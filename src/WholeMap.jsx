import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconArrowRight,
    IconChevronLeft,
    IconCurrentLocation,
    IconMap2,
    IconZoomIn,
    IconZoomOut,
    IconZoomReset,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import CloseButton from "./CloseButton";
import PlaceName from "./PlaceName";
import { MAP_HEIGHT, MAP_WIDTH, loadMap, wholeMap } from "./SanctuaryMap";
import { placeCard, placesByLabel } from "./mapPlaces";
import { UNITS_PER_METRE, mapPointOf, onMap } from "./mapGeo";
import { enclosureHash, isInside } from "./enclosures";
import { thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import "./SanctuaryMap.css";
import "./WholeMap.css";

// The Interactive Map: the whole sanctuary map in a pop-up, in full colour,
// opened from Map in the side rail, bottom bar or ☰ menu. Starts with the
// whole map in view; drag to move around, and zoom with the slider and
// buttons in the title bar, the mouse wheel, a pinch, or the keyboard
// (+ / − / 0, arrows to move).
// Tapping an enclosure, introcage or area picks it out and shows a small
// card (photo, name, Open Page); tapping anywhere else puts it away.
// My Location (title bar): a blue dot where the phone is (mapGeo.js), with
// a circle for how sure it is. The position stays on the phone, and it's
// only followed while the map is open with My Location on.

// How far in it goes (1 = the whole map in view)
const MAX_ZOOM = 12;
// Each tap of + or −
const STEP = 1.6;

// The whole page, until the drawing on it has been measured (the map file
// is an A4 page with empty margins around the drawing)
const PAGE = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
// Room left around the drawing (a share of its size)
const MARGIN = 0.015;

// The part of the map in view, as an SVG viewBox, for a view of this shape
// (aspect: width / height): the whole drawing (bounds) fits at zoom 1;
// (cx, cy) is the point in the middle, kept so the map never slides out of
// view
function viewOf({ zoom, cx, cy }, aspect, bounds) {
    const fitWidth = Math.max(bounds.width, bounds.height * aspect);
    const width = fitWidth / zoom;
    const height = width / aspect;
    const keep = (centre, size, start, length) =>
        size >= length
            ? start + length / 2
            : Math.min(Math.max(centre, start + size / 2), start + length - size / 2);
    const x = keep(cx, width, bounds.x, bounds.width) - width / 2;
    const y = keep(cy, height, bounds.y, bounds.height) - height / 2;
    return { x, y, width, height };
}

// Zoomed right out, on the middle of the drawing
const wholeOf = (bounds) => ({ zoom: 1, cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 });

// A shape's Inkscape label (inkscape:label; written with another prefix by
// some browsers once the map is copied into the page)
export const inkscapeLabel = (el) => [...el.attributes].find((a) => a.name.endsWith(":label"))?.value;

const SVG = "http://www.w3.org/2000/svg";

// What My Location says when there's no dot to show
const LOCATION_MESSAGES = {
    finding: "Finding your location…",
    away: "You're not at the sanctuary right now",
    denied: "Location is turned off for vervetDB. Allow it in your browser's settings to see where you are.",
    unavailable: "Couldn't find your location. Try again outside, away from buildings.",
};
// When it's found you, the map moves to you, at least this close in
const FOUND_ZOOM = 3;

// How long a card takes to slide back out (as in WholeMap.css)
const CARD_OUT_MS = 220;

// How far a finger or the mouse can move and still be a tap (pixels)
const TAP_SLOP = 8;

//   enclosures, monkeys: the places to tap, and who lives there
function WholeMap({ onClose, enclosures = [], monkeys = [] }) {
    const closeRef = useRef(null);
    const viewRef = useRef(null);
    const [markup, setMarkup] = useState(undefined); // null: couldn't load
    const [size, setSize] = useState({ width: 1, height: 1 });
    const [bounds, setBounds] = useState(PAGE);
    const [camera, setCamera] = useState(wholeOf(PAGE));
    const aspect = size.width / size.height;
    const view = viewOf(camera, aspect, bounds);
    const svgRef = useRef(null);
    const showWhole = () => setCamera(wholeOf(bounds));
    // The place tapped (its card showing), or null
    const [picked, setPicked] = useState(null);
    // Its card sliding back out to the left (then it's gone)
    const [leaving, setLeaving] = useState(false);
    function closeCard() {
        if (!picked) return;
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (still) setPicked(null);
        else setLeaving(true);
    }
    useEffect(() => {
        if (!leaving) return;
        // (as long as the slide out: WholeMap.css)
        const done = setTimeout(() => {
            setPicked(null);
            setLeaving(false);
        }, CARD_OUT_MS);
        return () => clearTimeout(done);
    }, [leaving]);
    const labels = useMemo(() => placesByLabel(enclosures), [enclosures]);

    // My Location: following (on / off); where the phone is ({ x, y } on the
    // map and accuracy: metres); and what's happening ("finding", "here",
    // "away", "denied", "unavailable")
    const [following, setFollowing] = useState(false);
    const [here, setHere] = useState(null);
    const [locationStatus, setLocationStatus] = useState(null);
    useEffect(() => {
        if (!following) return;
        const gps = navigator.geolocation;
        if (!gps) {
            setLocationStatus("unavailable");
            setFollowing(false);
            return;
        }
        setLocationStatus("finding");
        let first = true;
        const watch = gps.watchPosition(
            ({ coords }) => {
                const [x, y] = mapPointOf(coords.latitude, coords.longitude);
                if (!onMap([x, y])) {
                    setHere(null);
                    setLocationStatus("away");
                    return;
                }
                setHere({ x, y, accuracy: coords.accuracy });
                setLocationStatus("here");
                // The first time: the map moves to you
                if (first) {
                    first = false;
                    setCamera((current) => ({ zoom: Math.max(current.zoom, FOUND_ZOOM), cx: x, cy: y }));
                }
            },
            (error) => {
                setHere(null);
                setLocationStatus(error.code === 1 ? "denied" : "unavailable");
                setFollowing(false);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        return () => gps.clearWatch(watch);
    }, [following]);
    function toggleLocation() {
        if (following) {
            setFollowing(false);
            setHere(null);
            setLocationStatus(null);
        } else {
            setFollowing(true);
        }
    }

    // Zoom to newZoom(the zoom now), keeping the point at (px, py) in the
    // view (pixels) where it is; no point: the middle
    function zoomWith(newZoom, px = size.width / 2, py = size.height / 2) {
        setCamera((current) => {
            const before = viewOf(current, aspect, bounds);
            const zoom = Math.min(Math.max(newZoom(current.zoom), 1), MAX_ZOOM);
            const after = viewOf({ ...current, zoom }, aspect, bounds);
            // The map point under (px, py), and where the middle must go to keep it there
            const mx = before.x + (px / size.width) * before.width;
            const my = before.y + (py / size.height) * before.height;
            return {
                zoom,
                cx: mx - (px / size.width - 0.5) * after.width,
                cy: my - (py / size.height - 0.5) * after.height,
            };
        });
    }

    const zoomBy = (factor, px, py) => zoomWith((zoom) => zoom * factor, px, py);

    // Move by (dx, dy) pixels on screen (the map follows the finger)
    function panBy(dx, dy) {
        setCamera((current) => {
            const shown = viewOf(current, aspect, bounds);
            // (from the middle actually shown, so it never "sticks" at an edge)
            return {
                ...current,
                cx: shown.x + shown.width / 2 - (dx / size.width) * shown.width,
                cy: shown.y + shown.height / 2 - (dy / size.height) * shown.height,
            };
        });
    }

    useDialog(true, closeRef, {
        // (Escape: the card first, then the map)
        onClose: () => (picked ? closeCard() : onClose()),
        onKeyDown: (event) => {
            // (the slider has its own arrow keys)
            if (event.target.type === "range") return;
            const keys = {
                "+": () => zoomBy(STEP),
                "=": () => zoomBy(STEP),
                "-": () => zoomBy(1 / STEP),
                0: () => showWhole(),
                ArrowLeft: () => panBy(60, 0),
                ArrowRight: () => panBy(-60, 0),
                ArrowUp: () => panBy(0, 60),
                ArrowDown: () => panBy(0, -60),
            };
            if (keys[event.key]) {
                event.preventDefault();
                keys[event.key]();
            }
        },
    });

    useEffect(() => {
        let cancelled = false;
        loadMap()
            .then((doc) => !cancelled && setMarkup(wholeMap(doc)))
            .catch(() => !cancelled && setMarkup(null));
        return () => {
            cancelled = true;
        };
    }, []);

    // The drawing's edges, with a little room around them, once it's on the
    // page (tests have no layout: the whole page)
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg?.getBBox) return;
        const box = svg.getBBox();
        if (!box.width || !box.height) return;
        const pad = Math.max(box.width, box.height) * MARGIN;
        const drawn = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
        setBounds(drawn);
        setCamera(wholeOf(drawn));
    }, [markup]);

    // The places on the map: their shapes marked (data-place: the place's
    // id) so they can be tapped; everything else lets taps through to them.
    // Not their names written on the map (text, or a group of text, often
    // labelled the same, e.g. "Camelot troop"): a tap on a name goes through
    // to the shape under it.
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        for (const el of svg.querySelectorAll("*")) {
            if (el.closest("text") || el.querySelector("text")) continue;
            const place = labels.get(inkscapeLabel(el));
            if (place) el.setAttribute("data-place", place.id);
        }
    }, [markup, labels]);

    // The tapped place picked out with a glow (all its shapes: some
    // introcages have two). An introcage's or area's boxes are drawn again on
    // top of everything while it's picked: in the map file they're under the
    // enclosures and icons, which would hide most of the glow. (Not an
    // enclosure: it'd cover its own name, boxes and icons.)
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !picked) return;
        const shapes = [...svg.querySelectorAll("[data-place]")].filter(
            (el) => el.getAttribute("data-place") === String(picked.id)
        );
        if (!shapes.length) return;
        if (!isInside(picked) || !svg.getScreenCTM) {
            shapes.forEach((el) => el.classList.add("is-picked"));
            return () => shapes.forEach((el) => el.classList.remove("is-picked"));
        }
        // Each copy placed as its original is: its parent's transform, in
        // the map's own units
        const toMap = svg.getScreenCTM().inverse();
        const lifted = document.createElementNS(SVG, "g");
        lifted.setAttribute("class", "WholeMap-lifted is-picked");
        for (const el of shapes) {
            const m = toMap.multiply(el.parentNode.getScreenCTM());
            const holder = document.createElementNS(SVG, "g");
            holder.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
            const copy = el.cloneNode(true);
            copy.removeAttribute("data-place");
            holder.appendChild(copy);
            lifted.appendChild(holder);
        }
        svg.appendChild(lifted);
        return () => lifted.remove();
    }, [picked, markup]);

    // A tap: the place under it (or none: the card goes)
    function tapAt(x, y) {
        const shape = document.elementFromPoint?.(x, y)?.closest?.("[data-place]");
        const id = shape ? Number(shape.getAttribute("data-place")) : null;
        const place = enclosures.find((e) => e.id === id);
        if (!place) return closeCard();
        // (another place: its card slides in, even if one was leaving)
        setLeaving(false);
        setPicked(place);
    }

    // The view's size on screen (the window can change)
    useEffect(() => {
        const el = viewRef.current;
        if (!el) return;
        const measure = () => {
            const { width, height } = el.getBoundingClientRect();
            if (width > 0 && height > 0) setSize({ width, height });
        };
        measure();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [markup]);

    // The mouse wheel zooms (added by hand: React's wheel events can't stop
    // the page scrolling)
    const zoomRef = useRef(zoomBy);
    zoomRef.current = zoomBy;
    useEffect(() => {
        const el = viewRef.current;
        if (!el) return;
        const onWheel = (event) => {
            event.preventDefault();
            const box = el.getBoundingClientRect();
            zoomRef.current(Math.exp(-event.deltaY * 0.002), event.clientX - box.left, event.clientY - box.top);
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, [markup]);

    // Dragging (one finger or the mouse) moves; two fingers pinch to zoom; a
    // tap (one finger, hardly moving) picks a place
    const pointers = useRef(new Map());
    const gesture = useRef(null);
    function onPointerDown(event) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size === 1) gesture.current = { x: event.clientX, y: event.clientY, tap: true };
        else if (gesture.current) gesture.current.tap = false;
    }
    function onPointerMove(event) {
        const all = pointers.current;
        const last = all.get(event.pointerId);
        if (!last) return;
        const now = { x: event.clientX, y: event.clientY };
        const start = gesture.current;
        if (start && Math.hypot(now.x - start.x, now.y - start.y) > TAP_SLOP) start.tap = false;
        if (all.size === 1) {
            panBy(now.x - last.x, now.y - last.y);
        } else if (all.size === 2) {
            const [other] = [...all].filter(([id]) => id !== event.pointerId).map(([, p]) => p);
            const box = event.currentTarget.getBoundingClientRect();
            const apart = (a) => Math.hypot(a.x - other.x, a.y - other.y);
            if (apart(last) > 0) {
                zoomBy(apart(now) / apart(last), (now.x + other.x) / 2 - box.left, (now.y + other.y) / 2 - box.top);
            }
        }
        all.set(event.pointerId, now);
    }
    function onPointerUp(event) {
        if (!pointers.current.delete(event.pointerId)) return;
        if (pointers.current.size === 0 && gesture.current?.tap && event.type === "pointerup") {
            tapAt(event.clientX, event.clientY);
        }
        if (pointers.current.size === 0) gesture.current = null;
    }

    const card = picked && placeCard(picked, enclosures, monkeys);

    return createPortal(
        <div
            className="MapPopup WholeMap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="WholeMap-title"
            // (the pop-up takes the drawing's shape: see WholeMap.css)
            style={{ "--map-aspect": bounds.width / bounds.height }}
        >
            <div className="MapPopup-overlay" onClick={onClose} />
            <div className="MapPopup-window WholeMap-window">
                <div className="MapPopup-header WholeMap-header">
                    <h2 id="WholeMap-title">Sanctuary Map</h2>
                    {/* Zoom Out, the slider, Zoom In, Whole Map (once the
                        map is in). The slider goes up in equal steps of
                        how many times bigger, so it feels even all the way */}
                    {markup && (
                        <div className="WholeMap-tools">
                            <button
                                type="button"
                                className={`WholeMap-locate${locationStatus === "finding" ? " is-finding" : ""}`}
                                onClick={toggleLocation}
                                aria-pressed={following}
                                aria-label="My Location"
                                title="My Location"
                            >
                                <IconCurrentLocation size={18} aria-hidden="true" />
                            </button>
                            <div className="WholeMap-zoom" role="group" aria-label="Zoom controls">
                                <button
                                    type="button"
                                    onClick={() => zoomBy(1 / STEP)}
                                    disabled={camera.zoom <= 1}
                                    aria-label="Zoom Out"
                                    title="Zoom Out"
                                >
                                    <IconZoomOut size={18} aria-hidden="true" />
                                </button>
                                <input
                                    type="range"
                                    className="WholeMap-slider"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={Math.round((Math.log(camera.zoom) / Math.log(MAX_ZOOM)) * 100)}
                                    onChange={(event) => {
                                        const zoom = MAX_ZOOM ** (Number(event.target.value) / 100);
                                        zoomWith(() => zoom);
                                    }}
                                    aria-label="Zoom"
                                    aria-valuetext={`${camera.zoom.toFixed(1)} times`}
                                />
                                <button
                                    type="button"
                                    onClick={() => zoomBy(STEP)}
                                    disabled={camera.zoom >= MAX_ZOOM}
                                    aria-label="Zoom In"
                                    title="Zoom In"
                                >
                                    <IconZoomIn size={18} aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => showWhole()}
                                    disabled={camera.zoom === 1}
                                    aria-label="Whole Map"
                                    title="Whole Map"
                                >
                                    <IconZoomReset size={18} aria-hidden="true" />
                                </button>
                            </div>
                        </div>
                    )}
                    <CloseButton className="MapPopup-close" ref={closeRef} onClick={onClose} />
                </div>
                {markup ? (
                    <div className="WholeMap-area">
                        <div
                            className="WholeMap-view"
                            ref={viewRef}
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={onPointerUp}
                            onPointerCancel={onPointerUp}
                        >
                            <svg
                                ref={svgRef}
                                viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                                // (the tapped place's glow: 5 screen pixels, in map units)
                                style={{ "--glow": `${(5 * view.width) / size.width}px` }}
                                role="img"
                                aria-label="The whole sanctuary map"
                                dangerouslySetInnerHTML={{ __html: markup }}
                            />
                            {/* You: a blue dot (the same size at any zoom), in a
                                pale circle as wide as how sure the phone is */}
                            {here && (
                                <svg
                                    className="WholeMap-here"
                                    viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                                    aria-hidden="true"
                                >
                                    <circle
                                        className="WholeMap-hereAccuracy"
                                        cx={here.x}
                                        cy={here.y}
                                        r={here.accuracy * UNITS_PER_METRE}
                                    />
                                    <circle
                                        className="WholeMap-hereDot"
                                        cx={here.x}
                                        cy={here.y}
                                        r={(7 * view.width) / size.width}
                                        strokeWidth={(2.5 * view.width) / size.width}
                                    />
                                </svg>
                            )}
                        </div>
                        {/* What My Location is doing, when there's no dot */}
                        <p className="WholeMap-location" role="status">
                            {LOCATION_MESSAGES[locationStatus] ?? ""}
                        </p>
                        {/* The tapped place: its photo, name, what it is,
                            and the way to its page */}
                        {card && (
                            <div className="WholeMap-cardSpot">
                                {/* (keyed: another place's card slides in afresh) */}
                                <div
                                    key={picked.id}
                                    className={`WholeMap-card${leaving ? " is-leaving" : ""}`}
                                    role="region"
                                    aria-label={card.name}
                                >
                                    {card.photo ? (
                                        <img
                                            className="WholeMap-cardPhoto"
                                            src={thumbUrl(card.photo)}
                                            alt=""
                                            crossOrigin="anonymous"
                                            onError={fallbackTo(card.photo)}
                                        />
                                    ) : (
                                        <span className="WholeMap-cardPhoto is-empty" aria-hidden="true">
                                            <IconMap2 size={24} stroke={1.5} />
                                        </span>
                                    )}
                                    <div className="WholeMap-cardText">
                                        <h3>
                                            <PlaceName name={card.name} />
                                        </h3>
                                        <p>{card.kind}</p>
                                        <p className="WholeMap-cardCount">
                                            {card.count} {card.count === 1 ? "monkey" : "monkeys"}
                                        </p>
                                        <a className="WholeMap-cardLink" href={enclosureHash(picked)} onClick={onClose}>
                                            Open Page
                                            <IconArrowRight size={16} aria-hidden="true" />
                                        </a>
                                    </div>
                                    {/* Closes it: a chevron back the way it came */}
                                    <button
                                        type="button"
                                        className="WholeMap-cardClose"
                                        onClick={closeCard}
                                        aria-label={`Close ${card.name}`}
                                        title="Close"
                                    >
                                        <IconChevronLeft size={20} stroke={2} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="SanctuaryMap is-empty WholeMap-area" aria-busy={markup === undefined}>
                        <IconMap2 size={36} stroke={1.5} aria-hidden="true" />
                        <span>{markup === undefined ? "Loading the map…" : "Couldn't load the map. Please try again."}</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export default WholeMap;
