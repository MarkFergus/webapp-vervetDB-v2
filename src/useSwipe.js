import { useRef, useState } from "react";

// Sideways swipes on touch screens (fingers and pens, not the mouse).
//   onSwipe("next" | "prev"): a swipe left (next) or right (previous)
//   enabled: false ignores swipes (e.g. only one photo)
// Returns the handlers to spread onto the swiped element, and dragX: how far
// the finger has moved sideways (px) while it's down, or 0, so the element
// can follow the finger. Mostly-up-and-down moves are left to page scrolling
// (pair with CSS touch-action: pan-y).

// Far enough to count as a swipe (px), or a quick flick of this speed (px/ms)
const MIN_DISTANCE = 50;
const MIN_SPEED = 0.4;

export default function useSwipe(onSwipe, enabled = true) {
    const start = useRef(null);
    const [dragX, setDragX] = useState(0);

    function onPointerDown(event) {
        if (!enabled || event.pointerType === "mouse" || !event.isPrimary) return;
        start.current = { x: event.clientX, y: event.clientY, time: event.timeStamp, sideways: null };
    }

    function onPointerMove(event) {
        const s = start.current;
        if (!s) return;
        const dx = event.clientX - s.x;
        const dy = event.clientY - s.y;
        // Decide once the finger has moved a little: sideways, or a scroll
        if (s.sideways === null && Math.hypot(dx, dy) > 8) {
            s.sideways = Math.abs(dx) > Math.abs(dy);
            if (!s.sideways) {
                start.current = null;
                return;
            }
            event.currentTarget.setPointerCapture?.(event.pointerId);
        }
        if (s.sideways) setDragX(dx);
    }

    function onPointerUp(event) {
        const s = start.current;
        start.current = null;
        setDragX(0);
        if (!s?.sideways) return;
        const dx = event.clientX - s.x;
        const speed = Math.abs(dx) / Math.max(1, event.timeStamp - s.time);
        if (Math.abs(dx) >= MIN_DISTANCE || (Math.abs(dx) > 15 && speed >= MIN_SPEED)) {
            onSwipe(dx < 0 ? "next" : "prev");
        }
    }

    function onPointerCancel() {
        start.current = null;
        setDragX(0);
    }

    return { handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel }, dragX };
}
