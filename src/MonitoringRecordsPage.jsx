import { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconAlertTriangle,
    IconArrowLeft,
    IconCheck,
    IconChevronDown,
    IconCircleCheckFilled,
    IconCopy,
    IconExclamationMark,
    IconEye,
    IconPlayerPlay,
    IconPencil,
    IconPlus,
    IconProgress,
    IconTrash,
} from "@tabler/icons-react";
import ConfirmBubble from "./ConfirmBubble";
import { MarkSeenButton, MarkSeenForm, missingText } from "./MarkSeen";
import { InjuryForm, updateNeeded, useInjuryList } from "./Injuries";
import { rememberTroop, rememberedTroop } from "./SectionsRecordsPage";
import {
    addCondition,
    addSpotSighting,
    deleteMonitoringSession,
    deleteSpotSighting,
    finishMonitoringSession,
    loadConditions,
    loadMonitoringFor,
    loadMonitoringSessions,
    loadSessionNotes,
    loadSpotSightings,
    startMonitoringSession,
} from "./monkeyData";
import { hasTroop } from "./enclosures";
import { monkeysIn } from "./stats";
import { fullName } from "./places";
import { dayText } from "./babyRecords";
import { summaryDate } from "./feeding";
import {
    ALL_GOOD,
    CHECK_NOTE_MAX,
    FENCE,
    FOODS_USED,
    FOOD_LEVELS,
    MUST_SEE_AFTER,
    WATERS,
    isOverdue,
    latestSessionDays,
    sessionAlerts,
    sessionsBefore,
    sightingRecord,
    troopSessions,
    whatsappText,
} from "./monitoringRules";
import "./IntegrationReports.css"; // (the injury and condition forms)
import "./IntegrationRecordsPage.css"; // (the troop picker)
import "./ConfirmBubble.css";
import "./MonitoringRecordsPage.css";

// Records → Sections → Monitoring (staff): a troop's monitoring sessions.
//   1. Start Session (before the walk): the briefing: who's missing (Must
//      See after 2 sessions in a row), who wasn't seen last time, priority
//      checks, current injuries (Update Needed) and latest conditions
//   2. Finish Session (after the walk, the same person, or an admin): the
//      date, food used (or none), the checks (fence, waters and food, each
//      with a short note; Introcages and Perimeter Check ticks), a Seen
//      tick for each monkey (+ Injury, Add Update, + Condition), general
//      notes and maintenance; then the alerts, and the summary to copy for
//      WhatsApp
//   History: the troop's finished sessions, each to copy again, change or
//   delete, and its monkeys' sightings between sessions. A troop with no
//   session for over a week is Overdue.
//   Missing: the troop's monkeys not seen in their last session, each with
//   Mark Seen (seen since, between sessions: MarkSeen.jsx)
// Starting and finishing: editors and admins (staff.canAdd); anyone on
// the staff can look. (supabase/monitoring-sessions.sql)
//   staff: { canSee, canAdd, userId, isAdmin, readOnly } (as the pop-up's)

// Phones (up to 624px wide): the troop picker and its buttons on one row,
// so the troops' short names (D&D, H&B) and shorter button words
const PHONE = "(max-width: 624px)";
function usePhone() {
    const [phone, setPhone] = useState(() => Boolean(window.matchMedia?.(PHONE).matches));
    useEffect(() => {
        const query = window.matchMedia?.(PHONE);
        if (!query) return undefined;
        const change = () => setPhone(query.matches);
        query.addEventListener?.("change", change);
        return () => query.removeEventListener?.("change", change);
    }, []);
    return phone;
}

const longDate = (date) => summaryDate(new Date(`${date}T00:00:00`));
const timeText = (at) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// Choices as one squared group (one at a time; optional: none, and a
// second tap takes it off). note: { value, onChange }: a short note beside
// them ("North corner sagging")
function Choices({ label, options, value, onChange, optional = false, note = null }) {
    const name = optional ? `${label} (optional)` : label;
    return (
        <div className={`Monitoring-field${note ? " has-note" : ""}`}>
            <span className="Monitoring-fieldLabel">
                {label}
                {optional && <em> (optional)</em>}
            </span>
            <div className="Monitoring-choices" role="group" aria-label={name}>
                {Object.entries(options).map(([id, word]) => (
                    <button
                        key={id}
                        type="button"
                        aria-pressed={value === id}
                        onClick={() => onChange(optional && value === id ? "" : id)}
                    >
                        {word}
                    </button>
                ))}
            </div>
            {note && (
                <input
                    type="text"
                    className="Monitoring-checkNote"
                    aria-label={`${label} note`}
                    placeholder="Note (optional)"
                    value={note.value}
                    maxLength={CHECK_NOTE_MAX}
                    onChange={(e) => note.onChange(e.target.value)}
                />
            )}
        </div>
    );
}

// A tick for a check that was done (Introcages Check, Perimeter Check)
function Tick({ label, checked, onChange }) {
    return (
        <label className="Monitoring-tick">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
            {label}
        </label>
    );
}

// A small flag beside a monkey: Must See, Not Seen Last Session, Injury…
function Flag({ kind, children }) {
    return <span className={`Monitoring-flag is-${kind}`}>{children}</span>;
}

// ---- What's known about the troop's monkeys ----

// A troop's monkeys: { inTroop, inIntrocages, all } (troop first, by
// name, then each introcage's)
function troopMonkeys(monkeys, troop) {
    const inTroop = troop ? [...monkeysIn(monkeys, troop, "troop")].sort((a, b) => a.name.localeCompare(b.name)) : [];
    const inIntrocages = troop
        ? [...monkeysIn(monkeys, troop, "introcages")].sort(
              (a, b) => (a.introcage ?? "").localeCompare(b.introcage ?? "") || a.name.localeCompare(b.name)
          )
        : [];
    return { inTroop, inIntrocages, all: [...inTroop, ...inIntrocages] };
}

// The sightings between sessions that count for a session: one in
// progress (or none: the list), all of them; a finished one, those before
// its day
const spotsFor = (spots, session) => (session?.status === "finished" ? spots.filter((s) => s.date < session.date) : spots);

// For a troop: its monkeys (troop first, then each introcage's), their
// sighting records (the finished sessions before this session, and
// sightings between sessions), priority checks, current injuries and
// latest conditions
function useTroopFacts(monkeys, troop, sessions, staff, session = null, spots = []) {
    const { inTroop, inIntrocages, all } = troopMonkeys(monkeys, troop);
    const ids = all.map((m) => m.id);
    const key = ids.join(",");
    const injuries = useInjuryList(ids, staff);
    const [priority, setPriority] = useState({});
    const [conditions, setConditions] = useState([]);
    const reloadConditions = useCallback(() => {
        const list = key ? key.split(",").map(Number) : [];
        return loadConditions(list)
            .then(setConditions)
            .catch(() => setConditions([]));
    }, [key]);
    useEffect(() => {
        const list = key ? key.split(",").map(Number) : [];
        loadMonitoringFor(list)
            .then(setPriority)
            .catch(() => setPriority({}));
        reloadConditions();
    }, [key, reloadConditions]);

    const past = troop ? sessionsBefore(sessions, troop.id, session) : [];
    const counted = spotsFor(spots, session);
    const records = Object.fromEntries(all.map((m) => [m.id, sightingRecord(past, m.id, counted)]));
    const current = Array.isArray(injuries.entries) ? injuries.entries : [];
    const latestCondition = {};
    for (const c of conditions) if (!latestCondition[c.monkeyId]) latestCondition[c.monkeyId] = c;
    return { inTroop, inIntrocages, all, records, priority, injuries, current, latestCondition, reloadConditions };
}

// An injury's latest news: its last update's date (or, with none, its own)
const lastNews = (injury) => (injury.updates ?? []).reduce((d, u) => (u.date > d ? u.date : d), injury.date);

// ---- Step 1: the briefing ----

function Briefing({ facts, today }) {
    const [open, setOpen] = useState(true);
    const { all, records, priority, current, latestCondition } = facts;
    const mustSee = all.filter((m) => records[m.id].missed >= MUST_SEE_AFTER);
    const notSeenLast = all.filter((m) => records[m.id].missed === 1);
    const priorities = all.filter((m) => priority[m.id]?.conditionCheck || priority[m.id]?.notes);
    const withCondition = all.filter((m) => latestCondition[m.id]);
    // (seen between sessions, since they were last seen in one)
    const seenSince = all.filter((m) => records[m.id].spot);
    const byId = Object.fromEntries(all.map((m) => [m.id, m]));
    const seenText = (m) => (records[m.id].lastSeen ? `last seen ${longDate(records[m.id].lastSeen)}` : "not seen in a session yet");
    const empty =
        !mustSee.length && !notSeenLast.length && !seenSince.length && !priorities.length && !current.length && !withCondition.length;

    return (
        <section className="Monitoring-briefing" aria-label="Briefing">
            <button type="button" className="Monitoring-foldButton" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                Briefing
                <IconChevronDown size={16} stroke={2.5} aria-hidden="true" />
            </button>
            {open &&
                (empty ? (
                    <p className="Monitoring-quiet">Nothing to look out for: everyone was seen last time, and no injuries or priority checks.</p>
                ) : (
                    <div className="Monitoring-briefingParts">
                        {mustSee.length > 0 && (
                            <div className="Monitoring-part is-danger">
                                <h3>Must See</h3>
                                <ul>
                                    {mustSee.map((m) => (
                                        <li key={m.id}>
                                            <b>{m.name}</b> missing on the last {records[m.id].missed} sessions, {seenText(m)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {notSeenLast.length > 0 && (
                            <div className="Monitoring-part is-warn">
                                <h3>Not Seen Last Session</h3>
                                <ul>
                                    {notSeenLast.map((m) => (
                                        <li key={m.id}>
                                            <b>{m.name}</b> {seenText(m)}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {seenSince.length > 0 && (
                            <div className="Monitoring-part is-good">
                                <h3>Seen Since Last Session</h3>
                                <ul>
                                    {seenSince.map((m) => {
                                        const spot = records[m.id].spot;
                                        return (
                                            <li key={m.id}>
                                                <b>{m.name}</b> seen {longDate(spot.date)} by {spot.by}
                                                {spot.note && <span className="Monitoring-latest"> · {spot.note}</span>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        {priorities.length > 0 && (
                            <div className="Monitoring-part is-warn">
                                <h3>Priority Checks</h3>
                                <ul>
                                    {priorities.map((m) => (
                                        <li key={m.id}>
                                            <b>{m.name}</b>
                                            {priority[m.id].notes ? ` ${priority[m.id].notes}` : " Priority Condition Check"}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {current.length > 0 && (
                            <div className="Monitoring-part">
                                <h3>Current Injuries</h3>
                                <ul>
                                    {current.map((injury) => {
                                        const latest = [...(injury.updates ?? [])].sort((a, b) => b.date.localeCompare(a.date))[0];
                                        return (
                                            <li key={injury.id}>
                                                <b>{byId[injury.monkeyId]?.name}</b> {injury.description}
                                                {latest && (
                                                    <span className="Monitoring-latest">
                                                        {" "}
                                                        · {longDate(latest.date)}: {latest.details}
                                                    </span>
                                                )}
                                                {updateNeeded(injury, today) && <Flag kind="warn">Update Needed</Flag>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}
                        {withCondition.length > 0 && (
                            <div className="Monitoring-part">
                                <h3>Latest Conditions</h3>
                                <ul>
                                    {withCondition.map((m) => (
                                        <li key={m.id}>
                                            <b>{m.name}</b> {latestCondition[m.id].description}
                                            <span className="Monitoring-latest"> · {longDate(latestCondition[m.id].date)}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
        </section>
    );
}

// ---- Step 2: the checklist ----

// What the + adds, the likeliest first (Update: only with a current injury,
// and then it's where the box starts)
const ADD_KINDS = { update: "Update", injury: "Injury", condition: "Condition" };

// One monkey (no photo: a tight list): its Seen tick, flags, last seen,
// and a +: an injury, an update on one, or a condition (saved straight
// away, linked to the session)
function CheckRow({ monkey, facts, seen, onSeen, notes, session, today, onAdded }) {
    const [mode, setMode] = useState(null); // "injury", "update" or "condition"
    const record = facts.records[monkey.id];
    const injuries = facts.current.filter((i) => i.monkeyId === monkey.id);
    const [injuryId, setInjuryId] = useState(null);
    const priority = facts.priority[monkey.id];
    const condition = facts.latestCondition[monkey.id];
    const isPriority = Boolean(priority?.conditionCheck || priority?.notes);
    const hasFlags = record.missed > 0 || injuries.length > 0 || isPriority;
    const close = () => setMode(null);

    async function save(values) {
        if (mode === "injury") await facts.injuries.add(monkey.id, { ...values, sessionId: session.id });
        else if (mode === "update")
            await facts.injuries.addUpdate(injuryId ?? injuries[0].id, {
                date: values.date,
                details: values.description,
                sessionId: session.id,
            });
        else {
            await addCondition(monkey.id, { ...values, sessionId: session.id });
            await facts.reloadConditions();
        }
        setMode(null);
        onAdded();
    }

    return (
        <li className={`Monitoring-row${seen ? " is-seen" : ""}`}>
            {/* One line on wider screens: the tick and name | flags,
                condition and what's been added | the buttons (phones: stacked) */}
            <div className="Monitoring-rowMain">
                <label className="Monitoring-seen">
                    <input type="checkbox" checked={seen} onChange={(e) => onSeen(e.target.checked)} aria-label={`${monkey.name} seen`} />
                    <span className="RecordsPage-baby">
                        <span className="RecordsPage-name">{monkey.name}</span>
                        <span className="RecordsPage-place">
                            {record.lastSeen ? `Last seen ${longDate(record.lastSeen)}` : "Not seen in a session yet"}
                        </span>
                    </span>
                </label>
                <div className="Monitoring-rowInfo">
                    {hasFlags && (
                        <span className="Monitoring-flags">
                            {record.missed >= MUST_SEE_AFTER && <Flag kind="danger">Must See</Flag>}
                            {record.missed === 1 && <Flag kind="warn">Not Seen Last Session</Flag>}
                            {injuries.length > 0 && <Flag kind="danger">Injury</Flag>}
                            {isPriority && <Flag kind="warn">Priority</Flag>}
                        </span>
                    )}
                    {condition && (
                        <p className="Monitoring-note">
                            Condition: {condition.description} · {longDate(condition.date)}
                        </p>
                    )}
                    {notes.length > 0 && (
                        <ul className="Monitoring-added" aria-label={`Added for ${monkey.name}`}>
                            {notes.map((n, i) => (
                                <li key={i}>
                                    <IconCheck size={14} aria-hidden="true" /> {n.text}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
                {!mode && (
                    <div className="Monitoring-rowActions">
                        <button
                            type="button"
                            className="Monitoring-add"
                            aria-label={`Add for ${monkey.name}`}
                            title="Add an injury, an update or a condition"
                            onClick={() => setMode(injuries.length ? "update" : "injury")}
                        >
                            <IconPlus size={22} stroke={2.5} aria-hidden="true" />
                        </button>
                    </div>
                )}
            </div>
            {mode && (
                <div className="Monitoring-form">
                    <h4 className="Monitoring-formTitle">
                        Add <span>· {monkey.name}</span>
                    </h4>
                    {/* Injury, Update (with a current injury) or Condition */}
                    <div className="Monitoring-choices" role="group" aria-label="What to add">
                        {Object.entries(ADD_KINDS)
                            .filter(([id]) => id !== "update" || injuries.length > 0)
                            .map(([id, word]) => (
                                <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}>
                                    {word}
                                </button>
                            ))}
                    </div>
                    {/* An update: the injury it's on (more than one: choose) */}
                    {mode === "update" &&
                        (injuries.length > 1 ? (
                            <label className="IntegrationPage-choose">
                                <span>Injury</span>
                                <select value={injuryId ?? injuries[0].id} onChange={(e) => setInjuryId(Number(e.target.value))}>
                                    {injuries.map((i) => (
                                        <option key={i.id} value={i.id}>
                                            {i.description} ({longDate(i.date)})
                                        </option>
                                    ))}
                                </select>
                            </label>
                        ) : (
                            <p className="Monitoring-updating">
                                <span>Updating</span> {injuries[0].description} · {longDate(injuries[0].date)}
                            </p>
                        ))}
                    <InjuryForm
                        key={mode}
                        kind={mode}
                        initial={{ date: session.date, description: "" }}
                        max={today}
                        onSave={save}
                        onCancel={close}
                    />
                </div>
            )}
        </li>
    );
}

// A session's draft on this phone: { form, seen } (localStorage can be
// missing or full: then there's just no draft)
const draftKey = (id) => `vervetdb-monitoring-draft-${id}`;
function loadDraft(id) {
    try {
        const draft = JSON.parse(localStorage.getItem(draftKey(id)));
        return draft?.form && draft?.seen ? draft : null;
    } catch {
        return null;
    }
}
function saveDraft(id, draft) {
    try {
        localStorage.setItem(draftKey(id), JSON.stringify(draft));
    } catch {
        // (no room, or not allowed)
    }
}
function clearDraft(id) {
    try {
        localStorage.removeItem(draftKey(id));
    } catch {
        // (not allowed)
    }
}

// The session: briefing, then the results to enter (or change), then
// Finish Session. onFinished(session, summary) / onLeave() / onCancelled()
function SessionPage({ session, troop, monkeys, sessions, spots, staff, onFinished, onLeave, onCancelled }) {
    const today = dayText(new Date());
    const facts = useTroopFacts(monkeys, troop, sessions, staff, session, spots);
    const finished = session.status === "finished";
    // (one in progress: what was entered so far on this phone, if anything)
    const [draft] = useState(() => (finished ? null : loadDraft(session.id)));
    const [form, setForm] = useState(() => {
        const saved = {
            date: session.date,
            foodUsed: session.foodUsed ?? "",
            fence: session.fence ?? "",
            fenceNote: session.fenceNote ?? "",
            waters: session.waters ?? "",
            watersNote: session.watersNote ?? "",
            food: session.food ?? "",
            foodNote: session.foodNote ?? "",
            introcagesChecked: Boolean(session.introcagesChecked),
            perimeterChecked: Boolean(session.perimeterChecked),
            notes: session.notes ?? "",
            maintenance: session.maintenance ?? "",
        };
        if (!draft) return saved;
        // (a draft from before the words changed: a choice no longer there is cleared)
        const known = (value, options) => (value in options ? value : "");
        const form = { ...saved, ...draft.form };
        return {
            ...form,
            foodUsed: known(form.foodUsed, FOODS_USED),
            fence: known(form.fence, FENCE),
            waters: known(form.waters, WATERS),
            food: known(form.food, FOOD_LEVELS),
        };
    });
    // monkey id → seen (a finished one: as it was; new: nobody yet)
    const [seen, setSeen] = useState(
        () => draft?.seen ?? Object.fromEntries(session.sightings.map((s) => [s.monkeyId, s.seen]))
    );
    // Kept on the phone as it's entered, so a lost connection, a refresh or a
    // closed tab loses nothing (cleared once finished or cancelled)
    useEffect(() => {
        if (!finished) saveDraft(session.id, { form, seen });
    }, [finished, session.id, form, seen]);
    const [notes, setNotes] = useState([]);
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);
    const [sameDay, setSameDay] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const set = (field) => (value) => setForm((f) => ({ ...f, [field]: value }));
    const reloadNotes = useCallback(
        () =>
            loadSessionNotes(session.id)
                .then(setNotes)
                .catch(() => {}),
        [session.id]
    );
    useEffect(() => {
        reloadNotes();
    }, [reloadNotes]);

    const seenCount = facts.all.filter((m) => seen[m.id]).length;

    async function finish(confirmed = false) {
        setProblem(null);
        if (!form.date || form.date > today) return setProblem("Please choose the date (not in the future).");
        if (!form.fence || !form.waters || !form.food) return setProblem("Please choose the Fence, Waters and Food checks.");
        if (!facts.all.length) return setProblem("This troop has no monkeys to check.");
        const others = troopSessions(sessions, troop.id, session.id).filter((s) => s.date === form.date);
        if (others.length && !confirmed) {
            setSameDay(true);
            return;
        }
        setSameDay(false);
        setBusy(true);
        try {
            const saved = await finishMonitoringSession(session.id, {
                ...form,
                seen: facts.all.filter((m) => seen[m.id]).map((m) => m.id),
                notSeen: facts.all.filter((m) => !seen[m.id]).map((m) => m.id),
            });
            clearDraft(session.id);
            onFinished(saved, summaryFor(saved, troop, facts, notes, today));
        } catch (error) {
            setProblem(
                error.offline && !finished
                    ? "No connection right now. Everything entered is kept on this phone: try Finish Session again when there's signal."
                    : error.message
            );
            setBusy(false);
        }
    }

    async function cancelSession() {
        setBusy(true);
        try {
            await deleteMonitoringSession(session.id);
            clearDraft(session.id);
            onCancelled();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
            setCancelling(false);
        }
    }

    const section = (title, list) =>
        list.length > 0 && (
            <div className="Monitoring-group">
                <h3 className="Monitoring-groupTitle">{title}</h3>
                <ul className="Monitoring-rows">
                    {list.map((m) => (
                        <CheckRow
                            key={m.id}
                            monkey={m}
                            facts={facts}
                            seen={Boolean(seen[m.id])}
                            onSeen={(value) => setSeen((s) => ({ ...s, [m.id]: value }))}
                            notes={notes.filter((n) => n.monkeyId === m.id)}
                            session={{ ...session, date: form.date }}
                            today={today}
                            onAdded={reloadNotes}
                        />
                    ))}
                </ul>
            </div>
        );
    // Introcage monkeys: under each introcage's name
    const introcages = [...new Set(facts.inIntrocages.map((m) => m.introcage))];

    return (
        <div className="Monitoring-session">
            <button type="button" className="Monitoring-back" onClick={onLeave}>
                <IconArrowLeft size={18} aria-hidden="true" />
                Monitoring
            </button>
            {/* (the page's title is the troop's: "Skunkey Monitoring") */}
            <p className="Monitoring-started">
                {finished ? "Changing the session of " : "Started "}
                {longDate(session.date)}
                {!finished && ` at ${timeText(session.startedAt)}`} by {session.startedByName ?? "Staff"}
            </p>
            {!finished && <Briefing facts={facts} today={today} />}

            <section className="Monitoring-results" aria-label="Results">
                <label className="IntegrationPage-choose Monitoring-date">
                    <span>Date</span>
                    <input type="date" value={form.date} max={today} onChange={(e) => set("date")(e.target.value)} />
                </label>
                <Choices label="Food" options={FOODS_USED} value={form.foodUsed} onChange={set("foodUsed")} optional />
                {/* The enclosure's checks, together in a box */}
                <section className="Monitoring-checks" aria-label="Checks">
                    <Choices
                        label="Fence"
                        options={FENCE}
                        value={form.fence}
                        onChange={set("fence")}
                        note={{ value: form.fenceNote, onChange: set("fenceNote") }}
                    />
                    <Choices
                        label="Waters"
                        options={WATERS}
                        value={form.waters}
                        onChange={set("waters")}
                        note={{ value: form.watersNote, onChange: set("watersNote") }}
                    />
                    <Choices
                        label="Food"
                        options={FOOD_LEVELS}
                        value={form.food}
                        onChange={set("food")}
                        note={{ value: form.foodNote, onChange: set("foodNote") }}
                    />
                    <div className="Monitoring-ticks">
                        <Tick label="Introcages Check" checked={form.introcagesChecked} onChange={set("introcagesChecked")} />
                        <Tick label="Perimeter Check" checked={form.perimeterChecked} onChange={set("perimeterChecked")} />
                    </div>
                </section>

                <div className="Monitoring-checklistHead">
                    <h3 className="Monitoring-stepTitle">
                        Checklist <span>{seenCount} / {facts.all.length} seen</span>
                    </h3>
                    <span className="Monitoring-tickAll">
                        <button
                            type="button"
                            className="Modal-edit is-soft"
                            onClick={() => setSeen(Object.fromEntries(facts.all.map((m) => [m.id, true])))}
                        >
                            Tick All Seen
                        </button>
                        <button type="button" className="Modal-edit is-quiet" onClick={() => setSeen({})}>
                            Clear All
                        </button>
                    </span>
                </div>
                {section("Troop", facts.inTroop)}
                {introcages.map((name) =>
                    section(fullName(name), facts.inIntrocages.filter((m) => m.introcage === name))
                )}

                <label className="IntegrationPage-choose Monitoring-notes">
                    <span>General Notes</span>
                    <textarea
                        rows={3}
                        value={form.notes}
                        maxLength={1000}
                        placeholder="e.g. Raining, low sightings"
                        onChange={(e) => set("notes")(e.target.value)}
                    />
                </label>
                <label className="IntegrationPage-choose Monitoring-notes">
                    <span>Maintenance</span>
                    <textarea
                        rows={2}
                        value={form.maintenance}
                        maxLength={1000}
                        placeholder="What needs doing, e.g. Branches need cutting, fence break by the gate"
                        onChange={(e) => set("maintenance")(e.target.value)}
                    />
                </label>

                {problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {problem}
                    </p>
                )}
                {sameDay ? (
                    <div className="Monitoring-warning" role="alert">
                        <p>
                            <IconAlertTriangle size={18} aria-hidden="true" /> {fullName(troop.name)} already has a session on{" "}
                            {longDate(form.date)}. Save this one as well?
                        </p>
                        <div className="Monitoring-actions">
                            <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={() => finish(true)}>
                                Save Anyway
                            </button>
                            <button type="button" className="Modal-edit is-quiet" onClick={() => setSameDay(false)}>
                                Go Back
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="Monitoring-actions">
                        <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={() => finish()}>
                            {busy ? "Saving…" : finished ? "Save Changes" : "Finish Session"}
                        </button>
                        {!finished && (
                            <span className="Monitoring-confirmHost">
                                <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={() => setCancelling(true)}>
                                    Cancel Session
                                </button>
                                {cancelling && (
                                    <ConfirmBubble
                                        question="Cancel this session? It will be deleted."
                                        danger
                                        busy={busy}
                                        onConfirm={cancelSession}
                                        onCancel={() => setCancelling(false)}
                                    />
                                )}
                            </span>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}

// The alerts and the WhatsApp summary of a finished session
function summaryFor(session, troop, facts, notes, today) {
    const names = Object.fromEntries(facts.all.map((m) => [m.id, m.name]));
    const notSeen = facts.all.filter((m) => !session.sightings.find((s) => s.monkeyId === m.id)?.seen);
    const missing = notSeen.map((m) => ({ name: m.name, lastSeen: facts.records[m.id].lastSeen }));
    const mustSee = notSeen
        .map((m) => ({ name: m.name, missed: facts.records[m.id].missed + 1, lastSeen: facts.records[m.id].lastSeen }))
        .filter((m) => m.missed >= MUST_SEE_AFTER);
    // Seen this time: the priority checks, and those who were Must See
    const prioritySeen = facts.all
        .filter((m) => session.sightings.find((s) => s.monkeyId === m.id)?.seen)
        .filter(
            (m) =>
                facts.priority[m.id]?.conditionCheck || facts.priority[m.id]?.notes || facts.records[m.id].missed >= MUST_SEE_AFTER
        )
        .map((m) => m.name);
    const staleInjuries = facts.current
        .filter((i) => updateNeeded(i, today))
        .map((i) => ({ name: names[i.monkeyId], since: lastNews(i) }));
    const checkNotes = { fence: session.fenceNote, waters: session.watersNote, food: session.foodNote };
    return {
        alerts: sessionAlerts({ mustSee, staleInjuries, fence: session.fence, waters: session.waters, food: session.food, checkNotes }),
        text: whatsappText({
            troop: troop.name,
            date: session.date,
            missing,
            total: facts.all.length,
            prioritySeen,
            mustSee,
            notes: notes.filter((n) => names[n.monkeyId]).map((n) => ({ name: names[n.monkeyId], text: n.text })),
            fence: session.fence,
            waters: session.waters,
            food: session.food,
            checkNotes,
            generalNotes: session.notes,
            maintenance: session.maintenance,
        }),
    };
}

// Copy for WhatsApp: the summary, and a button to copy it
function WhatsAppSummary({ text }) {
    const [copied, setCopied] = useState(false);
    async function copy() {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch {
            setCopied(false);
        }
    }
    return (
        <div className="Monitoring-whatsapp">
            <pre aria-label="WhatsApp summary">{text}</pre>
            <button type="button" className="Modal-edit is-confirm" onClick={copy}>
                <IconCopy size={18} aria-hidden="true" />
                {copied ? "Copied" : "Copy for WhatsApp"}
            </button>
        </div>
    );
}

// After Finish Session: the alerts, then the summary to copy
function SessionDone({ troop, summary, onDone }) {
    return (
        <div className="Monitoring-session">
            <p className="Monitoring-started is-saved">
                <IconCheck size={18} aria-hidden="true" /> Session saved
            </p>
            <h2 className="Monitoring-sessionTitle">Monitoring Summary</h2>
            {summary.alerts.length > 0 ? (
                <ul className="Monitoring-alerts" aria-label="Alerts">
                    {summary.alerts.map((a, i) => (
                        <li key={i} className={`is-${a.level}${a.check ? " is-check" : ""}`}>
                            {/* (monkeys: ⚠; the fence, waters and food: a red !) */}
                            {a.check ? (
                                <IconExclamationMark size={18} stroke={3} aria-hidden="true" />
                            ) : (
                                <IconAlertTriangle size={18} aria-hidden="true" />
                            )}
                            {a.text}
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="Monitoring-quiet">No alerts: everyone's accounted for.</p>
            )}
            <WhatsAppSummary text={summary.text} />
            <div className="Monitoring-actions">
                <button type="button" className="Modal-edit is-soft" onClick={onDone}>
                    Done
                </button>
            </div>
        </div>
    );
}

// ---- The History ----

// A check as ✓ (all good) or a red ! (⚠ is for monkeys); its word in the
// tooltip and for screen readers
function Check({ icon, label, value, good, words }) {
    const ok = value === good;
    return (
        <span className={`Monitoring-check${ok ? " is-good" : " is-bad"}`} title={words[value]} aria-label={`${label}: ${words[value]}`}>
            {icon} {ok ? "✓" : "!"}
        </span>
    );
}

function HistoryItem({ session, troop, monkeys, sessions, spots, staff, canChange, onChange, onDeleted }) {
    const [open, setOpen] = useState(false);
    const [summary, setSummary] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const byId = Object.fromEntries(monkeys.map((m) => [m.id, m]));
    const notSeen = session.sightings.filter((s) => !s.seen).map((s) => byId[s.monkeyId]?.name ?? "A monkey");
    const seenCount = session.sightings.filter((s) => s.seen).length;
    const facts = useTroopFacts(monkeys, open ? troop : null, sessions, staff, session, spots);

    useEffect(() => {
        if (!open) return;
        loadSessionNotes(session.id)
            .then((notes) =>
                setSummary(
                    summaryFor(
                        session,
                        troop,
                        {
                            ...facts,
                            all: facts.all.filter((m) => session.sightings.some((s) => s.monkeyId === m.id)),
                        },
                        notes,
                        session.date
                    )
                )
            )
            .catch(() => setSummary(null));
        // (once when opened: the facts settle after loading)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, session.id, facts.all.length]);

    return (
        <li className="Monitoring-history">
            <button type="button" className="Monitoring-historyLine" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                <b>{longDate(session.date)}</b>
                <span>
                    {seenCount} / {session.sightings.length} seen
                </span>
                <Check icon="⚡️" label="Fence" value={session.fence} good={ALL_GOOD.fence} words={FENCE} />
                <Check icon="💧" label="Waters" value={session.waters} good={ALL_GOOD.waters} words={WATERS} />
                <Check icon="🥗" label="Food" value={session.food} good={ALL_GOOD.food} words={FOOD_LEVELS} />
                <IconChevronDown size={16} stroke={2.5} aria-hidden="true" />
            </button>
            <p className="Monitoring-historySub">
                By {session.startedByName ?? "Staff"}
                {notSeen.length > 0 ? ` · Not seen: ${notSeen.join(", ")}` : " · All seen"}
            </p>
            {open && (
                <div className="Monitoring-historyMore">
                    {session.notes && <p className="Monitoring-note">📝 {session.notes}</p>}
                    {session.maintenance && <p className="Monitoring-note">🔧 {session.maintenance}</p>}
                    {summary ? <WhatsAppSummary text={summary.text} /> : <p className="Monitoring-quiet">Loading…</p>}
                    {problem && (
                        <p className="RecordsPage-problem" role="alert">
                            {problem}
                        </p>
                    )}
                    {canChange && (
                        <div className="Monitoring-actions">
                            <button type="button" className="Modal-edit is-soft" onClick={onChange}>
                                <IconPencil size={16} aria-hidden="true" />
                                Change
                            </button>
                            <span className="Monitoring-confirmHost">
                                <button type="button" className="Modal-edit is-quiet" onClick={() => setDeleting(true)}>
                                    <IconTrash size={16} aria-hidden="true" />
                                    Delete
                                </button>
                                {deleting && (
                                    <ConfirmBubble
                                        question="Delete this session?"
                                        danger
                                        busy={busy}
                                        onConfirm={async () => {
                                            setBusy(true);
                                            try {
                                                await deleteMonitoringSession(session.id);
                                                onDeleted();
                                            } catch (error) {
                                                setProblem(error.message);
                                                setBusy(false);
                                                setDeleting(false);
                                            }
                                        }}
                                        onCancel={() => setDeleting(false)}
                                    />
                                )}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </li>
    );
}

// ---- Missing, and sightings between sessions ----

// A missing monkey: why, and Mark Seen
function MissingItem({ monkey, record, canMark, onMark }) {
    const [open, setOpen] = useState(false);
    return (
        <li className={record.missed >= MUST_SEE_AFTER ? "is-danger" : "is-warn"}>
            <span className="Monitoring-missingText">
                <IconAlertTriangle size={18} aria-hidden="true" />
                <span>
                    <b>{monkey.name}</b> {missingText(record)}
                </span>
            </span>
            {canMark && !open && <MarkSeenButton name={monkey.name} onClick={() => setOpen(true)} />}
            {open && (
                <MarkSeenForm
                    name={monkey.name}
                    onCancel={() => setOpen(false)}
                    onSave={async (values) => {
                        await onMark(values);
                        setOpen(false);
                    }}
                />
            )}
        </li>
    );
}

// In the History: "Malawi seen 1st Nov 2026 by Sam" (Delete: whoever
// added it, or an admin)
function SpotItem({ spot, name, canDelete, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    return (
        <li className="Monitoring-history Monitoring-spot">
            <p className="Monitoring-spotLine">
                <IconEye size={16} aria-hidden="true" />
                <span>
                    <b>{longDate(spot.date)}</b> {name} seen by {spot.by}
                    {spot.note && <span className="Monitoring-latest"> · {spot.note}</span>}
                </span>
                {canDelete && (
                    <span className="Monitoring-confirmHost">
                        <button
                            type="button"
                            className="Monitoring-spotDelete"
                            aria-label={`Delete ${name}'s sighting`}
                            title="Delete"
                            onClick={() => setDeleting(true)}
                        >
                            <IconTrash size={16} aria-hidden="true" />
                        </button>
                        {deleting && (
                            <ConfirmBubble
                                question="Delete this sighting?"
                                danger
                                busy={busy}
                                onConfirm={async () => {
                                    setBusy(true);
                                    try {
                                        await deleteSpotSighting(spot.id);
                                        onDeleted();
                                    } catch (error) {
                                        setProblem(error.message);
                                        setBusy(false);
                                        setDeleting(false);
                                    }
                                }}
                                onCancel={() => setDeleting(false)}
                            />
                        )}
                    </span>
                )}
            </p>
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}
        </li>
    );
}

// ---- The page ----

// onTitle(title): the page's title while a session's open ("Skunkey
// Monitoring"; null: back to "Monitoring")
export default function MonitoringRecordsPage({ monkeys = [], enclosures = [], staff = null, onTitle = () => {} }) {
    const today = dayText(new Date());
    const troops = useMemo(
        () => enclosures.filter(hasTroop).sort((a, b) => fullName(a.name).localeCompare(fullName(b.name))),
        [enclosures]
    );
    const [chosen, setChosen] = useState(rememberedTroop);
    const phone = usePhone();
    // (none chosen yet: Choose Troop)
    const troop = troops.find((t) => t.name === chosen) ?? null;
    // null while loading; "failed"; or the sessions
    const [sessions, setSessions] = useState(null);
    // Sightings between sessions (Mark Seen): the last year's
    const [spots, setSpots] = useState([]);
    const [problem, setProblem] = useState(null);
    // What's showing: the list, a session ({ id }), or one just finished
    // ({ done: summary, troopId })
    const [view, setView] = useState(null);
    const [busy, setBusy] = useState(false);
    // The Cancel Session being asked about (by the troop picker): { id, where: "bar" }
    const [cancelling, setCancelling] = useState(null);
    const canEnter = Boolean(staff?.canAdd) && !staff?.readOnly;
    const canChange = (s) => canEnter && Boolean(staff?.isAdmin || s.startedBy === staff?.userId);

    const reload = useCallback(
        () =>
            Promise.all([loadMonitoringSessions(), loadSpotSightings().catch(() => [])])
                .then(([list, seen]) => {
                    setSessions(list);
                    setSpots(seen);
                    setProblem(null);
                })
                .catch((error) => {
                    setSessions("failed");
                    setProblem(error.message);
                }),
        []
    );
    useEffect(() => {
        reload();
    }, [reload]);

    // The page's title: the troop's, while one of its sessions is open
    const troopOf = (id) => enclosures.find((e) => e.id === id);
    const openTroop = view?.done
        ? troopOf(view.troopId)
        : view?.id && Array.isArray(sessions)
          ? troopOf(sessions.find((s) => s.id === view.id)?.enclosureId)
          : null;
    const title = openTroop ? `${fullName(openTroop.name)} Monitoring` : null;
    useEffect(() => {
        onTitle(title);
    }, [title, onTitle]);
    useEffect(() => () => onTitle(null), [onTitle]);

    if (sessions === null) return <p className="RecordsPage-none">Loading…</p>;
    if (sessions === "failed") return <p className="RecordsPage-problem">{problem}</p>;

    const troopById = Object.fromEntries(troops.map((t) => [t.id, t]));
    if (view?.done) {
        return <SessionDone troop={troopById[view.troopId]} summary={view.done} onDone={() => setView(null)} />;
    }
    const open = view?.id ? sessions.find((s) => s.id === view.id) : null;
    if (open && troopById[open.enclosureId]) {
        return (
            <SessionPage
                key={open.id}
                session={open}
                troop={troopById[open.enclosureId]}
                monkeys={monkeys}
                sessions={sessions}
                spots={spots}
                staff={staff}
                onLeave={() => setView(null)}
                onCancelled={() => {
                    setView(null);
                    reload();
                }}
                onFinished={(saved, summary) => {
                    setSessions((list) => list.map((s) => (s.id === saved.id ? saved : s)));
                    setView({ done: summary, troopId: saved.enclosureId });
                    reload();
                }}
            />
        );
    }

    const latest = latestSessionDays(sessions);
    const inProgress = sessions.filter((s) => s.status === "in_progress");
    // (by the troop picker: Continue / Cancel Session, for whoever started
    // it, or an admin)
    const myOpen = troop && inProgress.find((s) => s.enclosureId === troop.id && canChange(s));
    // Finished in the last 24 hours, newest first
    const recent = sessions
        .filter((s) => s.status === "finished" && s.finishedAt && Date.now() - new Date(s.finishedAt) < 86400000)
        .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)));
    const history = troop ? troopSessions(sessions, troop.id) : [];
    // The troop's monkeys, and who's missing (not seen in their last
    // session, nor since)
    const members = troopMonkeys(monkeys, troop).all;
    const missing = members
        .map((m) => ({ monkey: m, record: sightingRecord(history, m.id, spots) }))
        .filter((m) => m.record.missed > 0);
    // The History: the sessions and the troop's sightings between them,
    // newest first (a sighting before a session on the same day)
    const memberIds = new Set(members.map((m) => m.id));
    const nameOf = Object.fromEntries(members.map((m) => [m.id, m.name]));
    const historyItems = [
        ...history.map((s) => ({ kind: "session", date: s.date, at: s.finishedAt, item: s })),
        ...spots.filter((s) => memberIds.has(s.monkeyId)).map((s) => ({ kind: "spot", date: s.date, at: s.at, item: s })),
    ].sort(
        (a, b) =>
            b.date.localeCompare(a.date) || (a.kind === b.kind ? String(b.at).localeCompare(String(a.at)) : a.kind === "spot" ? -1 : 1)
    );
    const canDeleteSpot = (s) => canEnter && Boolean(staff?.isAdmin || s.loggedBy === staff?.userId);

    async function markSeen(monkeyId, values) {
        const spot = await addSpotSighting(monkeyId, values);
        setSpots((list) => [spot, ...list]);
    }

    // Cancel (In Progress): deleted, after asking
    async function cancelSession(id) {
        setBusy(true);
        setProblem(null);
        try {
            await deleteMonitoringSession(id);
            clearDraft(id);
            setSessions((list) => list.filter((s) => s.id !== id));
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
            setCancelling(null);
        }
    }

    async function start() {
        setBusy(true);
        setProblem(null);
        try {
            const session = await startMonitoringSession(troop.id, today);
            setSessions((list) => [{ ...session, sightings: [] }, ...list]);
            setView({ id: session.id });
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="Monitoring">
            {/* Who's monitoring now, and what's been done in the last day:
                every troop, a list to look at (Continue and Cancel Session:
                by the troop picker) */}
            {(inProgress.length > 0 || recent.length > 0) && (
                <section className="Monitoring-inProgress" aria-label="In Progress">
                    {inProgress.length > 0 && (
                        <>
                            <h2 className="RecordsPage-subhead">In Progress</h2>
                            <ul>
                                {inProgress.map((s) => (
                                    <li key={s.id}>
                                        <IconProgress size={18} className="Monitoring-stateIcon is-progress" aria-hidden="true" />
                                        <span>
                                            <b>{fullName(troopById[s.enclosureId]?.name ?? "A troop")}</b> · started{" "}
                                            {longDate(s.date)} at {timeText(s.startedAt)} by {s.startedByName ?? "Staff"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                    {recent.length > 0 && (
                        <>
                            <h2 className="RecordsPage-subhead">Recently Monitored</h2>
                            <ul aria-label="Recently Monitored">
                                {recent.map((s) => (
                                    <li key={s.id}>
                                        <IconCircleCheckFilled size={18} className="Monitoring-stateIcon is-done" aria-hidden="true" />
                                        <span>
                                            <b>{fullName(troopById[s.enclosureId]?.name ?? "A troop")}</b> · finished{" "}
                                            {timeText(s.finishedAt)} by {s.startedByName ?? "Staff"} ·{" "}
                                            {s.sightings.filter((x) => x.seen).length} / {s.sightings.length} seen
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            )}

            <div className="SectionsPage-bar Monitoring-bar">
                <label className="IntegrationPage-choose SectionsPage-troop">
                    <span>New Monitoring Session</span>
                    <select
                        value={troop?.name ?? ""}
                        onChange={(e) => {
                            setChosen(e.target.value);
                            rememberTroop(e.target.value);
                        }}
                    >
                        {!troop && (
                            <option value="" disabled>
                                Choose Troop
                            </option>
                        )}
                        {troops.map((t) => (
                            <option key={t.id} value={t.name}>
                                {/* (phones: D&D, H&B) */}
                                {phone ? t.name : fullName(t.name)}
                                {isOverdue(latest.get(t.id), today) ? " (Overdue)" : ""}
                            </option>
                        ))}
                    </select>
                </label>
                {canEnter && troop && (
                    <span className="Monitoring-inProgressButtons">
                        <button
                            type="button"
                            className="Modal-edit is-confirm Monitoring-start"
                            disabled={busy}
                            onClick={() => (myOpen ? setView({ id: myOpen.id }) : start())}
                        >
                            <IconPlayerPlay size={18} aria-hidden="true" />
                            {/* (phones: just Continue / Start) */}
                            {myOpen ? "Continue" : "Start"}
                            {phone ? "" : " Session"}
                        </button>
                        {myOpen && (
                            <span className="Monitoring-confirmHost">
                                <button
                                    type="button"
                                    className="Modal-edit is-quiet Monitoring-start"
                                    disabled={busy}
                                    onClick={() => setCancelling({ id: myOpen.id, where: "bar" })}
                                >
                                    {phone ? "Cancel" : "Cancel Session"}
                                </button>
                                {cancelling?.id === myOpen.id && cancelling.where === "bar" && (
                                    <ConfirmBubble
                                        question="Cancel this session? It will be deleted."
                                        danger
                                        busy={busy}
                                        onConfirm={() => cancelSession(myOpen.id)}
                                        onCancel={() => setCancelling(null)}
                                    />
                                )}
                            </span>
                        )}
                    </span>
                )}
            </div>
            {troop && (
                <p className={`Monitoring-due${isOverdue(latest.get(troop.id), today) ? " is-overdue" : ""}`}>
                    {latest.get(troop.id)
                        ? `Last session ${longDate(latest.get(troop.id))}`
                        : "No sessions yet"}
                    {isOverdue(latest.get(troop.id), today) && " · Overdue: due at least once a week"}
                </p>
            )}
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}

            {/* Missing: not seen in their last session (Mark Seen: editors and admins) */}
            {troop && missing.length > 0 && (
                <section className="Monitoring-missing" aria-label="Missing">
                    <h2 className="RecordsPage-subhead">Missing</h2>
                    <ul>
                        {missing.map(({ monkey, record }) => (
                            <MissingItem
                                key={monkey.id}
                                monkey={monkey}
                                record={record}
                                canMark={canEnter}
                                onMark={(values) => markSeen(monkey.id, values)}
                            />
                        ))}
                    </ul>
                </section>
            )}

            {troop && <h2 className="RecordsPage-subhead">{fullName(troop.name)} Troop History</h2>}
            {!troop ? null : historyItems.length ? (
                <ul className="Monitoring-historyList" aria-label="History">
                    {historyItems.map(({ kind, item }) =>
                        kind === "spot" ? (
                            <SpotItem
                                key={`spot-${item.id}`}
                                spot={item}
                                name={nameOf[item.monkeyId]}
                                canDelete={canDeleteSpot(item)}
                                onDeleted={() => setSpots((list) => list.filter((s) => s.id !== item.id))}
                            />
                        ) : (
                            <HistoryItem
                                key={item.id}
                                session={item}
                                troop={troop}
                                monkeys={monkeys}
                                sessions={sessions}
                                spots={spots}
                                staff={staff}
                                canChange={canChange(item)}
                                onChange={() => setView({ id: item.id })}
                                onDeleted={reload}
                            />
                        )
                    )}
                </ul>
            ) : (
                <p className="RecordsPage-none">No sessions for {fullName(troop.name)} Troop yet.</p>
            )}
        </div>
    );
}
