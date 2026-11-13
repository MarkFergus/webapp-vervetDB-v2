import { fieldStaff } from "./outbox";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    IconClipboardCheck,
    IconPencil,
    IconPlus,
    IconFileTypePdf,
    IconMail,
    IconRefresh,
    IconSend,
    IconTrash,
} from "@tabler/icons-react";
import {
    deleteDewormingSheet,
    loadDewormingCalendar,
    loadDewormingSheets,
    refreshDewormingCalendar,
    saveDewormingResults,
    saveDewormingSheet,
} from "./monkeyData";
import { expectedSession, relativeDay, scheduleBuckets, scheduleOf } from "./dewormingSchedule";
import { timeAgo } from "./savedData";
import { summaryDate } from "./feeding";
import {
    AMOUNTS,
    DEFAULT_INSTRUCTIONS,
    DEWORMERS,
    SESSIONS,
    UNITS,
    daysFor,
    dewormingGroups,
    doseText,
    nextSession,
    introcageRanks,
    isCustom,
    printOrder,
    shortIntrocage,
    differentScheduleText,
    sheetTitle,
    splitDose,
    startingLines,
    usualDose,
} from "./dewormingRules";
import { dayLabel, dayText } from "./babyRecords";
import { ageLabel } from "./ages";
import { fullName } from "./places";
import { downloadBlob } from "./canvasHelpers";
import ConfirmBubble from "./ConfirmBubble";
import {
    AddPhotoButton,
    emailSheet,
    ResultsForm,
    ResultsTable,
    Review,
    SheetPhotos,
    allDaysDone,
    resultsOf,
} from "./DewormingResults";
import "./IntegrationRecordsPage.css"; // (the pickers' look)
import "./DewormingRecordsPage.css";

// Records → Sections → Deworming: the deworming sheets.
//   the list     every sheet, newest first, with where it's up to; Download PDF
//                (the paper sheet, as before) and (admins) Delete icons;
//                staff open one to see who's on it
//   Prepare Sheet (admins)   a deworming group and session (the next in
//                its cycle to start with), the start date, the line under
//                the printed title, and each monkey's dewormer and dose
//                (dewormingRules.js: who's ticked to start with, and with
//                what). Edit (until results are entered) and Delete too.
//   a sheet      Enter Results (editors and admins: DewormingResults.jsx),
//                day by day; then Add Photo (the paper sheet) and Submit for
//                Approval, each once the one before is done; admins Approve
//                it (each monkey's record goes into its Medical records) or
//                Send it Back
//   staff: { isAdmin, canAdd, readOnly, … } (as the pop-up's)

const OTHER = "other";

// The sheet's monkeys by name, with their names (a monkey no longer in the
// list: "Unknown")
// (placeRank: where its introcage comes, for the sheet's order;
// introcageShort: its short name, for the paper sheet)
function namedLines(sheet, monkeys, enclosures = []) {
    const rank = introcageRanks(enclosures);
    return sheet.lines.map((l) => {
        const monkey = monkeys.find((m) => m.id === l.monkeyId);
        return {
            ...l,
            name: monkey?.name ?? "Unknown",
            introcage: Boolean(monkey?.introcage),
            placeRank: monkey?.introcage ? rank(monkey.introcage) : 0,
            // (the paper sheet: "Bruno (Gol A)")
            introcageShort: monkey?.introcage ? shortIntrocage(monkey.introcage, enclosures) : null,
        };
    });
}

// One monkey's choice in the form → its dewormer's name ("" if not chosen)
const medicationOf = (line) => (line.choice === OTHER ? line.other.trim() : line.choice);

// A line to edit: { on, choice (a dewormer's name, OTHER or ""), other,
// amount, unit, days, different (not ticked: On different schedule) }
function formLine(line, on, different = false) {
    const known = DEWORMERS.some((d) => d.name === line.medication);
    const { amount, unit } = splitDose(line.dose);
    return {
        on,
        choice: !line.medication ? "" : known ? line.medication : OTHER,
        other: known ? "" : (line.medication ?? ""),
        amount,
        unit,
        days: line.days ?? 3,
        different: !on && different,
    };
}

//   custom: a custom list (one-off, not on the schedule): its own title and
//   any monkeys, searched for and added, instead of a group and session
function PrepareSheet({ groups, sheets, monkeys, editing, custom = false, onSaved, onCancel }) {
    const [groupKey, setGroupKey] = useState(editing?.groupKey ?? groups[0]?.key ?? "");
    const group = custom ? null : (groups.find((g) => g.key === groupKey) ?? null);
    const [customTitle, setCustomTitle] = useState(custom ? (editing?.groupName ?? "") : "");
    const [search, setSearch] = useState("");
    const [session, setSession] = useState(editing?.session ?? (custom ? "custom" : nextSession(sheets, groupKey)));
    const [startDate, setStartDate] = useState(editing?.startDate ?? dayText(new Date()));
    const [instructions, setInstructions] = useState(editing ? editing.instructions : DEFAULT_INSTRUCTIONS);
    // every monkey on the form: the group's, and (editing) any already on
    // the sheet that have moved since
    const fresh = useCallback(
        (g, s) => {
            const start = g ? startingLines(g, s, sheets) : {};
            return Object.fromEntries(
                (g?.monkeys ?? []).map(({ monkey }) => [
                    monkey.id,
                    formLine(start[monkey.id] ?? { medication: "", dose: "", days: 3 }, Boolean(start[monkey.id]?.on)),
                ])
            );
        },
        [sheets]
    );
    const [lines, setLines] = useState(() => {
        if (custom && !editing) return {};
        if (!editing) return fresh(group, session);
        const own = Object.fromEntries(editing.lines.map((l) => [l.monkeyId, formLine(l, true)]));
        const rest = Object.fromEntries(
            (group?.monkeys ?? [])
                .filter(({ monkey }) => !(monkey.id in own))
                .map(({ monkey }) => [monkey.id, formLine({}, false, editing.differentSchedule?.includes(monkey.id))])
        );
        return { ...rest, ...own };
    });
    const [all, setAll] = useState({ choice: "", amount: "", unit: UNITS[0] });
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);

    // What's expected (Outlook's deworming near the start date, or else the
    // group's cycle): a new list starts as it; a different session is
    // flagged, and saving it is the confirming
    const [events, setEvents] = useState(null);
    useEffect(() => {
        let live = true;
        Promise.resolve()
            .then(loadDewormingCalendar)
            .then((found) => live && setEvents(found?.events ?? []))
            .catch(() => live && setEvents([]));
        return () => {
            live = false;
        };
    }, []);
    const others = editing ? sheets.filter((s) => s.id !== editing.id) : sheets;
    const expectedFor = (key) =>
        events ? expectedSession(events, groups, others, key, startDate) : { session: nextSession(sheets, key) };
    const expected = events && group && !custom ? expectedFor(group.key) : null;
    // (editing: not flagged again unless something's changed)
    const unchanged =
        editing && session === editing.session && groupKey === editing.groupKey && startDate === editing.startDate;
    const mismatch = expected && expected.session !== session && !unchanged ? expected : null;
    // (Outlook's arrived before anything's chosen: start as it)
    const touched = useRef(Boolean(editing));
    useEffect(() => {
        if (touched.current || !events || !group) return;
        touched.current = true;
        const s = expectedSession(events, groups, sheets, group.key, startDate).session;
        if (s !== session) {
            setSession(s);
            setLines(fresh(group, s));
        }
    }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

    const rows = Object.keys(lines)
        .map(Number)
        .map((id) => ({ id, monkey: monkeys.find((m) => m.id === id) ?? null }))
        .sort((a, b) => (a.monkey?.name ?? "").localeCompare(b.monkey?.name ?? ""));
    // A custom list: monkeys found by name, not on it yet (at most 8)
    const term = search.trim().toLowerCase();
    const found =
        custom && term
            ? monkeys
                  .filter((m) => m.name.toLowerCase().includes(term) && !(m.id in lines))
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .slice(0, 8)
            : [];
    function addMonkey(monkey) {
        setLines((ls) => ({ ...ls, [monkey.id]: formLine({ medication: "", dose: "", days: 3 }, true) }));
        setSearch("");
        setProblem(null);
    }
    const ticked = rows.filter((r) => lines[r.id].on).length;

    const restart = (g, s) => {
        setLines(fresh(g, s));
        setProblem(null);
    };
    const change = (id, values) => {
        touched.current = true;
        // (ticked: on this list after all, not a different schedule)
        setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...values, ...(values.on && { different: false }) } }));
        setProblem(null);
        setUnusual(null);
    };
    // (a dewormer from the list: its days and usual dose)
    const choose = (id, choice) =>
        change(id, {
            choice,
            days: daysFor(choice) ?? lines[id].days,
            ...(usualDose(choice) && splitDose(usualDose(choice))),
        });

    function applyToAll() {
        setLines((ls) =>
            Object.fromEntries(
                Object.entries(ls).map(([id, l]) => [
                    id,
                    l.on
                        ? {
                              ...l,
                              ...(all.choice && { choice: all.choice, other: "", days: daysFor(all.choice) ?? l.days }),
                              ...(all.amount && { amount: all.amount, unit: all.unit }),
                          }
                        : l,
                ])
            )
        );
    }

    // Doses that aren't their dewormer's usual one (uncommon: checked before
    // saving): [{ name, dose, medication, usual }]
    const [unusual, setUnusual] = useState(null);

    async function save(checked = false) {
        const chosen = rows.filter((r) => lines[r.id].on);
        if (custom && !customTitle.trim()) return setProblem("Please give the list a title.");
        if (!custom && !group) return setProblem("Please choose the group.");
        if (!startDate) return setProblem("Please choose the start date.");
        if (!chosen.length) return setProblem("Please tick at least one monkey.");
        const missing = chosen.filter((r) => !medicationOf(lines[r.id]) || !lines[r.id].amount);
        if (missing.length) {
            return setProblem(
                `Please choose a dewormer and dose for ${missing.map((r) => r.monkey?.name ?? "Unknown").join(", ")}.`
            );
        }
        if (!checked) {
            const different = chosen
                .map((r) => ({
                    name: r.monkey?.name ?? "Unknown",
                    medication: medicationOf(lines[r.id]),
                    dose: doseText(lines[r.id].amount, lines[r.id].unit),
                }))
                .map((d) => ({ ...d, usual: usualDose(d.medication) }))
                .filter((d) => d.usual && d.dose !== d.usual);
            if (different.length) {
                setProblem(null);
                return setUnusual(different);
            }
        }
        setUnusual(null);
        setBusy(true);
        setProblem(null);
        try {
            await saveDewormingSheet({
                id: editing?.id,
                // (a custom list: a key of its own, its title as the name)
                groupKey: custom ? (editing?.groupKey ?? `custom:${Date.now()}`) : group.key,
                groupName: custom ? customTitle.trim() : group.name,
                session: custom ? "custom" : session,
                startDate,
                instructions,
                differentSchedule: rows.filter((r) => !lines[r.id].on && lines[r.id].different).map((r) => r.id),
                lines: chosen.map((r) => ({
                    monkeyId: r.id,
                    medication: medicationOf(lines[r.id]),
                    dose: doseText(lines[r.id].amount, lines[r.id].unit),
                    days: Number(lines[r.id].days),
                })),
            });
            await onSaved();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <section className="Deworming-prepare" aria-label={editing ? "Edit List" : custom ? "New Custom List" : "New Deworming List"}>
            {/* (the page's title, "New Deworming List" / "Edit List", and the way back
                above it: onTitle) */}
            <div className="Deworming-fields">
                {custom ? (
                    <label className="IntegrationPage-choose Deworming-customTitle">
                        <span>Title</span>
                        <input
                            type="text"
                            value={customTitle}
                            maxLength={60}
                            placeholder="e.g. Full Moon Deworming"
                            onChange={(e) => setCustomTitle(e.target.value)}
                        />
                    </label>
                ) : (
                    <>
                <label className="IntegrationPage-choose">
                    <span>Group</span>
                    <select
                        value={groupKey}
                        onChange={(e) => {
                            const g = groups.find((x) => x.key === e.target.value);
                            const s = editing ? session : expectedFor(e.target.value).session;
                            setGroupKey(e.target.value);
                            setSession(s);
                            restart(g, s);
                        }}
                    >
                        {groups.map((g) => (
                            <option key={g.key} value={g.key}>
                                {g.name}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="IntegrationPage-choose">
                    <span>Session</span>
                    <select
                        value={session}
                        onChange={(e) => {
                            touched.current = true;
                            setSession(e.target.value);
                            restart(group, e.target.value);
                        }}
                    >
                        {Object.entries(SESSIONS)
                            .filter(([id]) => id !== "custom")
                            .map(([id, label]) => (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            ))}
                    </select>
                </label>
                    </>
                )}
                <label className="IntegrationPage-choose">
                    <span>Start Date</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
            </div>
            {mismatch && (
                <p className="Deworming-mismatch" role="status">
                    {mismatch.date
                        ? `Outlook has ${group.name} ${mismatch.extra ? "Extra " : ""}${SESSIONS[mismatch.session]} Deworming on ${longDay(mismatch.date)}.`
                        : `The next in ${group.name}'s cycle is the ${SESSIONS[mismatch.session]}.`}{" "}
                    This list is a {SESSIONS[session]}. Please check before saving.
                </p>
            )}
            <label className="IntegrationPage-choose Deworming-instructions">
                <span>Instructions (printed under the title)</span>
                <input
                    type="text"
                    value={instructions}
                    maxLength={300}
                    onChange={(e) => setInstructions(e.target.value)}
                />
            </label>

            <div className="Deworming-setAll" role="group" aria-label="Set All To">
                <span className="Deworming-setAllLabel">Set All To</span>
                <select
                    aria-label="Dewormer for all"
                    value={all.choice}
                    onChange={(e) =>
                        setAll({
                            ...all,
                            choice: e.target.value,
                            ...(usualDose(e.target.value) && splitDose(usualDose(e.target.value))),
                        })
                    }
                >
                    <option value="">Dewormer…</option>
                    {DEWORMERS.map((d) => (
                        <option key={d.name} value={d.name}>
                            {d.name}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Amount for all"
                    value={all.amount}
                    onChange={(e) => setAll({ ...all, amount: e.target.value })}
                >
                    <option value="">Dose…</option>
                    {AMOUNTS.map((a) => (
                        <option key={a} value={a}>
                            {a}
                        </option>
                    ))}
                </select>
                <select
                    aria-label="Unit for all"
                    value={all.unit}
                    onChange={(e) => setAll({ ...all, unit: e.target.value })}
                >
                    {UNITS.map((u) => (
                        <option key={u} value={u}>
                            {u}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    className="Modal-edit is-soft"
                    disabled={!all.choice && !all.amount}
                    onClick={applyToAll}
                >
                    Apply To Ticked
                </button>
            </div>

            {custom && (
                <div className="Deworming-addMonkey">
                    <label className="IntegrationPage-choose">
                        <span>Add Monkey</span>
                        <input
                            type="search"
                            value={search}
                            placeholder="Search by name"
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </label>
                    {found.length > 0 && (
                        <ul className="Deworming-found" aria-label="Monkeys found">
                            {found.map((m) => (
                                <li key={m.id}>
                                    <button type="button" onClick={() => addMonkey(m)}>
                                        <b>{m.name}</b>
                                        <span className="Deworming-about">
                                            {ageLabel(m.year)}
                                            {m.introcage ? ` · ${fullName(m.introcage)}` : m.troop ? ` · ${fullName(m.troop)}` : ""}
                                        </span>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    {term && !found.length && <p className="RecordsPage-hint">No monkeys found.</p>}
                </div>
            )}
            <p className="Deworming-count">
                {ticked} of {rows.length} ticked
            </p>
            <ul className="Deworming-lines">
                {rows.map(({ id, monkey }) => {
                    const line = lines[id];
                    const name = monkey?.name ?? "Unknown";
                    return (
                        <li key={id} className={`Deworming-line${line.on ? " is-on" : line.different ? " is-different" : ""}`}>
                            <label className="Deworming-who">
                                <input
                                    type="checkbox"
                                    checked={line.on}
                                    onChange={(e) => change(id, { on: e.target.checked })}
                                    aria-label={name}
                                />
                                <span>
                                    <b>{name}</b>
                                    <span className="Deworming-about">
                                        {monkey ? ageLabel(monkey.year) : ""}
                                        {monkey?.introcage ? ` · ${fullName(monkey.introcage)}` : ""}
                                    </span>
                                </span>
                            </label>
                            {!line.on && (
                                <label className="Deworming-different">
                                    <input
                                        type="checkbox"
                                        checked={line.different}
                                        onChange={(e) => change(id, { different: e.target.checked })}
                                        aria-label={`${name}: On different schedule`}
                                    />
                                    On different schedule
                                </label>
                            )}
                            {line.on && (
                                <div className="Deworming-dose">
                                    <select
                                        aria-label={`Dewormer for ${name}`}
                                        value={line.choice}
                                        onChange={(e) => choose(id, e.target.value)}
                                    >
                                        <option value="">Dewormer…</option>
                                        {DEWORMERS.map((d) => (
                                            <option key={d.name} value={d.name}>
                                                {d.name}
                                            </option>
                                        ))}
                                        <option value={OTHER}>Other…</option>
                                    </select>
                                    {line.choice === OTHER && (
                                        <>
                                            <input
                                                type="text"
                                                aria-label={`Other dewormer for ${name}`}
                                                placeholder="e.g. Milbemax"
                                                maxLength={40}
                                                value={line.other}
                                                onChange={(e) => change(id, { other: e.target.value })}
                                            />
                                            <select
                                                aria-label={`Days for ${name}`}
                                                value={line.days}
                                                onChange={(e) => change(id, { days: Number(e.target.value) })}
                                            >
                                                <option value={1}>1 day</option>
                                                <option value={3}>3 days</option>
                                            </select>
                                        </>
                                    )}
                                    <select
                                        aria-label={`Dose for ${name}`}
                                        value={line.amount}
                                        onChange={(e) => change(id, { amount: e.target.value })}
                                    >
                                        <option value="">Dose…</option>
                                        {AMOUNTS.map((a) => (
                                            <option key={a} value={a}>
                                                {a}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        aria-label={`Unit for ${name}`}
                                        value={line.unit}
                                        onChange={(e) => change(id, { unit: e.target.value })}
                                    >
                                        {UNITS.map((u) => (
                                            <option key={u} value={u}>
                                                {u}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {unusual ? (
                <div className="Deworming-unusual" role="alertdialog" aria-label="Check these doses">
                    <p>
                        <b>Check these doses.</b> They're not the usual dose for their dewormer:
                    </p>
                    <ul>
                        {unusual.map((d) => (
                            <li key={d.name}>
                                {d.name}: {d.dose} {d.medication} (usually {d.usual})
                            </li>
                        ))}
                    </ul>
                    <div className="Deworming-actions">
                        <button
                            type="button"
                            className="Modal-edit is-confirm"
                            disabled={busy}
                            onClick={() => save(true)}
                        >
                            {busy ? "Saving…" : "Save Anyway"}
                        </button>
                        <button
                            type="button"
                            className="Modal-edit is-blue-outline"
                            disabled={busy}
                            onClick={() => setUnusual(null)}
                        >
                            Go Back
                        </button>
                    </div>
                </div>
            ) : (
                <div className="Deworming-actions">
                    <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={() => save()}>
                        {busy ? "Saving…" : mismatch ? `Save ${SESSIONS[session]} Anyway` : "Save List"}
                    </button>
                    <button type="button" className="Modal-edit is-cancel" disabled={busy} onClick={onCancel}>
                        Cancel
                    </button>
                </div>
            )}
        </section>
    );
}

// One sheet: who's on it and with what, Print Sheet, and (admins) Edit and
// Delete
// A sheet's stage, in words: Ready (nothing entered yet), In Progress,
// Waiting for Approval, Approved
export function stageText(sheet) {
    if (sheet.status === "approved") return "Approved";
    if (sheet.status === "submitted") return "Waiting for Approval";
    return sheet.lines.some((l) => Object.keys(l.doses ?? {}).length || (l.kind && l.kind !== "list"))
        ? "In Progress"
        : "Ready";
}

// A sheet in the list: where it's up to (Not Started, Day 2, Ready to
// Submit…) and its tag on the right (Ready dark, In Progress amber, Awaiting
// Approval blue, Completed green)
// A sheet's title on screen, with "F/U" kept whole: a long title breaks
// before "F/U Deworming" or before "Deworming", never inside "F/U"
export function SheetTitle({ text }) {
    return text.split(/(F\/U)/).map((part, i) =>
        part === "F/U" ? (
            <span key={i} className="Deworming-nowrap">
                F/U
            </span>
        ) : (
            part
        )
    );
}

export function listStatus(sheet) {
    // (Day 4 when anyone needs it)
    const days = [1, 2, 3, ...(sheet.lines.some((l) => l.day4 === true) ? [4] : [])];
    const allDays = `Days 1–${days.at(-1)} Done`;
    if (sheet.status === "approved") return { text: allDays, tag: "Completed", tone: "approved" };
    if (sheet.status === "submitted") return { text: allDays, tag: "Awaiting Approval", tone: "submitted" };
    const done = sheet.daysDone ?? [];
    if (stageText(sheet) === "Ready" && done.length === 0) return { text: "Not Started", tag: "Ready", tone: "ready" };
    const day = days.find((d) => !done.includes(d));
    return { text: day ? `Day ${day}` : "Ready to Submit", tag: "In Progress", tone: "progress" };
}

// Download PDF: the paper sheet as a PDF. Throws a message to show.
async function printSheet(sheet, monkeys, enclosures) {
    try {
        const [{ pdf }, { default: DewormingSheetPDF }] = await Promise.all([
            import("@react-pdf/renderer"),
            import("./DewormingSheetPDF"),
        ]);
        const lines = printOrder(namedLines(sheet, monkeys, enclosures));
        const blob = await pdf(
            <DewormingSheetPDF sheet={sheet} lines={lines} different={differentScheduleText(sheet, monkeys)} />
        ).toBlob();
        const name = `${sheet.groupName}_${SESSIONS[sheet.session]}`.replace(/[^a-z0-9]+/gi, "_");
        downloadBlob(blob, `deworming_${name}_${sheet.startDate}.pdf`);
    } catch (error) {
        console.error(error);
        throw new Error("Couldn't create the PDF. Check your internet connection, then try again.");
    }
}

// A sheet in the list: its title and where it's up to (opens it), then
// Download PDF and (admins) Delete, as icons
function SheetRow({ sheet, monkeys, enclosures, canPrepare, onOpen, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const stopDeleting = useCallback(() => setDeleting(false), []);
    const status = listStatus(sheet);
    const title = sheetTitle(sheet);

    async function print() {
        setBusy(true);
        setProblem(null);
        try {
            await printSheet(sheet, monkeys, enclosures);
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    async function remove() {
        setBusy(true);
        try {
            await deleteDewormingSheet(sheet.id);
            await onDeleted();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
            setDeleting(false);
        }
    }

    return (
        <li className="Deworming-row">
            <div className="Deworming-rowMain">
                <button type="button" className="Deworming-item" onClick={onOpen}>
                    <span className="Deworming-itemText">
                        <b>
                            <SheetTitle text={title} />
                        </b>
                        <span>
                            {startedText(sheet)} ·{" "}
                            {sheet.lines.length === 1 ? "1 monkey" : `${sheet.lines.length} monkeys`} · {status.text}
                        </span>
                    </span>
                    {status.tag && <span className={`Deworming-tag is-${status.tone}`}>{status.tag}</span>}
                </button>
                <span className="Deworming-rowTools">
                    <button
                        type="button"
                        className="Deworming-icon"
                        aria-label="Download PDF"
                        title="Download PDF"
                        disabled={busy}
                        onClick={print}
                    >
                        <IconFileTypePdf size={18} aria-hidden="true" />
                    </button>
                    {canPrepare && (
                        <span className="Deworming-confirmHost">
                            <button
                                type="button"
                                className="Deworming-icon is-danger"
                                aria-label="Delete"
                                title="Delete"
                                disabled={busy}
                                onClick={() => setDeleting(true)}
                            >
                                <IconTrash size={18} aria-hidden="true" />
                            </button>
                            {deleting && (
                                <ConfirmBubble
                                    question={
                                        sheet.status === "approved"
                                            ? "Delete this list? (The Medical records it added stay.)"
                                            : "Delete this list?"
                                    }
                                    danger
                                    busy={busy}
                                    onConfirm={remove}
                                    onCancel={stopDeleting}
                                />
                            )}
                        </span>
                    )}
                </span>
            </div>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
        </li>
    );
}

// One sheet: who's on it and with what; Enter Results, Add Photo and Submit
// (staff, until it's submitted: each once the one before is done); the
// results and photos; Review (admins, once submitted); and (admins, before
// any results) Edit
function SheetView({ sheet, monkeys, enclosures, canPrepare, canRecord, onEdit, onChanged }) {
    const [recording, setRecording] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const lines = printOrder(namedLines(sheet, monkeys, enclosures));
    const stopSubmitting = useCallback(() => setSubmitting(false), []);
    // (results entered, or a monkey added: Edit would lose them)
    const started = lines.some((l) => Object.keys(l.doses ?? {}).length || (l.kind && l.kind !== "list"));
    const stage = stageText(sheet);
    // (staff until it's submitted; admins until it's approved)
    const canEnter = canRecord && (sheet.status === "ready" || (sheet.status === "submitted" && canPrepare));

    const daysDone = allDaysDone(sheet);
    const photos = sheet.photos ?? [];
    // (staff completing it: Add Photo and Submit too)
    const completing = canEnter && sheet.status === "ready";

    async function emailNow() {
        setBusy(true);
        setProblem(null);
        try {
            await emailSheet(sheet, photos);
            await onChanged();
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    // The photos (added or removed), or Submit: saved with the results
    async function saveSheet(changes, submit = false) {
        setBusy(true);
        setProblem(null);
        setSubmitting(false);
        try {
            await saveDewormingResults(sheet.id, { ...resultsOf({ ...sheet, ...changes }, sheet.lines), submit });
            await onChanged();
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    if (recording) {
        return (
            <section className="Deworming-sheet" aria-label={sheetTitle(sheet)}>
                <ResultsForm
                    sheet={sheet}
                    lines={lines}
                    monkeys={monkeys}
                    onCancel={() => setRecording(false)}
                    onSaved={onChanged}
                />
            </section>
        );
    }

    return (
        <section className="Deworming-sheet" aria-label={sheetTitle(sheet)}>
            {/* (the page's title is the sheet's: "H&B Troop 3-Month Deworming") */}
            <p className="Deworming-meta">
                {startedText(sheet)} ·{" "}
                {lines.length === 1 ? "1 monkey" : `${lines.length} monkeys`} ·{" "}
                <span className={`Deworming-stage is-${sheet.status}`}>{stage}</span>
                {sheet.preparedByName ? ` · prepared by ${sheet.preparedByName}` : ""}
            </p>
            {sheet.status === "ready" && sheet.returnNote && (
                <p className="Deworming-returned" role="note">
                    <b>Sent back:</b> {sheet.returnNote}
                </p>
            )}
            {sheet.status === "submitted" && (
                <p className="Deworming-meta">
                    Submitted{sheet.submittedByName ? ` by ${sheet.submittedByName}` : ""}, waiting for an admin to
                    approve it.
                </p>
            )}
            {sheet.status === "approved" && (
                <p className="Deworming-meta">
                    Approved{sheet.approvedByName ? ` by ${sheet.approvedByName}` : ""}: in each monkey's Medical
                    records.
                </p>
            )}
            {/* Has the paper sheet gone out? (admins: send it, or send it again) */}
            {sheet.status === "approved" && canPrepare && photos.length > 0 && (
                <div className="Deworming-emailed">
                    <p className="Deworming-meta">
                        {sheet.photoEmailedAt ? `Sheet emailed ${dayLabel(dayText(new Date(sheet.photoEmailedAt)))}.` : "Sheet not emailed yet."}
                    </p>
                    <button type="button" className="Modal-edit is-blue-outline" disabled={busy} onClick={emailNow}>
                        <IconMail size={16} aria-hidden="true" />
                        {busy ? "Sending…" : sheet.photoEmailedAt ? "Email Again" : "Email Sheet"}
                    </button>
                </div>
            )}
            {sheet.instructions && <p className="Deworming-note">{sheet.instructions}</p>}
            {sheet.staffNames && <p className="Deworming-meta">Staff: {sheet.staffNames}</p>}
            {started || sheet.status !== "ready" ? (
                <ResultsTable lines={lines} />
            ) : (
                <table className="Deworming-table">
                    <thead>
                        <tr>
                            <th scope="col">Name</th>
                            <th scope="col">Details</th>
                            <th scope="col">Days</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((l) => (
                            <tr key={l.monkeyId}>
                                <th scope="row">{l.name}</th>
                                <td>
                                    {l.dose} {l.medication}
                                </td>
                                <td>{l.days === 1 ? "1 day" : "3 days"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            {differentScheduleText(sheet, monkeys) && (
                <p className="Deworming-meta Deworming-differentNote">{differentScheduleText(sheet, monkeys)}</p>
            )}
            {photos.length > 0 && (
                <>
                    <h3 className="RecordsPage-subhead">Photo of the Paper Copy</h3>
                    <SheetPhotos
                        paths={photos}
                        onRemove={completing ? (p) => saveSheet({ photos: photos.filter((x) => x !== p) }) : null}
                    />
                </>
            )}
            {sheet.status === "approved" && (
                <>
                    <h3 className="RecordsPage-subhead">Records</h3>
                    <ul className="Deworming-recordList">
                        {lines.map((l) => (
                            <li key={l.id ?? l.monkeyId}>
                                <b>{l.name}</b> {l.recordText}
                            </li>
                        ))}
                    </ul>
                </>
            )}
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {completing && (
                <p className="Deworming-meta Deworming-steps">
                    Enter Results at the end of each day. When all days are complete, upload a photo of the completed
                    sheet and press Submit to finalise deworming.
                </p>
            )}
            <div className="Deworming-actions">
                {canEnter && (
                    <button
                        type="button"
                        className="Modal-edit is-blue"
                        disabled={busy}
                        onClick={() => setRecording(true)}
                    >
                        <IconClipboardCheck size={16} aria-hidden="true" />
                        {sheet.status === "submitted" ? "Edit Results" : "Enter Results"}
                    </button>
                )}
                {completing && (
                    <>
                        <AddPhotoButton
                            sheetId={sheet.id}
                            done={photos.length > 0}
                            disabled={busy || !daysDone}
                            onAdded={(added) => saveSheet({ photos: [...photos, ...added] })}
                            onProblem={setProblem}
                        />
                        <span className="Deworming-confirmHost">
                            <button
                                type="button"
                                className="Modal-edit is-confirm"
                                disabled={busy || !daysDone || !photos.length}
                                title={
                                    !daysDone
                                        ? "Complete every day first"
                                        : photos.length
                                          ? undefined
                                          : "Add a photo of the deworming sheet first"
                                }
                                onClick={() => setSubmitting(true)}
                            >
                                <IconSend size={16} aria-hidden="true" />
                                Submit
                            </button>
                            {submitting && (
                                <ConfirmBubble
                                    question="Submit for approval? Only an admin can change it after."
                                    busy={busy}
                                    onConfirm={() => saveSheet({}, true)}
                                    onCancel={stopSubmitting}
                                />
                            )}
                        </span>
                    </>
                )}
                {canPrepare && sheet.status === "ready" && !started && (
                    <button type="button" className="Modal-edit is-blue-outline" disabled={busy} onClick={onEdit}>
                        <IconPencil size={16} aria-hidden="true" />
                        Edit
                    </button>
                )}
            </div>
            {canPrepare && sheet.status === "submitted" && <Review sheet={sheet} lines={lines} onDone={onChanged} />}
        </section>
    );
}

// "2026-09-10" → "10th Sep 2026"
// A list's start: "Starts Mon 2 Nov", or once it's passed (or begun)
// "Started on Mon 2 Nov" (the day it really began, if known)
function startedText(sheet) {
    if (sheet.startedOn) return `Started on ${dayLabel(sheet.startedOn)}`;
    if (sheet.startDate < dayText(new Date())) return `Started on ${dayLabel(sheet.startDate)}`;
    return `Starts ${dayLabel(sheet.startDate)}`;
}

function longDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return summaryDate(new Date(y, m - 1, d));
}

// A date's block on the left of a Schedule row: "TUE", "10", "NOV"
const CHIP_DAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
const CHIP_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
function DateChip({ date, late }) {
    if (!date) {
        return (
            <span className="Deworming-chip is-none" aria-hidden="true">
                <b>?</b>
            </span>
        );
    }
    const [y, m, d] = date.split("-").map(Number);
    return (
        <span className={`Deworming-chip${late ? " is-late" : ""}`} aria-hidden="true">
            <small>{CHIP_DAYS[new Date(y, m - 1, d).getDay()]}</small>
            <b>{d}</b>
            <small>{CHIP_MONTHS[m - 1]}</small>
        </span>
    );
}

// Schedule: the dewormings planned in Outlook (dewormingSchedule.js), and
// each group's next one that isn't in it yet (worked out: "estimated"), at
// a glance: under Overdue, This Week, then each month, each with its date
// block, how long until (or since), and its list's stage once it's
// prepared (opens it). Where it's from and when it was last fetched;
// admins: Refresh Now, and any titles that couldn't be read.
function Schedule({ groups, sheets, canPrepare, onOpen }) {
    // null: loading; { problem }; false: not set up yet; or the calendar
    const [calendar, setCalendar] = useState(null);
    const [refreshing, setRefreshing] = useState(false);
    // (Other Scheduled Dewormings' naming tips, for the titles that couldn't be read: hidden until asked for)
    const [tips, setTips] = useState(false);
    const [problem, setProblem] = useState(null);
    const load = useCallback(
        () =>
            loadDewormingCalendar()
                .then((found) => setCalendar(found ?? false))
                .catch((error) => setCalendar({ problem: error.message })),
        []
    );
    useEffect(() => {
        load();
    }, [load]);

    async function refresh() {
        setRefreshing(true);
        setProblem(null);
        try {
            await refreshDewormingCalendar();
            await load();
        } catch (error) {
            setProblem(error.message);
        } finally {
            setRefreshing(false);
        }
    }

    if (calendar === null) return <p className="RecordsPage-intro">Loading…</p>;
    if (calendar === false) {
        return (
            <p className="RecordsPage-intro">
                The schedule isn't ready yet: supabase/deworming-calendar.sql needs to be run.
            </p>
        );
    }
    if (calendar.problem) {
        return (
            <p className="Integration-problem" role="alert">
                {calendar.problem}
            </p>
        );
    }
    const { due, overdue, unscheduled, unread } = scheduleOf(calendar.events, groups, sheets, dayText(new Date()));
    const { sync } = calendar;
    const today = dayText(new Date());
    const buckets = scheduleBuckets({ due, overdue, unscheduled }, today);
    const row = (item) => {
        const status = item.sheet ? listStatus(item.sheet) : null;
        const tag = item.sheet
            ? status.tag && { text: status.tag, tone: status.tone }
            : item.kind === "estimate"
              ? {
                    text: item.late ? "Overdue, not in calendar" : "Not in calendar",
                    // (to schedule: an amber outline, apart from In Progress's fill)
                    tone: item.late ? "overdue" : "todo",
                }
              : item.late
                ? { text: "Overdue, date TBC", tone: "overdue" }
                : null;
        const when = [
            item.date ? relativeDay(item.date, today) : "No past deworming found",
            item.kind === "estimate" && item.date ? "estimated" : null,
            item.kind === "outlook" && !item.late && !item.sheet ? "No list yet" : null,
        ]
            .filter(Boolean)
            .join(" · ");
        const content = (
            <>
                <DateChip date={item.date} late={item.late} />
                <span className="Deworming-itemText">
                    <b>
                        <SheetTitle
                            text={`${item.groupName} ${item.extra ? "Extra " : ""}${SESSIONS[item.session]} Deworming`}
                        />
                    </b>
                    <span className="Deworming-whenText">{when}</span>
                    {/* (the main deworming before it: to check the dates add up) */}
                    {item.date && (
                        <span className="Deworming-previous">
                            Previous:{" "}
                            {item.previous
                                ? `${SESSIONS[item.previous.session]} Deworming ${longDay(item.previous.date)}`
                                : "none found"}
                        </span>
                    )}
                </span>
                {(tag || item.doneAs) && (
                    <span className="Deworming-tags">
                        {/* (a 3m done as a 6m: to check it's meant) */}
                        {item.doneAs && <span className="Deworming-tag is-todo">Done as {SESSIONS[item.doneAs]}</span>}
                        {tag && <span className={`Deworming-tag is-${tag.tone}`}>{tag.text}</span>}
                    </span>
                )}
            </>
        );
        return (
            <li key={`${item.kind}-${item.groupKey}-${item.session}-${item.date}`} className="Deworming-row">
                {item.sheet ? (
                    <button
                        type="button"
                        className="Deworming-item Deworming-when"
                        onClick={() => onOpen(item.sheet.id)}
                    >
                        {content}
                    </button>
                ) : (
                    <div className="Deworming-item Deworming-when is-static">{content}</div>
                )}
            </li>
        );
    };

    return (
        <div className="Deworming-schedule">
            <p className="RecordsPage-hint Deworming-hint">
                Upcoming dewormings from the Outlook calendar, and estimated dates for the others.
            </p>
            {buckets.length === 0 ? (
                <p className="RecordsPage-intro">No dewormings coming up.</p>
            ) : (
                buckets.map((b) => (
                    <section key={b.label} className="Deworming-bucket" aria-label={b.label}>
                        <h3 className={`Deworming-bucketHead${b.label === "Overdue" ? " is-late" : ""}`}>{b.label}</h3>
                        <ul className="Deworming-list">{b.items.map(row)}</ul>
                    </section>
                ))
            )}
            <div className="Deworming-sync">
                <span className="Deworming-meta">
                    {sync?.syncedAt ? `From Outlook, checked ${timeAgo(Date.parse(sync.syncedAt))}` : "Not checked yet"}
                </span>
                {canPrepare && (
                    <button
                        type="button"
                        className="Deworming-icon"
                        aria-label="Refresh Now"
                        title="Refresh Now"
                        disabled={refreshing}
                        onClick={refresh}
                    >
                        <IconRefresh
                            size={18}
                            className={refreshing ? "Deworming-spinner" : undefined}
                            aria-hidden="true"
                        />
                    </button>
                )}
            </div>
            {canPrepare && sync && !sync.ok && sync.message && (
                <p className="Deworming-done is-warn" role="status">
                    {sync.message}
                </p>
            )}
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {canPrepare && unread.length > 0 && (
                <section className="Deworming-unread" aria-label="Other Scheduled Dewormings">
                    <div className="Deworming-unreadHead">
                        <h3 className="RecordsPage-subhead">
                            Other Scheduled Dewormings <span className="Deworming-adminOnly">(Admin only)</span>
                        </h3>
                        <button
                            type="button"
                            className="Modal-edit is-soft"
                            aria-expanded={tips}
                            onClick={() => setTips(!tips)}
                        >
                            {tips ? "Hide Naming Tips" : "Show Naming Tips"}
                        </button>
                    </div>
                    {tips && (
                        <p className="RecordsPage-hint Deworming-hint Deworming-tips">
                            Write each title in Outlook as the group, 3m or 6m (and F/U), then "deworming", e.g. "H&B
                            3m deworming", "Top & Middle IC 6m F/U deworming" (or "Top/Middle IC"), "Global 3m + James
                            3m F/U deworming" (a "+" or a comma between groups with different sessions). Use full troop
                            names, or D&D, H&B, Jala or IC. An extra round: "Goliath extra 6m deworming".
                        </p>
                    )}
                    <ul className="Deworming-recordList">
                        {unread.map((u) => (
                            <li key={`${u.title}-${u.startsOn}`}>
                                <b>{dayLabel(u.startsOn)}</b> {u.title}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </div>
    );
}

// onTitle(title, back): the page's title while a sheet (or Prepare Sheet) is
// open, and the way back above it ("← Deworming Sheets"); null: back to
// "Deworming". As Monitoring's.
export default function DewormingRecordsPage({ monkeys = [], enclosures = [], staff = null, onTitle = () => {} }) {
    const canPrepare = Boolean(staff?.isAdmin && !staff.readOnly);
    // (editors and admins: recording results)
    // (results carry on with no signal)
    const canRecord = Boolean(fieldStaff(staff)?.canAdd && !fieldStaff(staff).readOnly);
    const groups = useMemo(() => dewormingGroups(enclosures, monkeys), [enclosures, monkeys]);
    // null: loading; { problem }; or the sheets
    const [sheets, setSheets] = useState(null);
    // null (the list), { prepare: true } (custom: true, a custom list),
    // { edit: id } or { view: id }
    const [open, setOpen] = useState(null);
    // Lists (the deworming lists) or Schedule (when each group's due)
    const [tab, setTab] = useState("lists");

    const reload = useCallback(
        () =>
            loadDewormingSheets()
                .then(setSheets)
                .catch((error) => setSheets({ problem: error.message })),
        []
    );
    useEffect(() => {
        reload();
    }, [reload]);

    const openId = open?.view ?? open?.edit;
    const openSheet = openId && Array.isArray(sheets) ? sheets.find((s) => s.id === openId) : null;
    const title = open?.prepare
        ? open.custom
            ? "New Custom List"
            : "New Deworming List"
        : open?.edit
          ? "Edit List"
          : openSheet
            ? sheetTitle(openSheet)
            : null;
    const backToSheets = useCallback(() => setOpen(null), []);
    // (kept the same between renders: it goes up to the page's title)
    const titleText = useMemo(() => title && <SheetTitle text={title} />, [title]);
    useEffect(() => {
        onTitle(titleText, titleText ? { label: "Deworming Lists", onClick: backToSheets } : null);
    }, [titleText, onTitle, backToSheets]);
    useEffect(() => () => onTitle(null), [onTitle]);

    if (sheets === null) return <p className="RecordsPage-intro">Loading…</p>;
    if (sheets.problem) {
        return (
            <p className="Integration-problem" role="alert">
                {sheets.problem}
            </p>
        );
    }

    const opened = open?.view ?? open?.edit;
    const sheet = opened ? sheets.find((s) => s.id === opened) : null;

    if (open?.prepare || (open?.edit && sheet)) {
        return (
            <PrepareSheet
                groups={groups}
                sheets={sheets.filter((s) => s.id !== open.edit)}
                monkeys={monkeys}
                editing={open.edit ? sheet : null}
                custom={Boolean(open.custom) || isCustom(sheet)}
                onCancel={() => setOpen(open.edit ? { view: open.edit } : null)}
                onSaved={async () => {
                    await reload();
                    setOpen(open.edit ? { view: open.edit } : null);
                }}
            />
        );
    }
    if (sheet) {
        return (
            <SheetView
                sheet={sheet}
                monkeys={monkeys}
                enclosures={enclosures}
                canPrepare={canPrepare}
                canRecord={canRecord}
                onChanged={reload}
                onEdit={() => setOpen({ edit: sheet.id })}
            />
        );
    }

    return (
        <div className="Deworming">
            <div className="RecordsPage-tabRow">
                <div className="RecordsPage-tabs" role="tablist" aria-label="Deworming">
                    {[
                        ["lists", "Lists"],
                        ["schedule", "Schedule"],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={tab === id ? "is-on" : ""}
                            onClick={() => setTab(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            {tab === "schedule" ? (
                <Schedule
                    groups={groups}
                    sheets={sheets}
                    canPrepare={canPrepare}
                    onOpen={(id) => setOpen({ view: id })}
                />
            ) : (
                <>
                    <h3 className="RecordsPage-subhead Deworming-listsHead">Deworming Lists</h3>
                    {/* New Deworming List and New Custom List, side by side (admins) */}
                    {canPrepare && (
                        <div className="Deworming-newRow">
                            <button
                                type="button"
                                className="Modal-edit is-action Deworming-new"
                                onClick={() => setOpen({ prepare: true })}
                            >
                                <IconPlus size={16} aria-hidden="true" />
                                New Deworming List
                            </button>
                            <button
                                type="button"
                                className="Modal-edit is-action-outline Deworming-new"
                                onClick={() => setOpen({ prepare: true, custom: true })}
                            >
                                <IconPlus size={16} aria-hidden="true" />
                                New Custom List
                            </button>
                        </div>
                    )}
                    <p className="RecordsPage-hint Deworming-hint">
                        Upcoming, current, and completed deworming lists. Click to view summary and enter results.
                    </p>
                    {sheets.length === 0 ? (
                        <p className="RecordsPage-intro">No deworming lists yet.</p>
                    ) : (
                        <ul className="Deworming-list">
                            {sheets.map((s) => (
                                <SheetRow
                                    enclosures={enclosures}
                                    key={s.id}
                                    sheet={s}
                                    monkeys={monkeys}
                                    canPrepare={canPrepare}
                                    onOpen={() => setOpen({ view: s.id })}
                                    onDeleted={reload}
                                />
                            ))}
                        </ul>
                    )}
                </>
            )}
        </div>
    );
}
