import { useEffect, useState } from "react";
import { IconPlus, IconTool, IconTrash } from "@tabler/icons-react";
import { addMaintenance, deleteMaintenance, loadMaintenance } from "./monkeyData";
import "./MaintenanceLog.css";

// An enclosure's maintenance log: dated entries, newest first, each with who
// wrote it in. Editors can add entries; admins can delete them.
//   live: the database has the log (false before enclosures.sql, or offline)

// Today, as "2026-10-07" (in the phone's own time zone)
function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "2026-10-05" → "5 Oct 2026"
function dayText(date) {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function MaintenanceLog({ enclosure, live, canAdd, canDelete }) {
    const [entries, setEntries] = useState(undefined); // undefined = loading
    const [problem, setProblem] = useState(null);
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState({ doneOn: today(), details: "" });
    const [busy, setBusy] = useState(false);
    const [confirming, setConfirming] = useState(null); // the entry id to delete

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

    async function handleAdd(event) {
        event.preventDefault();
        const details = draft.details.trim();
        if (!details) {
            setProblem("Please say what was done.");
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            const saved = await addMaintenance(enclosure.id, { doneOn: draft.doneOn, details });
            // Newest first, by the day it was done
            setEntries((list) =>
                [saved, ...(list ?? [])].sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.id - a.id)
            );
            setDraft({ doneOn: today(), details: "" });
            setAdding(false);
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
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
                    <form className="MaintenanceLog-form" onSubmit={handleAdd}>
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
                        <div className="MaintenanceLog-buttons">
                            <button
                                type="button"
                                className="MaintenanceLog-button is-quiet"
                                onClick={() => {
                                    setAdding(false);
                                    setProblem(null);
                                }}
                                disabled={busy}
                            >
                                Cancel
                            </button>
                            <button type="submit" className="MaintenanceLog-button is-save" disabled={busy}>
                                {busy ? "Adding…" : "Add Entry"}
                            </button>
                        </div>
                    </form>
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
                    {entries.map((entry) => (
                        <li key={entry.id} className="MaintenanceLog-entry">
                            <time dateTime={entry.doneOn}>{dayText(entry.doneOn)}</time>
                            <p>{entry.details}</p>
                            <span className="MaintenanceLog-who">
                                {entry.loggedBy ? `Logged by ${entry.loggedBy}` : "Logged"}
                            </span>
                            {canDelete &&
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
                                    <button
                                        type="button"
                                        className="MaintenanceLog-delete"
                                        aria-label={`Delete the entry from ${dayText(entry.doneOn)}`}
                                        onClick={() => setConfirming(entry.id)}
                                    >
                                        <IconTrash size={16} aria-hidden="true" />
                                    </button>
                                ))}
                        </li>
                    ))}
                </ol>
            ) : entries ? (
                <p className="Enclosures-none">Nothing logged yet.</p>
            ) : null}
        </div>
    );
}

export default MaintenanceLog;
