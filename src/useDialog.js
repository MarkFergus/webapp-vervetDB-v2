import { useEffect, useRef } from "react";

// Keyboard and focus behaviour shared by the modals:
// - when the dialog opens, focus moves to `initialFocusRef` (e.g. its close button)
// - Escape calls onClose; any other key goes to onKeyDown (optional)
// - when it closes, focus goes back to whatever was focused before it opened
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

        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            previouslyFocused?.focus?.();
        };
    }, [isOpen, initialFocusRef]);
}
