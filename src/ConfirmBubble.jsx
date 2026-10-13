import { useEffect, useRef } from "react";
import "./ConfirmBubble.css";

// A small pop-up bubble above the buttons it belongs to (their wrapper needs
// position: relative): the question, Confirm and Cancel. Above, so there's
// always room, even for the last entry in a list. A tap anywhere else
// cancels it. (Injuries' Healed? / Delete, Integration Reports' Delete)
//   danger: a destructive action (Delete): Confirm is red, never green
//   onCancel: keep it the same function between renders (useCallback)
export default function ConfirmBubble({ question, busy, danger = false, onConfirm, onCancel }) {
    const ref = useRef(null);
    const confirmRef = useRef(null);
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
