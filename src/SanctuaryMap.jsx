import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import PlaceName from "./PlaceName";
import { fullName } from "./places";
import { createPortal } from "react-dom";
import { IconArrowsMaximize, IconMap2 } from "@tabler/icons-react";
import useDialog from "./useDialog";
import "./SanctuaryMap.css";
import "./WholeMap.css";
import CloseButton from "./CloseButton";
import MapZoom from "./MapZoom";
import useMapCamera, { cameraOn } from "./useMapCamera";

// The sanctuary map (public/VMF_Sanctuary_Map.svg, drawn in Inkscape) on an
// enclosure's page: in greyscale, zoomed in around the enclosure, with its
// outline picked out in its section's neon colour.
// Each troop enclosure is a shape in the map named "<troop> troop" (its
// Inkscape label). Each introcage is a small gate box beside its enclosure
// (sometimes two), in the "Enclosure gates" layer, labelled with the
// introcage's full name (e.g. "H&B C1").

export const MAP_URL = "/VMF_Sanctuary_Map.svg";
// The map's own size (its viewBox): A4 portrait
export const MAP_WIDTH = 595.3;
export const MAP_HEIGHT = 841.9;
const LABEL = "http://www.inkscape.org/namespaces/inkscape";

// Enclosure name → its shape's label in the map, where they differ (the
// block and the care units aren't "… troop"; Sickbay (the care unit) is the
// Sickbay building)
const MAP_LABELS = {
    "D&D": "Dino & Daniel troop",
    "Bachelor Block": "Bachelor block",
    Quarantine: "Quarantine",
    Sickbay: "Sickbay building",
    // (its old name, until supabase/rename-sickbay.sql has run: remove then)
    "Sickbay Care Unit": "Sickbay building",
};
export const mapLabel = (enclosureName) => MAP_LABELS[enclosureName] ?? `${enclosureName} troop`;

// Enclosures with no one shape of their own, just their areas in different
// places: all of those picked out together
const MAP_GROUPS = {
    "Baby Care": ["Dreamland", "Neverland", "Disneyland"],
};

// The site's neon colours, by section
export const SECTION_COLOURS = {
    Top: "#3dfc8a",
    Middle: "#25c4f8",
    Bottom: "#ff4d6a",
    Sickbay: "#ffe14d",
    "Care Units": "#c77dff",
};

// The map is loaded once, then each enclosure's outline is worked out once
let mapDocument = null;
let mapMarkup = null;
const outlines = new Map();

// The whole map's drawing, as SVG markup to put straight into the page (not
// as a picture: drawn in the page, its labels can use the site's font)
export function wholeMap(doc) {
    if (mapMarkup === null) {
        const serializer = new XMLSerializer();
        mapMarkup = [...doc.documentElement.children]
            // (no title: it would pop up as a tooltip)
            .filter((el) => el.localName !== "title" && el.localName !== "namedview")
            .map((el) => serializer.serializeToString(el))
            .join("");
    }
    return mapMarkup;
}

export function loadMap() {
    mapDocument ??= fetch(MAP_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`Map not found (${response.status})`);
            return response.text();
        })
        .then((text) => new DOMParser().parseFromString(text, "image/svg+xml"))
        .catch((error) => {
            // (not kept: the next try loads it again, e.g. back online)
            mapDocument = null;
            throw error;
        });
    return mapDocument;
}

// A part of the map (a shape, a whole layer, or an introcage's gate
// boxes), in the map's own coordinates: { markup (as SVG), transform,
// box: { x, y, width, height }, inGates (gate boxes, not a shape found
// elsewhere) }, or null if the map hasn't got it.
//   key: "label:Robert troop" (the first shape with that Inkscape label),
//   or "labels:Dreamland|Neverland" (the first shape, not a name, with each),
//   or "gate:H&B C1" (every box with that label in the "Enclosure gates"
//   layer: some introcages have two; or, if none, the shape with that label
//   elsewhere, e.g. Koko D, an annex drawn with the enclosures)
function findPart(doc, key) {
    if (outlines.has(key)) return outlines.get(key);
    const split = key.indexOf(":");
    const kind = key.slice(0, split);
    const value = key.slice(split + 1);
    const labelled = (el, label) => el.getAttributeNS(LABEL, "label") === label;
    // The matching elements in a copy of the map
    function pick(root) {
        const all = [...root.getElementsByTagName("*")];
        if (kind === "labels") {
            const shape = (label) => all.find((el) => labelled(el, label) && !el.closest("text"));
            return value.split("|").map(shape).filter(Boolean);
        }
        if (kind !== "gate") {
            const first = all.find((el) => labelled(el, value));
            return first ? [first] : [];
        }
        const layer = all.find((el) => labelled(el, "Enclosure gates"));
        const boxes = layer ? [...layer.children].filter((el) => labelled(el, value)) : [];
        inGates = boxes.length > 0;
        if (boxes.length) return boxes;
        // Not a gate box: a shape of its own elsewhere (e.g. Koko D, an annex)
        const shape = all.find((el) => labelled(el, value));
        return shape ? [shape] : [];
    }
    let found = null;
    let inGates = false;
    const shapes = pick(doc);
    if (shapes.length) {
        // Measure them on a hidden copy of the map, drawn at its own size so
        // the measurements come out in the map's coordinates
        const holder = document.createElement("div");
        holder.style.cssText = "position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden";
        const svg = document.importNode(doc.documentElement, true);
        svg.setAttribute("width", MAP_WIDTH);
        svg.setAttribute("height", MAP_HEIGHT);
        holder.appendChild(svg);
        document.body.appendChild(holder);
        try {
            const placed = pick(svg);
            const xs = [];
            const ys = [];
            for (const el of placed) {
                const m = el.getCTM();
                const b = el.getBBox();
                for (const [x, y] of [
                    [b.x, b.y],
                    [b.x + b.width, b.y],
                    [b.x, b.y + b.height],
                    [b.x + b.width, b.y + b.height],
                ]) {
                    xs.push(m.a * x + m.c * y + m.e);
                    ys.push(m.b * x + m.d * y + m.f);
                }
            }
            // Each keeps its own transform (if any) in its markup, so they're
            // placed with their parent's: the layers they sit in (the same
            // for an introcage's boxes, all in the gates layer)
            const parent = placed[0].parentNode;
            const p =
                parent instanceof SVGGraphicsElement && parent !== svg
                    ? parent.getCTM()
                    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            const serializer = new XMLSerializer();
            found = {
                markup: shapes.map((el) => serializer.serializeToString(el)).join(""),
                transform: `matrix(${p.a} ${p.b} ${p.c} ${p.d} ${p.e} ${p.f})`,
                inGates,
                box: {
                    x: Math.min(...xs),
                    y: Math.min(...ys),
                    width: Math.max(...xs) - Math.min(...xs),
                    height: Math.max(...ys) - Math.min(...ys),
                },
            };
        } catch {
            found = null;
        } finally {
            holder.remove();
        }
    }
    outlines.set(key, found);
    return found;
}

// A part of the map drawn over the top (in the map's greys, or picked out)
//   filter: drawn through this filter (an id); mask: only drawn inside this
//   mask (an id)
function Part({ part, className, filter, mask }) {
    if (!part) return null;
    return (
        <g
            className={className}
            transform={part.transform}
            filter={filter ? `url(#${filter})` : undefined}
            mask={mask ? `url(#${mask})` : undefined}
            dangerouslySetInnerHTML={{ __html: part.markup }}
        />
    );
}

// The part of the map to show: the enclosure with room around it (spread:
// how many times its size), in the card's shape (aspect: width / height; the
// pop-up is 4:3), kept within the map
const CARD_ASPECT = 40 / 21;
function zoomBox(box, spread, smallest = 100, ASPECT = CARD_ASPECT) {
    // smallest: the narrowest view, as a 4:3 width (wide strips keep its height)
    let width = Math.max(box.width * spread, box.height * spread * ASPECT, smallest, smallest * 0.75 * ASPECT);
    // No bigger than the map, unless that's needed to show the whole
    // enclosure (a tall one in a wide strip)
    const whole = Math.max(box.width * 1.08, box.height * 1.08 * ASPECT);
    width = Math.max(Math.min(width, MAP_WIDTH, MAP_HEIGHT * ASPECT), whole);
    const height = width / ASPECT;
    // Kept within the map (centred on the enclosure when bigger than it)
    const place = (centre, size, mapSize) =>
        size >= mapSize ? centre - size / 2 : Math.min(Math.max(centre - size / 2, 0), mapSize - size);
    const x = place(box.x + box.width / 2, width, MAP_WIDTH);
    const y = place(box.y + box.height / 2, height, MAP_HEIGHT);
    return `${x} ${y} ${width} ${height}`;
}

// The small icons, hidden on the map and shown in the map pop-up when
// chosen. Found by their Inkscape labels: hide (the icons in the whole map)
// and show (the layer to show in the copy drawn on top). The fire pits
// share a layer with the rocks (which stay, as landmarks), as do the cabins
// with the other icons.
const byLabel = (name) => `[inkscape\\:label="${name}"]`;
const FIRE_PITS = '[inkscape\\:label^="Fire pit"]';
export const MAP_ICONS = [
    { id: "taps", label: "Water Taps", hide: byLabel("Water taps"), show: byLabel("Water taps") },
    { id: "misters", label: "Misters", hide: byLabel("Misters"), show: byLabel("Misters") },
    {
        id: "fences",
        label: "Fence Switches",
        hide: byLabel("Electric fence switches"),
        show: byLabel("Electric fence switches"),
    },
    {
        id: "toilets",
        label: "Toilets & Showers",
        hide: byLabel("Toilets & showers"),
        show: byLabel("Toilets & showers"),
    },
    { id: "firePits", label: "Fire Pits", hide: FIRE_PITS, show: byLabel("Rocks & fire pits") },
];

// The parts of the map for one enclosure (undefined while loading, null if
// it isn't on the map). See SanctuaryMap for what's passed in.
function useMapParts(enclosure, introcage, introcages) {
    const group = MAP_GROUPS[enclosure.name];
    const label = group ? `labels:${group.join("|")}` : `label:${mapLabel(enclosure.name)}`;
    const introcageKey = introcages.join("|");
    const [parts, setParts] = useState(undefined);
    useEffect(() => {
        let cancelled = false;
        loadMap()
            .then((doc) => {
                if (cancelled) return;
                const outline = findPart(doc, label);
                setParts(
                    outline && {
                        map: wholeMap(doc),
                        outline,
                        // drawn again on top, so they show over the colour
                        gates: findPart(doc, "label:Enclosure gates"),
                        labels: findPart(doc, "label:Labels"),
                        // the icons, on top too (in the pop-up, when shown)
                        icons: findPart(doc, "label:Icons"),
                        gate: introcage ? findPart(doc, `gate:${introcage}`) : null,
                        // (a block's or care unit's areas are inside its
                        // outline, so only gate boxes: not drawn over its colour)
                        ownGates: introcageKey
                            .split("|")
                            .filter(Boolean)
                            .map((name) => findPart(doc, `gate:${name}`))
                            .filter((part) => part && (part.inGates || enclosure.type === "troop")),
                    }
                );
            })
            .catch(() => {
                if (!cancelled) setParts(null);
            });
        return () => {
            cancelled = true;
        };
    }, [label, enclosure.type, introcage, introcageKey]);
    return parts;
}

// The map itself: faded, with the enclosure in colour.
//   viewBox: the part to show; shownIcons: the icon ids to show (MAP_ICONS)
function MapView({ parts, colour, viewBox, label, shownIcons = [], svgRef }) {
    // Ids for this copy's filters and mask (the card and the pop-up can both
    // be on the page), and a class to scope its icon rules to
    const id = useId().replace(/[^a-zA-Z0-9]/g, "");
    const grey = `${id}-grey`;
    const faded = `${id}-faded`;
    const inside = `${id}-inside`;
    const { map, outline, gates, labels, icons, gate, ownGates } = parts;
    // The whole map: no small icons, no legend. Drawn on top: only the
    // chosen icons (from the rocks and fire pits layer, only the fire pits)
    const iconRules = [
        `.${id} .SanctuaryMap-base :is(${MAP_ICONS.map((icon) => icon.hide).join(", ")}, ${byLabel("Key")}) { display: none; }`,
        `.${id} .SanctuaryMap-icons > g > g { display: none; }`,
        `.${id} .SanctuaryMap-icons ${byLabel("Rocks & fire pits")} > :not(${FIRE_PITS}) { display: none; }`,
        ...MAP_ICONS.map(
            (icon) =>
                `.${id} .SanctuaryMap-icons ${icon.show} { display: ${
                    shownIcons.includes(icon.id) ? "inline" : "none"
                } !important; }`
        ),
    ].join("\n");
    return (
        <svg ref={svgRef} className={id} viewBox={viewBox} preserveAspectRatio="xMidYMid slice" role="img" aria-label={label}>
            <style>{iconRules}</style>
            {/* Grey: no colour. Faded: grey, and washed towards white */}
            <filter id={grey}>
                <feColorMatrix type="saturate" values="0" />
            </filter>
            <filter id={faded}>
                <feColorMatrix type="saturate" values="0" />
                <feComponentTransfer>
                    <feFuncR type="linear" slope="0.78" intercept="0.22" />
                    <feFuncG type="linear" slope="0.78" intercept="0.22" />
                    <feFuncB type="linear" slope="0.78" intercept="0.22" />
                </feComponentTransfer>
            </filter>
            {/* The enclosure's shape, and around its introcages' boxes: the
                names and letters there are drawn again, not faded */}
            <mask id={inside} maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT}>
                <Part part={outline} className="SanctuaryMap-maskShape" />
                {ownGates.map((part, i) => (
                    <Part key={i} part={part} className="SanctuaryMap-maskShape is-around" />
                ))}
            </mask>
            {/* The whole map, faded */}
            <g className="SanctuaryMap-base" filter={`url(#${faded})`} dangerouslySetInnerHTML={{ __html: map }} />
            {/* The enclosure in its section's colour (paler on an
                introcage's page, so the introcage stands out) */}
            <Part part={outline} className="SanctuaryMap-highlight" />
            {/* Gates on top of the colour (faded like the rest), the
                introcage's own box, and the enclosure's names in black */}
            <Part part={gates} filter={faded} />
            {ownGates.map((part, i) => (
                <Part key={i} part={part} filter={grey} />
            ))}
            <Part part={gate} className="SanctuaryMap-introcage" />
            <Part part={labels} filter={grey} mask={inside} />
            {/* The chosen icons, on top of everything */}
            {shownIcons.length > 0 && <Part part={icons} className="SanctuaryMap-icons" />}
        </svg>
    );
}

// Shown in the pop-up: all of the small icons, for now (later: pills to
// choose, for the ones that matter for monkey care, once each icon is linked
// to its enclosure in the map file)
const ALL_ICONS = MAP_ICONS.map((icon) => icon.id);

// The map in a pop-up, closer in (the enclosure filling most of it), with the
// small icons showing. Drag to move around and zoom in or out, as in the
// Interactive Map (useMapCamera.js); the reset button goes back to the
// enclosure.
const PAGE = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
// Room left around the drawing when zoomed right out (a share of its size)
const MARGIN = 0.015;
function MapPopup({ parts, colour, enclosure, onClose }) {
    const closeRef = useRef(null);
    const viewRef = useRef(null);
    const svgRef = useRef(null);
    // The drawing's edges (the map file is an A4 page with empty margins),
    // once it's on the page (tests have no layout: the whole page)
    const [bounds, setBounds] = useState(PAGE);
    useLayoutEffect(() => {
        const base = svgRef.current?.querySelector(".SanctuaryMap-base");
        if (!base?.getBBox) return;
        const box = base.getBBox();
        if (!box.width || !box.height) return;
        const pad = Math.max(box.width, box.height) * MARGIN;
        setBounds({ x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad });
    }, []);
    const map = useMapCamera(bounds, viewRef);
    const { camera, setCamera, view, size, aspect } = map;

    // Where it starts (and the reset button goes back to): the enclosure,
    // with some room around it (a small one: still room to zoom in)
    const { box } = parts.outline;
    const room = { width: Math.max(box.width * 1.4, 110), height: Math.max(box.height * 1.4, 82) };
    const focus = {
        x: box.x + box.width / 2 - room.width / 2,
        y: box.y + box.height / 2 - room.height / 2,
        ...room,
    };
    const start = cameraOn(focus, aspect, bounds);
    const showEnclosure = () => setCamera(start);
    const started = useRef(false);
    useLayoutEffect(() => {
        if (started.current || bounds === PAGE || size.width <= 1) return;
        started.current = true;
        setCamera(start);
    });
    const atStart =
        Math.abs(camera.zoom - start.zoom) < 0.01 &&
        Math.hypot(view.x + view.width / 2 - start.cx, view.y + view.height / 2 - start.cy) < 1;

    useDialog(true, closeRef, { onClose, onKeyDown: (event) => map.onKeyDown(event, showEnclosure) });
    const name = fullName(enclosure.name);
    return createPortal(
        <div className="MapPopup" role="dialog" aria-modal="true" aria-labelledby="MapPopup-title">
            <div className="MapPopup-overlay" onClick={onClose} />
            <div className="MapPopup-window">
                <div className="MapPopup-header WholeMap-header">
                    <h2 id="MapPopup-title"><PlaceName name={enclosure.name} /> on the map</h2>
                    <div className="WholeMap-tools">
                        <MapZoom map={map} reset={showEnclosure} resetLabel={`Back to ${name}`} atReset={atStart} />
                    </div>
                    <CloseButton className="MapPopup-close" ref={closeRef} onClick={onClose} />
                </div>
                <div className="SanctuaryMap is-large" style={{ "--highlight": colour }}>
                    <div className="WholeMap-view" ref={viewRef} {...map.pointerHandlers}>
                        <MapView
                            svgRef={svgRef}
                            parts={parts}
                            colour={colour}
                            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                            label={`Sanctuary map, close up on ${name}`}
                            shownIcons={ALL_ICONS}
                        />
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}

//   enclosure: the troop enclosure to pick out (an introcage's page passes
//   its enclosure); section: for the colour
//   introcage: on an introcage's page, its name: its gate box is picked out
//   too, and the map zooms in on it (with its enclosure around it)
//   introcages: the names of the enclosure's introcages: their boxes and
//   letters aren't faded (they're part of the enclosure)
// On an enclosure's page, tapping the map opens it in a pop-up.
function SanctuaryMap({ enclosure, section, introcage = null, introcages = [] }) {
    const parts = useMapParts(enclosure, introcage, introcages);
    const [popupOpen, setPopupOpen] = useState(false);
    // The card's shape (width / height): computers show a wide strip, so the
    // part of the map shown matches it
    const [aspect, setAspect] = useState(CARD_ASPECT);
    const cardRef = useCallback((card) => {
        if (!card || typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            if (width > 0 && height > 0) setAspect(width / height);
        });
        observer.observe(card);
        return () => observer.disconnect();
    }, []);

    if (!parts) {
        return (
            <div className="SanctuaryMap is-empty" aria-busy={parts === undefined}>
                <IconMap2 size={36} stroke={1.5} aria-hidden="true" />
                <span>{parts === undefined ? "Loading the map…" : `${enclosure.name} isn't on the map yet`}</span>
            </div>
        );
    }

    const colour = SECTION_COLOURS[section] ?? SECTION_COLOURS.Middle;
    const { outline, gate } = parts;
    const view = (
        <MapView
            parts={parts}
            colour={colour}
            viewBox={gate ? zoomBox(gate.box, 4, 100, aspect) : zoomBox(outline.box, introcage ? 1.4 : 1.7, 100, aspect)}
            label={`Sanctuary map, with ${fullName(introcage && gate ? introcage : enclosure.name)} picked out`}
        />
    );
    if (introcage) {
        return (
            <div ref={cardRef} className={`SanctuaryMap${gate ? " has-introcage" : ""}`} style={{ "--highlight": colour }}>
                {view}
            </div>
        );
    }
    return (
        <>
            <button
                type="button"
                ref={cardRef}
                className="SanctuaryMap is-button"
                style={{ "--highlight": colour }}
                onClick={() => setPopupOpen(true)}
                aria-label={`Open the map of ${enclosure.name}`}
            >
                {view}
                <span className="SanctuaryMap-expand" aria-hidden="true">
                    <IconArrowsMaximize size={16} />
                </span>
            </button>
            {popupOpen && (
                <MapPopup parts={parts} colour={colour} enclosure={enclosure} onClose={() => setPopupOpen(false)} />
            )}
        </>
    );
}

export default SanctuaryMap;
