import { useCallback, useEffect, useId, useState } from "react";
import { IconCheck, IconCopy, IconPencil, IconPlus, IconTrash } from "@tabler/icons-react";
import { deleteVasectomy, deleteVetVisit, loadVasectomies, loadVetVisits, saveVasectomy, saveVetVisit } from "./monkeyData";
import {
    MAX_OTHER_VET,
    MAX_VET_DETAILS,
    VASECTOMY_VETS,
    VET_PRACTICES,
    VET_REASONS,
    VASECTOMY_STATUS_WORDS,
    vasectomyWhatsApp,
    vasectomyYears,
    vetFormProblems,
    vetName,
} from "./medsRules";
import { intakeYears } from "./intakeReport";
import { dayText } from "./babyRecords";
import MonkeyFind from "./MonkeyFind";
import { summaryDate } from "./feeding";
import { BabyPhoto } from "./PagePicker";
import { STATUS_WORDS } from "./monkeyStatus";
import ConfirmBubble from "./ConfirmBubble";
import "./IntegrationRecordsPage.css";
import "./IntegrationReports.css"; // (Edit and Delete: Injuries' icons)
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

// (the lists: "6th Mar 2026", so the place beside it stays on one line)
const shortDay = (date) => summaryDate(new Date(`${date}T00:00:00`));

// ---- The form: the monkey, the date, the vet (and reason), details ----

//   kind: "visit" or "vasectomy"; choices: the monkeys to choose from
//   entry: the one being changed (Edit: its monkey stays), or none (new);
//   name: its monkey's name
function VetForm({ kind, choices, entry = null, name = "", onSave, onCancel }) {
    const visit = kind === "visit";
    const today = dayText(new Date());
    const [monkey, setMonkey] = useState(entry ? { id: entry.monkeyId, name } : null);
    const [date, setDate] = useState(entry?.date ?? today);
    const [place, setPlace] = useState(entry ? (visit ? entry.practice : entry.vet) : "");
    const [other, setOther] = useState(entry ? (visit ? entry.practiceOther : entry.vetOther) : "");
    const [reason, setReason] = useState(entry?.reason ?? "");
    const [details, setDetails] = useState(entry?.details ?? "");
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
    const also = entry ? editWords(visit, entry, { place, reason }) : visit
        ? reason === "vasectomy"
            ? "A Vet Visit and a Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes."
            : "A Vet Visit record will also be added to Medical records."
        : place && place !== "on_site"
          ? "A Vasectomy and a Vet Visit record will also be added to Medical records, and Vasectomised? set to Yes."
          : "A Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes.";

    return (
        <form className="IntegrationPage-new" onSubmit={save} noValidate>
            <h2 className="RecordsPage-subhead">
                {entry ? `Edit ${name}'s ${visit ? "Vet Visit" : "Vasectomy"}` : visit ? "New Vet Visit" : "New Vasectomy"}
            </h2>
            {!entry && (
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
            )}
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

// Editing: what else the change does (the database keeps a vasectomy and
// its vet visit in step: meds-edit.sql)
function editWords(visit, entry, { place, reason }) {
    if (visit) {
        if (entry.reason === "vasectomy" && reason !== "vasectomy") return "Its Vasectomy record will be removed from Medical records.";
        if (entry.reason !== "vasectomy" && reason === "vasectomy")
            return "A Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes.";
        if (reason === "vasectomy") return "Its Vasectomy and Medical records will be changed to match.";
        return "Its Medical record will be changed to match.";
    }
    if (entry.vetVisitId && place === "on_site") return "Its Vet Visit will be removed, as it was done on site.";
    if (entry.vetVisitId) return "Its Vet Visit and Medical records will be changed to match.";
    if (entry.vet === "on_site" && place && place !== "on_site") return "A Vet Visit record will also be added to Medical records.";
    return "Its Medical record will be changed to match.";
}

// ---- A row's Delete (admins, or whoever added it): asks first ----

function DeleteButton({ what, onDelete }) {
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const stop = useCallback(() => setAsking(false), []);
    return (
        <span className="Meds-delete">
            <button type="button" className="Integration-icon is-delete" aria-label={`Delete ${what}`} title="Delete" onClick={() => setAsking(true)}>
                <IconTrash size={17} aria-hidden="true" />
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

// One record, a card as Injuries' (Records → Sections): the monkey's photo
// (tapped: their pop-up), name and where they live, the date on the right;
// then what and where in bold, the details (2 lines at most, then "…"),
// and who added it
// (archived: { name, status } from the record, admins only; none for
// others: "Archived Monkey")
function Row({ monkey, archived, name, date, what, details, by, canChange, onEdit, onDelete, deleteWhat }) {
    return (
        <li className="Meds-row">
            <div className="Meds-who">
                {monkey ? <BabyPhoto monkey={monkey} /> : <span className="RecordsPage-photo" />}
                <span className="RecordsPage-baby">
                    <span className={`RecordsPage-name${monkey || archived ? "" : " Meds-gone"}`}>{name}</span>
                    {/* (short, on one line: "H&B Troop", "Goliath C") */}
                    {monkey ? (
                        <span className="RecordsPage-place">{shortPlace(monkey)}</span>
                    ) : (
                        archived && (
                            <span className="RecordsPage-place">
                                {STATUS_WORDS[archived.status] ?? "Archived"}
                            </span>
                        )
                    )}
                </span>
                <span className="Meds-date">{shortDay(date)}</span>
                {canChange && (
                    <span className="Meds-tools">
                        <button type="button" className="Integration-icon is-edit" aria-label={`Edit ${deleteWhat}`} title="Edit" onClick={onEdit}>
                            <IconPencil size={17} aria-hidden="true" />
                        </button>
                        <DeleteButton what={deleteWhat} onDelete={onDelete} />
                    </span>
                )}
            </div>
            <p className="Meds-line">
                <b className="Meds-what">{what}</b>
                {details && (
                    <span className="Meds-details" title={details}>
                        {details}
                    </span>
                )}
            </p>
            {by && <span className="Meds-by">Added by {by}</span>}
        </li>
    );
}

// Where they live, short: their introcage, else "Goliath Troop"
const shortPlace = (monkey) => monkey.introcage ?? (monkey.troop ? `${monkey.troop} Troop` : "");
const monkeyOf = (monkeys, id) => monkeys.find((m) => m.id === id) ?? null;
// (an archived monkey: their name from the record, admins; else "Archived
// Monkey")
const nameOf = (monkeys, entry) => monkeyOf(monkeys, entry.monkeyId)?.name ?? entry.monkey?.name ?? "Archived Monkey";
const archivedOf = (monkeys, entry) => (monkeyOf(monkeys, entry.monkeyId) ? null : entry.monkey);
const mayChange = (staff, entry) => Boolean(staff && (staff.isAdmin || entry.loggedBy === staff.userId));

// ---- Vet Visits ----

function VetVisits({ monkeys, canEnter, staff }) {
    const years = intakeYears();
    const [year, setYear] = useState(years[0]);
    // null (loading), [visits] or { problem }
    const [visits, setVisits] = useState(null);
    const [adding, setAdding] = useState(false);
    // (the one being changed: its id)
    const [editing, setEditing] = useState(null);
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
                            const name = nameOf(monkeys, v);
                            if (editing === v.id) {
                                return (
                                    <li key={v.id}>
                                        <VetForm
                                            kind="visit"
                                            choices={monkeys}
                                            entry={v}
                                            name={name}
                                            onCancel={() => setEditing(null)}
                                            onSave={async (values) => {
                                                await saveVetVisit(v.id, values);
                                                setEditing(null);
                                                setYear(Number(values.date.slice(0, 4)));
                                                setVersion((n) => n + 1);
                                            }}
                                        />
                                    </li>
                                );
                            }
                            return (
                                <Row
                                    onEdit={() => setEditing(v.id)}
                                    key={v.id}
                                    date={v.date}
                                    monkey={monkeyOf(monkeys, v.monkeyId)}
                                    archived={archivedOf(monkeys, v)}
                                    name={name}
                                    what={`${VET_REASONS[v.reason] ?? v.reason} · ${vetName(v.practice, v.practiceOther)}`}
                                    details={v.details}
                                    by={v.loggedByName}
                                    canChange={mayChange(staff, v)}
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
                            .map(({ monkey, done, status }) => (
                                <span key={monkey.id} className={`Meds-boy is-${status}`}>
                                    {monkey.name}
                                    {done ? (
                                        <IconCheck size={14} stroke={2.5} aria-label="Vasectomised" />
                                    ) : (
                                        <span className="Meds-due">{VASECTOMY_STATUS_WORDS[status]}</span>
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
    // (the one being changed: its id)
    const [editing, setEditing] = useState(null);
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
                            const name = nameOf(monkeys, v);
                            if (editing === v.id) {
                                return (
                                    <li key={v.id}>
                                        <VetForm
                                            kind="vasectomy"
                                            choices={boys}
                                            entry={v}
                                            name={name}
                                            onCancel={() => setEditing(null)}
                                            onSave={async (values) => {
                                                await saveVasectomy(v.id, values);
                                                setEditing(null);
                                                setVersion((n) => n + 1);
                                            }}
                                        />
                                    </li>
                                );
                            }
                            return (
                                <Row
                                    onEdit={() => setEditing(v.id)}
                                    key={v.id}
                                    date={v.date}
                                    monkey={monkeyOf(monkeys, v.monkeyId)}
                                    archived={archivedOf(monkeys, v)}
                                    name={name}
                                    what={v.vet === "on_site" ? "On Site" : vetName(v.vet, v.vetOther)}
                                    details={v.details}
                                    by={v.loggedByName}
                                    canChange={mayChange(staff, v)}
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
