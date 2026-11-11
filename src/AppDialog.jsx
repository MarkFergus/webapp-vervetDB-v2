import { useRef } from "react";
import { createRoot } from "react-dom/client";
import useDialog from "./useDialog";
import "./Modal.css"; // the buttons
import "./AppDialog.css";

// The app's own small centred pop-up, in place of the browser's confirm()
// and alert() boxes:
//   askConfirm({ message, confirmLabel, cancelLabel }) → true / false
//     e.g. "Discard your changes?" — Discard (red) / Keep Editing
//   showNotice(message) → when OK is pressed
// Escape, a tap outside, or the safe button (Keep Editing / OK) closes it;
// the safe button has the focus, so Enter never discards by accident.
// It draws itself on the page (its own root), so it works from anywhere —
// even after the form that showed it has closed.
let root = null;
let holder = null;
let opened = 0;
let finishOpen = null;

function render(dialog) {
    if (!holder) {
        holder = document.createElement("div");
        holder.className = "AppDialog-root";
        root = createRoot(holder);
    }
    if (!holder.isConnected) document.body.appendChild(holder);
    root.render(dialog);
}

function open(props) {
    // (a second one replaces the first, which counts as its safe answer)
    finishOpen?.(false);
    return new Promise((resolve) => {
        opened += 1;
        const id = opened;
        finishOpen = (answer) => {
            if (finishOpen === null || id !== opened) return;
            finishOpen = null;
            render(null);
            resolve(answer);
        };
        const finish = finishOpen;
        render(<AppDialog key={id} {...props} onAnswer={finish} />);
    });
}

export function askConfirm({ message, confirmLabel = "Confirm", cancelLabel = "Cancel" }) {
    return open({ message, confirmLabel, cancelLabel });
}

// A form closing with unsaved changes. `asking` (a ref) is true while it's
// up, so another Escape or ✕ meanwhile doesn't ask again.
export async function askDiscard(asking) {
    asking.current = true;
    const discard = await askConfirm({ message: "Discard your changes?", confirmLabel: "Discard", cancelLabel: "Keep Editing" });
    asking.current = false;
    return discard;
}

export async function showNotice(message) {
    await open({ message, cancelLabel: "OK" });
}

function AppDialog({ message, confirmLabel, cancelLabel, onAnswer }) {
    const safeRef = useRef(null);
    useDialog(true, safeRef, { onClose: () => onAnswer(false) });
    return (
        <div className="AppDialog" onPointerDown={(event) => event.target === event.currentTarget && onAnswer(false)}>
            <div className="AppDialog-box" role={confirmLabel ? "alertdialog" : "dialog"} aria-modal="true" aria-label={message}>
                <p className="AppDialog-message">{message}</p>
                <div className="AppDialog-buttons">
                    {confirmLabel && (
                        <button type="button" className="Modal-edit is-danger" onClick={() => onAnswer(true)}>
                            {confirmLabel}
                        </button>
                    )}
                    <button
                        type="button"
                        className={`Modal-edit ${confirmLabel ? "is-blue-outline" : "is-blue"}`}
                        onClick={() => onAnswer(false)}
                        ref={safeRef}
                    >
                        {cancelLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
