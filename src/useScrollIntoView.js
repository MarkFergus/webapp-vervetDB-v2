import { useEffect, useRef } from "react";

// Scrolls an element fully into view when it first appears (e.g. an Edit
// form opening in a list), so nobody has to scroll down to it. Smooth,
// unless the person prefers less motion. Gives back the ref to put on it.
//   enabled: false leaves it where it is (e.g. a form in a drop-down)
export default function useScrollIntoView(enabled = true) {
    const ref = useRef(null);
    useEffect(() => {
        if (!enabled) return;
        const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        ref.current?.scrollIntoView?.({ block: "nearest", behavior: calm ? "auto" : "smooth" });
    }, [enabled]);
    return ref;
}
