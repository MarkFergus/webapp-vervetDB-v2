import { useEffect, useRef } from "react";

// Keyboard and focus behaviour shared by the modals:
// - when the dialog opens, focus moves to `initialFocusRef` (e.g. its close button)
// - Escape calls onClose; any other key goes to onKeyDown (optional)
// - when it closes, focus goes back to whatever was focused before it opened
// - while it's open, the page behind can't scroll (see lockScroll)

// How many dialogs are open (one can open over another, e.g. the edit form
// over a monkey's pop-up): the page unlocks when the last one closes
let openDialogs = 0;

// Stops the page behind scrolling. On computers the scrollbar's space is kept
// as padding, so the page doesn't jump sideways when the scrollbar goes.
export function lockScroll() {
    openDialogs += 1;
    if (openDialogs > 1) return;
    const root = document.documentElement;
    const scrollbar = window.innerWidth - root.clientWidth;
    root.style.overflow = "hidden";
    if (scrollbar > 0) root.style.paddingRight = `${scrollbar}px`;
}

export function unlockScroll() {
    openDialogs -= 1;
    if (openDialogs > 0) return;
    const root = document.documentElement;
    root.style.overflow = "";
    root.style.paddingRight = "";
}

export default function useDialog(isOpen, initialFocusRef, { onClose, onKeyDown }) {
    // Keep the latest handlers without re-running the effect on every render
    const handlers = useRef({ onClose, onKeyDown });
    handlers.current = { onClose, onKeyDown };

    useEffect(() => {
        if (!isOpen) return;
        const previouslyFocused = document.activeElement;
        initialFocusRef.current?.focus();

        function handleKeyDown(event) {
            if (event.key === "Escape") {
                handlers.current.onClose();
            } else {
                handlers.current.onKeyDown?.(event);
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        lockScroll();

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            unlockScroll();
            previouslyFocused?.focus?.();
        };
    }, [isOpen, initialFocusRef]);
}
