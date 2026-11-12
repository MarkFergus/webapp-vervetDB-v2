import { useCallback, useEffect, useId, useState } from "react";
import { IconCheck, IconCopy, IconPlus, IconTrash } from "@tabler/icons-react";
import { deleteVasectomy, deleteVetVisit, loadVasectomies, loadVetVisits, saveVasectomy, saveVetVisit } from "./monkeyData";
import {
    MAX_OTHER_VET,
    MAX_VET_DETAILS,
    VASECTOMY_VETS,
    VET_PRACTICES,
    VET_REASONS,
    vasectomyWhatsApp,
    vasectomyYears,
    vetFormProblems,
    vetName,
} from "./medsRules";
import { intakeYears, longDate } from "./intakeReport";
import { dayText } from "./babyRecords";
import MonkeyFind from "./MonkeyFind";
import ConfirmBubble from "./ConfirmBubble";
import "./IntegrationRecordsPage.css";
import "./MedsRecordsPage.css";

// Records → Meds & Sickbay (RecordsPage.jsx): its own pages.
//   Vet Visits    + New Vet Visit, then the year's visits, newest first
//   Vasectomies   + New Vasectomy, then the Log (newest first) or By Birth
//                 Year (each year's boys, vasectomised or not, to copy for
//                 WhatsApp)
// Each one adds the monkey's Medical record, and a vasectomy at a vet (or a
// vet visit for one) adds the other: the database does that
// (supabase/vet-visits.sql). Adding: editors and admins (canEnter);
// deleting: admins, or whoever added it.

const dayWords = (date) => longDate(new Date(`${date}T00:00:00`));

// ---- The form: the monkey, the date, the vet (and reason), details ----

//   kind: "visit" or "vasectomy"; choices: the monkeys to choose from
function VetForm({ kind, choices, onSave, onCancel }) {
    const visit = kind === "visit";
    const today = dayText(new Date());
    const [monkey, setMonkey] = useState(null);
    const [date, setDate] = useState(today);
    const [place, setPlace] = useState("");
    const [other, setOther] = useState("");
    const [reason, setReason] = useState("");
    const [details, setDetails] = useState("");
    const [errors, setErrors] = useState({});
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const places = visit ? VET_PRACTICES : VASECTOMY_VETS;
    const id = useId();

    async function save(event) {
        event.preventDefault();
        const values = { monkeyId: monkey?.id ?? null, date, place, other, reason, details };
        const found = vetFormProblems(values, today, { needsReason: visit });
        setErrors(found);
        setProblem(null);
        if (Object.keys(found).length) return;
        setBusy(true);
        try {
            await onSave(
                visit
                    ? { monkeyId: monkey.id, date, practice: place, practiceOther: other, reason, details }
                    : { monkeyId: monkey.id, date, vet: place, vetOther: other, details }
            );
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    // (under its box, outside the label: the box's name stays just its name)
    const error = (field) =>
        errors[field] && (
            <span className="Meds-error" role="alert" id={`${id}-${field}-error`}>
                {errors[field]}
            </span>
        );
    const describe = (field) => (errors[field] ? { "aria-describedby": `${id}-${field}-error`, "aria-invalid": true } : {});
    // (what else saving does, to know before saving)
    const also = visit
        ? reason === "vasectomy"
            ? "A Vet Visit and a Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes."
            : "A Vet Visit record will also be added to Medical records."
        : place && place !== "on_site"
          ? "A Vasectomy and a Vet Visit record will also be added to Medical records, and Vasectomised? set to Yes."
          : "A Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes.";

    return (
        <form className="IntegrationPage-new" onSubmit={save} noValidate>
            <h2 className="RecordsPage-subhead">{visit ? "New Vet Visit" : "New Vasectomy"}</h2>
            <div>
                <MonkeyFind
                    monkeys={choices}
                    chosen={monkey}
                    onChoose={setMonkey}
                    label={visit ? "Search monkeys" : "Search boys"}
                    none={visit ? "No monkey found." : "No boy found."}
                />
                {error("monkey")}
            </div>
            <div className={`Meds-fields${visit ? " is-visit" : ""}`}>
                <div className="IntegrationPage-choose">
                    <label htmlFor={`${id}-date`}>Date</label>
                    <input id={`${id}-date`} type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} {...describe("date")} />
                    {error("date")}
                </div>
                <div className="IntegrationPage-choose">
                    <label htmlFor={`${id}-place`}>{visit ? "Vet Practice" : "Vet"}</label>
                    <select id={`${id}-place`} value={place} onChange={(e) => setPlace(e.target.value)} {...describe("place")}>
                        <option value="">Choose…</option>
                        {Object.entries(places).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                    {error("place")}
                </div>
                {visit && (
                    <div className="IntegrationPage-choose">
                        <label htmlFor={`${id}-reason`}>Reason</label>
                        <select id={`${id}-reason`} value={reason} onChange={(e) => setReason(e.target.value)} {...describe("reason")}>
                            <option value="">Choose…</option>
                            {Object.entries(VET_REASONS).map(([id, label]) => (
                                <option key={id} value={id}>
                                    {label}
                                </option>
                            ))}
                        </select>
                        {error("reason")}
                    </div>
                )}
            </div>
            {place === "other" && (
                <div className="IntegrationPage-choose Meds-other">
                    <label htmlFor={`${id}-other`}>Vet&apos;s Name</label>
                    <input
                        id={`${id}-other`}
                        type="text"
                        value={other}
                        maxLength={MAX_OTHER_VET}
                        onChange={(e) => setOther(e.target.value)}
                        {...describe("other")}
                    />
                    {error("other")}
                </div>
            )}
            <label className="IntegrationPage-choose">
                <span>Details</span>
                <textarea
                    className="IntegrationPage-report"
                    value={details}
                    maxLength={MAX_VET_DETAILS}
                    onChange={(e) => setDetails(e.target.value)}
                />
            </label>
            <div className="IntegrationPage-under">
                <span>{error("details")}</span>
                <span className="IntegrationPage-count">
                    {details.length} / {MAX_VET_DETAILS}
                </span>
            </div>
            <p className="RecordsPage-hint">{also}</p>
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="RecordsPage-actions">
                <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                    {busy ? "Saving…" : "Save"}
                </button>
                <button type="button" className="Modal-edit is-cancel" onClick={onCancel} disabled={busy}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

// ---- A row's Delete (admins, or whoever added it): asks first ----

function DeleteButton({ what, onDelete }) {
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const stop = useCallback(() => setAsking(false), []);
    return (
        <span className="Meds-delete">
            <button type="button" className="Meds-icon" aria-label={`Delete ${what}`} onClick={() => setAsking(true)}>
                <IconTrash size={16} aria-hidden="true" />
            </button>
            {asking && (
                <ConfirmBubble
                    question={`Delete ${what}?`}
                    danger
                    busy={busy}
                    onCancel={stop}
                    onConfirm={async () => {
                        setBusy(true);
                        try {
                            await onDelete();
                        } catch (error) {
                            setProblem(error.message);
                            setBusy(false);
                            setAsking(false);
                        }
                    }}
                />
            )}
            {problem && (
                <span className="Meds-error" role="alert">
                    {problem}
                </span>
            )}
        </span>
    );
}

// One row: the date and monkey, what and where, the details (2 lines at
// most, then "…"), and who added it
function Row({ date, name, what, details, by, canDelete, onDelete, deleteWhat }) {
    return (
        <li className="Meds-row">
            <div className="Meds-main">
                <span className="Meds-top">
                    <span className="Meds-name">{name}</span>
                    <span className="Meds-date">{dayWords(date)}</span>
                </span>
                <span className="Meds-what">{what}</span>
                {details && (
                    <span className="Meds-details" title={details}>
                        {details}
                    </span>
                )}
                {by && <span className="Meds-by">Added by {by}</span>}
            </div>
            {canDelete && <DeleteButton what={deleteWhat} onDelete={onDelete} />}
        </li>
    );
}

const nameOf = (monkeys, id) => monkeys.find((m) => m.id === id)?.name ?? "A monkey no longer at the sanctuary";
const mayDelete = (staff, entry) => Boolean(staff && (staff.isAdmin || entry.loggedBy === staff.userId));

// ---- Vet Visits ----

function VetVisits({ monkeys, canEnter, staff }) {
    const years = intakeYears();
    const [year, setYear] = useState(years[0]);
    // null (loading), [visits] or { problem }
    const [visits, setVisits] = useState(null);
    const [adding, setAdding] = useState(false);
    const [version, setVersion] = useState(0);

    useEffect(() => {
        let current = true;
        setVisits(null);
        loadVetVisits(year)
            .then((list) => current && setVisits(list))
            .catch((error) => current && setVisits({ problem: error.message }));
        return () => {
            current = false;
        };
    }, [year, version]);

    return (
        <div className="Meds">
            <div className="Meds-bar">
                <label className="IntegrationPage-choose Meds-year">
                    <span>Year</span>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
                        {years.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </label>
                {canEnter && !adding && (
                    <button type="button" className="Modal-edit is-action-outline" onClick={() => setAdding(true)}>
                        <IconPlus size={18} aria-hidden="true" />
                        New Vet Visit
                    </button>
                )}
            </div>
            {adding && (
                <VetForm
                    kind="visit"
                    choices={monkeys}
                    onCancel={() => setAdding(false)}
                    onSave={async (values) => {
                        await saveVetVisit(null, values);
                        setAdding(false);
                        // (its year, to see it there)
                        setYear(Number(values.date.slice(0, 4)));
                        setVersion((v) => v + 1);
                    }}
                />
            )}
            {visits === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : visits.problem ? (
                <p className="RecordsPage-problem" role="alert">
                    {visits.problem}
                </p>
            ) : visits.length === 0 ? (
                <p className="RecordsPage-none">No vet visits in {year}.</p>
            ) : (
                <>
                    <p className="SectionsPage-count">
                        {visits.length} {visits.length === 1 ? "vet visit" : "vet visits"} in {year}
                    </p>
                    <ul className="Meds-list" aria-label={`Vet visits in ${year}`}>
                        {visits.map((v) => {
                            const name = nameOf(monkeys, v.monkeyId);
                            return (
                                <Row
                                    key={v.id}
                                    date={v.date}
                                    name={name}
                                    what={`${VET_REASONS[v.reason] ?? v.reason} · ${vetName(v.practice, v.practiceOther)}`}
                                    details={v.details}
                                    by={v.loggedByName}
                                    canDelete={mayDelete(staff, v)}
                                    deleteWhat={`${name}'s vet visit`}
                                    onDelete={async () => {
                                        await deleteVetVisit(v.id);
                                        setVisits((list) => list.filter((x) => x.id !== v.id));
                                    }}
                                />
                            );
                        })}
                    </ul>
                </>
            )}
        </div>
    );
}

// ---- Vasectomies ----

function BirthYear({ group }) {
    // null, "copied" or "failed"
    const [copied, setCopied] = useState(null);
    async function copy() {
        try {
            await navigator.clipboard.writeText(vasectomyWhatsApp(group));
            setCopied("copied");
        } catch {
            setCopied("failed");
        }
    }
    const homes = [...new Set(group.boys.map((b) => b.home))];
    return (
        <section className="Meds-yearCard" aria-label={`Born ${group.label}`}>
            <div className="Meds-yearTop">
                <h3>
                    {group.label} <span className="Meds-done">{group.doneCount} of {group.total} done</span>
                </h3>
                <button type="button" className="Modal-edit is-blue-outline Meds-copy" onClick={copy}>
                    <IconCopy size={16} aria-hidden="true" />
                    {copied === "copied" ? "Copied!" : "Copy"}
                </button>
            </div>
            {copied === "failed" && (
                <p className="RecordsPage-problem" role="alert">
                    Couldn&apos;t copy it here, sorry.
                </p>
            )}
            {homes.map((home) => (
                <div key={home} className="Meds-home">
                    <span className="Meds-homeName">{home}</span>
                    <span className="Meds-boys">
                        {group.boys
                            .filter((b) => b.home === home)
                            .map(({ monkey, done }) => (
                                <span key={monkey.id} className={`Meds-boy${done ? " is-done" : ""}`}>
                                    {monkey.name}
                                    {done ? (
                                        <IconCheck size={14} stroke={2.5} aria-label="Vasectomised" />
                                    ) : (
                                        <span className="Meds-notYet">Not Yet</span>
                                    )}
                                </span>
                            ))}
                    </span>
                </div>
            ))}
        </section>
    );
}

function Vasectomies({ monkeys, canEnter, staff }) {
    const [tab, setTab] = useState("log");
    // null (loading), [vasectomies] or { problem }
    const [list, setList] = useState(null);
    const [adding, setAdding] = useState(false);
    const [version, setVersion] = useState(0);
    const boys = monkeys.filter((m) => m.sex === "male");

    useEffect(() => {
        let current = true;
        loadVasectomies()
            .then((found) => current && setList(found))
            .catch((error) => current && setList({ problem: error.message }));
        return () => {
            current = false;
        };
    }, [version]);

    const loaded = Array.isArray(list) ? list : [];
    return (
        <div className="Meds">
            <div className="RecordsPage-tabRow">
                <div className="RecordsPage-tabs" role="tablist" aria-label="Vasectomies">
                    {[
                        ["log", "Log"],
                        ["years", "By Birth Year"],
                    ].map(([id, label]) => (
                        <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "is-on" : ""} onClick={() => setTab(id)}>
                            {label}
                        </button>
                    ))}
                </div>
                {canEnter && !adding && (
                    <button type="button" className="Modal-edit is-action-outline" onClick={() => setAdding(true)}>
                        <IconPlus size={18} aria-hidden="true" />
                        New Vasectomy
                    </button>
                )}
            </div>
            {adding && (
                <VetForm
                    kind="vasectomy"
                    choices={boys}
                    onCancel={() => setAdding(false)}
                    onSave={async (values) => {
                        await saveVasectomy(null, values);
                        setAdding(false);
                        setVersion((v) => v + 1);
                    }}
                />
            )}
            {list === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : list.problem ? (
                <p className="RecordsPage-problem" role="alert">
                    {list.problem}
                </p>
            ) : tab === "log" ? (
                loaded.length === 0 ? (
                    <p className="RecordsPage-none">No vasectomies recorded yet.</p>
                ) : (
                    <ul className="Meds-list" aria-label="Vasectomies">
                        {loaded.map((v) => {
                            const name = nameOf(monkeys, v.monkeyId);
                            return (
                                <Row
                                    key={v.id}
                                    date={v.date}
                                    name={name}
                                    what={v.vet === "on_site" ? "On Site" : vetName(v.vet, v.vetOther)}
                                    details={v.details}
                                    by={v.loggedByName}
                                    canDelete={mayDelete(staff, v)}
                                    deleteWhat={`${name}'s vasectomy`}
                                    onDelete={async () => {
                                        await deleteVasectomy(v.id);
                                        setList((all) => all.filter((x) => x.id !== v.id));
                                    }}
                                />
                            );
                        })}
                    </ul>
                )
            ) : (
                <>
                    <p className="RecordsPage-hint">Every boy at the sanctuary, by the season he was born in. Copy a year for WhatsApp.</p>
                    {vasectomyYears(monkeys, loaded).map((group) => (
                        <BirthYear key={group.label} group={group} />
                    ))}
                </>
            )}
        </div>
    );
}

export default function MedsRecordsPage({ kind, monkeys = [], canEnter = false, staff = null }) {
    return kind.id === "vasectomies" ? (
        <Vasectomies monkeys={monkeys} canEnter={canEnter} staff={staff} />
    ) : (
        <VetVisits monkeys={monkeys} canEnter={canEnter} staff={staff} />
    );
}
