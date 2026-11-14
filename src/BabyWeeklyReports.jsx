import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconCopy, IconPencil } from "@tabler/icons-react";
import { loadBabyWeeklyReports, loadMoves, saveBabyWeeklyReports } from "./monkeyData";
import {
    MAX_BABY_REPORT,
    addDays,
    babiesInWeek,
    babyCareBabies,
    dayLabel,
    dayText,
    firstUnreportedWeek,
    mondayOf,
    unreportedWeek,
    weekCommencing,
    weeklyBabyText,
} from "./babyRecords";
import { BabyPhoto } from "./PagePicker";
import "./IntegrationReports.css";
import "./IntegrationRecordsPage.css";
import "./BabyWeeklyReports.css";

// Records → Baby Care → Weekly Baby Reports (staff; entering and editing:
// editors and admins, canEnter):
//   Enter  only the weeks not reported yet (‹ › skip the reported ones):
//          a report (up to 1000 characters) for each baby in Baby Care that
//          week (a baby who left during it is still listed). Save All; a
//          baby left blank is saved as Not recorded. A week is saved once.
//   View   every week's reports, newest week first, each with Copy (for
//          WhatsApp, Not recorded left out) and Edit (Not recorded ones
//          offered again to fill in).
// (supabase/baby-weekly-reports.sql)

// How many weeks View shows before Show More
const WEEKS_AT_FIRST = 4;

const weekDays = (monday) => `${dayLabel(monday)} – ${dayLabel(addDays(monday, 6))}`;
const thisWeek = () => mondayOf(dayText(new Date()));

// Copy a week's text: a button that says "Copied!" (or how to copy it by
// hand when it can't)
function CopyButton({ text, label = "Copy Report" }) {
    // null, "copied" or "failed"
    const [copied, setCopied] = useState(null);
    useEffect(() => setCopied(null), [text]);
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied("copied");
        } catch {
            setCopied("failed");
        }
    };
    return (
        <>
            <button type="button" className="Modal-edit is-blue" onClick={copy}>
                <IconCopy size={18} aria-hidden="true" />
                {copied === "copied" ? "Copied!" : label}
            </button>
            {copied === "failed" && (
                <p className="RecordsPage-problem" role="alert">
                    Couldn't copy it here. Select the reports and copy them instead.
                </p>
            )}
        </>
    );
}

// ‹ W/C 02.11 › with the week's days under it. prev / next: the weeks the
// arrows go to (null: none that way)
function WeekPicker({ week, prev, next, onChange }) {
    return (
        <div className="BabyReports-week">
            <button type="button" className="BabyReports-arrow" onClick={() => onChange(prev)} disabled={!prev} aria-label="The week before">
                <IconChevronLeft size={22} aria-hidden="true" />
            </button>
            <div className="BabyReports-weekText" aria-live="polite">
                <strong>{weekCommencing(week)}</strong>
                <span>{weekDays(week)}</span>
            </div>
            <button type="button" className="BabyReports-arrow" onClick={() => onChange(next)} disabled={!next} aria-label="The week after">
                <IconChevronRight size={22} aria-hidden="true" />
            </button>
        </div>
    );
}

// A report box for each baby, with its count. hereNow: who's in Baby Care
// today (the others: "Left Baby Care"); side(monkey): what shows top right
function ReportBoxes({ babies, hereNow, textOf, onType, side = () => null }) {
    return (
        <ul className="IntegrationPage-cards">
            {babies.map((monkey) => {
                const id = `BabyReports-report-${monkey.id}`;
                const text = textOf(monkey.id);
                return (
                    <li key={monkey.id} className="IntegrationPage-card">
                        <div className="IntegrationPage-who">
                            <BabyPhoto monkey={monkey} />
                            <div className="RecordsPage-baby">
                                <label className="RecordsPage-name" htmlFor={id}>
                                    {monkey.name}
                                </label>
                                {!hereNow.has(monkey.id) && <span className="RecordsPage-place">Left Baby Care</span>}
                            </div>
                            {side(monkey) && <span className="IntegrationPage-last">{side(monkey)}</span>}
                        </div>
                        <textarea
                            id={id}
                            className="IntegrationPage-report"
                            rows={4}
                            maxLength={MAX_BABY_REPORT}
                            placeholder={`How ${monkey.name}'s week went (blank: Not recorded)`}
                            value={text}
                            onChange={(e) => onType(monkey.id, e.target.value)}
                            aria-describedby={`${id}-count`}
                        />
                        <div className="IntegrationPage-under">
                            <span />
                            <span className="IntegrationPage-count" id={`${id}-count`}>
                                {text.length} / {MAX_BABY_REPORT}
                            </span>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

// ---- Enter: a week not reported yet ----

function ReportsEnter({ monkeys, enclosures, reports, moves, reload }) {
    const reported = useMemo(() => new Set(reports.map((r) => r.week)), [reports]);
    // The week picked (once it's reported, Enter moves on to another)
    const [picked, setPicked] = useState(null);
    const week = picked && !reported.has(picked) ? picked : firstUnreportedWeek(reported);
    // What's typed, by week and baby ("2026-11-02:12" → text), so going to
    // another week and back keeps it
    const [typed, setTyped] = useState({});
    // null, "saving", { done } or { problem }
    const [status, setStatus] = useState(null);
    const babies = useMemo(() => (week ? babiesInWeek(monkeys, enclosures, moves, week) : []), [monkeys, enclosures, moves, week]);
    const hereNow = new Set(babyCareBabies(monkeys, enclosures).map((m) => m.id));

    if (!week) return <p className="RecordsPage-none">Every week has been reported. To change one, use Edit in View.</p>;

    const key = (id) => `${week}:${id}`;
    const textOf = (id) => typed[key(id)] ?? "";
    const type = (id, text) => {
        setTyped((t) => ({ ...t, [key(id)]: text }));
        setStatus(null);
    };
    const changeWeek = (next) => {
        setPicked(next);
        setStatus(null);
    };
    const busy = status === "saving";

    async function save(event) {
        event.preventDefault();
        const entries = babies.map((m) => ({ monkeyId: m.id, report: textOf(m.id).trim() || null }));
        const written = entries.filter((e) => e.report).length;
        if (!written) {
            setStatus({ problem: "Please write a report for at least one baby." });
            return;
        }
        setStatus("saving");
        try {
            await saveBabyWeeklyReports(week, entries);
            const blank = entries.length - written;
            setTyped((t) => Object.fromEntries(Object.entries(t).filter(([k]) => !k.startsWith(`${week}:`))));
            setStatus({
                done: `Saved ${weekCommencing(week)}: ${written} ${written === 1 ? "report" : "reports"}${blank ? `, ${blank} not recorded` : ""}. It's in View.`,
            });
            await reload().catch(() => {});
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    const now = thisWeek();
    return (
        <form className="IntegrationPage-reports" onSubmit={save} noValidate>
            <WeekPicker week={week} prev={unreportedWeek(week, -1, reported, now)} next={unreportedWeek(week, 1, reported, now)} onChange={changeWeek} />
            {status?.done && (
                <p className="RecordsPage-done" role="status">
                    {status.done}
                </p>
            )}
            {!babies.length ? (
                <p className="RecordsPage-none">No babies in Baby Care that week.</p>
            ) : (
                <>
                    <p className="RecordsPage-hint">
                        Write a report for each baby in Baby Care that week, then Save All. A baby left blank is saved as Not recorded (fill it in later with Edit in View).
                    </p>
                    <ReportBoxes babies={babies} hereNow={hereNow} textOf={textOf} onType={type} />
                    <div className="RecordsPage-actions">
                        <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                            {busy ? "Saving…" : "Save All"}
                        </button>
                        {status?.problem && (
                            <p className="RecordsPage-problem" role="alert">
                                {status.problem}
                            </p>
                        )}
                    </div>
                </>
            )}
        </form>
    );
}

// ---- View ----

// Edit a week: its babies' boxes (Not recorded ones empty), Save Changes
function WeekEdit({ week, own, monkeys, enclosures, moves, onSaved, onCancel }) {
    const [typed, setTyped] = useState(() => Object.fromEntries(own.map((r) => [r.monkeyId, r.report ?? ""])));
    // null, "saving" or { problem }
    const [status, setStatus] = useState(null);
    // The week's babies: those saved, and anyone else in Baby Care that week
    const babies = useMemo(() => {
        const saved = own.map((r) => monkeys.find((m) => m.id === r.monkeyId)).filter(Boolean);
        const more = babiesInWeek(monkeys, enclosures, moves, week).filter((m) => !saved.some((s) => s.id === m.id));
        return [...saved, ...more].sort((a, b) => a.name.localeCompare(b.name));
    }, [own, monkeys, enclosures, moves, week]);
    const hereNow = new Set(babyCareBabies(monkeys, enclosures).map((m) => m.id));
    const before = (id) => own.find((r) => r.monkeyId === id)?.report ?? null;

    async function save() {
        const entries = babies
            .map((m) => ({ monkeyId: m.id, report: (typed[m.id] ?? "").trim() || null }))
            .filter((e) => e.report !== before(e.monkeyId) || !own.some((r) => r.monkeyId === e.monkeyId));
        if (!entries.length) return onCancel();
        setStatus("saving");
        try {
            await saveBabyWeeklyReports(week, entries, true);
            await onSaved();
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    const busy = status === "saving";
    return (
        <div className="BabyReports-edit">
            <ReportBoxes
                babies={babies}
                hereNow={hereNow}
                textOf={(id) => typed[id] ?? ""}
                onType={(id, text) => {
                    setTyped((t) => ({ ...t, [id]: text }));
                    setStatus(null);
                }}
                side={(m) => (own.some((r) => r.monkeyId === m.id) ? (before(m.id) ? null : "Not recorded") : "New")}
            />
            <div className="RecordsPage-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={save}>
                    {busy ? "Saving…" : "Save Changes"}
                </button>
                <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
                {status?.problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {status.problem}
                    </p>
                )}
            </div>
        </div>
    );
}

function ReportsView({ monkeys, enclosures, moves, reports, canEnter, reload }) {
    const [all, setAll] = useState(false);
    // The week being edited (one at a time)
    const [editing, setEditing] = useState(null);
    const weeks = [...new Set(reports.map((r) => r.week))].sort().reverse();
    if (!weeks.length) return <p className="RecordsPage-none">No weekly baby reports yet.</p>;
    const shown = all ? weeks : weeks.slice(0, WEEKS_AT_FIRST);
    const byName = (list) =>
        list
            .map((r) => ({ ...r, monkey: monkeys.find((m) => m.id === r.monkeyId) }))
            .sort((a, b) => (a.monkey?.name ?? "").localeCompare(b.monkey?.name ?? ""));
    return (
        <>
            <p className="RecordsPage-hint">Each week's reports, newest first. Copy a week, then paste it into WhatsApp.</p>
            <ul className="IntegrationPage-cards">
                {shown.map((week) => {
                    const own = reports.filter((r) => r.week === week);
                    const title = `Weekly Baby Report ${weekCommencing(week)}`;
                    return (
                        <li key={week} className="IntegrationPage-card">
                            <div className="BabyReports-head">
                                <div className="BabyReports-weekText">
                                    <strong>{title}</strong>
                                    <span>{weekDays(week)}</span>
                                </div>
                                {editing !== week && (
                                    <span className="BabyReports-tools">
                                        {canEnter && (
                                            <button
                                                type="button"
                                                className="Integration-icon is-edit"
                                                aria-label={`Edit ${title}`}
                                                title="Edit"
                                                onClick={() => setEditing(week)}
                                            >
                                                <IconPencil size={18} aria-hidden="true" />
                                            </button>
                                        )}
                                        <CopyButton text={weeklyBabyText(week, own, monkeys)} label="Copy" />
                                    </span>
                                )}
                            </div>
                            {editing === week ? (
                                <WeekEdit
                                    week={week}
                                    own={own}
                                    monkeys={monkeys}
                                    enclosures={enclosures}
                                    moves={moves}
                                    onCancel={() => setEditing(null)}
                                    onSaved={async () => {
                                        await reload().catch(() => {});
                                        setEditing(null);
                                    }}
                                />
                            ) : (
                                <ol className="IntegrationPage-past" aria-label={title}>
                                    {byName(own).map((r) => (
                                        <li key={r.id} className="BabyReports-baby">
                                            <BabyPhoto monkey={r.monkey ?? { name: "A baby" }} />
                                            <div className="BabyReports-words">
                                                <p className="IntegrationPage-pastWhen">
                                                    <strong>{r.monkey?.name ?? "A baby"}</strong>
                                                    {r.report && <span> · {r.loggedByName ?? "Staff"}</span>}
                                                </p>
                                                {r.report ? (
                                                    <p className="IntegrationPage-pastText">{r.report}</p>
                                                ) : (
                                                    <p className="IntegrationPage-pastText BabyReports-none">Not recorded</p>
                                                )}
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            )}
                        </li>
                    );
                })}
            </ul>
            {weeks.length > WEEKS_AT_FIRST && (
                <button type="button" className="Modal-edit is-blue-outline IntegrationPage-more" aria-expanded={all} onClick={() => setAll(!all)}>
                    {all ? "Show Fewer" : `Show All (${weeks.length} weeks)`}
                </button>
            )}
        </>
    );
}

// ---- The page: Enter | View ----

function BabyWeeklyReports({ monkeys, enclosures, canEnter }) {
    const [tab, setTab] = useState(canEnter ? "enter" : "view");
    const shownTab = canEnter ? tab : "view";
    // null: loading; "failed"; "not-ready" (baby-weekly-reports.sql not run
    // yet); or the reports
    const [reports, setReports] = useState(null);
    const reload = useCallback(async () => {
        const list = await loadBabyWeeklyReports();
        setReports(list);
        return list;
    }, []);
    useEffect(() => {
        reload().catch((error) => {
            console.error("Loading the weekly baby reports failed:", error);
            setReports(["42P01", "PGRST205"].includes(error?.code) ? "not-ready" : "failed");
        });
    }, [reload]);
    // Everyone's moves, for who was in Baby Care that week (null: loading)
    const [moves, setMoves] = useState(null);
    useEffect(() => {
        let cancelled = false;
        loadMoves()
            .then((list) => !cancelled && setMoves(list))
            .catch((error) => {
                console.error("Loading moves failed:", error);
                if (!cancelled) setMoves([]);
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <>
            {canEnter && (
                <div className="RecordsPage-tabRow">
                    <div className="RecordsPage-tabs" role="tablist" aria-label="Weekly Baby Reports">
                        {[
                            ["enter", "Enter"],
                            ["view", "View"],
                        ].map(([id, label]) => (
                            <button
                                key={id}
                                type="button"
                                role="tab"
                                aria-selected={shownTab === id}
                                className={shownTab === id ? "is-on" : ""}
                                onClick={() => setTab(id)}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {reports === null || moves === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : reports === "not-ready" ? (
                <p className="RecordsPage-none RecordsPage-problem">Weekly Baby Reports need supabase/baby-weekly-reports.sql to be run first.</p>
            ) : reports === "failed" ? (
                <p className="RecordsPage-none RecordsPage-problem">Couldn't load the reports. Please check your connection and try again.</p>
            ) : shownTab === "enter" ? (
                <ReportsEnter monkeys={monkeys} enclosures={enclosures} reports={reports} moves={moves} reload={reload} />
            ) : (
                <ReportsView monkeys={monkeys} enclosures={enclosures} moves={moves} reports={reports} canEnter={canEnter} reload={reload} />
            )}
        </>
    );
}

export default BabyWeeklyReports;
