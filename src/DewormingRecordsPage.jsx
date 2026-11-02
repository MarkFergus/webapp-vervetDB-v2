import { useCallback, useEffect, useMemo, useState } from "react";
import { IconClipboardCheck, IconPencil, IconPlus, IconPrinter, IconTrash } from "@tabler/icons-react";
import { deleteDewormingSheet, loadDewormingSheets, saveDewormingSheet } from "./monkeyData";
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
    printOrder,
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
import { ResultsForm, ResultsTable, Review, SheetPhotos } from "./DewormingResults";
import "./IntegrationRecordsPage.css"; // (the pickers' look)
import "./DewormingRecordsPage.css";

// Records → Sections → Deworming: the deworming sheets.
//   the list     every sheet, newest first; staff open one to see who's on
//                it, and print it (Print Sheet: the paper sheet, as before)
//   Prepare Sheet (admins)   a deworming group and session (the next in
//                its cycle to start with), the start date, the line under
//                the printed title, and each monkey's dewormer and dose
//                (dewormingRules.js: who's ticked to start with, and with
//                what). Edit (until results are entered) and Delete too.
//   a sheet      Record Results (editors and admins: DewormingResults.jsx),
//                day by day, with the paper sheet's photo, then Submit for
//                Approval; admins Approve it (each monkey's record goes into
//                its Medical records) or Send it Back
//   staff: { isAdmin, canAdd, readOnly, … } (as the pop-up's)

const OTHER = "other";

// The sheet's monkeys by name, with their names (a monkey no longer in the
// list: "Unknown")
function namedLines(sheet, monkeys) {
    return sheet.lines.map((l) => ({ ...l, name: monkeys.find((m) => m.id === l.monkeyId)?.name ?? "Unknown" }));
}

// One monkey's choice in the form → its dewormer's name ("" if not chosen)
const medicationOf = (line) => (line.choice === OTHER ? line.other.trim() : line.choice);

// A line to edit: { on, choice (a dewormer's name, OTHER or ""), other,
// amount, unit, days }
function formLine(line, on) {
    const known = DEWORMERS.some((d) => d.name === line.medication);
    const { amount, unit } = splitDose(line.dose);
    return {
        on,
        choice: !line.medication ? "" : known ? line.medication : OTHER,
        other: known ? "" : (line.medication ?? ""),
        amount,
        unit,
        days: line.days ?? 3,
    };
}

function PrepareSheet({ groups, sheets, monkeys, editing, onSaved, onCancel }) {
    const [groupKey, setGroupKey] = useState(editing?.groupKey ?? groups[0]?.key ?? "");
    const group = groups.find((g) => g.key === groupKey) ?? null;
    const [session, setSession] = useState(editing?.session ?? nextSession(sheets, groupKey));
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
        if (!editing) return fresh(group, session);
        const own = Object.fromEntries(editing.lines.map((l) => [l.monkeyId, formLine(l, true)]));
        const rest = Object.fromEntries(
            (group?.monkeys ?? [])
                .filter(({ monkey }) => !(monkey.id in own))
                .map(({ monkey }) => [monkey.id, formLine({}, false)])
        );
        return { ...rest, ...own };
    });
    const [all, setAll] = useState({ choice: "", amount: "", unit: UNITS[0] });
    const [problem, setProblem] = useState(null);
    const [busy, setBusy] = useState(false);

    const rows = Object.keys(lines)
        .map(Number)
        .map((id) => ({ id, monkey: monkeys.find((m) => m.id === id) ?? null }))
        .sort((a, b) => (a.monkey?.name ?? "").localeCompare(b.monkey?.name ?? ""));
    const ticked = rows.filter((r) => lines[r.id].on).length;

    const restart = (g, s) => {
        setLines(fresh(g, s));
        setProblem(null);
    };
    const change = (id, values) => {
        setLines((ls) => ({ ...ls, [id]: { ...ls[id], ...values } }));
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
        if (!group) return setProblem("Please choose the group.");
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
                groupKey: group.key,
                groupName: group.name,
                session,
                startDate,
                instructions,
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
        <section className="Deworming-prepare" aria-label={editing ? "Edit List" : "New Deworming List"}>
            {/* (the page's title, "New Deworming List" / "Edit List", and the way back
                above it: onTitle) */}
            <div className="Deworming-fields">
                <label className="IntegrationPage-choose">
                    <span>Group</span>
                    <select
                        value={groupKey}
                        onChange={(e) => {
                            const g = groups.find((x) => x.key === e.target.value);
                            const s = editing ? session : nextSession(sheets, e.target.value);
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
                            setSession(e.target.value);
                            restart(group, e.target.value);
                        }}
                    >
                        {Object.entries(SESSIONS).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className="IntegrationPage-choose">
                    <span>Start Date</span>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
            </div>
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

            <p className="Deworming-count">
                {ticked} of {rows.length} ticked
            </p>
            <ul className="Deworming-lines">
                {rows.map(({ id, monkey }) => {
                    const line = lines[id];
                    const name = monkey?.name ?? "Unknown";
                    return (
                        <li key={id} className={`Deworming-line${line.on ? " is-on" : ""}`}>
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
                            className="Modal-edit is-cancel"
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
                        {busy ? "Saving…" : "Save List"}
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

// One sheet: who's on it and with what, Print Sheet; Record Results (staff,
// until it's submitted); the results and photos; Review (admins, once
// submitted); and (admins, before any results) Edit and Delete
function SheetView({ sheet, monkeys, canPrepare, canRecord, onEdit, onDeleted, onChanged }) {
    const [deleting, setDeleting] = useState(false);
    const [recording, setRecording] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const lines = printOrder(namedLines(sheet, monkeys));
    const stopDeleting = useCallback(() => setDeleting(false), []);
    // (results entered, or a monkey added: Edit would lose them)
    const started = lines.some((l) => Object.keys(l.doses ?? {}).length || (l.kind && l.kind !== "list"));
    const stage = stageText(sheet);
    // (staff until it's submitted; admins until it's approved)
    const canEnter = canRecord && (sheet.status === "ready" || (sheet.status === "submitted" && canPrepare));

    async function print() {
        setBusy(true);
        setProblem(null);
        try {
            const [{ pdf }, { default: DewormingSheetPDF }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./DewormingSheetPDF"),
            ]);
            const blob = await pdf(<DewormingSheetPDF sheet={sheet} lines={lines} />).toBlob();
            const name = `${sheet.groupName}_${SESSIONS[sheet.session]}`.replace(/[^a-z0-9]+/gi, "_");
            downloadBlob(blob, `deworming_${name}_${sheet.startDate}.pdf`);
        } catch (error) {
            console.error(error);
            setProblem("Couldn't create the PDF. Check your internet connection, then try again.");
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

    if (recording) {
        return (
            <section className="Deworming-sheet" aria-label={sheetTitle(sheet)}>
                <ResultsForm
                    sheet={sheet}
                    lines={lines}
                    monkeys={monkeys}
                    onCancel={() => setRecording(false)}
                    onSaved={async (submitted) => {
                        await onChanged();
                        if (submitted) setRecording(false);
                    }}
                />
            </section>
        );
    }

    return (
        <section className="Deworming-sheet" aria-label={sheetTitle(sheet)}>
            {/* (the page's title is the sheet's: "H&B Troop 3-Month Deworming") */}
            <p className="Deworming-meta">
                {sheet.startedOn ? `Started ${dayLabel(sheet.startedOn)}` : `Starts ${dayLabel(sheet.startDate)}`} ·{" "}
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
            {sheet.photos?.length > 0 && (
                <>
                    <h3 className="RecordsPage-subhead">Photo of the Paper Copy</h3>
                    <SheetPhotos paths={sheet.photos} sheetId={sheet.id} />
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
            <div className="Deworming-actions">
                {canEnter && (
                    <button
                        type="button"
                        className="Modal-edit is-confirm"
                        disabled={busy}
                        onClick={() => setRecording(true)}
                    >
                        <IconClipboardCheck size={16} aria-hidden="true" />
                        {sheet.status === "submitted"
                            ? "Edit Results"
                            : started
                              ? "Continue Results"
                              : "Record Results"}
                    </button>
                )}
                <button type="button" className="Modal-edit" disabled={busy} onClick={print}>
                    <IconPrinter size={16} aria-hidden="true" />
                    Print List
                </button>
                {canPrepare && sheet.status === "ready" && !started && (
                    <button type="button" className="Modal-edit is-soft" disabled={busy} onClick={onEdit}>
                        <IconPencil size={16} aria-hidden="true" />
                        Edit
                    </button>
                )}
                {canPrepare && (
                    <span className="Deworming-confirmHost">
                        <button
                            type="button"
                            className="Modal-edit is-soft"
                            disabled={busy}
                            onClick={() => setDeleting(true)}
                        >
                            <IconTrash size={16} aria-hidden="true" />
                            Delete
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
            </div>
            {canPrepare && sheet.status === "submitted" && <Review sheet={sheet} lines={lines} onDone={onChanged} />}
        </section>
    );
}

// onTitle(title, back): the page's title while a sheet (or Prepare Sheet) is
// open, and the way back above it ("← Deworming Sheets"); null: back to
// "Deworming". As Monitoring's.
export default function DewormingRecordsPage({ monkeys = [], enclosures = [], staff = null, onTitle = () => {} }) {
    const canPrepare = Boolean(staff?.isAdmin && !staff.readOnly);
    // (editors and admins: recording results)
    const canRecord = Boolean(staff?.canAdd && !staff.readOnly);
    const groups = useMemo(() => dewormingGroups(enclosures, monkeys), [enclosures, monkeys]);
    // null: loading; { problem }; or the sheets
    const [sheets, setSheets] = useState(null);
    // null (the list), { prepare: true }, { edit: id } or { view: id }
    const [open, setOpen] = useState(null);

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
        ? "New Deworming List"
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
                canPrepare={canPrepare}
                canRecord={canRecord}
                onChanged={reload}
                onEdit={() => setOpen({ edit: sheet.id })}
                onDeleted={async () => {
                    await reload();
                    setOpen(null);
                }}
            />
        );
    }

    return (
        <div className="Deworming">
            {canPrepare && (
                <button
                    type="button"
                    className="Modal-edit is-confirm Deworming-new"
                    onClick={() => setOpen({ prepare: true })}
                >
                    <IconPlus size={16} aria-hidden="true" />
                    New Deworming List
                </button>
            )}
            <p className="RecordsPage-hint Deworming-hint">
                Upcoming, current, and completed deworming lists. Click to view summary and enter results.
            </p>
            {sheets.length === 0 ? (
                <p className="RecordsPage-intro">No deworming lists yet.</p>
            ) : (
                <ul className="Deworming-list">
                    {sheets.map((s) => {
                        const status = listStatus(s);
                        return (
                            <li key={s.id}>
                                <button
                                    type="button"
                                    className="Deworming-item"
                                    onClick={() => setOpen({ view: s.id })}
                                >
                                    <span className="Deworming-itemText">
                                        <b>
                                            <SheetTitle text={sheetTitle(s)} />
                                        </b>
                                        <span>
                                            Starts {dayLabel(s.startDate)} ·{" "}
                                            {s.lines.length === 1 ? "1 monkey" : `${s.lines.length} monkeys`} ·{" "}
                                            {status.text}
                                        </span>
                                    </span>
                                    {status.tag && (
                                        <span className={`Deworming-tag is-${status.tone}`}>{status.tag}</span>
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
