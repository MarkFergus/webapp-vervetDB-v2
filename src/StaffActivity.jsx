import { useEffect, useState } from "react";
import { IconCirclePlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { loadStaff, loadStaffActivity } from "./monkeyData";
import { dayLabel } from "./MyChanges";
import { fullName } from "./places";
import { dayText } from "./babyRecords";
import { GROUPS, PERIODS, changeLines, dayWords, inGroup, periodFor, sourceOf } from "./activityWords";
import "./MyChanges.css";
import "./StaffActivity.css";

// Admin Dashboard → Staff Activity (#admin/activity, admins only): what
// each staff member (or everyone) has added, changed or deleted, newest
// first, grouped by day: monkeys, enclosures, injuries, records, weights,
// maintenance and the rest, each with what changed. Choose who, how far
// back (24 Hours, 7, 14 or 30 Days, or Custom: From and To dates) and what.
// Looking only: nothing is undone from here (yet).
// (supabase/staff-activity.sql)

const ACTIONS = {
    added: { Icon: IconCirclePlus, word: "Added" },
    changed: { Icon: IconPencil, word: "Changed" },
    deleted: { Icon: IconTrash, word: "Deleted" },
};

const timeText = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

// Who, how far back and what (the database gives the first two; the
// third is picked out here)
function Filters({ staff, person, onPerson, days, onDays, group, onGroup, from, to, onFrom, onTo }) {
    const today = dayText(new Date());
    return (
        <div className="Activity-filters">
            <label className="Activity-choose">
                <span>Staff Member</span>
                <select value={person} onChange={(e) => onPerson(e.target.value)}>
                    <option value="">Everyone</option>
                    {staff.map((s) => (
                        <option key={s.userId} value={s.userId}>
                            {s.name ?? s.email}
                        </option>
                    ))}
                </select>
            </label>
            <label className="Activity-choose">
                <span>What</span>
                <select value={group} onChange={(e) => onGroup(e.target.value)}>
                    {GROUPS.map((g) => (
                        <option key={g.id} value={g.id}>
                            {g.label}
                        </option>
                    ))}
                </select>
            </label>
            <div className="Activity-periods" role="group" aria-label="How far back">
                {[...PERIODS, { days: "custom", label: "Custom" }].map((p) => (
                    <button key={p.days} type="button" aria-pressed={days === p.days} onClick={() => onDays(p.days)}>
                        {p.label}
                    </button>
                ))}
            </div>
            {days === "custom" && (
                <div className="Activity-dates">
                    <label className="Activity-choose">
                        <span>From</span>
                        <input type="date" value={from} max={to || today} onChange={(e) => onFrom(e.target.value)} />
                    </label>
                    <label className="Activity-choose">
                        <span>To</span>
                        <input type="date" value={to} min={from} max={today} onChange={(e) => onTo(e.target.value)} />
                    </label>
                </div>
            )}
        </div>
    );
}

function Change({ change, showWho }) {
    const action = ACTIONS[change.action] ?? ACTIONS.changed;
    const { Icon } = action;
    const lines = changeLines(change);
    return (
        <li className={`MyChanges-item is-${change.action}`}>
            <span className="MyChanges-icon" aria-hidden="true">
                <Icon stroke={2} size={16} />
            </span>
            <div className="MyChanges-body">
                <p className="MyChanges-heading">
                    <span className="MyChanges-kind">
                        {action.word} {sourceOf(change).label}
                    </span>
                    {change.title && <> · {fullName(change.title)}</>}
                    <span className="MyChanges-time">{timeText(change.at)}</span>
                </p>
                {showWho && <p className="Activity-who">by {change.changed_by_name ?? "Unknown"}</p>}
                {lines.length > 0 && (
                    <ul className="MyChanges-lines">
                        {lines.map((line, i) => (
                            <li key={i}>{line}</li>
                        ))}
                    </ul>
                )}
            </div>
        </li>
    );
}

export default function StaffActivity() {
    const [staff, setStaff] = useState([]);
    const [person, setPerson] = useState("");
    // 1, 7, 14, 30 or "custom" (then from / to: "2026-10-20")
    const [days, setDays] = useState(7);
    const [from, setFrom] = useState(() => dayText(new Date(Date.now() - 13 * 86400000)));
    const [to, setTo] = useState(() => dayText(new Date()));
    // Custom: both dates, in order
    const datesOk = days !== "custom" || (Boolean(from) && Boolean(to) && from <= to);
    const [group, setGroup] = useState("all");
    // null while loading; then { changes } or { problem }
    const [result, setResult] = useState(null);

    useEffect(() => {
        loadStaff()
            .then((list) => setStaff([...list].sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email))))
            .catch((error) => console.error("Couldn't load the staff list:", error));
    }, []);

    useEffect(() => {
        if (!datesOk) return undefined;
        let cancelled = false;
        setResult(null);
        const { since, until } = periodFor(days, from, to);
        loadStaffActivity(person || null, since, until)
            .then((changes) => !cancelled && setResult({ changes }))
            .catch((error) => {
                console.error("Couldn't load Staff Activity:", error);
                if (!cancelled) setResult({ problem: error.message });
            });
        return () => {
            cancelled = true;
        };
    }, [person, days, from, to, datesOk]);

    const shown = result?.changes ? inGroup(result.changes, group) : [];
    const byDay = [];
    for (const change of shown) {
        const at = new Date(change.changed_at);
        const label = dayLabel(at);
        if (byDay.at(-1)?.label !== label) byDay.push({ label, changes: [] });
        byDay.at(-1).changes.push({ ...change, at });
    }
    const period =
        days === "custom"
            ? from === to
                ? `on ${dayWords(from)}`
                : `from ${dayWords(from)} to ${dayWords(to)}`
            : `in the last ${PERIODS.find((p) => p.days === days)?.label.toLowerCase()}`;

    return (
        <>
            <p className="Admin-intro">What staff have added, changed or deleted. Looking only: nothing is undone from here.</p>
            <section className="Admin-card" aria-label="Staff Activity">
                <Filters
                    staff={staff}
                    person={person}
                    onPerson={setPerson}
                    days={days}
                    onDays={setDays}
                    group={group}
                    onGroup={setGroup}
                    from={from}
                    to={to}
                    onFrom={setFrom}
                    onTo={setTo}
                />
                {!datesOk ? (
                    <p className="MyChanges-problem" role="alert">
                        Please choose a From date on or before the To date.
                    </p>
                ) : !result ? (
                    <p className="MyChanges-note is-loading" role="status">
                        Loading…
                    </p>
                ) : result.problem ? (
                    <p className="MyChanges-problem" role="alert">
                        {result.problem}
                    </p>
                ) : shown.length === 0 ? (
                    <p className="MyChanges-note">No changes {period}.</p>
                ) : (
                    <>
                        <p className="Activity-count">
                            {shown.length === 500 ? "The latest 500 changes" : `${shown.length} ${shown.length === 1 ? "change" : "changes"}`}{" "}
                            {period}
                        </p>
                        <div className="MyChanges Activity-list">
                            {byDay.map((day) => (
                                <section key={day.label} className="MyChanges-day">
                                    <h2 className="MyChanges-dayLabel">{day.label}</h2>
                                    <ul className="MyChanges-list">
                                        {day.changes.map((change, i) => (
                                            <Change key={i} change={change} showWho={!person} />
                                        ))}
                                    </ul>
                                </section>
                            ))}
                        </div>
                    </>
                )}
            </section>
        </>
    );
}
