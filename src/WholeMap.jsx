import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconMap2, IconZoomIn, IconZoomOut, IconZoomReset } from "@tabler/icons-react";
import useDialog from "./useDialog";
import CloseButton from "./CloseButton";
import { MAP_HEIGHT, MAP_WIDTH, loadMap, wholeMap } from "./SanctuaryMap";
import "./SanctuaryMap.css";
import "./WholeMap.css";

// The Interactive Map: the whole sanctuary map in a pop-up, in full colour,
// opened from Map in the side rail, bottom bar or ☰ menu. Starts with the
// whole map in view; drag to move around, and zoom with the slider and
// buttons in the title bar, the mouse wheel, a pinch, or the keyboard
// (+ / − / 0, arrows to move).
// (A first version: more to come, e.g. the icons and tapping an enclosure.)

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

function WholeMap({ onClose }) {
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
        onClose,
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

    // Dragging (one finger or the mouse) moves; two fingers pinch to zoom
    const pointers = useRef(new Map());
    function onPointerDown(event) {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    function onPointerMove(event) {
        const all = pointers.current;
        const last = all.get(event.pointerId);
        if (!last) return;
        const now = { x: event.clientX, y: event.clientY };
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
        pointers.current.delete(event.pointerId);
    }

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
                                role="img"
                                aria-label="The whole sanctuary map"
                                dangerouslySetInnerHTML={{ __html: markup }}
                            />
                        </div>
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
