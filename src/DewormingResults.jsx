import { useCallback, useEffect, useRef, useState } from "react";
import {
    IconCamera,
    IconCheck,
    IconCopy,
    IconEraser,
    IconPencil,
    IconPlus,
    IconTrash,
    IconX,
} from "@tabler/icons-react";
import {
    addDewormingMonkey,
    approveDewormingSheet,
    emailDewormingSheet,
    removeDewormingMonkey,
    returnDewormingSheet,
    saveDewormingResults,
    sheetPhotoData,
    sheetPhotoUrls,
    uploadSheetPhoto,
} from "./monkeyData";
import {
    SESSIONS,
    sheetTitle,
    AMOUNTS,
    DAYS,
    DEWORMERS,
    FOODS,
    PARTIALS,
    RESULTS,
    UNITS,
    dayAdvice,
    daySummary,
    daysFor,
    doseNumber,
    doseText,
    givenOn,
    lateStart,
    nameList,
    needsDay4,
    onDay,
    recordText,
    splitDose,
    usualDose,
} from "./dewormingRules";
import { dayLabel } from "./babyRecords";
import ConfirmBubble from "./ConfirmBubble";
import useDialog from "./useDialog";

// Completing a deworming sheet (DewormingRecordsPage.jsx's sheet page):
//   ResultsForm   staff record each day in turn (Day 2 opens once Day 1 is
//                 complete…): Full / Partial / Miss / Skipped for each
//                 monkey, the food, a note, and a change of dewormer; the
//                 real start date, who did it, a note for the day, Save Day
//                 N (complete, with a tick, once everyone has a result),
//                 Copy Day N Summary; then, all 3 days complete, the paper
//                 sheet's photo and Submit (dewormingRules.js: the advice, the
//                 summary, the records' words)
//                 Add Monkey: an accidental dose, or a monkey added to the
//                 course; after Day 3, Day 4 for those whose course
//                 started a day late
//   ResultsTable  what each monkey got, day by day
//   SheetPhotos   the paper sheet's photos (private: only staff see them)
//   Review        (admins, a submitted sheet) each monkey's record to
//                 check, then Approve (into its Medical records) or Send
//                 Back with a note

const OTHER = "other";

// The days shown: Day 1–3, and Day 4 when anyone needs it
const shownDays = (lines) => DAYS.filter((d) => d <= 3 || lines.some((l) => onDay(l, d)));

// A monkey added while completing the sheet: its tag ("Added Day 2",
// "Accidental"), or null
const addedTag = (line) =>
    line.kind === "accidental" ? "Accidental" : line.kind === "added" ? `Added Day ${line.fromDay ?? 1}` : null;

function AddedTag({ line }) {
    const tag = addedTag(line);
    // (its space before it: none without a tag)
    return tag ? (
        <>
            {" "}
            <span className={`Deworming-addedTag is-${line.kind}`}>{tag}</span>
        </>
    ) : null;
}

// A day's cell: "✓ Banana", "3/4 JS", "✗", "Skipped" (and "→ Milbeworm")
function cellText(dose) {
    if (!dose) return "";
    const what = !dose.result
        ? ""
        : dose.result === "full"
          ? `✓${dose.food ? ` ${dose.food}` : ""}`
          : dose.result === "none"
            ? "✗"
            : dose.result === "skipped"
              ? "Skipped"
              : `${dose.result}${dose.food ? ` ${dose.food}` : ""}`;
    return dose.medication ? `${what} → ${dose.medication}` : what;
}

export function ResultsTable({ lines }) {
    const days = shownDays(lines);
    return (
        <div className="Deworming-tableWrap">
            <table className="Deworming-table Deworming-results">
                <thead>
                    <tr>
                        <th scope="col">Name</th>
                        {days.map((d) => (
                            <th key={d} scope="col">
                                Day {d}
                            </th>
                        ))}
                        <th scope="col">Details</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l) => (
                        <tr key={l.id ?? l.monkeyId}>
                            <th scope="row">
                                {l.name}
                                <AddedTag line={l} />
                            </th>
                            {days.map((d) => {
                                const dose = l.doses?.[d];
                                // (not on the list that day: before they were added, or no Day 4)
                                if (!onDay(l, d) && !dose) return <td key={d}>–</td>;
                                return (
                                    <td
                                        key={d}
                                        className={dose?.result ? `is-${dose.result.replace("/", "-")}` : undefined}
                                        title={dose?.note ?? undefined}
                                    >
                                        {l.days === 1 && d > 1 && !dose ? "N/A" : cellText(dose)}
                                    </td>
                                );
                            })}
                            <td>
                                {l.dose} {l.medication}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// The paper sheet's photos: each opens full size; staff can add more while
// it's being completed (onAdd / onRemove)
export function SheetPhotos({ paths, sheetId, onChange = null }) {
    const [urls, setUrls] = useState({});
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const key = paths.join("|");
    useEffect(() => {
        let cancelled = false;
        sheetPhotoUrls(paths).then((found) => !cancelled && setUrls(found));
        return () => {
            cancelled = true;
        };
        // (only when the photos change: key)
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

    async function add(event) {
        const files = [...event.target.files];
        event.target.value = "";
        if (!files.length) return;
        setBusy(true);
        setProblem(null);
        try {
            const added = [];
            for (const file of files) added.push(await uploadSheetPhoto(file, sheetId));
            onChange([...paths, ...added]);
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="Deworming-photos">
            {paths.length > 0 && (
                <ul className="Deworming-photoList">
                    {paths.map((p, i) => (
                        <li key={p}>
                            {urls[p] ? (
                                <a href={urls[p]} target="_blank" rel="noreferrer">
                                    <img src={urls[p]} alt={`Paper copy, photo ${i + 1}`} />
                                </a>
                            ) : (
                                <span className="Deworming-photoWait">Photo {i + 1}</span>
                            )}
                            {onChange && (
                                <button
                                    type="button"
                                    className="Deworming-photoRemove"
                                    aria-label={`Remove photo ${i + 1}`}
                                    onClick={() => onChange(paths.filter((x) => x !== p))}
                                >
                                    <IconX size={14} aria-hidden="true" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {onChange && (
                <div className="Deworming-photoRow">
                    <label className={`Modal-edit is-soft Deworming-photoAdd${busy ? " is-busy" : ""}`}>
                        <IconCamera size={16} aria-hidden="true" />
                        {busy ? "Uploading…" : "Add Photo"}
                        <input type="file" accept="image/*" multiple hidden disabled={busy} onChange={add} />
                    </label>
                    {/* (a photo's there: done) */}
                    {paths.length > 0 && !busy && (
                        <IconCheck
                            className="Deworming-photoDone"
                            size={22}
                            stroke={3}
                            aria-label="Photo added"
                            role="img"
                        />
                    )}
                </div>
            )}
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
        </div>
    );
}

// Change Dewormer's pop-up: the dewormer (and dose) a monkey gets from this
// day on, or Undo Change
function ChangeDewormer({ line, day, given, current, onSave, onClose }) {
    const closeRef = useRef(null);
    useDialog(true, closeRef, { onClose });
    const start = current?.medication ?? "";
    const known = !start || DEWORMERS.some((d) => d.name === start);
    const [choice, setChoice] = useState(known ? start : OTHER);
    const [other, setOther] = useState(known ? "" : start);
    const [dose, setDose] = useState(() => splitDose(current?.dose ?? given.dose));
    const medication = choice === OTHER ? other.trim() : choice;
    return (
        <>
            <div className="RecordsPage-scrim" onClick={onClose} />
            <div
                className="RecordsPage-dialog Deworming-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="Deworming-changeTitle"
            >
                <h2 id="Deworming-changeTitle">Change Dewormer: {line.name}</h2>
                <p>
                    From Day {day} on, instead of {line.dose} {line.medication}.
                </p>
                <div className="Deworming-dialogFields">
                    <select
                        aria-label="New dewormer"
                        value={choice}
                        onChange={(e) => {
                            setChoice(e.target.value);
                            const usual = usualDose(e.target.value);
                            if (usual) setDose(splitDose(usual));
                        }}
                    >
                        <option value="">Dewormer…</option>
                        {DEWORMERS.map((d) => (
                            <option key={d.name} value={d.name}>
                                {d.name}
                            </option>
                        ))}
                        <option value={OTHER}>Other…</option>
                    </select>
                    {choice === OTHER && (
                        <input
                            type="text"
                            aria-label="Other dewormer"
                            placeholder="e.g. Milbemax"
                            maxLength={40}
                            value={other}
                            onChange={(e) => setOther(e.target.value)}
                        />
                    )}
                    <select
                        aria-label="New dose"
                        value={dose.amount}
                        onChange={(e) => setDose({ ...dose, amount: e.target.value })}
                    >
                        {AMOUNTS.map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="New unit"
                        value={dose.unit}
                        onChange={(e) => setDose({ ...dose, unit: e.target.value })}
                    >
                        {UNITS.map((u) => (
                            <option key={u} value={u}>
                                {u}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="RecordsPage-dialogButtons">
                    <button
                        type="button"
                        className="Modal-edit is-confirm"
                        disabled={!medication || !dose.amount}
                        onClick={() => onSave({ medication, dose: doseText(dose.amount, dose.unit) })}
                    >
                        Save
                    </button>
                    {current?.medication && (
                        <button type="button" className="Modal-edit is-soft" onClick={() => onSave(null)}>
                            Undo Change
                        </button>
                    )}
                    <button type="button" className="Modal-edit is-cancel" onClick={onClose} ref={closeRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

// One monkey's entry for a day: the result, then (once there's one) the
// food and a note; at the end, Change Dewormer (a pop-up) and Reset (clears
// the day's entry)
function DoseEntry({ line, day, onChange, onRemove }) {
    const dose = line.doses?.[day] ?? null;
    const advice = dayAdvice(line, day);
    const [anyway, setAnyway] = useState(false);
    const [changing, setChanging] = useState(false);
    const [removing, setRemoving] = useState(false);
    const stopRemoving = useCallback(() => setRemoving(false), []);
    const given = givenOn(line, day);
    const accidental = line.kind === "accidental";
    // ("2nd dose": which of a 3-day course's doses today's is)
    const number = advice?.done ? null : doseNumber(line, day);
    // (nothing left: no entry for the day)
    const update = (values) => {
        const next = { ...(dose ?? {}), ...values };
        onChange(!next.result && !next.medication ? null : next);
    };
    const knownFood = !dose?.food || FOODS.includes(dose.food);
    const [otherFood, setOtherFood] = useState(!knownFood);
    const result = dose?.result ?? null;
    const pick = (id) => update({ result: result === id ? null : id });

    const head = (
        <div className="Deworming-entryHead">
            <b>
                {line.name}
                <AddedTag line={line} />
            </b>
            <span className={`Deworming-about${dose?.medication ? " is-changed" : ""}`}>
                {given.dose} {given.medication}
                {dose?.medication ? " (changed)" : ""}
                {number ? ` · ${number} dose` : ""}
            </span>
        </div>
    );

    if (advice?.done && !dose && !anyway) {
        return (
            <li className="Deworming-entry is-done">
                {head}
                <p className="Deworming-advice">
                    {advice.text}
                    <button type="button" className="Deworming-link" onClick={() => setAnyway(true)}>
                        Enter Anyway
                    </button>
                </p>
            </li>
        );
    }

    return (
        <li className="Deworming-entry">
            {head}
            {advice && <p className={`Deworming-advice${advice.warn ? " is-warn" : ""}`}>{advice.text}</p>}
            <div className="Deworming-results-buttons" role="group" aria-label={`${line.name}: Day ${day}`}>
                {/* Full, a partial dose (one drop-down), Miss, Skipped; pressed again: cleared */}
                <button type="button" className="is-full" aria-pressed={result === "full"} onClick={() => pick("full")}>
                    <IconCheck size={15} stroke={3} aria-hidden="true" />
                    Full
                </button>
                <select
                    className={`Deworming-partial${PARTIALS.includes(result) ? " is-on" : ""}`}
                    aria-label={`Partial dose for ${line.name}`}
                    value={PARTIALS.includes(result) ? result : ""}
                    onChange={(e) => update({ result: e.target.value || null })}
                >
                    <option value="">Partial</option>
                    {PARTIALS.map((p) => (
                        <option key={p} value={p}>
                            {p}
                        </option>
                    ))}
                </select>
                {/* (an accidental dose: they got it, so Full or a partial only) */}
                {RESULTS.filter(([id]) => !accidental && (id === "none" || id === "skipped")).map(([id, label]) => (
                    <button
                        key={id}
                        type="button"
                        className={`is-${id}`}
                        aria-pressed={result === id}
                        onClick={() => pick(id)}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div className="Deworming-entryMore">
                {result && result !== "none" && result !== "skipped" && (
                    <>
                        <select
                            aria-label={`Food for ${line.name}`}
                            value={otherFood ? OTHER : (dose.food ?? "")}
                            onChange={(e) => {
                                const other = e.target.value === OTHER;
                                setOtherFood(other);
                                update({ food: other ? "" : e.target.value || null });
                            }}
                        >
                            <option value="">Food…</option>
                            {FOODS.map((f) => (
                                <option key={f} value={f}>
                                    {f}
                                </option>
                            ))}
                            <option value={OTHER}>Other…</option>
                        </select>
                        {otherFood && (
                            <input
                                type="text"
                                aria-label={`Other food for ${line.name}`}
                                placeholder="e.g. Grape"
                                maxLength={40}
                                value={dose.food ?? ""}
                                onChange={(e) => update({ food: e.target.value })}
                            />
                        )}
                    </>
                )}
                {result && (
                    <input
                        type="text"
                        className="Deworming-noteInput"
                        aria-label={`Note for ${line.name}`}
                        placeholder={result === "skipped" ? "Why? e.g. missed Day 2 dose" : "Note (optional)"}
                        maxLength={200}
                        value={dose.note ?? ""}
                        onChange={(e) => update({ note: e.target.value })}
                    />
                )}
            </div>
            <div className="Deworming-rowIcons">
                {!accidental && (
                    <button
                        type="button"
                        className={`Deworming-icon${dose?.medication ? " is-changed" : ""}`}
                        aria-label={`Change dewormer for ${line.name}`}
                        title="Change Dewormer"
                        onClick={() => setChanging(true)}
                    >
                        <IconPencil size={17} aria-hidden="true" />
                    </button>
                )}
                <button
                    type="button"
                    className="Deworming-icon"
                    aria-label={`Reset ${line.name}`}
                    title="Reset (clear this day)"
                    // (after Enter Anyway: back to just the advice)
                    disabled={!dose && !anyway}
                    onClick={() => {
                        setOtherFood(false);
                        setAnyway(false);
                        onChange(null);
                    }}
                >
                    <IconEraser size={17} aria-hidden="true" />
                </button>
                {/* (a monkey staff added: Remove, after asking) */}
                {line.kind !== "list" && line.kind && (
                    <span className="Deworming-confirmHost">
                        <button
                            type="button"
                            className="Deworming-icon is-danger"
                            aria-label={`Remove ${line.name}`}
                            title="Remove from the list"
                            onClick={() => setRemoving(true)}
                        >
                            <IconTrash size={17} aria-hidden="true" />
                        </button>
                        {removing && (
                            <ConfirmBubble
                                question={`Remove ${line.name} from the list?`}
                                danger
                                onConfirm={() => {
                                    setRemoving(false);
                                    onRemove();
                                }}
                                onCancel={stopRemoving}
                            />
                        )}
                    </span>
                )}
            </div>
            {changing && (
                <ChangeDewormer
                    line={line}
                    day={day}
                    given={given}
                    current={dose?.medication ? { medication: dose.medication, dose: dose.dose } : null}
                    onClose={() => setChanging(false)}
                    onSave={(change) => {
                        setChanging(false);
                        update(change ?? { medication: null, dose: null });
                    }}
                />
            )}
        </li>
    );
}

// Add Monkey's pop-up: a monkey not on the list (search by name), then
//   Accidental Dose   what they got, on this day only
//   Add to Course     their dewormer, dose and days, from this day on (a
//                     3-day course starts by Day 2: from Day 3, one dose)
// with the same check as Prepare for a dose that isn't the usual one
const MATCHES = 8;
function AddMonkey({ sheet, day, monkeys, onClose, onAdded }) {
    const closeRef = useRef(null);
    useDialog(true, closeRef, { onClose });
    const [search, setSearch] = useState("");
    const [monkey, setMonkey] = useState(null);
    const [kind, setKind] = useState("accidental");
    const [choice, setChoice] = useState("");
    const [other, setOther] = useState("");
    const [dose, setDose] = useState(() => splitDose(""));
    const [otherDays, setOtherDays] = useState(3);
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const medication = choice === OTHER ? other.trim() : choice;
    const doseWords = dose.amount ? doseText(dose.amount, dose.unit) : "";
    const usual = usualDose(medication);
    const wanted = daysFor(medication) ?? otherDays;
    // (from Day 3: one dose; Panacur needs its 3 days in a row)
    const tooLate = kind === "added" && day === 3 && medication === "Panacur";
    const days = kind === "accidental" || day === 3 ? 1 : wanted;
    const term = search.trim().toLowerCase();
    const matches = term
        ? monkeys.filter((m) => m.name.toLowerCase().includes(term)).sort((a, b) => a.name.localeCompare(b.name))
        : [];

    async function add(anyway = false) {
        if (!anyway && usual && doseWords !== usual) return setChecking(true);
        setChecking(false);
        setBusy(true);
        setProblem(null);
        try {
            const line = { monkeyId: monkey.id, kind, fromDay: day, medication, dose: doseWords, days };
            const id = await addDewormingMonkey(sheet.id, line);
            onAdded({ ...line, id, name: monkey.name, doses: {}, day4: null, recordText: null });
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <>
            <div className="RecordsPage-scrim" onClick={onClose} />
            <div
                className="RecordsPage-dialog Deworming-dialog Deworming-addDialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="Deworming-addTitle"
            >
                <h2 id="Deworming-addTitle">Add Monkey: Day {day}</h2>
                {monkey ? (
                    <p className="Deworming-chosen">
                        <b>{monkey.name}</b>
                        <button type="button" className="Deworming-link" onClick={() => setMonkey(null)}>
                            Change
                        </button>
                    </p>
                ) : (
                    <div className="Deworming-search">
                        <input
                            type="search"
                            aria-label="Find a monkey"
                            placeholder="Find a monkey…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                        {matches.length > 0 && (
                            <ul className="Deworming-matches">
                                {matches.slice(0, MATCHES).map((m) => (
                                    <li key={m.id}>
                                        <button type="button" onClick={() => setMonkey(m)}>
                                            {m.name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {term && !matches.length && (
                            <p className="Deworming-meta">No monkey found (or already on the list).</p>
                        )}
                    </div>
                )}

                <div className="RecordsPage-tabs Deworming-kind" role="radiogroup" aria-label="Type">
                    {[
                        ["accidental", "Accidental Dose"],
                        ["added", "Add to Course"],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="radio"
                            aria-checked={kind === id}
                            className={kind === id ? "is-on" : undefined}
                            onClick={() => setKind(id)}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <p className="Deworming-meta">
                    {kind === "accidental"
                        ? `On Day ${day} only. Enter what they got on their row.`
                        : `On the list from Day ${day}, like everyone else.`}
                </p>

                <div className="Deworming-dialogFields">
                    <select
                        aria-label="Dewormer"
                        value={choice}
                        onChange={(e) => {
                            setChoice(e.target.value);
                            setChecking(false);
                            const usualOne = usualDose(e.target.value);
                            if (usualOne) setDose(splitDose(usualOne));
                        }}
                    >
                        <option value="">Dewormer…</option>
                        {DEWORMERS.map((d) => (
                            <option key={d.name} value={d.name}>
                                {d.name}
                            </option>
                        ))}
                        <option value={OTHER}>Other…</option>
                    </select>
                    {choice === OTHER && (
                        <input
                            type="text"
                            aria-label="Other dewormer"
                            placeholder="e.g. Milbemax"
                            maxLength={40}
                            value={other}
                            onChange={(e) => setOther(e.target.value)}
                        />
                    )}
                    <select
                        aria-label="Dose"
                        value={dose.amount}
                        onChange={(e) => {
                            setDose({ ...dose, amount: e.target.value });
                            setChecking(false);
                        }}
                    >
                        <option value="">Dose…</option>
                        {AMOUNTS.map((a) => (
                            <option key={a} value={a}>
                                {a}
                            </option>
                        ))}
                    </select>
                    <select
                        aria-label="Unit"
                        value={dose.unit}
                        onChange={(e) => {
                            setDose({ ...dose, unit: e.target.value });
                            setChecking(false);
                        }}
                    >
                        {UNITS.map((u) => (
                            <option key={u} value={u}>
                                {u}
                            </option>
                        ))}
                    </select>
                    {kind === "added" && choice === OTHER && day < 3 && (
                        <select
                            aria-label="Days"
                            value={otherDays}
                            onChange={(e) => setOtherDays(Number(e.target.value))}
                        >
                            <option value={1}>1 day</option>
                            <option value={3}>3 days</option>
                        </select>
                    )}
                </div>
                {kind === "added" && medication && !tooLate && (
                    <p className="Deworming-meta">
                        {days === 1
                            ? wanted === 3
                                ? "Added on Day 3: one dose only."
                                : "One dose."
                            : `Once a day for 3 days, Day ${day} to ${day + 2}${day === 2 ? " (Day 4 opens for them)" : ""}.`}
                    </p>
                )}
                {tooLate && (
                    <p className="Integration-problem" role="alert">
                        Panacur needs 3 days in a row, so it can't start on Day 3.
                    </p>
                )}
                {checking && (
                    <p className="Deworming-advice is-warn" role="alert">
                        {doseWords} isn't the usual dose of {medication} ({usual}). Add anyway?
                    </p>
                )}
                {problem && (
                    <p className="Integration-problem" role="alert">
                        {problem}
                    </p>
                )}
                <div className="RecordsPage-dialogButtons">
                    <button
                        type="button"
                        className="Modal-edit is-confirm"
                        disabled={busy || !monkey || !medication || !dose.amount || tooLate}
                        onClick={() => add(checking)}
                    >
                        {busy ? "Adding…" : checking ? "Add Anyway" : "Add"}
                    </button>
                    <button type="button" className="Modal-edit is-cancel" onClick={onClose} ref={closeRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

// After Day 3: the monkeys whose 3-day course started a day late (missed
// Day 1, or added on Day 2). Panacur's always need Day 4; for the others,
// staff choose: Day 4, or finish here → onDecide({ lineId: true / false })
function Day4Question({ lines, onDecide, onClose }) {
    const closeRef = useRef(null);
    useDialog(true, closeRef, { onClose });
    const [choices, setChoices] = useState(() => Object.fromEntries(lines.map((l) => [l.id, true])));
    return (
        <>
            <div className="RecordsPage-scrim" onClick={onClose} />
            <div
                className="RecordsPage-dialog Deworming-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="Deworming-day4Title"
            >
                <h2 id="Deworming-day4Title">Day 4</h2>
                <ul className="Deworming-day4">
                    {lines.map((l) =>
                        needsDay4(l) === "must" ? (
                            <li key={l.id}>
                                <p>
                                    {l.name} {lateStart(l)}: Panacur needs all 3 days, so their 3rd dose is on Day 4.
                                </p>
                            </li>
                        ) : (
                            <li key={l.id}>
                                <p>
                                    {l.name} {lateStart(l)} but received doses on Day 2 & 3. Do they still need another
                                    dose to complete their course?
                                </p>
                                <div className="RecordsPage-tabs" role="radiogroup" aria-label={`Day 4 for ${l.name}`}>
                                    {[
                                        [true, "Yes, Day 4"],
                                        [false, "No, Finish Here"],
                                    ].map(([value, label]) => (
                                        <button
                                            key={label}
                                            type="button"
                                            role="radio"
                                            aria-checked={choices[l.id] === value}
                                            className={choices[l.id] === value ? "is-on" : undefined}
                                            onClick={() => setChoices({ ...choices, [l.id]: value })}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </li>
                        )
                    )}
                </ul>
                <div className="RecordsPage-dialogButtons">
                    <button type="button" className="Modal-edit is-confirm" onClick={() => onDecide(choices)}>
                        Save Day 3
                    </button>
                    <button type="button" className="Modal-edit is-cancel" onClick={onClose} ref={closeRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

// After Approve: the paper sheet's photos as a PDF, emailed once (to Mark,
// for now: supabase/deworming-sheet-email.sql). Not sent: logged, as the
// sheet's approved anyway (the photos are in the app)
async function emailPhotos(sheet, photos) {
    try {
        const [{ pdf }, { default: DewormingPhotosPDF }, data] = await Promise.all([
            import("@react-pdf/renderer"),
            import("./DewormingPhotosPDF"),
            sheetPhotoData(photos),
        ]);
        const blob = await pdf(<DewormingPhotosPDF sheet={sheet} photos={data} />).toBlob();
        const name = `${sheet.groupName}_${SESSIONS[sheet.session]}`.replace(/[^a-z0-9]+/gi, "_");
        await emailDewormingSheet(sheet.id, blob, `deworming_sheet_${name}_${sheet.startedOn ?? sheet.startDate}.pdf`);
    } catch (error) {
        console.error(`Emailing the photo of ${sheetTitle(sheet)} failed:`, error);
    }
}

// The days in order (each opens once the day before is complete): Day 1–3,
// and Day 4 when anyone needs it
const sheetDays = (lines) => [1, 2, 3, ...(lines.some((l) => onDay(l, 4)) ? [4] : [])];

// The first day not complete yet (to open on)
const firstOpenDay = (days, daysDone) => days.find((d) => !daysDone.includes(d)) ?? days.at(-1);

// The monkeys still needing a result for a day (not those already done,
// e.g. a Milbeworm given on Day 1) → their names
const stillToDo = (lines, day) =>
    lines.filter((l) => onDay(l, day) && !l.doses?.[day]?.result && !dayAdvice(l, day)?.done).map((l) => l.name);

// Tidies an entry for saving: an empty food or note as nothing
const tidy = (dose) => ({
    ...dose,
    food: dose.food?.trim() || null,
    note: dose.note?.trim() || null,
});

export function ResultsForm({ sheet, lines: startLines, monkeys = [], onSaved, onCancel }) {
    const [lines, setLines] = useState(startLines);
    const [daysDone, setDaysDone] = useState(sheet.daysDone ?? []);
    const [day, setDay] = useState(() => firstOpenDay(sheetDays(startLines), sheet.daysDone ?? []));
    const [startedOn, setStartedOn] = useState(sheet.startedOn ?? sheet.startDate);
    const [staffNames, setStaffNames] = useState(sheet.staffNames ?? "");
    const [dayNotes, setDayNotes] = useState(sheet.dayNotes ?? {});
    const [photos, setPhotos] = useState(sheet.photos ?? []);
    // null, "saving", { saved: message }, "copied" or { problem }
    const [status, setStatus] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [adding, setAdding] = useState(false);
    // After Day 3: the monkeys whose course needs a Day 4 (asked first)
    const [askDay4, setAskDay4] = useState(null);
    const stopSubmitting = useCallback(() => setSubmitting(false), []);
    const days = sheetDays(lines);
    const allDone = days.every((d) => daysDone.includes(d));
    // (a day opens once the one before it is complete)
    const isOpen = (d) => d === 1 || daysDone.includes(d - 1);

    const changeDose = (lineId, value) => {
        setLines((ls) =>
            ls.map((l) => {
                if (l.id !== lineId) return l;
                const doses = { ...l.doses };
                if (value === null) delete doses[day];
                else doses[day] = value;
                return { ...l, doses };
            })
        );
        setStatus(null);
    };

    // Save Day N: saved, and complete once everyone has a result (or is
    // done already); Submit: the same, sent for approval. Day 3 complete:
    // first, Day 4 for anyone whose course started a day late (asked)
    //   decided: the lines with their Day 4 decisions
    async function save(submit = false, decided = null) {
        setSubmitting(false);
        if (submit && !photos.length) {
            return setStatus({ problem: "Please upload a photo of the deworming sheet before submitting." });
        }
        const missing = submit ? [] : stillToDo(lines, day);
        if (!submit && day === 3 && !missing.length && !decided) {
            const late = lines.filter((l) => needsDay4(l));
            if (late.length) return setAskDay4(late);
        }
        // (Day 3 saved: each line's Day 4, as decided (none needed: cleared))
        const saving =
            !submit && day === 3 && !missing.length
                ? lines.map((l) => ({ ...l, day4: needsDay4(l) ? (decided?.[l.id] ?? true) : null }))
                : lines;
        const done = submit
            ? daysDone
            : missing.length
              ? daysDone.filter((d) => d !== day)
              : [...new Set([...daysDone, day])].sort();
        setStatus("saving");
        try {
            await saveDewormingResults(sheet.id, {
                startedOn,
                staffNames,
                dayNotes,
                photos,
                daysDone: done,
                submit,
                lines: saving.map((l) => ({
                    ...l,
                    doses: Object.fromEntries(Object.entries(l.doses).map(([d, x]) => [d, tidy(x)])),
                })),
            });
            setLines(saving);
            setDaysDone(done);
            await onSaved(submit);
            if (!submit) {
                setStatus({
                    saved: missing.length
                        ? `Saved. Day ${day} isn't complete yet: ${nameList(missing)} still ${missing.length === 1 ? "needs" : "need"} a result.`
                        : day < sheetDays(saving).at(-1)
                          ? `Day ${day} complete. Copy the summary, then go on to Day ${day + 1}.`
                          : `Day ${day} complete. Copy the summary, then upload the photo and submit below.`,
                });
            }
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    // Removes a monkey staff added (straight away, in the database too)
    async function remove(line) {
        try {
            await removeDewormingMonkey(line.id);
            setLines((ls) => ls.filter((l) => l.id !== line.id));
            setStatus(null);
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    async function copy() {
        const text = daySummary(sheet, lines, day, dayNotes[day] ?? "");
        if (!text) return setStatus({ problem: `Nothing entered for Day ${day} yet.` });
        try {
            await navigator.clipboard.writeText(text);
            setStatus("copied");
        } catch {
            setStatus({ problem: "Couldn't copy. Please try again." });
        }
    }

    const busy = status === "saving";
    return (
        <section className="Deworming-results" aria-label="Record Results">
            <h3 className="RecordsPage-subhead">Record Results</h3>
            <div className="Deworming-fields">
                <label className="IntegrationPage-choose">
                    <span>Date Started (Day 1)</span>
                    <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} />
                </label>
                <label className="IntegrationPage-choose">
                    <span>Staff Member(s)</span>
                    <input
                        type="text"
                        maxLength={120}
                        value={staffNames}
                        onChange={(e) => setStaffNames(e.target.value)}
                    />
                </label>
            </div>

            <div className="RecordsPage-tabs Deworming-days" role="tablist" aria-label="Day">
                {days.map((d) => (
                    <button
                        key={d}
                        type="button"
                        role="tab"
                        aria-selected={day === d}
                        aria-label={`Day ${d}${daysDone.includes(d) ? " (complete)" : ""}`}
                        className={`${day === d ? "is-on" : ""}${daysDone.includes(d) ? " is-complete" : ""}`}
                        disabled={!isOpen(d)}
                        title={isOpen(d) ? undefined : `Complete Day ${d - 1} first`}
                        onClick={() => {
                            setDay(d);
                            setStatus(null);
                        }}
                    >
                        Day {d}
                        {daysDone.includes(d) && <IconCheck size={15} stroke={3} aria-hidden="true" />}
                    </button>
                ))}
            </div>
            <p className="Deworming-meta">{startedOn ? dayLabel(addDays(startedOn, day - 1)) : ""}</p>
            <ul className="Deworming-entries">
                {lines
                    .filter((l) => onDay(l, day))
                    .map((l) => (
                        <DoseEntry
                            key={`${l.id}-${day}`}
                            line={l}
                            day={day}
                            onChange={(value) => changeDose(l.id, value)}
                            onRemove={() => remove(l)}
                        />
                    ))}
            </ul>
            {day <= 3 && (
                <button
                    type="button"
                    className="Modal-edit is-soft Deworming-addMonkey"
                    onClick={() => setAdding(true)}
                >
                    <IconPlus size={16} aria-hidden="true" />
                    Add Monkey
                </button>
            )}
            {adding && (
                <AddMonkey
                    sheet={sheet}
                    day={day}
                    monkeys={monkeys.filter((m) => !lines.some((l) => l.monkeyId === m.id))}
                    onClose={() => setAdding(false)}
                    onAdded={(line) => {
                        setAdding(false);
                        setLines((ls) => [...ls, line]);
                        setStatus(null);
                    }}
                />
            )}
            {askDay4 && (
                <Day4Question
                    lines={askDay4}
                    onClose={() => setAskDay4(null)}
                    onDecide={(decided) => {
                        setAskDay4(null);
                        save(false, decided);
                    }}
                />
            )}
            <label className="IntegrationPage-choose Deworming-dayNote">
                <span>Note for Day {day} (added to the summary)</span>
                <input
                    type="text"
                    maxLength={300}
                    value={dayNotes[day] ?? ""}
                    onChange={(e) => setDayNotes({ ...dayNotes, [day]: e.target.value })}
                />
            </label>

            {status?.problem && (
                <p className="Integration-problem" role="alert">
                    {status.problem}
                </p>
            )}
            {(status?.saved || status === "copied") && (
                <p className="Deworming-done" role="status">
                    {status === "copied" ? `Day ${day} summary copied` : status.saved}
                </p>
            )}
            <div className="Deworming-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={() => save()}>
                    {busy ? "Saving…" : `Save Day ${day}`}
                </button>
                <button type="button" className="Modal-edit is-soft" disabled={busy} onClick={copy}>
                    <IconCopy size={16} aria-hidden="true" />
                    Copy Day {day} Summary
                </button>
                <button type="button" className="Modal-edit is-cancel" disabled={busy} onClick={onCancel}>
                    Close
                </button>
            </div>

            {/* (an admin changing a submitted sheet: no Submit, it's waiting for Approve) */}
            {allDone && sheet.status !== "submitted" && (
                <section className="Deworming-finish" aria-label="Finish">
                    <h3 className="RecordsPage-subhead">Finish</h3>
                    <p className="Deworming-meta">Upload a photo of the deworming sheet and press Submit to finish.</p>
                    <SheetPhotos paths={photos} sheetId={sheet.id} onChange={setPhotos} />
                    <div className="Deworming-actions">
                        <span className="Deworming-confirmHost">
                            <button
                                type="button"
                                className="Modal-edit is-confirm"
                                disabled={busy || !photos.length}
                                title={photos.length ? undefined : "Upload a photo of the deworming sheet first"}
                                onClick={() => setSubmitting(true)}
                            >
                                Submit
                            </button>
                            {submitting && (
                                <ConfirmBubble
                                    question="Submit for approval? Only an admin can change it after."
                                    busy={busy}
                                    onConfirm={() => save(true)}
                                    onCancel={stopSubmitting}
                                />
                            )}
                        </span>
                    </div>
                </section>
            )}
        </section>
    );
}

// "2026-11-02" plus days → "2026-11-04"
function addDays(date, days) {
    const [y, m, d] = date.split("-").map(Number);
    const day = new Date(y, m - 1, d + days);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
}

// A monkey's notes, day by day: ["Day 2: got a second helping"]
const notesOf = (line) =>
    Object.entries(line.doses ?? {})
        .filter(([, d]) => d.note)
        .map(([day, d]) => `Day ${day}: ${d.note}`);

// Admins: each monkey's record to check (worded from its results), then
// Approve or Send Back. The monkeys staff added are listed apart, and a
// monkey's notes can be added to its record (e.g. an extra dose)
export function Review({ sheet, lines, onDone }) {
    const [texts, setTexts] = useState(() =>
        Object.fromEntries(lines.map((l) => [l.id, l.recordText ?? recordText(sheet.session, l)]))
    );
    const [approving, setApproving] = useState(false);
    const [sending, setSending] = useState(false);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const stopApproving = useCallback(() => setApproving(false), []);
    const listed = lines.filter((l) => (l.kind ?? "list") === "list");
    const added = lines.filter((l) => (l.kind ?? "list") !== "list");

    async function approve() {
        setApproving(false);
        if (lines.some((l) => !texts[l.id]?.trim()))
            return setProblem("Every monkey needs its record before approving.");
        setBusy(true);
        setProblem(null);
        try {
            await approveDewormingSheet(
                sheet.id,
                lines.map((l) => ({ lineId: l.id, text: texts[l.id].trim() }))
            );
            await emailPhotos(sheet, sheet.photos ?? []);
            await onDone();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    async function sendBack() {
        setBusy(true);
        setProblem(null);
        try {
            await returnDewormingSheet(sheet.id, note);
            await onDone();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <section className="Deworming-review" aria-label="Review">
            <h3 className="RecordsPage-subhead">Review</h3>
            <p className="Deworming-meta">
                Check each monkey's record against the results and the photo. Approving adds them to each monkey's
                Medical records.
            </p>
            {[
                [listed, null],
                [added, added.length === 1 ? "1 Monkey Added by Staff" : `${added.length} Monkeys Added by Staff`],
            ].map(
                ([group, heading]) =>
                    group.length > 0 && (
                        <div key={heading ?? "list"}>
                            {heading && <h4 className="Deworming-reviewHead">{heading}</h4>}
                            <ul className="Deworming-records">
                                {group.map((l) => (
                                    <li key={l.id}>
                                        <label className="IntegrationPage-choose">
                                            <span>
                                                {l.name}
                                                <AddedTag line={l} />
                                                {l.addedByName ? ` by ${l.addedByName}` : ""}
                                            </span>
                                            <input
                                                type="text"
                                                maxLength={1000}
                                                value={texts[l.id] ?? ""}
                                                onChange={(e) => setTexts({ ...texts, [l.id]: e.target.value })}
                                            />
                                        </label>
                                        {notesOf(l).map((n) => (
                                            <p key={n} className="Deworming-reviewNote">
                                                {n}
                                                {!texts[l.id]?.includes(n) && (
                                                    <button
                                                        type="button"
                                                        className="Deworming-link"
                                                        onClick={() =>
                                                            setTexts({ ...texts, [l.id]: `${texts[l.id] ?? ""}; ${n}` })
                                                        }
                                                    >
                                                        Add to Record
                                                    </button>
                                                )}
                                            </p>
                                        ))}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )
            )}
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {sending ? (
                <div className="Deworming-sendBack">
                    <label className="IntegrationPage-choose">
                        <span>Note for staff (what to fix)</span>
                        <input type="text" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
                    </label>
                    <div className="Deworming-actions">
                        <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={sendBack}>
                            {busy ? "Sending…" : "Send Back"}
                        </button>
                        <button
                            type="button"
                            className="Modal-edit is-cancel"
                            disabled={busy}
                            onClick={() => setSending(false)}
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div className="Deworming-actions">
                    <span className="Deworming-confirmHost">
                        <button
                            type="button"
                            className="Modal-edit is-confirm"
                            disabled={busy}
                            onClick={() => setApproving(true)}
                        >
                            {busy ? "Saving…" : "Approve"}
                        </button>
                        {approving && (
                            <ConfirmBubble
                                question={`Approve, and add ${lines.length === 1 ? "1 record" : `${lines.length} records`} to Medical?`}
                                busy={busy}
                                onConfirm={approve}
                                onCancel={stopApproving}
                            />
                        )}
                    </span>
                    <button
                        type="button"
                        className="Modal-edit is-cancel"
                        disabled={busy}
                        onClick={() => setSending(true)}
                    >
                        Send Back
                    </button>
                </div>
            )}
        </section>
    );
}
