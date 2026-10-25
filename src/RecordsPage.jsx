import { useCallback, useEffect, useRef, useState } from "react";
import { IconBabyCarriage, IconBottle, IconChevronDown, IconChevronRight, IconCopy, IconScale } from "@tabler/icons-react";
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
            <p className="RecordsPage-hint">{kind.hint} Leave a baby empty to skip it.</p>
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
                        return (
                            <li key={monkey.id} className={`RecordsPage-row${error ? " has-error" : ""}`}>
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
                                    <input
                                        className="RecordsPage-note"
                                        type="text"
                                        placeholder="Note (optional)"
                                        maxLength={500}
                                        value={typed[monkey.id]?.notes ?? ""}
                                        onChange={(e) => type(monkey.id, "notes", e.target.value)}
                                        aria-label={`Note for ${monkey.name}`}
                                    />
                                    {error && (
                                        <span className="RecordsPage-error" id={`${inputId}-error`}>
                                            {error}
                                        </span>
                                    )}
                                </div>
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

// ---- View: each baby's latest, the change since the one before, and its
// history ----

function BabyHistory({ kind, monkey, records }) {
    const [open, setOpen] = useState(false);
    const history = historyFor(records, monkey.id);
    const latest = history[0] ?? null;
    const value = (n) => `${n.toLocaleString("en-GB")} ${kind.unit}`;
    // (weights: a gain green, a loss amber)
    const tone = (change) => (kind.id !== "weights" || !change ? "" : change > 0 ? " is-up" : " is-down");
    const listId = `RecordsPage-history-${kind.id}-${monkey.id}`;
    return (
        <li className="RecordsPage-card">
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
                    {latest.notes && <p className="RecordsPage-noteText">{latest.notes}</p>}
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
                                    <th scope="col">{kind.id === "milk" ? "Milk" : "Weight"}</th>
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
                                        <td>{value(r.value)}</td>
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

function KindPage({ kind, monkeys, enclosures, canEnter }) {
    const [tab, setTab] = useState(canEnter ? "enter" : "view");
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
            {records === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : records === "failed" ? (
                <p className="RecordsPage-problem">Couldn't load the {kind.whats}. Please check your connection and try again.</p>
            ) : shownTab === "enter" ? (
                <EnterForm kind={kind} babies={babies} records={records} reload={reload} />
            ) : (
                <ViewList kind={kind} babies={babies} monkeys={monkeys} records={records} />
            )}
        </>
    );
}

// ---- The page: the team, what to record, then Enter / View ----

function Choice({ href, Icon, title, sub }) {
    return (
        <li>
            <a className="RecordsPage-choice" href={href}>
                <span className="RecordsPage-choiceIcon">
                    <Icon size={24} stroke={1.75} aria-hidden="true" />
                </span>
                <span className="RecordsPage-choiceText">
                    <span className="RecordsPage-choiceTitle">{title}</span>
                    {sub && <span className="RecordsPage-choiceSub">{sub}</span>}
                </span>
                <IconChevronRight size={20} aria-hidden="true" className="RecordsPage-choiceArrow" />
            </a>
        </li>
    );
}

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
            {crumbs.length > 1 && (
                <nav className="RecordsPage-crumbs" aria-label="Breadcrumb">
                    {crumbs.slice(0, -1).map((c) => (
                        <span key={c.href}>
                            <a href={c.href}>{c.label}</a>
                            <IconChevronRight size={14} aria-hidden="true" />
                        </span>
                    ))}
                </nav>
            )}
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
