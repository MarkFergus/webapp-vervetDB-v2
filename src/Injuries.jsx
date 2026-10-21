import { useCallback, useEffect, useState } from "react";
import ConfirmBubble from "./ConfirmBubble";
import { IconChevronDown, IconPencil, IconTrash } from "@tabler/icons-react";
import {
    addInjury,
    addInjuryUpdate,
    deleteInjury,
    deleteInjuryUpdate,
    injuryUpdatesAvailable,
    loadInjuries,
    saveInjury,
    saveInjuryUpdate,
    setInjuryHealed,
} from "./monkeyData";
import { summaryDate } from "./feeding";
import useScrollIntoView from "./useScrollIntoView";
import { useFormLock } from "./formLock";
import "./IntegrationReports.css";

// Injuries: a section of a monkey's pop-up (staff only). Editors
// and admins add them (Quick Actions → New Injury) and mark them Healed?,
// which moves them to the Injury History (kept on record); admins or whoever added
// one can change or delete it. Listed like the Integration Reports.
// A current injury can have dated updates ("wound healing well"), added the
// same way, listed under it (and on the Monitoring Notes).
// (supabase/injuries.sql, monitoring.sql)

export const MAX_INJURY = 500;

const dayText = (date) => summaryDate(new Date(`${date}T00:00:00`));

// The injuries of one monkey, loaded when staff open it. available: the
// database has them (false before injuries.sql, or offline), and this is staff.
//   staff: { canSee, canAdd, userId, isAdmin } or null
export function useInjuries(monkeyId, staff) {
    const enabled = Boolean(staff?.canSee && monkeyId != null);
    const [state, setState] = useState({ entries: [], available: false });
    useEffect(() => {
        if (!enabled) {
            setState({ entries: [], available: false });
            return;
        }
        let cancelled = false;
        loadInjuries(monkeyId)
            .then((entries) => !cancelled && setState({ entries, available: true }))
            .catch(() => !cancelled && setState({ entries: [], available: false }));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled]);

    // Newest first
    const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const change = (fn) => setState((s) => ({ ...s, entries: sorted(fn(s.entries)) }));
    // (a saved injury comes back without its updates: it keeps the ones it had)
    const replace = (saved) =>
        change((list) => list.map((e) => (e.id === saved.id ? { ...saved, updates: e.updates ?? [] } : e)));
    // An injury's updates, changed (oldest first)
    const changeUpdates = (injuryId, fn) =>
        change((list) =>
            list.map((e) =>
                e.id === injuryId
                    ? { ...e, updates: fn(e.updates ?? []).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id) }
                    : e
            )
        );
    const canAdd = state.available && Boolean(staff?.canAdd);
    return {
        available: state.available,
        current: state.entries.filter((e) => !e.healedOn),
        healed: state.entries.filter((e) => e.healedOn),
        canAdd,
        // Updates: once the database has them (monitoring.sql)
        canAddUpdate: canAdd && injuryUpdatesAvailable(),
        // Admins, or whoever added it (an injury or an update)
        canChange: (entry) => state.available && Boolean(staff?.isAdmin || (staff?.userId && entry.loggedBy === staff.userId)),
        async addUpdate(injuryId, values) {
            const saved = await addInjuryUpdate(injuryId, values);
            changeUpdates(injuryId, (list) => [...list, saved]);
        },
        async saveUpdate(injuryId, id, values) {
            const saved = await saveInjuryUpdate(id, values);
            changeUpdates(injuryId, (list) => list.map((u) => (u.id === id ? saved : u)));
        },
        async removeUpdate(injuryId, id) {
            await deleteInjuryUpdate(id);
            changeUpdates(injuryId, (list) => list.filter((u) => u.id !== id));
        },
        async add(values) {
            const saved = await addInjury(monkeyId, values);
            change((list) => [...list, saved]);
        },
        async update(id, values) {
            replace(await saveInjury(id, values));
        },
        async setHealed(id, healed) {
            replace(await setInjuryHealed(id, healed));
        },
        async remove(id) {
            await deleteInjury(id);
            change((list) => list.filter((e) => e.id !== id));
        },
    };
}

// Date, then the description, then Confirm and Cancel.
//   initial: { date, description }; onSave(values) async (throws a message
//   to show); onCancel(); scrollIntoView: scroll to it as it opens (Edit)
//   kind: "injury", or "update" (an update on one: "Details")
export function InjuryForm({ initial, max, onSave, onCancel, scrollIntoView = false, kind = "injury" }) {
    const isUpdate = kind === "update";
    // (holds the pop-up while it's open: see formLock.js)
    useFormLock();
    // Editing in a list: brought fully into view as it opens
    const formRef = useScrollIntoView(scrollIntoView);
    const [values, setValues] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const description = values.description.trim();
    const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });

    async function confirm() {
        if (!values.date) return setProblem("Please choose the date.");
        if (!description) return setProblem(isUpdate ? "Please write the update." : "Please describe the injury.");
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ date: values.date, description });
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="Integration-form" ref={formRef}>
            <label>
                <span>Date</span>
                <input type="date" value={values.date} max={max} onChange={set("date")} />
            </label>
            <label>
                <span>{isUpdate ? "Details" : "Description"}</span>
                <textarea
                    rows={isUpdate ? 3 : 4}
                    value={values.description}
                    maxLength={MAX_INJURY}
                    onChange={set("description")}
                    placeholder={isUpdate ? "How is it looking now?" : "What is the injury, and where?"}
                />
            </label>
            <span className="Integration-count">
                {values.description.length} / {MAX_INJURY}
            </span>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="Integration-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={confirm}>
                    {busy ? "Saving…" : "Confirm"}
                </button>
                <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// One update under an injury: its date and details (Edit / Delete on the
// right, for admins or whoever added it)
function UpdateItem({ injuryId, update, injuries, today }) {
    const [mode, setMode] = useState(null); // "edit" or "delete"
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const cancel = useCallback(() => setMode(null), []);

    if (mode === "edit") {
        return (
            <li>
                <InjuryForm
                    kind="update"
                    scrollIntoView
                    initial={{ date: update.date, description: update.details }}
                    max={today}
                    onSave={async ({ date, description }) => {
                        await injuries.saveUpdate(injuryId, update.id, { date, details: description });
                        setMode(null);
                    }}
                    onCancel={cancel}
                />
            </li>
        );
    }
    return (
        <li className="Injury-update">
            <div className="Injury-line">
                <b className="Injury-date">{dayText(update.date)}</b>
                <p className="Injury-text">{update.details}</p>
                {injuries.canChange(update) && (
                    <span className="Injury-tools">
                        <button
                            type="button"
                            className="Integration-icon is-edit"
                            aria-label="Edit update"
                            title="Edit"
                            onClick={() => setMode("edit")}
                        >
                            <IconPencil size={16} aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className="Integration-icon is-delete"
                            aria-label="Delete update"
                            title="Delete"
                            onClick={() => setMode("delete")}
                        >
                            <IconTrash size={16} aria-hidden="true" />
                        </button>
                        {mode === "delete" && (
                            <ConfirmBubble
                                question="Delete this update?"
                                danger
                                busy={busy}
                                onConfirm={async () => {
                                    setBusy(true);
                                    setProblem(null);
                                    try {
                                        await injuries.removeUpdate(injuryId, update.id);
                                    } catch (err) {
                                        setProblem(err.message);
                                        setBusy(false);
                                        setMode(null);
                                    }
                                }}
                                onCancel={cancel}
                            />
                        )}
                    </span>
                )}
            </div>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
        </li>
    );
}

// One injury in a list: its date (Edit / Delete icons on the right), the
// description, who added it, and Healed? (current) or when it healed (Injury
// History); then its updates, and Add Update (current ones)
function InjuryItem({ entry, injuries, today }) {
    const [mode, setMode] = useState(null); // "edit", "delete", "healed" (to confirm) or "update" (adding one)
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    const cancel = useCallback(() => setMode(null), []);

    async function run(fn) {
        setBusy(true);
        setProblem(null);
        try {
            await fn();
            setMode(null);
        } catch (err) {
            setProblem(err.message);
        } finally {
            setBusy(false);
        }
    }

    if (mode === "edit") {
        return (
            <li>
                <InjuryForm
                    scrollIntoView
                    initial={{ date: entry.date, description: entry.description }}
                    max={today}
                    onSave={async (values) => {
                        await injuries.update(entry.id, values);
                        setMode(null);
                    }}
                    onCancel={() => setMode(null)}
                />
            </li>
        );
    }

    return (
        <li className="Injury">
            {/* One line: the date, the description, then Healed? / Reopen and
                Edit / Delete on the right (on phones the description wraps) */}
            <div className="Injury-line">
                <b className="Injury-date">{dayText(entry.date)}</b>
                <p className="Injury-text">{entry.description}</p>
                <span className="Injury-tools">
                    {/* Editors and admins: Healed? on a current one; Reopen
                        on a healed one (if it was marked by mistake) */}
                    {injuries.canAdd && (
                        <button
                            type="button"
                            className="Modal-edit is-soft Injury-healed"
                            disabled={busy}
                            onClick={() => (entry.healedOn ? run(() => injuries.setHealed(entry.id, false)) : setMode("healed"))}
                        >
                            {entry.healedOn ? (busy ? "Saving…" : "Reopen") : "Healed?"}
                        </button>
                    )}
                    {injuries.canChange(entry) && (
                        <>
                            <button
                                type="button"
                                className="Integration-icon is-edit"
                                aria-label="Edit"
                                title="Edit"
                                onClick={() => setMode("edit")}
                            >
                                <IconPencil size={17} aria-hidden="true" />
                            </button>
                            <button
                                type="button"
                                className="Integration-icon is-delete"
                                aria-label="Delete"
                                title="Delete"
                                onClick={() => setMode("delete")}
                            >
                                <IconTrash size={17} aria-hidden="true" />
                            </button>
                        </>
                    )}
                    {mode === "delete" && (
                        <ConfirmBubble
                            question="Delete this injury?"
                            danger
                            busy={busy}
                            onConfirm={() => run(() => injuries.remove(entry.id))}
                            onCancel={cancel}
                        />
                    )}
                    {mode === "healed" && (
                        <ConfirmBubble
                            question="Mark as healed?"
                            busy={busy}
                            onConfirm={() => run(() => injuries.setHealed(entry.id, true))}
                            onCancel={cancel}
                        />
                    )}
                </span>
            </div>
            {/* Who added it (and healed it), on one small line */}
            <span className="Integration-by">
                Added by {entry.loggedByName ?? "Staff"} on {summaryDate(new Date(entry.loggedAt))}
                {entry.healedOn &&
                    ` · Healed on ${dayText(entry.healedOn)}${entry.healedByName ? ` by ${entry.healedByName}` : ""}`}
            </span>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {/* Its updates, oldest first */}
            {entry.updates?.length > 0 && (
                <ul className="Injury-updates" aria-label="Updates">
                    {entry.updates.map((update) => (
                        <UpdateItem key={update.id} injuryId={entry.id} update={update} injuries={injuries} today={today} />
                    ))}
                </ul>
            )}
            {mode === "update" ? (
                <InjuryForm
                    kind="update"
                    scrollIntoView
                    initial={{ date: today, description: "" }}
                    max={today}
                    onSave={async ({ date, description }) => {
                        await injuries.addUpdate(entry.id, { date, details: description });
                        setMode(null);
                    }}
                    onCancel={cancel}
                />
            ) : (
                !entry.healedOn &&
                injuries.canAddUpdate && (
                    <button type="button" className="Modal-edit is-soft Injury-addUpdate" onClick={() => setMode("update")}>
                        Add Update
                    </button>
                )
            )}
        </li>
    );
}

// The Injuries section: current injuries (open), and the healed ones under
// Injury History (folded away). Hidden until the monkey has had an injury.
//   open / onToggle: the current list's fold (Quick Actions opens it after
//   adding one)
export function InjuriesSection({ injuries, open, onToggle, today }) {
    const [historyOpen, setHistoryOpen] = useState(false);
    const { current, healed } = injuries;
    if (!injuries.available || current.length + healed.length === 0) return null;

    return (
        <section className="Integration-list Injuries">
            <button type="button" className="Integration-toggle" aria-expanded={open} onClick={onToggle}>
                Injuries ({current.length})
                <IconChevronDown size={16} stroke={2.5} aria-hidden="true" />
            </button>
            {open &&
                (current.length ? (
                    <ul>
                        {current.map((entry) => (
                            <InjuryItem key={entry.id} entry={entry} injuries={injuries} today={today} />
                        ))}
                    </ul>
                ) : (
                    <p className="Integration-none">No current injuries.</p>
                ))}
            {healed.length > 0 && (
                <>
                    <button
                        type="button"
                        className="Integration-toggle"
                        aria-expanded={historyOpen}
                        onClick={() => setHistoryOpen((o) => !o)}
                    >
                        Injury History ({healed.length})
                        <IconChevronDown size={16} stroke={2.5} aria-hidden="true" />
                    </button>
                    {historyOpen && (
                        <ul>
                            {healed.map((entry) => (
                                <InjuryItem key={entry.id} entry={entry} injuries={injuries} today={today} />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </section>
    );
}
