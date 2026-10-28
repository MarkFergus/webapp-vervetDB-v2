import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconAlertTriangle, IconPencil, IconPlus, IconSearch } from "@tabler/icons-react";
import useDialog from "./useDialog";
import {
    addIntegrationReports,
    loadIntegrations,
    loadLatestReportDates,
    startIntegration,
    updateIntegrationStatus,
} from "./monkeyData";
import { summaryDate } from "./feeding";
import { fullName } from "./places";
import { dayText } from "./babyRecords";
import {
    INTEGRATION_KINDS,
    INTEGRATION_STATUSES,
    MAX_REPORT,
    STATUS_DATE_LABELS,
    checkReports,
    integrationChoices,
    isCurrent,
    integrationPlace,
    matchesSearch,
    reportFrom,
} from "./integrations";
import { BabyPhoto } from "./PagePicker";
import "./IntegrationRecordsPage.css";

// Records → Integration (staff; entering: editors and admins, canEnter):
//   Reports                the monkeys with an integration going on, each
//                          with From and To dates and its report (up to 500
//                          characters), saved together with Save All. They
//                          show on the monkey's Full Profile (Integration).
//   Current Integrations   each one going on: the monkey, where it is, when
//                          it started, its type and status; + New
//                          Integration starts one (introcage monkeys);
//                          Status Update: On Hold (stays in the list),
//                          Completed or Cancelled (leaves it), or Active.
// (Later: photos with the reports, Past Integrations, and an Integration
// record when one starts.)

const longDate = (date) => summaryDate(new Date(`${date}T00:00:00`));

// The integrations going on, loaded when the page opens. list: null
// (loading), "failed", "not-ready" (integrations.sql not run yet), or them.
function useIntegrations() {
    const [list, setList] = useState(null);
    const reload = useCallback(async () => {
        try {
            const found = await loadIntegrations();
            setList(found);
            return found;
        } catch (error) {
            console.error("Loading the integrations failed:", error);
            setList(["42P01", "PGRST205"].includes(error?.code) ? "not-ready" : "failed");
            return null;
        }
    }, []);
    useEffect(() => {
        reload();
    }, [reload]);
    return { list, reload, setList };
}

function LoadProblem({ list }) {
    if (list === null) return <p className="RecordsPage-none">Loading…</p>;
    if (list === "not-ready") {
        return <p className="RecordsPage-none RecordsPage-problem">Integrations need supabase/integrations.sql to be run first.</p>;
    }
    return <p className="RecordsPage-none RecordsPage-problem">Couldn't load the integrations. Please check your connection and try again.</p>;
}

// ---- Reports ----

function ReportsPage({ monkeys, canEnter }) {
    const { list } = useIntegrations();
    const ready = Array.isArray(list);
    // Each one's latest report end ({ monkeyId: date }), for From
    const [latest, setLatest] = useState(null);
    // monkeyId → { from, to, report }
    const [typed, setTyped] = useState({});
    const [errors, setErrors] = useState({});
    // null, "saving", { done } or { problem }
    const [status, setStatus] = useState(null);
    const ids = useMemo(() => (ready ? list.map((i) => i.monkeyId) : []), [ready, list]);

    // Starting values: From the day after its last report (or the day it
    // started), To today
    const startRows = useCallback(
        (dates) =>
            Object.fromEntries(
                list.map((i) => [i.monkeyId, { from: reportFrom(dates[i.monkeyId], i.startedOn), to: dayText(new Date()), report: "" }])
            ),
        [list]
    );
    useEffect(() => {
        if (!ready) return;
        let cancelled = false;
        loadLatestReportDates(ids)
            .catch(() => ({}))
            .then((dates) => {
                if (cancelled) return;
                setLatest(dates);
                setTyped(startRows(dates));
            });
        return () => {
            cancelled = true;
        };
    }, [ready, ids, startRows]);

    if (!ready) return <LoadProblem list={list} />;
    const byId = (id) => monkeys.find((m) => m.id === id);
    const rows = list.map((i) => ({ integration: i, monkey: byId(i.monkeyId) })).filter((r) => r.monkey);
    const busy = status === "saving";
    const type = (monkeyId, field, value) => {
        setTyped((t) => ({ ...t, [monkeyId]: { ...t[monkeyId], [field]: value } }));
        setErrors((e) => ({ ...e, [monkeyId]: undefined }));
        setStatus(null);
    };

    async function save(event) {
        event.preventDefault();
        const { entries, errors: found } = checkReports(typed);
        setErrors(found);
        if (Object.keys(found).length) {
            setStatus({ problem: "Please check the reports marked below." });
            return;
        }
        if (!entries.length) {
            setStatus({ problem: "Nothing to save yet: write a report for at least one monkey." });
            return;
        }
        setStatus("saving");
        try {
            const saved = await addIntegrationReports(entries);
            const dates = await loadLatestReportDates(ids).catch(() => latest ?? {});
            setLatest(dates);
            setTyped(startRows(dates));
            setStatus({ done: `Saved ${saved} ${saved === 1 ? "report" : "reports"}.` });
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    if (!rows.length) {
        return (
            <p className="RecordsPage-none">
                No integrations going on at the moment. Start one in <a href="#records/integration/current">Current Integrations</a>.
            </p>
        );
    }
    return (
        <form className="IntegrationPage-reports" onSubmit={save} noValidate>
            <p className="RecordsPage-hint">
                {canEnter
                    ? "Write a report for each monkey being integrated (leave one blank to skip it), then Save All."
                    : "The monkeys being integrated. Editors write their reports here."}
            </p>
            <ul className="IntegrationPage-cards">
                {rows.map(({ integration, monkey }) => {
                    const row = typed[monkey.id] ?? { from: "", to: "", report: "" };
                    const error = errors[monkey.id];
                    const id = `IntegrationPage-report-${monkey.id}`;
                    const last = latest?.[monkey.id];
                    return (
                        <li key={integration.id} className={`IntegrationPage-card${error ? " has-error" : ""}`}>
                            <div className="IntegrationPage-who">
                                <BabyPhoto monkey={monkey} />
                                <div className="RecordsPage-baby">
                                    <label className="RecordsPage-name" htmlFor={id}>
                                        {monkey.name}
                                    </label>
                                    <span className="RecordsPage-place">
                                        {fullName(integrationPlace(monkey) ?? "")} · {INTEGRATION_KINDS[integration.kind]}
                                    </span>
                                </div>
                                <span className="IntegrationPage-last">
                                    {last ? `Last report to ${longDate(last)}` : "No reports yet"}
                                </span>
                            </div>
                            {canEnter && (
                                <>
                                    <div className="IntegrationPage-dates">
                                        <label>
                                            <span>From</span>
                                            <input
                                                type="date"
                                                value={row.from}
                                                max={dayText(new Date())}
                                                onChange={(e) => type(monkey.id, "from", e.target.value)}
                                                aria-label={`From, ${monkey.name}`}
                                            />
                                        </label>
                                        <label>
                                            <span>To</span>
                                            <input
                                                type="date"
                                                value={row.to}
                                                max={dayText(new Date())}
                                                onChange={(e) => type(monkey.id, "to", e.target.value)}
                                                aria-label={`To, ${monkey.name}`}
                                            />
                                        </label>
                                    </div>
                                    <textarea
                                        id={id}
                                        className="IntegrationPage-report"
                                        rows={4}
                                        maxLength={MAX_REPORT}
                                        placeholder="How the integration went"
                                        value={row.report}
                                        onChange={(e) => type(monkey.id, "report", e.target.value)}
                                        aria-invalid={Boolean(error)}
                                        aria-describedby={`${id}-count${error ? ` ${id}-error` : ""}`}
                                    />
                                    <div className="IntegrationPage-under">
                                        {error ? (
                                            <span className="RecordsPage-error" id={`${id}-error`}>
                                                {error}
                                            </span>
                                        ) : (
                                            <span />
                                        )}
                                        <span className="IntegrationPage-count" id={`${id}-count`}>
                                            {row.report.length} / {MAX_REPORT}
                                        </span>
                                    </div>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
            {canEnter && (
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
        </form>
    );
}

// ---- Current Integrations ----

// "Start integration for Poppy?": Confirm (green) or Cancel
function StartDialog({ monkey, busy, problem, onConfirm, onCancel }) {
    const cancelRef = useRef(null);
    useDialog(true, cancelRef, { onClose: busy ? () => {} : onCancel });
    return (
        <>
            <div className="RecordsPage-scrim" />
            <div className="RecordsPage-dialog" role="dialog" aria-modal="true" aria-labelledby="IntegrationPage-startTitle">
                <h2 id="IntegrationPage-startTitle">Start integration for {monkey.name}?</h2>
                {problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {problem}
                    </p>
                )}
                <div className="RecordsPage-dialogButtons">
                    <button type="button" className="Modal-edit is-confirm" onClick={onConfirm} disabled={busy}>
                        {busy ? "Starting…" : "Confirm"}
                    </button>
                    <button type="button" className="Modal-edit is-soft" onClick={onCancel} disabled={busy} ref={cancelRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

// + New Integration: find the monkey, the date it started and the type
function NewIntegration({ choices, onStart, onCancel }) {
    const [search, setSearch] = useState("");
    const [monkeyId, setMonkeyId] = useState(null);
    const [startedOn, setStartedOn] = useState(() => dayText(new Date()));
    const [kind, setKind] = useState("");
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const chosen = choices.find((m) => m.id === monkeyId) ?? null;
    const found = search.trim() ? choices.filter((m) => matchesSearch(m, search)).slice(0, 8) : [];
    const ready = Boolean(chosen && startedOn && startedOn <= dayText(new Date()) && kind);

    async function confirm() {
        setBusy(true);
        setProblem(null);
        try {
            await onStart(chosen, { startedOn, kind });
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <div className="IntegrationPage-new">
            <h2 className="RecordsPage-subhead">New Integration</h2>
            {chosen ? (
                <div className="IntegrationPage-chosen">
                    <BabyPhoto monkey={chosen} />
                    <div className="RecordsPage-baby">
                        <span className="RecordsPage-name">{chosen.name}</span>
                        <span className="RecordsPage-place">{fullName(integrationPlace(chosen))}</span>
                    </div>
                    <button type="button" className="Modal-edit is-soft" onClick={() => setMonkeyId(null)}>
                        Change
                    </button>
                </div>
            ) : (
                <div className="IntegrationPage-find">
                    <label className="IntegrationPage-search">
                        <IconSearch size={16} aria-hidden="true" />
                        <input
                            type="search"
                            value={search}
                            placeholder="Search introcage monkeys"
                            onChange={(e) => setSearch(e.target.value)}
                            aria-label="Search introcage monkeys"
                        />
                    </label>
                    {search.trim() && (
                        <ul className="IntegrationPage-found" aria-label="Monkeys found">
                            {found.length ? (
                                found.map((m) => (
                                    <li key={m.id}>
                                        <button type="button" onClick={() => setMonkeyId(m.id)}>
                                            <BabyPhoto monkey={m} />
                                            <span className="RecordsPage-baby">
                                                <span className="RecordsPage-name">{m.name}</span>
                                                <span className="RecordsPage-place">{fullName(integrationPlace(m))}</span>
                                            </span>
                                        </button>
                                    </li>
                                ))
                            ) : (
                                <li className="RecordsPage-none">
                                    No introcage monkey found (or it already has an integration going on).
                                </li>
                            )}
                        </ul>
                    )}
                </div>
            )}
            <div className="IntegrationPage-dates">
                <label>
                    <span>Date Started</span>
                    <input type="date" value={startedOn} max={dayText(new Date())} onChange={(e) => setStartedOn(e.target.value)} />
                </label>
                <label>
                    <span>Type</span>
                    <select value={kind} onChange={(e) => setKind(e.target.value)}>
                        <option value="">Choose…</option>
                        {Object.entries(INTEGRATION_KINDS).map(([id, label]) => (
                            <option key={id} value={id}>
                                {label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className="RecordsPage-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={!ready} onClick={() => setAsking(true)}>
                    Start Integration
                </button>
                <button type="button" className="Modal-edit is-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
            {asking && (
                <StartDialog
                    monkey={chosen}
                    busy={busy}
                    problem={problem}
                    onConfirm={confirm}
                    onCancel={() => {
                        setAsking(false);
                        setProblem(null);
                    }}
                />
            )}
        </div>
    );
}

// Status Update for one integration: choose the new status and its date
// (today to start with; not before it started), then Confirm shows what it
// will do and asks again (Cancelled: red)
function StatusDialog({ integration, monkey, onSave, onCancel }) {
    const cancelRef = useRef(null);
    const choices = Object.keys(INTEGRATION_STATUSES).filter((s) => s !== integration.status);
    const [status, setStatus] = useState("");
    const [date, setDate] = useState(() => dayText(new Date()));
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    useDialog(true, cancelRef, { onClose: busy ? () => {} : onCancel });
    const word = INTEGRATION_STATUSES[status];
    const tooEarly = Boolean(date) && date < integration.startedOn;
    const ready = Boolean(status && date && !tooEarly && date <= dayText(new Date()));

    async function save() {
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ status, date });
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <>
            <div className="RecordsPage-scrim" />
            <div className="RecordsPage-dialog" role="dialog" aria-modal="true" aria-labelledby="IntegrationPage-statusTitle">
                <h2 id="IntegrationPage-statusTitle">
                    {checking ? `Mark ${monkey.name}'s integration as ${word}?` : `Status Update: ${monkey.name}`}
                </h2>
                {checking ? (
                    <p className={`StatusUpdate-warning${status === "cancelled" ? "" : " is-restore"}`}>
                        <IconAlertTriangle size={18} aria-hidden="true" />
                        <span>
                            {isCurrent(status)
                                ? `It stays in Current Integrations, as ${word} from ${longDate(date)}.`
                                : `It will end on ${longDate(date)} and leave Current Integrations.`}
                        </span>
                    </p>
                ) : (
                    <>
                        <p>
                            Now: <strong>{INTEGRATION_STATUSES[integration.status]}</strong>
                        </p>
                        <label className="IntegrationPage-choose">
                            <span>New Status</span>
                            <select value={status} onChange={(e) => setStatus(e.target.value)}>
                                <option value="">Choose…</option>
                                {choices.map((s) => (
                                    <option key={s} value={s}>
                                        {INTEGRATION_STATUSES[s]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="IntegrationPage-choose">
                            <span>{STATUS_DATE_LABELS[status] ?? "Date"}</span>
                            <input
                                type="date"
                                value={date}
                                min={integration.startedOn}
                                max={dayText(new Date())}
                                onChange={(e) => setDate(e.target.value)}
                                aria-invalid={tooEarly}
                            />
                        </label>
                        {tooEarly && (
                            <p className="RecordsPage-error">
                                The date can't be before it started ({longDate(integration.startedOn)}).
                            </p>
                        )}
                    </>
                )}
                {problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {problem}
                    </p>
                )}
                <div className="RecordsPage-dialogButtons">
                    {checking ? (
                        <>
                            <button
                                type="button"
                                className={`Modal-edit ${status === "cancelled" ? "is-danger" : "is-confirm"}`}
                                onClick={save}
                                disabled={busy}
                            >
                                {busy ? "Saving…" : "Confirm"}
                            </button>
                            <button type="button" className="Modal-edit is-soft" onClick={() => setChecking(false)} disabled={busy} ref={cancelRef}>
                                Back
                            </button>
                        </>
                    ) : (
                        <>
                            <button type="button" className="Modal-edit is-confirm" onClick={() => setChecking(true)} disabled={!ready}>
                                Confirm
                            </button>
                            <button type="button" className="Modal-edit is-soft" onClick={onCancel} ref={cancelRef}>
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function CurrentPage({ monkeys, canEnter }) {
    const { list, setList } = useIntegrations();
    const [adding, setAdding] = useState(false);
    const [done, setDone] = useState(null);
    // The integration having its Status Update (its id), or null
    const [updating, setUpdating] = useState(null);
    if (!Array.isArray(list)) return <LoadProblem list={list} />;
    const byId = (id) => monkeys.find((m) => m.id === id);
    const rows = list.map((i) => ({ integration: i, monkey: byId(i.monkeyId) })).filter((r) => r.monkey);

    async function start(monkey, values) {
        const started = await startIntegration(monkey.id, values);
        setList((l) => [...l, started].sort((a, b) => a.startedOn.localeCompare(b.startedOn) || a.id - b.id));
        setAdding(false);
        setDone(`Integration started for ${monkey.name}.`);
    }

    async function changeStatus(integration, monkey, values) {
        const saved = await updateIntegrationStatus(integration.id, values);
        setList((l) => (isCurrent(saved.status) ? l.map((i) => (i.id === saved.id ? saved : i)) : l.filter((i) => i.id !== saved.id)));
        setUpdating(null);
        setDone(`${monkey.name}'s integration is now ${INTEGRATION_STATUSES[saved.status]}.`);
    }
    const open = rows.find((r) => r.integration.id === updating);

    return (
        <>
            <p className="RecordsPage-hint">
                {canEnter ? "The monkeys being integrated now. Start a new one with New Integration." : "The monkeys being integrated now."}
            </p>
            {canEnter &&
                (adding ? (
                    <NewIntegration choices={integrationChoices(monkeys, list)} onStart={start} onCancel={() => setAdding(false)} />
                ) : (
                    <button
                        type="button"
                        className="Modal-edit is-soft IntegrationPage-add"
                        onClick={() => {
                            setAdding(true);
                            setDone(null);
                        }}
                    >
                        <IconPlus size={18} aria-hidden="true" />
                        New Integration
                    </button>
                ))}
            {done && (
                <p className="RecordsPage-done" role="status">
                    {done}
                </p>
            )}
            {rows.length ? (
                <div className="IntegrationPage-table" role="table" aria-label="Current integrations">
                    <div className="IntegrationPage-row IntegrationPage-head" role="row">
                        <span role="columnheader">Monkey</span>
                        <span role="columnheader">Location</span>
                        <span role="columnheader">Started</span>
                        <span role="columnheader">Type</span>
                        <span role="columnheader">Status</span>
                    </div>
                    {rows.map(({ integration, monkey }) => (
                        <div className="IntegrationPage-row" role="row" key={integration.id}>
                            <span className="IntegrationPage-monkey" role="cell">
                                <BabyPhoto monkey={monkey} />
                                <span className="RecordsPage-name">{monkey.name}</span>
                            </span>
                            <span className="IntegrationPage-place" role="cell">
                                {fullName(integrationPlace(monkey) ?? "") || "–"}
                            </span>
                            <span className="IntegrationPage-started" role="cell">
                                {longDate(integration.startedOn)}
                            </span>
                            <span className="IntegrationPage-kind" role="cell">
                                {INTEGRATION_KINDS[integration.kind]}
                            </span>
                            <span className="IntegrationPage-statusCell" role="cell">
                                <span className={`IntegrationPage-status is-${integration.status}`}>
                                    {INTEGRATION_STATUSES[integration.status]}
                                </span>
                                {canEnter && (
                                    <button
                                        type="button"
                                        className="Modal-edit is-soft IntegrationPage-update"
                                        aria-label={`Update, ${monkey.name}`}
                                        onClick={() => {
                                            setUpdating(integration.id);
                                            setDone(null);
                                        }}
                                    >
                                        <IconPencil size={16} aria-hidden="true" />
                                        Update
                                    </button>
                                )}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="RecordsPage-none">No integrations going on at the moment.</p>
            )}
            {open && (
                <StatusDialog
                    integration={open.integration}
                    monkey={open.monkey}
                    onSave={(values) => changeStatus(open.integration, open.monkey, values)}
                    onCancel={() => setUpdating(null)}
                />
            )}
        </>
    );
}

// kind: "reports" or "current" (RECORD_KINDS)
function IntegrationRecordsPage({ kind, monkeys, canEnter }) {
    return kind.id === "reports" ? (
        <ReportsPage monkeys={monkeys} canEnter={canEnter} />
    ) : (
        <CurrentPage monkeys={monkeys} canEnter={canEnter} />
    );
}

export default IntegrationRecordsPage;
