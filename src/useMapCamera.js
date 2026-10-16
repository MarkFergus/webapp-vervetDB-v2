import { useEffect, useLayoutEffect, useRef, useState } from "react";

// Moving around a map and zooming in, shared by the Interactive Map
// (WholeMap.jsx) and an enclosure's map pop-up (SanctuaryMap.jsx): drag to
// move, zoom with the mouse wheel, a pinch, the keyboard (+ / − / 0, arrows
// to move) or the zoom controls (MapZoom.jsx).

// How far in it goes (1 = the whole map in view)
export const MAX_ZOOM = 12;
// Each tap of + or −
export const STEP = 1.6;

// How far a finger or the mouse can move and still be a tap (pixels)
const TAP_SLOP = 8;

// The part of the map in view, as an SVG viewBox, for a view of this shape
// (aspect: width / height): the whole drawing (bounds) fits at zoom 1;
// (cx, cy) is the point in the middle, kept so the map never slides out of
// view
export function viewOf({ zoom, cx, cy }, aspect, bounds) {
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
export const wholeOf = (bounds) => ({ zoom: 1, cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 });

// The camera that shows this part of the map (a box in the map's units),
// as near as the view's shape allows
export function cameraOn(box, aspect, bounds) {
    const fitWidth = Math.max(bounds.width, bounds.height * aspect);
    const width = Math.max(box.width, box.height * aspect);
    return {
        zoom: Math.min(Math.max(fitWidth / width, 1), MAX_ZOOM),
        cx: box.x + box.width / 2,
        cy: box.y + box.height / 2,
    };
}

//   bounds: the drawing (the whole map fits it at zoom 1)
//   viewRef: the element the map fills (it takes the drags, pinches and wheel)
//   ready: false until that element is on the page (e.g. the map loading)
//   onTap(x, y): a tap (one finger, hardly moving), in screen pixels
export default function useMapCamera(bounds, viewRef, { ready = true, onTap } = {}) {
    const [size, setSize] = useState({ width: 1, height: 1 });
    const [camera, setCamera] = useState(() => wholeOf(bounds));
    const aspect = size.width / size.height;
    const view = viewOf(camera, aspect, bounds);
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

    // The keyboard (for the pop-up's onKeyDown): + / − zoom, 0 = reset,
    // arrows move. reset: what 0 does (the whole map unless given)
    function onKeyDown(event, reset = showWhole) {
        // (the slider has its own arrow keys)
        if (event.target.type === "range") return;
        const keys = {
            "+": () => zoomBy(STEP),
            "=": () => zoomBy(STEP),
            "-": () => zoomBy(1 / STEP),
            0: () => reset(),
            ArrowLeft: () => panBy(60, 0),
            ArrowRight: () => panBy(-60, 0),
            ArrowUp: () => panBy(0, 60),
            ArrowDown: () => panBy(0, -60),
        };
        if (keys[event.key]) {
            event.preventDefault();
            keys[event.key]();
        }
    }

    // The view's size on screen (the window can change). Measured before
    // it's drawn, so a starting view can be set without a jump.
    useLayoutEffect(() => {
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
    }, [viewRef, ready]);

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
    }, [viewRef, ready]);

    // Dragging (one finger or the mouse) moves; two fingers pinch to zoom; a
    // tap (one finger, hardly moving) goes to onTap
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
            onTap?.(event.clientX, event.clientY);
        }
        if (pointers.current.size === 0) gesture.current = null;
    }

    return {
        camera,
        setCamera,
        view,
        size,
        aspect,
        zoomWith,
        zoomBy,
        panBy,
        showWhole,
        onKeyDown,
        // (spread onto the view element)
        pointerHandlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
        },
    };
}
