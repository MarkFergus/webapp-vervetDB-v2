import { useEffect, useLayoutEffect, useRef } from "react";
import "./ConfirmBubble.css";

// A small pop-up bubble above the buttons it belongs to (their wrapper needs
// position: relative): the question, Confirm and Cancel. Above, so there's
// always room, even for the last entry in a list. A tap anywhere else
// cancels it. Kept on screen: a button near the screen's edge (Submit on a
// phone) moves its bubble in. (Injuries' Healed? / Delete, Integration
// Reports' Delete, Deworming's Submit / Approve)
//   danger: a destructive action (Delete): Confirm is red, never green
//   onCancel: keep it the same function between renders (useCallback)
export default function ConfirmBubble({ question, busy, danger = false, onConfirm, onCancel }) {
    const ref = useRef(null);
    const confirmRef = useRef(null);
    // (off the screen's edge: moved in, 16px from it)
    useLayoutEffect(() => {
        const bubble = ref.current;
        const box = bubble?.getBoundingClientRect();
        if (!box?.width) return;
        const edge = 16;
        const shift =
            box.left < edge
                ? edge - box.left
                : box.right > window.innerWidth - edge
                  ? window.innerWidth - edge - box.right
                  : 0;
        if (shift) bubble.style.right = `${-shift}px`;
    }, []);
    useEffect(() => {
        confirmRef.current?.focus();
        function handlePointerDown(event) {
            if (!ref.current?.contains(event.target)) onCancel();
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [onCancel]);
    return (
        <span className="ConfirmBubble" role="dialog" aria-label={question} ref={ref}>
            <span className="ConfirmBubble-question">{question}</span>
            <span className="ConfirmBubble-buttons">
                <button
                    type="button"
                    className={`Modal-edit ${danger ? "is-danger" : "is-confirm"}`}
                    disabled={busy}
                    onClick={onConfirm}
                    ref={confirmRef}
                >
                    {busy ? "Saving…" : "Confirm"}
                </button>
                <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </span>
        </span>
    );
}
