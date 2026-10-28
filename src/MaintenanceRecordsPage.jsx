import { useCallback, useEffect, useRef, useState } from "react";
import { IconBuildingCommunity, IconFilterOff, IconPencil, IconSearch, IconTrash } from "@tabler/icons-react";
import useDialog from "./useDialog";
import { addMaintenance, deleteMaintenance, loadAllMaintenance, maintenanceKindsAvailable, saveMaintenance } from "./monkeyData";
import { EntryForm, MAINTENANCE_TYPES } from "./MaintenanceLog";
import { enclosureHash } from "./enclosures";
import { fullName } from "./places";
import { dayText } from "./babyRecords";
import { summaryDate } from "./feeding";
import { PAGE_SIZE, checkReport, filterReports, maintenancePlaces, matchesPlace, placeSub } from "./maintenanceRecords";
import "./MaintenanceLog.css";
import "./IntegrationRecordsPage.css"; // (its search, dates and report box)
import "./MaintenanceRecordsPage.css";

// Records → Maintenance (staff): the enclosures' maintenance logs, all in
// one place (a report added here shows on its enclosure's page too).
//   Add     find the enclosure or introcage, then the date, Routine or
//           Repair, and what was done (canLog: anyone with a role,
//           maintenance staff too)
//   View    every report, newest first: Routine / Repair and a place
//           picked from the search's list (an enclosure: its introcages
//           too); Edit and Delete their own (admins: anyone's)
//   live: the database has the log (false before enclosures.sql, or
//   offline); me: { userId, isAdmin }

const longDate = (date) => summaryDate(new Date(`${date}T00:00:00`));

// ---- Enter ----

// Find the enclosure or introcage: a search, then tap one. chosen: shown
// with Change to search again (filtering: the monkey list's pink clear
// filter icon by its name, Clear).
// onType(text): what's typed so far (View narrows the list as you type).
//   note: under a chosen one's name, instead of what it is
function PlacePicker({ places, enclosures, chosen, onChoose, onType = () => {}, filtering = false, note = null }) {
    const [search, setSearch] = useState("");
    const type = (text) => {
        setSearch(text);
        onType(text);
    };
    const found = search.trim() ? places.filter((p) => matchesPlace(p, search, enclosures)).slice(0, 8) : [];
    if (chosen) {
        return (
            <div className={`IntegrationPage-chosen${filtering ? " is-filter" : ""}`}>
                <span className="MaintenancePage-placeIcon">
                    <IconBuildingCommunity size={20} aria-hidden="true" />
                </span>
                <span className="RecordsPage-baby">
                    <span className="RecordsPage-name">{fullName(chosen.name)}</span>
                    <span className="RecordsPage-place">{note ?? placeSub(chosen, enclosures)}</span>
                </span>
                {filtering ? (
                    <button type="button" className="MaintenancePage-clear" onClick={() => onChoose(null)} aria-label="Clear" title="Clear">
                        <IconFilterOff size={15} aria-hidden="true" />
                    </button>
                ) : (
                    <button type="button" className="Modal-edit is-soft" onClick={() => onChoose(null)}>
                        Change
                    </button>
                )}
            </div>
        );
    }
    return (
        <div className="IntegrationPage-find">
            <label className="IntegrationPage-search">
                <IconSearch size={16} aria-hidden="true" />
                <input
                    type="search"
                    value={search}
                    placeholder="Search enclosures and introcages"
                    onChange={(e) => type(e.target.value)}
                    aria-label="Search enclosures and introcages"
                />
            </label>
            {search.trim() && (
                <ul className="IntegrationPage-found" aria-label="Places found">
                    {found.length ? (
                        found.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChoose(p);
                                        type("");
                                    }}
                                >
                                    <span className="MaintenancePage-placeIcon">
                                        <IconBuildingCommunity size={18} aria-hidden="true" />
                                    </span>
                                    <span className="RecordsPage-baby">
                                        <span className="RecordsPage-name">{fullName(p.name)}</span>
                                        <span className="RecordsPage-place">{placeSub(p, enclosures)}</span>
                                    </span>
                                </button>
                            </li>
                        ))
                    ) : (
                        <li className="RecordsPage-none">No enclosure or introcage found.</li>
                    )}
                </ul>
            )}
        </div>
    );
}

// Routine or Repair: two buttons
function TypeButtons({ value, onChange, label = "Maintenance Type", withAll = false }) {
    const options = withAll ? { all: "All", ...MAINTENANCE_TYPES } : MAINTENANCE_TYPES;
    return (
        <div className="MaintenancePage-types" role="group" aria-label={label}>
            {Object.entries(options).map(([id, word]) => (
                <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
                    {word}
                </button>
            ))}
        </div>
    );
}

function EnterForm({ enclosures, onAdded }) {
    const places = maintenancePlaces(enclosures);
    const blank = { place: null, doneOn: dayText(new Date()), kind: "", details: "" };
    const [form, setForm] = useState(blank);
    // null, "saving", { done } or { problem }
    const [status, setStatus] = useState(null);
    const change = (field, value) => {
        setForm((f) => ({ ...f, [field]: value }));
        setStatus(null);
    };

    async function save(event) {
        event.preventDefault();
        const { values, error } = checkReport(form, dayText(new Date()));
        if (error) {
            setStatus({ problem: error });
            return;
        }
        setStatus("saving");
        try {
            const saved = await addMaintenance(form.place.id, values);
            onAdded({ ...saved, enclosureId: form.place.id });
            // (the date stays: often several on the same day)
            setForm((f) => ({ ...blank, doneOn: f.doneOn }));
            setStatus({ done: `Saved for ${fullName(form.place.name)}.` });
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    return (
        <form className="MaintenancePage-enter" onSubmit={save} noValidate>
            <p className="RecordsPage-hint">Find the enclosure or introcage, then say what was done.</p>
            <div className="MaintenancePage-field">
                <span className="MaintenancePage-label">Enclosure or Introcage</span>
                <PlacePicker places={places} enclosures={enclosures} chosen={form.place} onChoose={(p) => change("place", p)} />
            </div>
            <div className="IntegrationPage-dates">
                <label>
                    <span>Date Done</span>
                    <input type="date" value={form.doneOn} max={dayText(new Date())} onChange={(e) => change("doneOn", e.target.value)} />
                </label>
                {maintenanceKindsAvailable() && (
                    <div className="MaintenancePage-field">
                        <span className="MaintenancePage-label">Maintenance Type</span>
                        <TypeButtons value={form.kind} onChange={(kind) => change("kind", kind)} />
                    </div>
                )}
            </div>
            <label className="MaintenancePage-field">
                <span className="MaintenancePage-label">Maintenance Details</span>
                <textarea
                    className="IntegrationPage-report"
                    rows={4}
                    value={form.details}
                    placeholder="e.g. Replaced the shade cloth on the climbing frame"
                    onChange={(e) => change("details", e.target.value)}
                />
            </label>
            <div className="RecordsPage-actions">
                <button type="submit" className="Modal-edit is-confirm" disabled={status === "saving"}>
                    {status === "saving" ? "Saving…" : "Save Report"}
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
        </form>
    );
}

// ---- View ----

// "Delete this report?": Delete (red) or Cancel
function DeleteDialog({ report, place, onConfirm, onCancel }) {
    const cancelRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    useDialog(true, cancelRef, { onClose: busy ? () => {} : onCancel });
    async function confirm() {
        setBusy(true);
        setProblem(null);
        try {
            await onConfirm();
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }
    return (
        <>
            <div className="RecordsPage-scrim" />
            <div className="RecordsPage-dialog" role="dialog" aria-modal="true" aria-labelledby="MaintenancePage-deleteTitle">
                <h2 id="MaintenancePage-deleteTitle">Delete this report?</h2>
                <p>
                    {place ? fullName(place.name) : "An enclosure"}, {longDate(report.doneOn)}: it goes from the enclosure's
                    page too.
                </p>
                {problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {problem}
                    </p>
                )}
                <div className="RecordsPage-dialogButtons">
                    <button type="button" className="Modal-edit is-danger" onClick={confirm} disabled={busy}>
                        {busy ? "Deleting…" : "Delete"}
                    </button>
                    <button type="button" className="Modal-edit is-soft" onClick={onCancel} disabled={busy} ref={cancelRef}>
                        Cancel
                    </button>
                </div>
            </div>
        </>
    );
}

function ViewList({ reports, enclosures, canLog, me, onSaved, onDeleted }) {
    const [type, setType] = useState("all");
    const [search, setSearch] = useState("");
    const [picked, setPicked] = useState(null);
    const [shown, setShown] = useState(PAGE_SIZE);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const canChange = (r) => canLog && Boolean(me.isAdmin || (me.userId && r.loggedById === me.userId));
    const placeOf = (r) => enclosures.find((e) => e.id === r.enclosureId) ?? null;
    const found = filterReports(reports, { type, search, placeId: picked?.id ?? null }, enclosures);
    const hasInside = picked && enclosures.some((e) => e.parentId === picked.id);
    const filter = (fn) => (value) => {
        fn(value);
        setShown(PAGE_SIZE);
    };

    return (
        <>
            <div className="MaintenancePage-filters">
                <PlacePicker
                    places={maintenancePlaces(enclosures)}
                    enclosures={enclosures}
                    chosen={picked}
                    onChoose={filter(setPicked)}
                    onType={filter(setSearch)}
                    filtering
                    note={hasInside ? "With its introcages" : null}
                />
                {maintenanceKindsAvailable() && <TypeButtons value={type} onChange={filter(setType)} label="Show" withAll />}
            </div>
            <p className="MaintenancePage-count" role="status">
                {found.length === 1 ? "1 report" : `${found.length.toLocaleString("en-GB")} reports`}
            </p>
            {found.length ? (
                <ol className="MaintenancePage-list">
                    {found.slice(0, shown).map((r) => {
                        const place = placeOf(r);
                        return (
                            <li key={r.id} className="MaintenancePage-report">
                                <div className="MaintenancePage-main">
                                    <div className="MaintenancePage-top">
                                        <time dateTime={r.doneOn}>{longDate(r.doneOn)}</time>
                                        {r.kind && <span className={`MaintenanceLog-kind is-${r.kind}`}>{MAINTENANCE_TYPES[r.kind]}</span>}
                                    </div>
                                    {editing === r.id ? (
                                        <EntryForm
                                            initial={{ doneOn: r.doneOn, kind: r.kind ?? "", details: r.details }}
                                            onSave={async (values) => {
                                                const saved = await saveMaintenance(r.id, values);
                                                onSaved({ ...saved, enclosureId: r.enclosureId });
                                                setEditing(null);
                                            }}
                                            onCancel={() => setEditing(null)}
                                            saveLabel="Save"
                                            busyLabel="Saving…"
                                        />
                                    ) : (
                                        // The place, then what was done, on one line
                                        <div className="MaintenancePage-details">
                                            {place ? (
                                                <a className="MaintenancePage-place" href={enclosureHash(place)}>
                                                    {fullName(place.name)}
                                                </a>
                                            ) : (
                                                <span className="MaintenancePage-place">–</span>
                                            )}
                                            <p>{r.details}</p>
                                        </div>
                                    )}
                                </div>
                                {/* On the right: Edit / Delete, then who logged it */}
                                <div className="MaintenancePage-side">
                                    {canChange(r) && editing !== r.id && (
                                        <span className="MaintenanceLog-icons">
                                            <button
                                                type="button"
                                                className="MaintenanceLog-icon is-edit"
                                                aria-label={`Edit the report from ${longDate(r.doneOn)}`}
                                                title="Edit"
                                                onClick={() => setEditing(r.id)}
                                            >
                                                <IconPencil size={16} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="MaintenanceLog-icon is-delete"
                                                aria-label={`Delete the report from ${longDate(r.doneOn)}`}
                                                title="Delete"
                                                onClick={() => setDeleting(r)}
                                            >
                                                <IconTrash size={16} aria-hidden="true" />
                                            </button>
                                        </span>
                                    )}
                                    <span className="MaintenanceLog-who">{r.loggedBy ? `Logged by ${r.loggedBy}` : "Logged"}</span>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            ) : (
                <p className="RecordsPage-none">
                    {reports.length ? "No reports match. Try another search or type." : "No maintenance reports yet."}
                </p>
            )}
            {found.length > shown && (
                <button type="button" className="Modal-edit is-soft MaintenancePage-more" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    See More
                </button>
            )}
            {deleting && (
                <DeleteDialog
                    report={deleting}
                    place={placeOf(deleting)}
                    onConfirm={async () => {
                        await deleteMaintenance(deleting.id);
                        onDeleted(deleting.id);
                        setDeleting(null);
                    }}
                    onCancel={() => setDeleting(null)}
                />
            )}
        </>
    );
}

// ---- The page ----

// Newest first, by the day it was done
const inOrder = (list) => [...list].sort((a, b) => b.doneOn.localeCompare(a.doneOn) || b.id - a.id);

function MaintenanceRecordsPage({ enclosures, live, canLog, me = {} }) {
    const [tab, setTab] = useState("enter");
    // null (loading), "failed", or every report
    const [reports, setReports] = useState(null);
    const load = useCallback(() => {
        loadAllMaintenance()
            .then(setReports)
            .catch(() => setReports("failed"));
    }, []);
    useEffect(() => {
        if (live) load();
    }, [live, load]);

    if (!live) return <p className="RecordsPage-none">Maintenance reports will show here once vervetDB is online.</p>;
    const shownTab = canLog ? tab : "view";
    return (
        <>
            {canLog && (
                <div className="RecordsPage-tabRow">
                    <div className="RecordsPage-tabs" role="tablist" aria-label="Maintenance">
                        {[
                            ["enter", "Add"],
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
            {reports === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : reports === "failed" ? (
                <p className="RecordsPage-none RecordsPage-problem">
                    Couldn't load the maintenance reports. Please check your connection and try again.
                </p>
            ) : shownTab === "enter" ? (
                <EnterForm enclosures={enclosures} onAdded={(r) => setReports((l) => inOrder([r, ...l]))} />
            ) : (
                <ViewList
                    reports={reports}
                    enclosures={enclosures}
                    canLog={canLog}
                    me={me}
                    onSaved={(r) => setReports((l) => inOrder(l.map((x) => (x.id === r.id ? r : x))))}
                    onDeleted={(id) => setReports((l) => l.filter((x) => x.id !== id))}
                />
            )}
        </>
    );
}

export default MaintenanceRecordsPage;
