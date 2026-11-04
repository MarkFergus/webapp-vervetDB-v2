import { useCallback, useEffect, useState } from "react";
import { IconChevronDown, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import ConfirmBubble from "./ConfirmBubble";
import { addRecord, deleteRecord, loadConditions, loadMonkeyWeights, loadRecords, saveRecord } from "./monkeyData";
import { changeText, historyFor } from "./babyRecords";
import { IntegrationForm, newReportDates } from "./IntegrationReports";
import { summaryDate } from "./feeding";
import { ARRIVAL_REASONS } from "./arrival";
import { SICKBAY_UNIT, placeChoices } from "./enclosures";
import { fullName } from "./places";
import useScrollIntoView from "./useScrollIntoView";
import "./IntegrationReports.css";
import "./MonkeyRecords.css";

// A monkey's records, on its page (staff only), one list per tab:
//   Rehabilitation, Medical   Date | Category | Details; admins add them
//     with "+ New … Record", e.g. historical ones (monkey-records.sql,
//     monkey-records-admin.sql), and change any of them. Every move adds a
//     Movement record by itself (movement-records.sql), and every status
//     change a Status record (monkey-archive.sql). Its arrival (Arrival
//     Date and Reason) starts Rehabilitation's list; injuries (and their
//     updates) and weights (the Records page's) are listed in with
//     Medical's. Those are changed where they're added (Edit; the pop-up's
//     Quick Actions; Records).
//   Integration   Date Start | Date End | Integration Report
//     (supabase/integration-reports.sql)

export const MAX_RECORD = 1000;

// Each section's name and categories, in the drop-down's order; older:
// categories no longer offered, still named (records saved with them)
export const SECTIONS = {
    rehabilitation: {
        title: "Rehabilitation",
        // (integration: its own tab now, so not offered; the database still
        // allows it)
        categories: { movement: "Movement", escape: "Escape", observation: "Observation" },
        older: {},
    },
    medical: {
        title: "Medical",
        categories: { food_monitoring: "Food Monitoring", injury: "Injury", condition: "Condition", deworming: "Deworming", observation: "Observation" },
        older: { medicine: "Medicine", treatment: "Treatment", vet_visit: "Vet Visit" },
    },
};

// Saved in their own tables, not as a record: an Injury (injuries.sql:
// Current Injuries, with updates and Healed?) and a Condition
// (monitoring-sessions.sql: Latest Condition). Offered, and changed here,
// only when the page says how (RecordList's elsewhere: admins)
const SAVED_ELSEWHERE = { injury: 500, condition: 500 };

// A Movement record's words, as the database writes them for a move:
// "Moved from Goliath A to Goliath Troop: integrated" (the reason optional)
export const movementText = ({ from, to, reason = "" }) =>
    `Moved from ${from} to ${to}${reason.trim() ? `: ${reason.trim()}` : ""}`;

// ...and back again ({ from, to, reason }), or null (e.g. "Home changed
// from …": edited as plain details)
export function parseMovement(details) {
    const match = /^Moved from (.+?) to (.+?)(?:: ([\s\S]*))?$/.exec(details ?? "");
    return match ? { from: match[1], to: match[2], reason: match[3] ?? "" } : null;
}

// Movement's From and To: every place, as its records name them, a group
// per enclosure: "Goliath Troop", "Goliath A"…, Sickbay (and Other…, typed
// in, in the form). [{ label, options: ["Goliath Troop", "Goliath A", …] }]
//   troops (no "All Troops"), enclosures, homeOf(troop): its enclosure
export function movementPlaces(troops, enclosures, homeOf) {
    const groups = placeChoices(troops, enclosures, homeOf)
        .map((choice) => ({
            label: fullName(choice.enclosure),
            options: [
                ...(choice.troop ? [`${fullName(choice.troop)} Troop`] : []),
                ...(choice.enclosure === SICKBAY_UNIT ? ["Sickbay"] : []),
                ...choice.introcages.map((c) => fullName(c.name)),
            ],
        }))
        .filter((group) => group.options.length);
    // (In Sickbay: "Sickbay", even without its care unit)
    return groups.some((g) => g.options.includes("Sickbay")) ? groups : [...groups, { label: "Sickbay", options: ["Sickbay"] }];
}

// Categories never in the drop-down: a Status record for each status
// change (added by the database: monkey-archive.sql), its arrival (from
// Arrival Date and Reason) and its weights (the Records page's): otherRows
const OTHER_CATEGORIES = { status: "Status", arrival: "Arrival", weight: "Weight", condition: "Condition" };

const dayText = (date) => summaryDate(new Date(`${date}T00:00:00`));

// Today as the date box wants it ("2026-10-21")
const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

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
    const admin = state.available && Boolean(staff?.isAdmin && !staff.readOnly);
    return {
        available: state.available,
        entries: state.entries,
        // Admins only: the Full Profile is where admins keep the full
        // records (historical ones too), and change any of them, Movement
        // and Status records too. Staff enter theirs through the Records
        // page (monkey-records-admin.sql)
        canAdd: admin,
        canEdit: () => admin,
        canDelete: () => admin,
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

// A monkey's weights (the Records page's: Baby Care's babies), for its
// Medical records; loaded when staff open its page. [] until then, or if
// there are none (or the database hasn't got them).
export function useWeights(monkeyId, enabled) {
    const [weights, setWeights] = useState([]);
    useEffect(() => {
        if (!enabled || monkeyId == null) {
            setWeights([]);
            return;
        }
        let cancelled = false;
        loadMonkeyWeights(monkeyId)
            .then((list) => !cancelled && setWeights(list))
            .catch(() => !cancelled && setWeights([]));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled]);
    return weights;
}

// A monkey's conditions (Records → Sections → Monitoring), newest first: none
// before monitoring-sessions.sql has run, or if they can't be loaded.
// version: a new number loads them again (one's been added)
export function useConditions(monkeyId, enabled, version = 0) {
    const [conditions, setConditions] = useState([]);
    useEffect(() => {
        if (!enabled || monkeyId == null) {
            setConditions([]);
            return;
        }
        let cancelled = false;
        loadConditions([monkeyId])
            .then((list) => !cancelled && setConditions(list))
            .catch(() => !cancelled && setConditions([]));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled, version]);
    return conditions;
}

// The records kept elsewhere, as rows of a section's list (not changed
// here): { key, date, category, details, by, first }. Rehabilitation: its
// arrival (first: before anything else that day). (Its moves and status
// changes are records of its own, added by the database.) Medical: its
// injuries (each with its updates: injury), its conditions, and its weights
// ("512 g (+38 g)", and the note) from the Records page.
export function otherRows(section, { injuries, monkey = null, weights = [], conditions = [] }) {
    if (section === "rehabilitation") {
        if (!monkey?.arrivalDate) return [];
        const reason = ARRIVAL_REASONS[monkey.arrivalReason];
        return [
            {
                key: "arrival",
                date: monkey.arrivalDate,
                category: "arrival",
                details: reason ? `Arrived at the sanctuary: ${reason}` : "Arrived at the sanctuary",
                by: "From Arrival Info",
                first: true,
            },
        ];
    }
    if (section !== "medical") return [];
    const weighings = historyFor(weights, monkey?.id ?? weights[0]?.monkeyId).map((w) => ({
        key: `weight-${w.date}`,
        date: w.date,
        category: "weight",
        details:
            `${w.value.toLocaleString("en-GB")} g` +
            (w.change === null ? "" : ` (${changeText(w.change, "g")})`) +
            (w.notes ? `: ${w.notes}` : ""),
        by: `Weight by ${w.loggedByName ?? "Staff"}`,
    }));
    // (each condition: a snapshot of its own)
    const snapshots = conditions.map((c) => ({
        key: `condition-${c.id}`,
        date: c.date,
        category: "condition",
        details: c.description,
        condition: c,
        by: `Condition by ${c.loggedByName ?? "Staff"}`,
    }));
    // (an injury's updates stay with it: InjuryFollowUps)
    return [
        ...weighings,
        ...snapshots,
        ...[...injuries.current, ...injuries.healed].map((e) => ({
            key: `injury-${e.id}`,
            date: e.date,
            category: "injury",
            details: e.description,
            injury: e,
            by: `Injury by ${e.loggedByName ?? "Staff"}`,
        })),
    ];
}

// Under an injury in Medical: Healed · its date (the final word), or its
// Latest Update · date: details; then All Updates (n), folded away: each
// one's date, details and who wrote it, newest first
function InjuryFollowUps({ injury }) {
    const [open, setOpen] = useState(false);
    const updates = [...(injury.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);
    const latest = updates[0];
    return (
        <>
            {injury.healedOn ? (
                <span className="Records-injuryState is-healed">
                    <b>Healed · {dayText(injury.healedOn)}</b>
                </span>
            ) : (
                latest && (
                    <span className="Records-injuryState">
                        <b>Latest Update · {dayText(latest.date)}:</b> {latest.details}
                    </span>
                )
            )}
            {updates.length > 0 && (
                <>
                    <button type="button" className="Records-updatesToggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                        All Updates ({updates.length})
                        <IconChevronDown size={14} stroke={2.5} aria-hidden="true" />
                    </button>
                    {open && (
                        <ul className="Records-updates" aria-label="Updates">
                            {updates.map((u) => (
                                <li key={u.id}>
                                    <b>{dayText(u.date)}</b> {u.details}
                                    <span className="Records-updateBy"> · {u.loggedByName ?? "Staff"}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
        </>
    );
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

// From / To's "Other…": a place typed in (not in the list)
const OTHER = "other";
const PLACE_MAX = 60;

// A Movement's From or To: every place (movementPlaces), then Other… with
// a box to type it in
function PlaceSelect({ label, places, value, other, onChange, onOther }) {
    return (
        <label>
            <span>{label}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)}>
                <option value="" disabled>
                    Choose…
                </option>
                {places.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                        {group.options.map((name) => (
                            <option key={name} value={name}>
                                {name}
                            </option>
                        ))}
                    </optgroup>
                ))}
                <option value={OTHER}>Other…</option>
            </select>
            {value === OTHER && (
                <input
                    type="text"
                    aria-label={`${label} (Other)`}
                    value={other}
                    maxLength={PLACE_MAX}
                    placeholder="e.g. Arrived from the wild"
                    onChange={(e) => onOther(e.target.value)}
                />
            )}
        </label>
    );
}

// The form's start: { date, category, details } → its values. A Movement's
// words split into From, To and Reason (a place not in the list: Other…,
// typed in); one it can't split (e.g. "Home changed from …"): plain details
function startValues(initial, places) {
    const known = (name) => places.some((g) => g.options.includes(name));
    const place = (name) => (name ? (known(name) ? { pick: name, other: "" } : { pick: OTHER, other: name }) : { pick: "", other: "" });
    const move = initial.category === "movement" && initial.details ? parseMovement(initial.details) : null;
    const from = place(move?.from);
    const to = place(move?.to);
    return {
        ...initial,
        plain: initial.category === "movement" && Boolean(initial.details) && !move,
        from: from.pick,
        fromOther: from.other,
        to: to.pick,
        toOther: to.other,
        reason: move?.reason ?? "",
    };
}

// Date, Category, then the details, then Confirm and Cancel (like the
// pop-up's Quick Actions forms). A Movement: From and To, then Reason
// (optional), as Edit asks for a new home location.
//   initial: { date, category, details }; places: movementPlaces;
//   elsewhere: the categories saved in their own tables that can be added
//   (a new record only); locked: the category can't change (an injury or
//   a condition, edited); onSave(values) async (throws a message to show);
//   onCancel()
function RecordForm({ section, initial, places = [], elsewhere = [], locked = false, onSave, onCancel, scrollIntoView = false }) {
    const formRef = useScrollIntoView(scrollIntoView);
    const [values, setValues] = useState(() => startValues(initial, places));
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });
    const { categories, older } = SECTIONS[section];
    // (a record saved with a category no longer offered keeps it; a Status
    // record stays one)
    const fixed = locked || (initial.category && !categories[initial.category] && !older[initial.category]);
    // (Injury and Condition: only when they can be saved; a record already
    // saved as one keeps it)
    const offered = Object.fromEntries(
        Object.entries(categories).filter(([key]) => !(key in SAVED_ELSEWHERE) || elsewhere.includes(key) || key === initial.category)
    );
    const choices = initial.category && !categories[initial.category]
        ? { ...offered, [initial.category]: older[initial.category] ?? OTHER_CATEGORIES[initial.category] ?? initial.category }
        : offered;
    const movement = values.category === "movement" && !values.plain;
    const text = movement ? values.reason : values.details;
    // (an injury's or a condition's description: 500 at most, as their tables)
    const max = ((locked || elsewhere.includes(values.category)) && SAVED_ELSEWHERE[values.category]) || MAX_RECORD;
    const placeOf = (pick, other) => (pick === OTHER ? other.trim() : pick);

    async function confirm() {
        if (!values.date) return setProblem("Please choose the date.");
        if (!values.category) return setProblem("Please choose a category.");
        let details = values.details.trim();
        if (movement) {
            const from = placeOf(values.from, values.fromOther);
            const to = placeOf(values.to, values.toOther);
            if (!from) return setProblem("Please choose where it moved from.");
            if (!to) return setProblem("Please choose where it moved to.");
            details = movementText({ from, to, reason: values.reason });
            if (details.length > MAX_RECORD) return setProblem(`Please shorten the reason (${MAX_RECORD} characters in all).`);
        } else if (!details) {
            return setProblem("Please write the details.");
        } else if (details.length > max) {
            return setProblem(`Please shorten the details (${max} characters at most).`);
        }
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
                    <span>{movement ? "Date Moved" : "Date"}</span>
                    <input type="date" value={values.date} max={todayText()} onChange={set("date")} />
                </label>
                <label>
                    <span>Category</span>
                    <select value={values.category} disabled={fixed} onChange={set("category")}>
                        <option value="" disabled>
                            Choose…
                        </option>
                        {Object.entries(choices).map(([key, label]) => (
                            <option key={key} value={key}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            {movement && (
                <div className="Integration-dates">
                    <PlaceSelect
                        label="From"
                        places={places}
                        value={values.from}
                        other={values.fromOther}
                        onChange={(from) => setValues({ ...values, from })}
                        onOther={(fromOther) => setValues({ ...values, fromOther })}
                    />
                    <PlaceSelect
                        label="To"
                        places={places}
                        value={values.to}
                        other={values.toOther}
                        onChange={(to) => setValues({ ...values, to })}
                        onOther={(toOther) => setValues({ ...values, toOther })}
                    />
                </div>
            )}
            <label>
                <span>{movement ? "Reason (optional)" : "Details"}</span>
                <textarea rows={4} value={text} maxLength={max} onChange={set(movement ? "reason" : "details")} />
            </label>
            <span className="Integration-count">
                {text.length} / {max}
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
                <button type="button" className="Modal-edit is-cancel" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// One section's list: "+ New … Record" at the top, then the records in
// columns (phones: date and category on a line, the details under them)
//   others: the records kept elsewhere (otherRows); places: Movement's From
//   and To (movementPlaces); elsewhere: { injury, condition }: each
//   { add(values), update(id, values), remove(id) } in its own table
//   (values: { date, description }; async, throwing a message to show)
export function RecordList({ section, records, others, places = [], elsewhere = {} }) {
    const [adding, setAdding] = useState(false);
    const [editing, setEditing] = useState(null); // a row's key
    const { title, categories, older } = SECTIONS[section];

    const own = records.entries
        .filter((e) => e.section === section)
        .map((e) => ({ key: `record-${e.id}`, entry: e, date: e.date, category: e.category, details: e.details, by: `Added by ${e.loggedByName ?? "Staff"}` }));
    // Newest first (its arrival last on its day: it came first)
    const rows = [...others, ...own].sort((a, b) => b.date.localeCompare(a.date) || Boolean(a.first) - Boolean(b.first));

    return (
        <div className="Records">
            {records.canAdd &&
                (adding ? (
                    <RecordForm
                        section={section}
                        places={places}
                        elsewhere={Object.keys(elsewhere)}
                        initial={{ date: todayText(), category: "", details: "" }}
                        onSave={async (values) => {
                            const kept = elsewhere[values.category];
                            if (kept) await kept.add({ date: values.date, description: values.details });
                            else await records.add({ section, ...values });
                            setAdding(false);
                        }}
                        onCancel={() => setAdding(false)}
                    />
                ) : (
                    <button type="button" className="Modal-edit is-action-outline Records-new" onClick={() => setAdding(true)}>
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
                    {rows.map((row) => {
                        // (an injury or a condition: changed in its own table)
                        const own = row.injury ?? row.condition;
                        const kept = own && elsewhere[row.category];
                        return editing === row.key ? (
                            <div className="Records-editing" key={row.key}>
                                <RecordForm
                                    scrollIntoView
                                    section={section}
                                    places={places}
                                    locked={Boolean(kept)}
                                    initial={{ date: row.date, category: row.category, details: row.details }}
                                    onSave={async (values) => {
                                        if (kept) await kept.update(own.id, { date: values.date, description: values.details });
                                        else await records.update(row.entry.id, values);
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
                                    <span className={`Records-category is-${row.category}`}>{categories[row.category] ?? older[row.category] ?? OTHER_CATEGORIES[row.category] ?? row.category}</span>
                                </span>
                                <span className="Records-details" role="cell">
                                    <span className="Records-text">{row.details}</span>
                                    {row.injury && <InjuryFollowUps injury={row.injury} />}
                                    <span className="Integration-by">{row.by}</span>
                                </span>
                                {row.entry && (records.canEdit(row.entry) || records.canDelete(row.entry)) && (
                                    <RowIcons
                                        question="Delete this record?"
                                        onEdit={records.canEdit(row.entry) ? () => setEditing(row.key) : undefined}
                                        onDelete={records.canDelete(row.entry) ? () => records.remove(row.entry.id) : undefined}
                                    />
                                )}
                                {kept && (
                                    <RowIcons
                                        question={row.injury ? "Delete this injury and its updates?" : "Delete this condition?"}
                                        onEdit={() => setEditing(row.key)}
                                        onDelete={() => kept.remove(own.id)}
                                    />
                                )}
                            </div>
                        );
                    })}
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
                    <button type="button" className="Modal-edit is-action-outline Records-new" onClick={() => setAdding(true)}>
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
