import { useCallback, useEffect, useRef, useState } from "react";
import {
    IconBabyCarriage,
    IconBottle,
    IconChartLine,
    IconChevronDown,
    IconCopy,
    IconMinus,
    IconPlus,
    IconScale,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import { loadBabyRecords, saveBabyRecords } from "./monkeyData";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import { placeName } from "./places";
import {
    RECORD_KINDS,
    TEAMS,
    alreadySaved,
    babyCareBabies,
    batchFrom,
    changeText,
    dayLabel,
    dayText,
    historyFor,
    parseRecordsRoute,
    startDay,
    weightReport,
} from "./babyRecords";
import { Choice, Crumbs } from "./PagePicker";
import "./RecordsPage.css";

// The Records page (#records, staff only): where teams enter their records.
// First the team (Baby Care, for now), then what to record (Milk Totals,
// Weights), then Enter (a whole batch at once: the date, then each baby's
// value) or View (each baby's latest, the change since the one before, and
// its history). Entering: editors and admins (canEnter); anyone else on the
// staff can view.
//   route: "records", "records/baby-care", "records/baby-care/milk"…

const TEAM_ICONS = { "baby-care": IconBabyCarriage };
const KIND_ICONS = { milk: IconBottle, weights: IconScale };

// A row's small photo: its first one, as in the list view (none yet: an
// empty circle)
function BabyPhoto({ monkey }) {
    const photo = Array.isArray(monkey.img) ? monkey.img[0] : monkey.img;
    return (
        <span className="RecordsPage-photo">
            {typeof photo === "string" && photo && !isPlaceholderPhoto(photo) && (
                <img src={thumbUrl(photo)} alt="" loading="lazy" onError={fallbackTo(photo)} />
            )}
        </span>
    );
}

// ---- Already saved: replace them, keep the old ones, or cancel ----

function AlreadySavedDialog({ kind, date, clashes, busy, onReplace, onKeep, onCancel }) {
    const cancelRef = useRef(null);
    useDialog(true, cancelRef, { onClose: busy ? () => {} : onCancel });
    const value = (n) => `${n.toLocaleString("en-GB")} ${kind.unit}`;
    return (
        <>
            <div className="RecordsPage-scrim" />
            <div className="RecordsPage-dialog" role="dialog" aria-modal="true" aria-labelledby="RecordsPage-dialogTitle">
                <h2 id="RecordsPage-dialogTitle">Already Saved</h2>
                <p>
                    {clashes.length === 1 ? `This baby already has a ${kind.what}` : `These babies already have ${kind.whats}`} for{" "}
                    {dayLabel(date)}:
                </p>
                <ul className="RecordsPage-clashes">
                    {clashes.map(({ entry, saved, monkey }) => (
                        <li key={entry.monkeyId}>
                            <strong>{monkey?.name ?? "A baby"}</strong>: {value(saved.value)}
                            {saved.loggedByName && <span className="RecordsPage-by"> ({saved.loggedByName})</span>} →{" "}
                            <strong>{value(entry.value)}</strong>
                        </li>
                    ))}
                </ul>
                <div className="RecordsPage-dialogButtons">
                    <button type="button" className="Modal-edit is-danger" onClick={onReplace} disabled={busy}>
                        Replace Them
                    </button>
                    <button type="button" className="Modal-edit" onClick={onKeep} disabled={busy}>
                        Keep Old Values
                    </button>
                    <button type="button" className="Modal-edit is-soft" onClick={onCancel} disabled={busy} ref={cancelRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

// ---- Enter: the date, then each baby's value (empty: skipped) ----

function EnterForm({ kind, babies, records, reload }) {
    const [date, setDate] = useState(() => startDay(kind));
    // monkeyId → { text, notes }
    const [typed, setTyped] = useState({});
    const [errors, setErrors] = useState({});
    // null, "saving", { done: message } or { problem: message }
    const [status, setStatus] = useState(null);
    // the ones already saved, waiting for Replace / Keep / Cancel
    const [clashes, setClashes] = useState(null);
    // (phones) the babies whose note box is open: notes are rare, so each
    // opens with its + button
    const [notesOpen, setNotesOpen] = useState(() => new Set());
    const toggleNote = (monkeyId) => {
        const opening = !notesOpen.has(monkeyId);
        setNotesOpen((open) => {
            const next = new Set(open);
            if (opening) next.add(monkeyId);
            else next.delete(monkeyId);
            return next;
        });
        // (straight into it)
        if (opening) requestAnimationFrame(() => document.getElementById(`RecordsPage-note-${kind.id}-${monkeyId}`)?.focus());
    };
    const today = dayText(new Date());
    const byId = (id) => babies.find((m) => m.id === id);
    const savedOn = (monkeyId) => records.find((r) => r.monkeyId === monkeyId && r.date === date) ?? null;

    const type = (monkeyId, field, value) => {
        setTyped((t) => ({ ...t, [monkeyId]: { ...t[monkeyId], [field]: value } }));
        if (field === "text") setErrors((e) => ({ ...e, [monkeyId]: undefined }));
        setStatus(null);
    };

    const save = async (entries, replace) => {
        setStatus("saving");
        try {
            const saved = await saveBabyRecords(kind.id, entries, replace);
            const kept = entries.length - saved;
            const things = (n) => `${n} ${n === 1 ? kind.what : kind.whats}`;
            setTyped({});
            setNotesOpen(new Set());
            setClashes(null);
            setStatus({
                done: `Saved ${things(saved)} for ${dayLabel(date)}.${kept ? ` Kept ${kept === 1 ? "the old value" : `${kept} old values`}.` : ""}`,
            });
            reload();
        } catch (error) {
            setClashes(null);
            setStatus({ problem: error.message });
        }
    };

    const saveAll = async (event) => {
        event.preventDefault();
        if (!date || date > today) {
            setStatus({ problem: "Please pick a date that isn't in the future." });
            return;
        }
        const rows = babies.map((monkey) => ({ monkey, text: typed[monkey.id]?.text, notes: typed[monkey.id]?.notes }));
        const batch = batchFrom(rows, date, kind);
        setErrors(batch.errors);
        if (Object.keys(batch.errors).length) {
            setStatus({ problem: "Please check the highlighted values." });
            return;
        }
        if (!batch.entries.length) {
            setStatus({ problem: `Type at least one ${kind.what}.` });
            return;
        }
        // (the latest from the database: someone else may have just saved)
        setStatus("saving");
        let fresh;
        try {
            fresh = await reload();
        } catch {
            setStatus({ problem: "Couldn't check what's already saved. Please check your connection and try again." });
            return;
        }
        const found = alreadySaved(batch.entries, fresh).map((c) => ({ ...c, monkey: byId(c.entry.monkeyId) }));
        if (found.length) {
            setStatus(null);
            setClashes({ entries: batch.entries, found });
        } else {
            save(batch.entries, false);
        }
    };

    const busy = status === "saving";
    return (
        <form className="RecordsPage-form" onSubmit={saveAll} noValidate>
            <p className="RecordsPage-hint">{kind.hint}</p>
            <label className="RecordsPage-date">
                <span>Date</span>
                <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => {
                        setDate(e.target.value);
                        setStatus(null);
                    }}
                    required
                />
            </label>
            {babies.length === 0 ? (
                <p className="RecordsPage-none">There are no babies in {TEAMS[0].name} at the moment.</p>
            ) : (
                <ul className="RecordsPage-rows">
                    {babies.map((monkey) => {
                        const saved = savedOn(monkey.id);
                        const error = errors[monkey.id];
                        const inputId = `RecordsPage-${kind.id}-${monkey.id}`;
                        const noteId = `RecordsPage-note-${kind.id}-${monkey.id}`;
                        const noteOpen = notesOpen.has(monkey.id);
                        const hasNote = Boolean(typed[monkey.id]?.notes?.trim());
                        return (
                            <li
                                key={monkey.id}
                                className={`RecordsPage-row${error ? " has-error" : ""}${noteOpen ? " is-noteOpen" : ""}`}
                            >
                                <BabyPhoto monkey={monkey} />
                                <div className="RecordsPage-baby">
                                    <label className="RecordsPage-name" htmlFor={inputId}>
                                        {monkey.name}
                                    </label>
                                    <span className="RecordsPage-place">{placeName(monkey)}</span>
                                    {saved && (
                                        <span className="RecordsPage-saved">
                                            Saved: {saved.value.toLocaleString("en-GB")} {kind.unit}
                                        </span>
                                    )}
                                </div>
                                <div className="RecordsPage-inputs">
                                    <span className="RecordsPage-value">
                                        <input
                                            id={inputId}
                                            type="text"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            autoComplete="off"
                                            value={typed[monkey.id]?.text ?? ""}
                                            onChange={(e) => type(monkey.id, "text", e.target.value)}
                                            aria-invalid={Boolean(error)}
                                            aria-describedby={error ? `${inputId}-error` : undefined}
                                        />
                                        <span className="RecordsPage-unit" aria-hidden="true">
                                            {kind.unit}
                                        </span>
                                    </span>
                                    {/* (phones only: the note box opens below) */}
                                    <button
                                        type="button"
                                        className={`RecordsPage-noteToggle${hasNote ? " has-note" : ""}`}
                                        onClick={() => toggleNote(monkey.id)}
                                        aria-expanded={noteOpen}
                                        aria-controls={noteId}
                                        aria-label={`Note for ${monkey.name}`}
                                        title={noteOpen ? "Hide the note" : "Add a note"}
                                    >
                                        {noteOpen ? <IconMinus size={18} aria-hidden="true" /> : <IconPlus size={18} aria-hidden="true" />}
                                    </button>
                                    {error && (
                                        <span className="RecordsPage-error" id={`${inputId}-error`}>
                                            {error}
                                        </span>
                                    )}
                                </div>
                                <input
                                    className="RecordsPage-note"
                                    id={noteId}
                                    type="text"
                                    placeholder="Note (optional)"
                                    maxLength={500}
                                    value={typed[monkey.id]?.notes ?? ""}
                                    onChange={(e) => type(monkey.id, "notes", e.target.value)}
                                    aria-label={`Note for ${monkey.name}`}
                                />
                            </li>
                        );
                    })}
                </ul>
            )}
            {babies.length > 0 && (
                <div className="RecordsPage-actions">
                    <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                        {busy ? "Saving…" : "Save All"}
                    </button>
                    {status?.done && (
                        <p className="RecordsPage-done" role="status">
                            {status.done}
                        </p>
                    )}
                    {status?.problem && (
                        <p className="RecordsPage-problem" role="alert">
                            {status.problem}
                        </p>
                    )}
                </div>
            )}
            {clashes && (
                <AlreadySavedDialog
                    kind={kind}
                    date={date}
                    clashes={clashes.found}
                    busy={busy}
                    onReplace={() => save(clashes.entries, true)}
                    onKeep={() => save(clashes.entries, false)}
                    onCancel={() => setClashes(null)}
                />
            )}
        </form>
    );
}

// ---- View: each baby's latest, the change since the one before, a quick
// line of them all, and its history ----

// A small line of a baby's values, for a quick impression (no labels: the
// latest value and the history table have the numbers). Spaced by date, so
// a late weighing sits where it fell; the latest marked with a dot. Two or
// more to draw.
//   history: newest first (historyFor)
function Sparkline({ kind, monkey, history }) {
    const boxRef = useRef(null);
    const [width, setWidth] = useState(300);
    useEffect(() => {
        const box = boxRef.current;
        if (!box || typeof ResizeObserver === "undefined") return undefined;
        const watch = new ResizeObserver(([entry]) => setWidth(Math.max(120, entry.contentRect.width)));
        watch.observe(box);
        return () => watch.disconnect();
    }, []);
    if (history.length < 2) return null;
    const points = [...history].reverse();
    const height = 64;
    const pad = 6;
    const time = (date) => new Date(`${date}T00:00:00`).getTime();
    const [t0, t1] = [time(points[0].date), time(points.at(-1).date)];
    const values = points.map((p) => p.value);
    const [lo, hi] = [Math.min(...values), Math.max(...values)];
    const x = (date) => pad + ((time(date) - t0) / (t1 - t0 || 1)) * (width - pad * 2);
    // (all the same: a flat line across the middle)
    const y = (v) => (hi === lo ? height / 2 : pad + (1 - (v - lo) / (hi - lo)) * (height - pad * 2));
    const xy = points.map((p) => [x(p.date), y(p.value)]);
    const line = xy.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
    const area = `${line} L${xy.at(-1)[0].toFixed(1)},${height} L${xy[0][0].toFixed(1)},${height} Z`;
    const [ex, ey] = xy.at(-1);
    const amount = (n) => `${n.toLocaleString("en-GB")} ${kind.unit}`;
    return (
        <div className="RecordsPage-spark" ref={boxRef}>
            <svg
                width={width}
                height={height}
                role="img"
                aria-label={`${monkey.name}'s ${kind.whats}: ${points.length}, from ${amount(points[0].value)} (${dayLabel(points[0].date)}) to ${amount(points.at(-1).value)} (${dayLabel(points.at(-1).date)})`}
            >
                <path className="RecordsPage-sparkArea" d={area} />
                <path className="RecordsPage-sparkLine" d={line} />
                <circle className="RecordsPage-sparkDot" cx={ex} cy={ey} r={4} />
            </svg>
        </div>
    );
}

function BabyHistory({ kind, monkey, records }) {
    const [open, setOpen] = useState(false);
    const history = historyFor(records, monkey.id);
    const latest = history[0] ?? null;
    const value = (n) => `${n.toLocaleString("en-GB")} ${kind.unit}`;
    // (weights: a gain green, a loss amber)
    const tone = (change) => (kind.id !== "weights" || !change ? "" : change > 0 ? " is-up" : " is-down");
    const listId = `RecordsPage-history-${kind.id}-${monkey.id}`;
    const change = latest && (
        <p className="RecordsPage-change">
            {latest.change === null ? (
                `The first ${kind.what}.`
            ) : (
                <>
                    <strong className={`RecordsPage-delta${tone(latest.change)}`}>{changeText(latest.change, kind.unit)}</strong> since{" "}
                    {dayLabel(latest.previous.date)} ({value(latest.previous.value)})
                </>
            )}
        </p>
    );
    return (
        <li className="RecordsPage-card">
            {/* The details on the left, the quick line on the right
                (phones: under them); the history across the bottom */}
            <div className="RecordsPage-cardBody">
                <div className="RecordsPage-cardMain">
                    <div className="RecordsPage-cardHead">
                        <BabyPhoto monkey={monkey} />
                        <div className="RecordsPage-baby">
                            <span className="RecordsPage-name">{monkey.name}</span>
                            <span className="RecordsPage-place">{placeName(monkey)}</span>
                        </div>
                        {latest && (
                            <div className="RecordsPage-latest">
                                <span className="RecordsPage-latestValue">{value(latest.value)}</span>
                                <span className="RecordsPage-latestDate">{dayLabel(latest.date)}</span>
                            </div>
                        )}
                    </div>
                    {!latest ? (
                        <p className="RecordsPage-none">No {kind.whats} yet.</p>
                    ) : (
                        <>
                            {change}
                            {latest.notes && <p className="RecordsPage-noteText">{latest.notes}</p>}
                        </>
                    )}
                </div>
                <Sparkline kind={kind} monkey={monkey} history={history} />
            </div>
            {latest && (
                <>
                    <button
                        type="button"
                        className="RecordsPage-historyToggle"
                        aria-expanded={open}
                        aria-controls={listId}
                        onClick={() => setOpen((o) => !o)}
                    >
                        History ({history.length})
                        <IconChevronDown size={16} aria-hidden="true" />
                    </button>
                    {open && (
                        <table className="RecordsPage-history" id={listId}>
                            <thead>
                                <tr>
                                    <th scope="col">Date</th>
                                    <th scope="col">{kind.id === "milk" ? "Total" : "Weight"}</th>
                                    <th scope="col">Change</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history.map((r) => (
                                    <tr key={r.date}>
                                        <th scope="row">
                                            {dayLabel(r.date)}
                                            {/* (its note, and who entered it, under the date) */}
                                            {(r.notes || r.loggedByName) && (
                                                <span className="RecordsPage-historyNote">
                                                    {[r.notes, r.loggedByName].filter(Boolean).join(" · ")}
                                                </span>
                                            )}
                                        </th>
                                        <td className="RecordsPage-historyValue">{value(r.value)}</td>
                                        <td className={`RecordsPage-delta${tone(r.change)}`}>{r.change === null ? "–" : changeText(r.change, kind.unit)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </li>
    );
}

// The weekly weights report, to copy into WhatsApp: pick a day, and it's
// that week's (Monday to Sunday)
function WeeklyReport({ monkeys, records }) {
    const [open, setOpen] = useState(false);
    const [day, setDay] = useState(() => dayText(new Date()));
    // null, "copied" or "failed"
    const [copied, setCopied] = useState(null);
    const report = weightReport(records, monkeys, day || dayText(new Date()));
    const copy = async () => {
        try {
            await navigator.clipboard.writeText(report.text);
            setCopied("copied");
        } catch {
            setCopied("failed");
        }
    };
    if (!open) {
        return (
            <button type="button" className="Modal-edit RecordsPage-reportButton" onClick={() => setOpen(true)}>
                Create Report
            </button>
        );
    }
    return (
        <section className="RecordsPage-report" aria-labelledby="RecordsPage-reportTitle">
            <h2 id="RecordsPage-reportTitle">Weekly Report</h2>
            <p className="RecordsPage-hint">
                Each baby weighed that week (Monday to Sunday), with the change since the weighing before. Copy it, then paste it into
                WhatsApp.
            </p>
            <label className="RecordsPage-date">
                <span>Week of</span>
                <input
                    type="date"
                    value={day}
                    onChange={(e) => {
                        setDay(e.target.value);
                        setCopied(null);
                    }}
                />
            </label>
            <p className="RecordsPage-reportWeek">
                {dayLabel(report.monday)} – {dayLabel(report.sunday)}
            </p>
            {report.lines.length ? (
                <>
                    <pre className="RecordsPage-reportText" aria-label="The report">
                        {report.text}
                    </pre>
                    <div className="RecordsPage-actions">
                        <button type="button" className="Modal-edit is-confirm" onClick={copy}>
                            <IconCopy size={18} aria-hidden="true" />
                            {copied === "copied" ? "Copied!" : "Copy Report"}
                        </button>
                        <button type="button" className="Modal-edit is-soft" onClick={() => setOpen(false)}>
                            Close
                        </button>
                        {copied === "failed" && (
                            <p className="RecordsPage-problem" role="alert">
                                Couldn't copy it here. Select the text above and copy it instead.
                            </p>
                        )}
                    </div>
                </>
            ) : (
                <>
                    <p className="RecordsPage-none">No weights that week.</p>
                    <button type="button" className="Modal-edit is-soft" onClick={() => setOpen(false)}>
                        Close
                    </button>
                </>
            )}
        </section>
    );
}

function ViewList({ kind, babies, monkeys, records }) {
    // Baby Care's babies, then anyone else with records (since moved on)
    const others = [...new Set(records.map((r) => r.monkeyId))]
        .filter((id) => !babies.some((m) => m.id === id))
        .map((id) => monkeys.find((m) => m.id === id))
        .filter(Boolean)
        .sort((a, b) => a.name.localeCompare(b.name));
    if (!babies.length && !others.length) return <p className="RecordsPage-none">No {kind.whats} yet.</p>;
    return (
        <>
            {kind.id === "weights" && records.length > 0 && <WeeklyReport monkeys={monkeys} records={records} />}
            <ul className="RecordsPage-cards">
                {babies.map((m) => (
                    <BabyHistory key={m.id} kind={kind} monkey={m} records={records} />
                ))}
            </ul>
            {others.length > 0 && (
                <>
                    <h2 className="RecordsPage-subhead">No Longer in {TEAMS[0].name}</h2>
                    <ul className="RecordsPage-cards">
                        {others.map((m) => (
                            <BabyHistory key={m.id} kind={kind} monkey={m} records={records} />
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}

// ---- One kind of record: Enter and View ----

// (phones) whether View shows the quick lines: remembered on this device
const CHARTS_KEY = "vervetdb-records-charts";
const chartsAtFirst = () => {
    try {
        return localStorage.getItem(CHARTS_KEY) !== "hidden";
    } catch {
        return true;
    }
};

function KindPage({ kind, monkeys, enclosures, canEnter }) {
    const [tab, setTab] = useState(canEnter ? "enter" : "view");
    const [charts, setCharts] = useState(chartsAtFirst);
    const toggleCharts = () =>
        setCharts((shown) => {
            try {
                localStorage.setItem(CHARTS_KEY, shown ? "hidden" : "shown");
            } catch {
                // (not saved on this device: it still works for now)
            }
            return !shown;
        });
    // null: loading; "failed": couldn't load
    const [records, setRecords] = useState(null);
    const reload = useCallback(async () => {
        const list = await loadBabyRecords(kind.id);
        setRecords(list);
        return list;
    }, [kind.id]);
    useEffect(() => {
        setRecords(null);
        reload().catch((error) => {
            console.error("Loading records failed:", error);
            setRecords("failed");
        });
    }, [reload]);
    const babies = babyCareBabies(monkeys, enclosures);
    const shownTab = canEnter ? tab : "view";
    return (
        <>
            <div className="RecordsPage-tabRow">
            {canEnter && (
                <div className="RecordsPage-tabs" role="tablist" aria-label={kind.title}>
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
            )}
            {/* (phones, on View: the quick lines on or off, top right) */}
            {shownTab === "view" && Array.isArray(records) && records.length > 0 && (
                <button
                    type="button"
                    className={`RecordsPage-chartsToggle${charts ? " is-on" : ""}`}
                    onClick={toggleCharts}
                    aria-pressed={charts}
                    title={charts ? "Hide the charts" : "Show the charts"}
                >
                    <IconChartLine size={18} aria-hidden="true" />
                    Charts
                </button>
            )}
            </div>
            {records === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : records === "failed" ? (
                <p className="RecordsPage-problem">Couldn't load the {kind.whats}. Please check your connection and try again.</p>
            ) : shownTab === "enter" ? (
                <EnterForm kind={kind} babies={babies} records={records} reload={reload} />
            ) : (
                <div className={charts ? "" : "RecordsPage-noCharts"}>
                    <ViewList kind={kind} babies={babies} monkeys={monkeys} records={records} />
                </div>
            )}
        </>
    );
}

// ---- The page: the team, what to record, then Enter / View ----

function RecordsPage({ route = "records", monkeys = [], enclosures = [], canEnter = false, inert = false }) {
    const { team, kind } = parseRecordsRoute(route);
    const crumbs = [
        { href: "#records", label: "Records" },
        ...(team ? [{ href: `#records/${team.id}`, label: team.name }] : []),
        ...(kind ? [{ label: kind.title }] : []),
    ];
    const title = crumbs.at(-1).label;
    return (
        <div className="RecordsPage" inert={inert}>
            <Crumbs crumbs={crumbs} />
            <h1 className="RecordsPage-title">{title}</h1>
            {!team ? (
                <>
                    <p className="RecordsPage-intro">Pick your team.</p>
                    <ul className="RecordsPage-choices">
                        {TEAMS.map((t) => (
                            <Choice
                                key={t.id}
                                href={`#records/${t.id}`}
                                Icon={TEAM_ICONS[t.id]}
                                title={t.name}
                                sub={t.kinds.map((k) => RECORD_KINDS[k].title).join(" · ")}
                            />
                        ))}
                    </ul>
                </>
            ) : !kind ? (
                <>
                    <p className="RecordsPage-intro">What would you like to record or see?</p>
                    <ul className="RecordsPage-choices">
                        {team.kinds.map((k) => (
                            <Choice
                                key={k}
                                href={`#records/${team.id}/${k}`}
                                Icon={KIND_ICONS[k]}
                                title={RECORD_KINDS[k].title}
                                sub={RECORD_KINDS[k].hint}
                            />
                        ))}
                    </ul>
                </>
            ) : (
                <KindPage key={kind.id} kind={kind} monkeys={monkeys} enclosures={enclosures} canEnter={canEnter} />
            )}
        </div>
    );
}

export default RecordsPage;
