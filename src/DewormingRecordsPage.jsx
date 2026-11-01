import { useCallback, useEffect, useMemo, useState } from "react";
import { IconArrowLeft, IconPencil, IconPlus, IconPrinter, IconTrash } from "@tabler/icons-react";
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
import "./IntegrationRecordsPage.css"; // (the pickers' look)
import "./DewormingRecordsPage.css";

// Records → Sections → Deworming: the deworming sheets.
//   the list     every sheet, newest first; staff open one to see who's on
//                it, and print it (Print Sheet: the paper sheet, as before)
//   Prepare Sheet (admins)   a deworming group and session (the next in
//                its cycle to start with), the start date, the line under
//                the printed title, and each monkey's dewormer and dose
//                (dewormingRules.js: who's ticked to start with, and with
//                what). Edit and Delete too (admins).
// (Completing a sheet and approving it come next.)
//   staff: { isAdmin, readOnly, … } (as the pop-up's)

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
        <section className="Deworming-prepare" aria-label={editing ? "Edit Sheet" : "Prepare Sheet"}>
            <h2 className="RecordsPage-subhead">{editing ? "Edit Sheet" : "Prepare Sheet"}</h2>
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
                        {busy ? "Saving…" : "Save Sheet"}
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
function SheetView({ sheet, monkeys, canPrepare, onBack, onEdit, onDeleted }) {
    const [deleting, setDeleting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const lines = printOrder(namedLines(sheet, monkeys));
    const stopDeleting = useCallback(() => setDeleting(false), []);

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

    return (
        <section className="Deworming-sheet" aria-label={sheetTitle(sheet)}>
            <button type="button" className="Deworming-back" onClick={onBack}>
                <IconArrowLeft size={16} aria-hidden="true" />
                All Sheets
            </button>
            <h2 className="RecordsPage-subhead Deworming-sheetTitle">{sheetTitle(sheet)}</h2>
            <p className="Deworming-meta">
                Starts {dayLabel(sheet.startDate)} · {lines.length === 1 ? "1 monkey" : `${lines.length} monkeys`} ·
                Ready
                {sheet.preparedByName ? ` · prepared by ${sheet.preparedByName}` : ""}
            </p>
            {sheet.instructions && <p className="Deworming-note">{sheet.instructions}</p>}
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
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="Deworming-actions">
                <button type="button" className="Modal-edit" disabled={busy} onClick={print}>
                    <IconPrinter size={16} aria-hidden="true" />
                    Print Sheet
                </button>
                {canPrepare && (
                    <>
                        <button type="button" className="Modal-edit is-soft" disabled={busy} onClick={onEdit}>
                            <IconPencil size={16} aria-hidden="true" />
                            Edit
                        </button>
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
                                    question="Delete this sheet?"
                                    danger
                                    busy={busy}
                                    onConfirm={remove}
                                    onCancel={stopDeleting}
                                />
                            )}
                        </span>
                    </>
                )}
            </div>
        </section>
    );
}

export default function DewormingRecordsPage({ monkeys = [], enclosures = [], staff = null }) {
    const canPrepare = Boolean(staff?.isAdmin && !staff.readOnly);
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
                onBack={() => setOpen(null)}
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
                    Prepare Sheet
                </button>
            )}
            {sheets.length === 0 ? (
                <p className="RecordsPage-intro">No deworming sheets yet.</p>
            ) : (
                <ul className="Deworming-list">
                    {sheets.map((s) => (
                        <li key={s.id}>
                            <button type="button" className="Deworming-item" onClick={() => setOpen({ view: s.id })}>
                                <b>{sheetTitle(s)}</b>
                                <span>
                                    Starts {dayLabel(s.startDate)} ·{" "}
                                    {s.lines.length === 1 ? "1 monkey" : `${s.lines.length} monkeys`} · Ready
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
