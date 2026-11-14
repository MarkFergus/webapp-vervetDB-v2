import { useCallback, useEffect, useMemo, useState } from "react";
import {
    IconAlertTriangle,
    IconBinoculars,
    IconCalendarWeek,
    IconCalendarMonth,
    IconCheck,
    IconFirstAidKit,
    IconListCheck,
    IconPencil,
    IconPlus,
    IconTrash,
} from "@tabler/icons-react";
import { useAuth } from "./auth";
import {
    addChecklistItem,
    addTodo,
    deleteChecklistItem,
    deleteTodos,
    loadDashboard,
    saveSections,
    setTicked,
    setTodoDone,
} from "./dashboardData";
import { loadCurrentInjuries, loadLastMoves, loadMonitoringFor, loadMonitoringSessions, loadSpotSightings } from "./monkeyData";
import { ALERT_SECTIONS, MAX_TODO, dueState, myAlerts, periodOf, sectionMonkeys, sortTodos } from "./dashboardRules";
import { dayLabel, dayText, weekCommencing } from "./babyRecords";
import { fullName } from "./places";
import "./IntegrationReports.css"; // (the Edit / Delete icons)
import "./StaffDashboard.css";

// My Dashboard (#dashboard, staff only): the signed-in person's own page.
//   My Alerts      for the sections they choose (Top, Middle, Bottom,
//                  Sickbay): troops overdue a monitoring session, monkeys not
//                  seen last session or Must See, injuries needing an update
//   My To-Do       their own list: add (a due date if they like), tick, delete
//   This Week / This Month   their own checklists, unticked again each new
//                  week (Monday) and month; Edit to add or take off items
// Only they see it (supabase/staff-dashboard.sql).

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ALERT_ICONS = { monitoring: IconBinoculars, missing: IconAlertTriangle, injury: IconFirstAidKit };

// ---- My Alerts ----

// The alerts' facts for these monkeys (null: loading)
function useAlertFacts(monkeys, enclosures, sections) {
    const ids = useMemo(() => sectionMonkeys(monkeys, enclosures, sections).map((m) => m.id), [monkeys, enclosures, sections]);
    const key = ids.join(",");
    const [facts, setFacts] = useState(null);
    useEffect(() => {
        if (!sections.length) {
            setFacts(null);
            return;
        }
        let cancelled = false;
        const list = key ? key.split(",").map(Number) : [];
        setFacts(null);
        Promise.all([
            loadMonitoringSessions().catch(() => []),
            loadSpotSightings().catch(() => []),
            loadLastMoves(list).catch(() => ({})),
            loadMonitoringFor(list).catch(() => ({})),
            loadCurrentInjuries(list).catch(() => []),
        ]).then(([sessions, spots, lastMoves, monitoring, injuries]) => {
            if (cancelled) return;
            const muted = new Set(Object.entries(monitoring).filter(([, m]) => m.alertsMuted).map(([id]) => Number(id)));
            setFacts({ sessions, spots, lastMoves, muted, injuries });
        });
        return () => {
            cancelled = true;
        };
    }, [key, sections.length]);
    return facts;
}

function AlertsCard({ monkeys, enclosures, sections, onSections, onOpenMonkey }) {
    const facts = useAlertFacts(monkeys, enclosures, sections);
    const today = dayText(new Date());
    const alerts = facts ? myAlerts({ monkeys, enclosures, sections, ...facts, today }) : [];
    const toggle = (section) => onSections(sections.includes(section) ? sections.filter((s) => s !== section) : [...sections, section]);
    return (
        <section className="Dashboard-card" aria-labelledby="Dashboard-alerts">
            <div className="Dashboard-head">
                <h2 id="Dashboard-alerts">
                    <IconAlertTriangle size={20} aria-hidden="true" />
                    My Alerts
                </h2>
                <div className="Dashboard-sections" role="group" aria-label="My Sections">
                    {ALERT_SECTIONS.map((s) => (
                        <button key={s} type="button" aria-pressed={sections.includes(s)} onClick={() => toggle(s)}>
                            {s}
                        </button>
                    ))}
                </div>
            </div>
            {!sections.length ? (
                <p className="Dashboard-none">Choose your sections above to see their alerts.</p>
            ) : !facts ? (
                <p className="Dashboard-none">Loading…</p>
            ) : !alerts.length ? (
                <p className="Dashboard-none Dashboard-clear">
                    <IconCheck size={18} aria-hidden="true" />
                    All clear in {sections.join(", ")}.
                </p>
            ) : (
                <ul className="Dashboard-alerts">
                    {alerts.map((alert) => {
                        const Icon = ALERT_ICONS[alert.kind];
                        return (
                            <li key={alert.id} className={`Dashboard-alert is-${alert.level}`}>
                                <Icon size={18} aria-hidden="true" />
                                <div className="Dashboard-alertText">
                                    {alert.monkey && (
                                        <button type="button" className="Dashboard-name" onClick={() => onOpenMonkey?.(alert.monkey)}>
                                            {alert.monkey.name}
                                        </button>
                                    )}
                                    {alert.monkey && alert.troop && <span className="Dashboard-where"> · {fullName(alert.troop.name)} Troop</span>}
                                    {alert.href ? (
                                        <a href={alert.href}>{alert.text}</a>
                                    ) : (
                                        <span className="Dashboard-what">{alert.text}</span>
                                    )}
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

// ---- My To-Do ----

function TodoCard({ todos, setTodos }) {
    const [text, setText] = useState("");
    const [dueOn, setDueOn] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const [showDone, setShowDone] = useState(false);
    const today = dayText(new Date());
    const { open, done } = sortTodos(todos);

    async function run(fn) {
        setProblem(null);
        try {
            await fn();
        } catch (error) {
            setProblem(error.message);
        }
    }
    async function add(event) {
        event.preventDefault();
        const words = text.trim();
        if (!words) return setProblem("Please write what needs doing.");
        setBusy(true);
        await run(async () => {
            const saved = await addTodo({ text: words, dueOn });
            setTodos((list) => [...list, saved]);
            setText("");
            setDueOn("");
        });
        setBusy(false);
    }
    const tick = (todo) =>
        run(async () => {
            const saved = await setTodoDone(todo.id, !todo.doneAt);
            setTodos((list) => list.map((t) => (t.id === todo.id ? saved : t)));
        });
    const remove = (ids) =>
        run(async () => {
            await deleteTodos(ids);
            setTodos((list) => list.filter((t) => !ids.includes(t.id)));
        });

    const row = (todo) => {
        const due = dueState(todo, today);
        return (
            <li key={todo.id} className={`Dashboard-todo${todo.doneAt ? " is-done" : ""}`}>
                <label>
                    <input type="checkbox" checked={Boolean(todo.doneAt)} onChange={() => tick(todo)} />
                    <span>{todo.text}</span>
                </label>
                {todo.dueOn && !todo.doneAt && (
                    <span className={`Dashboard-due${due ? ` is-${due}` : ""}`}>{due === "today" ? "Today" : dayLabel(todo.dueOn)}</span>
                )}
                <button type="button" className="Integration-icon is-delete" aria-label={`Delete: ${todo.text}`} title="Delete" onClick={() => remove([todo.id])}>
                    <IconTrash size={16} aria-hidden="true" />
                </button>
            </li>
        );
    };

    return (
        <section className="Dashboard-card" aria-labelledby="Dashboard-todo">
            <div className="Dashboard-head">
                <h2 id="Dashboard-todo">
                    <IconListCheck size={20} aria-hidden="true" />
                    My To-Do
                </h2>
                {open.length > 0 && <span className="Dashboard-count">{open.length} to do</span>}
            </div>
            <form className="Dashboard-add" onSubmit={add} noValidate>
                <input
                    type="text"
                    value={text}
                    maxLength={MAX_TODO}
                    placeholder="Something to do…"
                    aria-label="New to-do"
                    onChange={(e) => setText(e.target.value)}
                />
                <input type="date" value={dueOn} min={today} aria-label="Due date (optional)" title="Due date (optional)" onChange={(e) => setDueOn(e.target.value)} />
                <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                    <IconPlus size={18} aria-hidden="true" />
                    Add
                </button>
            </form>
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}
            {open.length ? <ul className="Dashboard-todos">{open.map(row)}</ul> : <p className="Dashboard-none">Nothing to do. Add something above.</p>}
            {done.length > 0 && (
                <div className="Dashboard-doneRow">
                    <button type="button" className="Modal-edit is-blue-outline" aria-expanded={showDone} onClick={() => setShowDone(!showDone)}>
                        {showDone ? "Hide Done" : `Show Done (${done.length})`}
                    </button>
                    {showDone && (
                        <button type="button" className="Modal-edit is-danger-outline" onClick={() => remove(done.map((t) => t.id))}>
                            Clear Done
                        </button>
                    )}
                </div>
            )}
            {showDone && done.length > 0 && <ul className="Dashboard-todos">{done.map(row)}</ul>}
        </section>
    );
}

// ---- This Week / This Month ----

function ChecklistCard({ every, items, setItems, ticks, setTicks }) {
    const today = dayText(new Date());
    const period = periodOf(every, today);
    const mine = items.filter((i) => i.every === every);
    const isTicked = (item) => ticks.some((t) => t.itemId === item.id && t.period === period);
    const doneCount = mine.filter(isTicked).length;
    const [editing, setEditing] = useState(false);
    const [text, setText] = useState("");
    const [problem, setProblem] = useState(null);
    const title = every === "week" ? "This Week" : "This Month";
    const when = every === "week" ? weekCommencing(period) : MONTHS[Number(period.slice(5, 7)) - 1];
    const Icon = every === "week" ? IconCalendarWeek : IconCalendarMonth;
    const id = `Dashboard-${every}`;

    async function run(fn) {
        setProblem(null);
        try {
            await fn();
        } catch (error) {
            setProblem(error.message);
        }
    }
    const tick = (item) =>
        run(async () => {
            const on = !isTicked(item);
            await setTicked(item.id, period, on);
            setTicks((list) => (on ? [...list, { itemId: item.id, period }] : list.filter((t) => !(t.itemId === item.id && t.period === period))));
        });
    async function add(event) {
        event.preventDefault();
        const words = text.trim();
        if (!words) return setProblem("Please write the item.");
        await run(async () => {
            const saved = await addChecklistItem({ every, text: words, position: mine.length });
            setItems((list) => [...list, saved]);
            setText("");
        });
    }
    const remove = (item) =>
        run(async () => {
            await deleteChecklistItem(item.id);
            setItems((list) => list.filter((i) => i.id !== item.id));
        });

    return (
        <section className="Dashboard-card" aria-labelledby={id}>
            <div className="Dashboard-head">
                <h2 id={id}>
                    <Icon size={20} aria-hidden="true" />
                    {title}
                    <span className="Dashboard-when">{when}</span>
                </h2>
                {mine.length > 0 && !editing && (
                    <span className={`Dashboard-count${doneCount === mine.length ? " is-all" : ""}`}>
                        {doneCount} of {mine.length} done
                    </span>
                )}
                <button
                    type="button"
                    className="Integration-icon is-edit"
                    aria-label={editing ? `Done editing ${title}` : `Edit ${title}`}
                    title={editing ? "Done" : "Edit"}
                    aria-pressed={editing}
                    onClick={() => setEditing(!editing)}
                >
                    {editing ? <IconCheck size={18} aria-hidden="true" /> : <IconPencil size={18} aria-hidden="true" />}
                </button>
            </div>
            {mine.length ? (
                <ul className="Dashboard-todos">
                    {mine.map((item) => (
                        <li key={item.id} className={`Dashboard-todo${isTicked(item) && !editing ? " is-done" : ""}`}>
                            {editing ? (
                                <>
                                    <span className="Dashboard-itemText">{item.text}</span>
                                    <button type="button" className="Integration-icon is-delete" aria-label={`Take off: ${item.text}`} title="Take Off" onClick={() => remove(item)}>
                                        <IconTrash size={16} aria-hidden="true" />
                                    </button>
                                </>
                            ) : (
                                <label>
                                    <input type="checkbox" checked={isTicked(item)} onChange={() => tick(item)} />
                                    <span>{item.text}</span>
                                </label>
                            )}
                        </li>
                    ))}
                </ul>
            ) : (
                !editing && <p className="Dashboard-none">No {every === "week" ? "weekly" : "monthly"} checklist yet. Tap the pencil to add items.</p>
            )}
            {editing && (
                <form className="Dashboard-add" onSubmit={add} noValidate>
                    <input
                        type="text"
                        value={text}
                        maxLength={MAX_TODO}
                        placeholder={every === "week" ? "Something to do every week…" : "Something to do every month…"}
                        aria-label={`New ${every === "week" ? "weekly" : "monthly"} item`}
                        onChange={(e) => setText(e.target.value)}
                    />
                    <button type="submit" className="Modal-edit is-confirm">
                        <IconPlus size={18} aria-hidden="true" />
                        Add
                    </button>
                </form>
            )}
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}
        </section>
    );
}

// ---- The page ----

function StaffDashboard({ monkeys = [], enclosures = [], onOpenMonkey, inert = false }) {
    const { name } = useAuth();
    const today = dayText(new Date());
    // null: loading; { problem, notReady }; or { todos, items, ticks, sections }
    const [data, setData] = useState(null);
    const load = useCallback(() => {
        loadDashboard([periodOf("week", today), periodOf("month", today)])
            .then(setData)
            .catch((error) => setData({ problem: error.message, notReady: Boolean(error.notReady) }));
    }, [today]);
    useEffect(() => {
        load();
    }, [load]);
    const setPart = (part) => (fn) => setData((d) => ({ ...d, [part]: typeof fn === "function" ? fn(d[part]) : fn }));
    const [sectionProblem, setSectionProblem] = useState(null);
    async function changeSections(sections) {
        const before = data.sections;
        setPart("sections")(sections);
        setSectionProblem(null);
        try {
            await saveSections(sections);
        } catch (error) {
            setPart("sections")(before);
            setSectionProblem(error.message);
        }
    }
    const first = name?.split(" ")[0];

    return (
        <div className="Dashboard" inert={inert}>
            <h1 className="Dashboard-title">My Dashboard</h1>
            <p className="Dashboard-intro">
                {first ? `Hi ${first}. ` : ""}
                {dayLabel(today)}
            </p>
            {data === null ? (
                <p className="Dashboard-none">Loading…</p>
            ) : data.problem ? (
                <p className="RecordsPage-problem">{data.problem}</p>
            ) : (
                <div className="Dashboard-grid">
                    <div className="Dashboard-wide">
                        <AlertsCard monkeys={monkeys} enclosures={enclosures} sections={data.sections} onSections={changeSections} onOpenMonkey={onOpenMonkey} />
                        {sectionProblem && (
                            <p className="RecordsPage-problem" role="alert">
                                {sectionProblem}
                            </p>
                        )}
                    </div>
                    <TodoCard todos={data.todos} setTodos={setPart("todos")} />
                    <div className="Dashboard-stack">
                        <ChecklistCard every="week" items={data.items} setItems={setPart("items")} ticks={data.ticks} setTicks={setPart("ticks")} />
                        <ChecklistCard every="month" items={data.items} setItems={setPart("items")} ticks={data.ticks} setTicks={setPart("ticks")} />
                    </div>
                </div>
            )}
        </div>
    );
}

export default StaffDashboard;
