import { useEffect, useState } from "react";
import { IconMap2 } from "@tabler/icons-react";
import { INTROCAGE_GATES } from "./mapIntrocages";
import "./SanctuaryMap.css";

// The sanctuary map (public/VMF Sanctuary Map.svg, drawn in Inkscape) on an
// enclosure's page: in greyscale, zoomed in around the enclosure, with its
// outline picked out in its section's neon colour.
// Each troop enclosure is a shape in the map named "<troop> troop" (its
// Inkscape label). Each introcage is a small gate box beside its enclosure,
// found by its id (mapIntrocages.js).

export const MAP_URL = "/VMF%20Sanctuary%20Map.svg";
// The map's own size (its viewBox): A4 portrait
const MAP_WIDTH = 595.3;
const MAP_HEIGHT = 841.9;
const LABEL = "http://www.inkscape.org/namespaces/inkscape";

// Enclosure name → its shape's label in the map, where they differ
const MAP_LABELS = { "D&D": "Dino & Daniel troop" };
export const mapLabel = (enclosureName) => MAP_LABELS[enclosureName] ?? `${enclosureName} troop`;

// The site's neon colours, by section
export const SECTION_COLOURS = {
    Top: "#3dfc8a",
    Middle: "#25c4f8",
    Bottom: "#ff4d6a",
    Sickbay: "#ffe14d",
};

// The map is loaded once, then each enclosure's outline is worked out once
let mapDocument = null;
const outlines = new Map();

function loadMap() {
    mapDocument ??= fetch(MAP_URL)
        .then((response) => {
            if (!response.ok) throw new Error(`Map not found (${response.status})`);
            return response.text();
        })
        .then((text) => new DOMParser().parseFromString(text, "image/svg+xml"));
    return mapDocument;
}

// A part of the map (a shape or a whole layer), in the map's own
// coordinates: { markup (as SVG), transform, box: { x, y, width, height } },
// or null if the map hasn't got it. Found by its Inkscape label, or by id.
//   key: "label:Robert troop" or "id:rect9454"
function findPart(doc, key) {
    if (outlines.has(key)) return outlines.get(key);
    const split = key.indexOf(":");
    const kind = key.slice(0, split);
    const value = key.slice(split + 1);
    const matches = (el) =>
        kind === "id" ? el.getAttribute("id") === value : el.getAttributeNS(LABEL, "label") === value;
    let found = null;
    const shape = [...doc.getElementsByTagName("*")].find(matches);
    if (shape) {
        // Measure it on a hidden copy of the map, drawn at its own size so the
        // measurements come out in the map's coordinates
        const holder = document.createElement("div");
        holder.style.cssText = "position:absolute;left:-10000px;top:0;width:0;height:0;overflow:hidden";
        const svg = document.importNode(doc.documentElement, true);
        svg.setAttribute("width", MAP_WIDTH);
        svg.setAttribute("height", MAP_HEIGHT);
        holder.appendChild(svg);
        document.body.appendChild(holder);
        try {
            const placed = [...svg.getElementsByTagName("*")].find(matches);
            const m = placed.getCTM();
            const b = placed.getBBox();
            const corners = [
                [b.x, b.y],
                [b.x + b.width, b.y],
                [b.x, b.y + b.height],
                [b.x + b.width, b.y + b.height],
            ].map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]);
            const xs = corners.map(([x]) => x);
            const ys = corners.map(([, y]) => y);
            // The part keeps its own transform (if any) in its markup, so it's
            // placed with its parent's: the layers it sits in
            const p =
                placed.parentNode instanceof SVGGraphicsElement && placed.parentNode !== svg
                    ? placed.parentNode.getCTM()
                    : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
            found = {
                markup: new XMLSerializer().serializeToString(shape),
                transform: `matrix(${p.a} ${p.b} ${p.c} ${p.d} ${p.e} ${p.f})`,
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
//   mask: only drawn inside this mask (an id)
function Part({ part, className, grey = false, mask }) {
    if (!part) return null;
    return (
        <g
            className={className}
            transform={part.transform}
            filter={grey ? "url(#SanctuaryMap-grey)" : undefined}
            mask={mask ? `url(#${mask})` : undefined}
            dangerouslySetInnerHTML={{ __html: part.markup }}
        />
    );
}

// The part of the map to show: the enclosure with room around it (spread:
// how many times its size), in the card's 4:3 shape, kept within the map
function zoomBox(box, spread, smallest = 100) {
    const ASPECT = 4 / 3;
    let width = Math.max(box.width * spread, box.height * spread * ASPECT, smallest);
    let height = width / ASPECT;
    width = Math.min(width, MAP_WIDTH);
    height = Math.min(height, MAP_HEIGHT);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const x = Math.min(Math.max(cx - width / 2, 0), MAP_WIDTH - width);
    const y = Math.min(Math.max(cy - height / 2, 0), MAP_HEIGHT - height);
    return `${x} ${y} ${width} ${height}`;
}

//   enclosure: the troop enclosure to pick out (an introcage's page passes
//   its enclosure); section: for the colour
//   introcage: on an introcage's page, its name: its gate box is picked out
//   too, and the map zooms in on it (with its enclosure around it)
function SanctuaryMap({ enclosure, section, introcage = null }) {
    const label = mapLabel(enclosure.name);
    const gateId = introcage ? INTROCAGE_GATES[introcage] : null;
    const [parts, setParts] = useState(undefined); // undefined = loading
    useEffect(() => {
        let cancelled = false;
        loadMap()
            .then((doc) => {
                if (cancelled) return;
                const outline = findPart(doc, `label:${label}`);
                setParts(
                    outline && {
                        outline,
                        // drawn again on top, so they show over the colour
                        gates: findPart(doc, "label:Enclosure gates"),
                        labels: findPart(doc, "label:Labels"),
                        gate: gateId ? findPart(doc, `id:${gateId}`) : null,
                    }
                );
            })
            .catch(() => {
                if (!cancelled) setParts(null);
            });
        return () => {
            cancelled = true;
        };
    }, [label, gateId]);

    if (!parts) {
        return (
            <div className="SanctuaryMap is-empty" aria-busy={parts === undefined}>
                <IconMap2 size={36} stroke={1.5} aria-hidden="true" />
                <span>{parts === undefined ? "Loading the map…" : `${enclosure.name} isn't on the map yet`}</span>
            </div>
        );
    }

    const colour = SECTION_COLOURS[section] ?? SECTION_COLOURS.Middle;
    const { outline, gates, labels, gate } = parts;
    return (
        <div className={`SanctuaryMap${gate ? " has-introcage" : ""}`} style={{ "--highlight": colour }}>
            <svg
                viewBox={gate ? zoomBox(gate.box, 14, 70) : zoomBox(outline.box, introcage ? 1.4 : 2.6)}
                preserveAspectRatio="xMidYMid slice"
                role="img"
                aria-label={`Sanctuary map, with ${introcage && gate ? introcage : enclosure.name} picked out`}
            >
                <filter id="SanctuaryMap-grey">
                    <feColorMatrix type="saturate" values="0" />
                </filter>
                {/* The enclosure's shape, to redraw the names inside it only
                    (redrawn names elsewhere wouldn't sit exactly on the map's) */}
                <mask id="SanctuaryMap-inside" maskUnits="userSpaceOnUse" x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT}>
                    <Part part={outline} className="SanctuaryMap-maskShape" />
                </mask>
                {/* The whole map, in greyscale */}
                <image href={MAP_URL} width={MAP_WIDTH} height={MAP_HEIGHT} filter="url(#SanctuaryMap-grey)" />
                {/* The enclosure in its section's colour (paler on an
                    introcage's page, so the introcage stands out) */}
                <Part part={outline} className="SanctuaryMap-highlight" />
                {/* Gates and the enclosure's names back on top: names stay black */}
                <Part part={gates} grey />
                <Part part={gate} className="SanctuaryMap-introcage" />
                <Part part={labels} grey mask="SanctuaryMap-inside" />
            </svg>
        </div>
    );
}

export default SanctuaryMap;
