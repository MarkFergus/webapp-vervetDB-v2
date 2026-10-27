import { useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";
import {
    DATE_LABELS,
    DETAILS_HINTS,
    MAX_STATUS_DETAILS,
    STATUS_WORDS,
    removeWarning,
    restoreWarning,
} from "./monkeyStatus";

// Today as the date box wants it ("2026-10-27")
const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Status Update's little form (admins): the new status, its date (the
// label follows the status: Date of Death, Last Seen…) and the details
// (always needed: there's always context). Confirm first shows what it
// will do (leaving the current records, or coming back to them), then
// saves.
//   choices: the statuses offered ("sanctuary" shown as a restore)
//   home: its home location, in words (for a restore's warning)
//   onSave({ status, date, details }): async; a thrown error shows here
function StatusUpdate({ name, choices, home = null, onSave, onCancel }) {
    const [form, setForm] = useState({ status: choices.length === 1 ? choices[0] : "", date: todayText(), details: "" });
    // false: filling it in; true: the warning, waiting for the last Confirm
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const ready = Boolean(form.status && form.date && form.date <= todayText() && form.details.trim());
    const restoring = form.status === "sanctuary";
    const change = (field, value) => {
        setForm((f) => ({ ...f, [field]: value }));
        setProblem(null);
    };

    async function save() {
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ ...form, details: form.details.trim() });
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="Modal-sickbayForm StatusUpdate">
            {checking ? (
                <p className={`StatusUpdate-warning${restoring ? " is-restore" : ""}`} role="alert">
                    <IconAlertTriangle size={18} aria-hidden="true" />
                    <span>{restoring ? restoreWarning(name, home) : removeWarning(name)}</span>
                </p>
            ) : (
                <>
                    <label>
                        <span>New Status</span>
                        <select value={form.status} onChange={(e) => change("status", e.target.value)}>
                            {!form.status && <option value="">Choose…</option>}
                            {choices.map((status) => (
                                <option key={status} value={status}>
                                    {status === "sanctuary" ? "Sanctuary (Restore)" : STATUS_WORDS[status]}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label>
                        <span>{DATE_LABELS[form.status] ?? "Date"}</span>
                        <input
                            type="date"
                            value={form.date}
                            max={todayText()}
                            onChange={(e) => change("date", e.target.value)}
                        />
                    </label>
                    <label>
                        <span>Status Details</span>
                        <textarea
                            rows={4}
                            value={form.details}
                            maxLength={MAX_STATUS_DETAILS}
                            placeholder={DETAILS_HINTS[form.status] ?? "What happened"}
                            onChange={(e) => change("details", e.target.value)}
                        />
                    </label>
                </>
            )}
            {problem && (
                <p className="Modal-sickbayProblem" role="alert">
                    {problem}
                </p>
            )}
            <div className="Modal-sickbayActions">
                {checking ? (
                    <>
                        <button
                            type="button"
                            className={`Modal-edit ${restoring ? "is-confirm" : "is-danger"}`}
                            disabled={busy}
                            onClick={save}
                        >
                            {busy ? "Saving…" : "Confirm"}
                        </button>
                        <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={() => setChecking(false)}>
                            Back
                        </button>
                    </>
                ) : (
                    <>
                        <button type="button" className="Modal-edit is-confirm" disabled={!ready} onClick={() => setChecking(true)}>
                            Confirm
                        </button>
                        <button type="button" className="Modal-edit is-quiet" onClick={onCancel}>
                            Cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

export default StatusUpdate;
