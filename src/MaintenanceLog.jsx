import { useEffect, useRef, useState } from "react";
import { IconPencil, IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { addMaintenance, deleteMaintenance, loadMaintenance, maintenanceKindsAvailable, saveMaintenance } from "./monkeyData";
import "./MaintenanceLog.css";

// An enclosure's maintenance log: dated entries, newest first, each with its
// Maintenance Type (Routine or Repair) and who wrote it in. Staff (any role:
// maintenance staff too) add entries, and change or delete their own;
// admins change or delete anyone's (maintenance-own.sql).
//   live: the database has the log (false before enclosures.sql, or offline)
//   canAdd: staff, with the database live; me: { userId, isAdmin }

// Today, as "2026-10-07" (in the phone's own time zone)
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// The Maintenance Types (supabase/maintenance-kind.sql)
export const MAINTENANCE_TYPES = { routine: "Routine", repair: "Repair" };

// "2026-10-05" → "5 Oct 2026"
function dayText(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// The date and (beside it) Routine or Repair, then what was done; Cancel
// and the save button. Adding, and changing an entry.
//   initial: { doneOn, kind, details }; onSave(values) async (throws a
//   message to show); saveLabel / busyLabel: "Add Entry" / "Adding…"
// (Records → Maintenance uses it too, to change a report)
export function EntryForm({ initial, onSave, onCancel, saveLabel, busyLabel }) {
    const formRef = useRef(null);
    const [draft, setDraft] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    // Phones: typing opens the keyboard over the bottom half, so the form
    // moves up to the top (under the page's bars); again once the keyboard
    // is up, as it shrinks the screen
    const toTop = () => {
        if (!window.matchMedia?.("(max-width: 624px)").matches) return;
        const go = () => formRef.current?.scrollIntoView?.({ block: "start", behavior: "auto" });
        go();
        setTimeout(go, 350);
    };

    async function handleSubmit(event) {
        event.preventDefault();
        const details = draft.details.trim();
        // (once the database has them)
        if (maintenanceKindsAvailable() && !draft.kind) {
            setProblem("Please choose the Maintenance Type.");
            return;
        }
        if (!details) {
            setProblem("Please say what was done.");
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ doneOn: draft.doneOn, kind: draft.kind, details });
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <form className="MaintenanceLog-form" ref={formRef} onSubmit={handleSubmit} onFocus={toTop}>
            {/* The date, and beside it Routine or Repair */}
            <div className="MaintenanceLog-row">
                <label className="MaintenanceLog-field is-date">
                    <span>Date done</span>
                    <input
                        type="date"
                        value={draft.doneOn}
                        max={today()}
                        required
                        onChange={(e) => setDraft({ ...draft, doneOn: e.target.value })}
                    />
                </label>
                {maintenanceKindsAvailable() && (
                    <label className="MaintenanceLog-field is-kind">
                        <span>Maintenance Type</span>
                        <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })}>
                            <option value="">Choose…</option>
                            {Object.entries(MAINTENANCE_TYPES).map(([value, label]) => (
                                <option key={value} value={value}>
                                    {label}
                                </option>
                            ))}
                        </select>
                    </label>
                )}
            </div>
            <label className="MaintenanceLog-field">
                <span>What was done</span>
                <textarea
                    rows={3}
                    value={draft.details}
                    autoFocus
                    placeholder="e.g. Replaced the shade cloth on the climbing frame"
                    onChange={(e) => setDraft({ ...draft, details: e.target.value })}
                />
            </label>
            {problem && (
                <p className="MaintenanceLog-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="MaintenanceLog-buttons">
                <button type="button" className="MaintenanceLog-button is-quiet" onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
                <button type="submit" className="MaintenanceLog-button is-save" disabled={busy}>
                    {busy ? busyLabel : saveLabel}
                </button>
            </div>
        </form>
    );
}

function MaintenanceLog({ enclosure, live, canAdd, me = {} }) {
    const [entries, setEntries] = useState(undefined); // undefined = loading
    const [problem, setProblem] = useState(null);
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null); // the entry id being changed
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(null); // the entry id to delete
    // Their own entries (admins: anyone's)
    const canChange = (entry) => canAdd && Boolean(me.isAdmin || (me.userId && entry.loggedById === me.userId));
    // Newest first, by the day it was done
    const inOrder = (list) => [...list].sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.id - a.id);

    useEffect(() => {
        if (!live) return;
        let cancelled = false;
        loadMaintenance(enclosure.id)
            .then((list) => !cancelled && setEntries(list))
            .catch((error) => !cancelled && setProblem(error.message));
        return () => {
            cancelled = true;
        };
    }, [enclosure.id, live]);

    if (!live) {
        return (
            <p className="Enclosures-none">
                <IconTool size={15} aria-hidden="true" /> The maintenance log will show here once vervetDB is online.
            </p>
        );
    }

    async function handleAdd(values) {
        const saved = await addMaintenance(enclosure.id, values);
        setEntries((list) => inOrder([saved, ...(list ?? [])]));
        setAdding(false);
    }

    async function handleSave(id, values) {
        const saved = await saveMaintenance(id, values);
        setEntries((list) => inOrder(list.map((e) => (e.id === id ? saved : e))));
        setEditing(null);
    }

    async function handleDelete(id) {
        setBusy(true);
        setProblem(null);
        try {
            await deleteMaintenance(id);
            setEntries((list) => list.filter((e) => e.id !== id));
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
            setConfirming(null);
        }
    }

    return (
        <div className="MaintenanceLog">
            {canAdd &&
                (adding ? (
                    <EntryForm
                        initial={{ doneOn: today(), kind: "", details: "" }}
                        onSave={handleAdd}
                        onCancel={() => setAdding(false)}
                        saveLabel="Add Entry"
                        busyLabel="Adding…"
                    />
                ) : (
                    <button type="button" className="MaintenanceLog-add" onClick={() => setAdding(true)}>
                        <IconPlus size={16} aria-hidden="true" />
                        Add Entry
                    </button>
                ))}

            {problem && (
                <p className="MaintenanceLog-problem" role="alert">
                    {problem}
                </p>
            )}

            {entries === undefined && !problem ? (
                <p className="Enclosures-none">Loading the log…</p>
            ) : entries?.length ? (
                <ol className="MaintenanceLog-list">
                    {entries.map((entry) =>
                        editing === entry.id ? (
                            <li key={entry.id} className="MaintenanceLog-editing">
                                <EntryForm
                                    initial={{ doneOn: entry.doneOn, kind: entry.kind ?? "", details: entry.details }}
                                    onSave={(values) => handleSave(entry.id, values)}
                                    onCancel={() => setEditing(null)}
                                    saveLabel="Save"
                                    busyLabel="Saving…"
                                />
                            </li>
                        ) : (
                        <li key={entry.id} className="MaintenanceLog-entry">
                            {/* The date, with its Maintenance Type under it */}
                            <span className="MaintenanceLog-when">
                                <time dateTime={entry.doneOn}>{dayText(entry.doneOn)}</time>
                                {entry.kind && (
                                    <span className={`MaintenanceLog-kind is-${entry.kind}`}>{MAINTENANCE_TYPES[entry.kind]}</span>
                                )}
                            </span>
                            <p>{entry.details}</p>
                            <span className="MaintenanceLog-who">
                                {entry.loggedBy ? `Logged by ${entry.loggedBy}` : "Logged"}
                            </span>
                            {/* Edit / Delete: their own (admins: anyone's) */}
                            {canChange(entry) &&
                                (confirming === entry.id ? (
                                    <span className="MaintenanceLog-confirm">
                                        Delete this entry?
                                        <button type="button" onClick={() => setConfirming(null)} disabled={busy}>
                                            Keep
                                        </button>
                                        <button
                                            type="button"
                                            className="is-danger"
                                            onClick={() => handleDelete(entry.id)}
                                            disabled={busy}
                                        >
                                            Delete
                                        </button>
                                    </span>
                                ) : (
                                    <span className="MaintenanceLog-icons">
                                        <button
                                            type="button"
                                            className="MaintenanceLog-icon is-edit"
                                            aria-label={`Edit the entry from ${dayText(entry.doneOn)}`}
                                            title="Edit"
                                            onClick={() => setEditing(entry.id)}
                                        >
                                            <IconPencil size={16} aria-hidden="true" />
                                        </button>
                                        <button
                                            type="button"
                                            className="MaintenanceLog-icon is-delete"
                                            aria-label={`Delete the entry from ${dayText(entry.doneOn)}`}
                                            title="Delete"
                                            onClick={() => setConfirming(entry.id)}
                                        >
                                            <IconTrash size={16} aria-hidden="true" />
                                        </button>
                                    </span>
                                ))}
                        </li>
                        )
                    )}
                </ol>
            ) : entries ? (
                <p className="Enclosures-none">Nothing logged yet.</p>
            ) : null}
        </div>
    );
}

export default MaintenanceLog;
