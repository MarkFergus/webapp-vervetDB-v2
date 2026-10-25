import { useCallback, useEffect, useState } from "react";
import { IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import ConfirmBubble from "./ConfirmBubble";
import { addRecord, deleteRecord, loadRecords, saveRecord } from "./monkeyData";
import { IntegrationForm, newReportDates } from "./IntegrationReports";
import { summaryDate } from "./feeding";
import useScrollIntoView from "./useScrollIntoView";
import "./IntegrationReports.css";
import "./MonkeyRecords.css";

// A monkey's records, on its page (staff only), one list per tab:
//   Rehabilitation, Medical   Date | Category | Details; staff add them with
//     "+ New … Record" (supabase/monkey-records.sql). Every move adds a
//     Movement record by itself (movement-records.sql). Injuries (and their
//     updates) are listed in with Medical's; those are changed where
//     they're added (the pop-up's Quick Actions).
//   Integration   Date Start | Date End | Integration Report
//     (supabase/integration-reports.sql)

export const MAX_RECORD = 1000;

// "+ New Rehabilitation / Medical Record": off for now, while staff try out
// Integration first (the lists still show). true turns them back on.
export const NEW_RECORDS_OPEN = false;

// Each section's name and categories, in the drop-down's order
export const SECTIONS = {
    rehabilitation: {
        title: "Rehabilitation",
        // (integration: its own tab now, so not offered; the database still
        // allows it)
        categories: { movement: "Movement", observation: "Observation", escape: "Escape" },
    },
    medical: {
        title: "Medical",
        categories: {
            injury: "Injury",
            medicine: "Medicine",
            treatment: "Treatment",
            vet_visit: "Vet Visit",
            observation: "Observation",
        },
    },
};

const dayText = (date) => summaryDate(new Date(`${date}T00:00:00`));

// Today as the date box wants it ("2026-10-21")
const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const isWriterOrAdmin = (staff, entry) =>
    !staff?.readOnly && Boolean(staff?.isAdmin || (staff?.userId && entry.loggedBy === staff.userId));

// One monkey's records, loaded when staff open its page. available: the
// database has them (false before monkey-records.sql, or offline), and
// this is staff.
//   staff: { canSee, canAdd, userId, isAdmin, readOnly (limited) } or null
export function useRecords(monkeyId, staff) {
    const enabled = Boolean(staff?.canSee && monkeyId != null);
    const [state, setState] = useState({ entries: [], available: false });
    useEffect(() => {
        if (!enabled) {
            setState({ entries: [], available: false });
            return;
        }
        let cancelled = false;
        loadRecords(monkeyId)
            .then((entries) => !cancelled && setState({ entries, available: true }))
            .catch(() => !cancelled && setState({ entries: [], available: false }));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled]);

    const sorted = (list) => [...list].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const change = (fn) => setState((s) => ({ ...s, entries: sorted(fn(s.entries)) }));
    return {
        available: state.available,
        entries: state.entries,
        canAdd: NEW_RECORDS_OPEN && state.available && Boolean(staff?.canAdd),
        // Admins, or whoever wrote it. A Movement record is a log of what
        // happened: never changed, and only admins delete one
        // (movement-records.sql)
        canEdit: (entry) => state.available && entry.category !== "movement" && isWriterOrAdmin(staff, entry),
        canDelete: (entry) =>
            state.available && Boolean(staff?.isAdmin || (entry.category !== "movement" && isWriterOrAdmin(staff, entry))),
        async add(values) {
            const saved = await addRecord(monkeyId, values);
            change((list) => [...list, saved]);
        },
        async update(id, values) {
            const saved = await saveRecord(id, values);
            change((list) => list.map((e) => (e.id === id ? saved : e)));
        },
        async remove(id) {
            await deleteRecord(id);
            change((list) => list.filter((e) => e.id !== id));
        },
    };
}

// The records kept elsewhere, as rows of a section's list (not changed
// here): { key, date, category, details, by }. Medical: its injuries and
// their updates. (Rehabilitation: none; its moves are Movement records of
// its own, added by the database: movement-records.sql)
export function otherRows(section, { injuries }) {
    if (section !== "medical") return [];
    return [...injuries.current, ...injuries.healed].flatMap((e) => [
        {
            key: `injury-${e.id}`,
            date: e.date,
            category: "injury",
            details: e.healedOn ? `${e.description} (healed ${dayText(e.healedOn)})` : e.description,
            by: `Injury by ${e.loggedByName ?? "Staff"}`,
        },
        ...(e.updates ?? []).map((u) => ({
            key: `update-${u.id}`,
            date: u.date,
            category: "injury",
            details: `Update: ${u.details}`,
            by: `Injury update by ${u.loggedByName ?? "Staff"}`,
        })),
    ]);
}

// Edit / Delete at the end of a row (admins, or whoever wrote it). Delete
// asks first in a small bubble.
//   onEdit(); onDelete() async (throws a message to show)
//   (no onEdit / onDelete: that icon's left out)
function RowIcons({ onEdit, onDelete, question }) {
    const [deleting, setDeleting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const cancel = useCallback(() => setDeleting(false), []);
    async function remove() {
        setBusy(true);
        setProblem(null);
        try {
            await onDelete();
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
            setDeleting(false);
        }
    }
    return (
        <span className="Integration-icons Records-icons">
            {onEdit && (
                <button type="button" className="Integration-icon is-edit" aria-label="Edit" title="Edit" onClick={onEdit}>
                    <IconPencil size={17} aria-hidden="true" />
                </button>
            )}
            {onDelete && (
                <button
                    type="button"
                    className="Integration-icon is-delete"
                    aria-label="Delete"
                    title="Delete"
                    onClick={() => setDeleting(true)}
                >
                    <IconTrash size={17} aria-hidden="true" />
                </button>
            )}
            {deleting && <ConfirmBubble question={question} danger busy={busy} onConfirm={remove} onCancel={cancel} />}
            {problem && (
                <span className="Integration-problem Records-problem" role="alert">
                    {problem}
                </span>
            )}
        </span>
    );
}

// Date, Category, then the details, then Confirm and Cancel (like the
// pop-up's Quick Actions forms).
//   initial: { date, category, details }; onSave(values) async (throws a
//   message to show); onCancel()
function RecordForm({ section, initial, onSave, onCancel, scrollIntoView = false }) {
    const formRef = useScrollIntoView(scrollIntoView);
    const [values, setValues] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const details = values.details.trim();
    const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });
    const { categories } = SECTIONS[section];

    async function confirm() {
        if (!values.date) return setProblem("Please choose the date.");
        if (!values.category) return setProblem("Please choose a category.");
        if (!details) return setProblem("Please write the details.");
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ date: values.date, category: values.category, details });
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="Integration-form Records-form" ref={formRef}>
            <div className="Integration-dates">
                <label>
                    <span>Date</span>
                    <input type="date" value={values.date} max={todayText()} onChange={set("date")} />
                </label>
                <label>
                    <span>Category</span>
                    <select value={values.category} onChange={set("category")}>
                        <option value="" disabled>
                            Choose…
                        </option>
                        {Object.entries(categories).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <label>
                <span>Details</span>
                <textarea rows={4} value={values.details} maxLength={MAX_RECORD} onChange={set("details")} />
            </label>
            <span className="Integration-count">
                {values.details.length} / {MAX_RECORD}
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

// One section's list: "+ New … Record" at the top, then the records in
// columns (phones: date and category on a line, the details under them)
//   others: the records kept elsewhere (otherRows)
export function RecordList({ section, records, others }) {
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null); // a record id
    const { title, categories } = SECTIONS[section];

    const own = records.entries
        .filter((e) => e.section === section)
        .map((e) => ({ key: `record-${e.id}`, entry: e, date: e.date, category: e.category, details: e.details, by: `Added by ${e.loggedByName ?? "Staff"}` }));
    // Newest first ("Current location" first on the same day)
    const rows = [...others, ...own].sort((a, b) => b.date.localeCompare(a.date));

    return (
        <div className="Records">
            {records.canAdd &&
                (adding ? (
                    <RecordForm
                        section={section}
                        initial={{ date: todayText(), category: "", details: "" }}
                        onSave={async (values) => {
                            await records.add({ section, ...values });
                            setAdding(false);
                        }}
                        onCancel={() => setAdding(false)}
                    />
                ) : (
                    <button type="button" className="Modal-edit is-soft Records-new" onClick={() => setAdding(true)}>
                        <IconPlus size={18} aria-hidden="true" />
                        New {title} Record
                    </button>
                ))}
            {rows.length ? (
                <div className="Records-table" role="table" aria-label={`${title} records`}>
                    <div className="Records-row Records-header" role="row">
                        <span role="columnheader">Date</span>
                        <span role="columnheader">Category</span>
                        <span role="columnheader">Details</span>
                    </div>
                    {rows.map((row) =>
                        row.entry && editing === row.entry.id ? (
                            <div className="Records-editing" key={row.key}>
                                <RecordForm
                                    scrollIntoView
                                    section={section}
                                    initial={{ date: row.date, category: row.category, details: row.details }}
                                    onSave={async (values) => {
                                        await records.update(row.entry.id, values);
                                        setEditing(null);
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            </div>
                        ) : (
                            <div className="Records-row" role="row" key={row.key}>
                                <span className="Records-date" role="cell">
                                    {dayText(row.date)}
                                </span>
                                <span role="cell">
                                    <span className={`Records-category is-${row.category}`}>{categories[row.category] ?? row.category}</span>
                                </span>
                                <span className="Records-details" role="cell">
                                    <span className="Records-text">{row.details}</span>
                                    <span className="Integration-by">{row.by}</span>
                                </span>
                                {row.entry && (records.canEdit(row.entry) || records.canDelete(row.entry)) && (
                                    <RowIcons
                                        question="Delete this record?"
                                        onEdit={records.canEdit(row.entry) ? () => setEditing(row.entry.id) : undefined}
                                        onDelete={records.canDelete(row.entry) ? () => records.remove(row.entry.id) : undefined}
                                    />
                                )}
                            </div>
                        )
                    )}
                </div>
            ) : (
                <p className="Integration-none Records-none">No {title.toLowerCase()} records yet.</p>
            )}
        </div>
    );
}

// The Integration tab: "+ New Integration Report" at the top, then the
// reports in columns: Date Start | Date End | Integration Report, newest
// first (phones: the dates on a line, the report under them)
//   integration: useIntegration (IntegrationReports.jsx)
export function IntegrationRecords({ integration }) {
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null); // a report id
    return (
        <div className="Records">
            {integration.canAdd &&
                (adding ? (
                    <div className="Records-form">
                        <IntegrationForm
                            initial={{ ...newReportDates(), report: "" }}
                            onSave={async (values) => {
                                await integration.add(values);
                                setAdding(false);
                            }}
                            onCancel={() => setAdding(false)}
                        />
                    </div>
                ) : (
                    <button type="button" className="Modal-edit is-soft Records-new" onClick={() => setAdding(true)}>
                        <IconPlus size={18} aria-hidden="true" />
                        New Integration Report
                    </button>
                ))}
            {integration.entries.length ? (
                <div className="Records-table" role="table" aria-label="Integration reports">
                    <div className="Records-row Records-header is-integration" role="row">
                        <span role="columnheader">Date Start</span>
                        <span role="columnheader">Date End</span>
                        <span role="columnheader">Integration Report</span>
                    </div>
                    {integration.entries.map((entry) =>
                        editing === entry.id ? (
                            <div className="Records-editing" key={entry.id}>
                                <IntegrationForm
                                    scrollIntoView
                                    initial={{ from: entry.from, to: entry.to, report: entry.report }}
                                    onSave={async (values) => {
                                        await integration.update(entry.id, values);
                                        setEditing(null);
                                    }}
                                    onCancel={() => setEditing(null)}
                                />
                            </div>
                        ) : (
                            <div className="Records-row is-integration" role="row" key={entry.id}>
                                <span className="Records-date" role="cell">
                                    {dayText(entry.from)}
                                </span>
                                <span className="Records-date" role="cell">
                                    {/* (phones: "4th Oct 2026 – 11th Oct 2026" on one line) */}
                                    <span className="Records-dash" aria-hidden="true">
                                        –{" "}
                                    </span>
                                    {dayText(entry.to)}
                                </span>
                                <span className="Records-details" role="cell">
                                    <span className="Records-text">{entry.report}</span>
                                    <span className="Integration-by">Added by {entry.loggedByName ?? "Staff"}</span>
                                </span>
                                {integration.canChange(entry) && (
                                    <RowIcons
                                        question="Delete this report?"
                                        onEdit={() => setEditing(entry.id)}
                                        onDelete={() => integration.remove(entry.id)}
                                    />
                                )}
                            </div>
                        )
                    )}
                </div>
            ) : (
                <p className="Integration-none Records-none">No integration reports yet.</p>
            )}
        </div>
    );
}
