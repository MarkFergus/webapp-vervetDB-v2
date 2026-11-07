import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconAlertTriangle, IconCamera, IconPencil, IconPlus, IconTrash, IconX } from "@tabler/icons-react";
import useDialog from "./useDialog";
import { addIssue, addIssuePhotos, closeIssue, deleteIssue, fixIssue, issuePhotoUrl, loadMaintenanceIssues, maintenanceKindsAvailable, saveIssue } from "./monkeyData";
import { PlacePicker, TypeButtons } from "./MaintenancePickers";
import { enclosureHash } from "./enclosures";
import { fullName } from "./places";
import { dayText } from "./babyRecords";
import { maintenancePlaces } from "./maintenanceRecords";
import { MAX_ISSUE_PHOTOS, checkClose, checkIssue, daysAgo, isOpen, issuesAt, openIssues, pastIssues, photosWithRoom } from "./issueRules";
import "./RecordsPage.css"; // (its pop-ups, hints and messages)
import "./MaintenanceLog.css";
import "./MaintenanceIssues.css";

// Maintenance Issues: what needs doing. An issue stays open until it's fixed
// (which adds a Maintenance report) or closed without a report, with a reason.
//   IssueReportDialog  report one, or change one
//   IssueFixDialog     Mark Fixed / Close Without Report
//   IssuesTab          Records → Maintenance → Issues
//   EnclosureIssues    the open ones on an enclosure's page
// Everyone with a role but Limited (the Interactive Map too: WholeMap.jsx).

function Dialog({ title, onClose, busy, firstRef, children }) {
    useDialog(true, firstRef, { onClose: busy ? () => {} : onClose });
    return createPortal(
        <>
            <div className="RecordsPage-scrim Issues-scrim" />
            <div className="RecordsPage-dialog Issues-dialog" role="dialog" aria-modal="true" aria-label={title}>
                <h2>{title}</h2>
                {children}
            </div>
        </>,
        document.body
    );
}

// Urgent or not: two buttons
function UrgentButtons({ value, onChange }) {
    return (
        <div className="MaintenancePage-types" role="group" aria-label="Urgency">
            <button type="button" aria-pressed={!value} onClick={() => onChange(false)}>
                Not Urgent
            </button>
            <button type="button" className="is-urgent" aria-pressed={value} onClick={() => onChange(true)}>
                Urgent
            </button>
        </div>
    );
}

export const UrgentBadge = () => (
    <span className="Issues-urgent">
        <IconAlertTriangle size={13} stroke={2.2} aria-hidden="true" />
        Urgent
    </span>
);

// Report an issue. start: { place, nearby (the map guessed it: the nearest),
// point: [x, y] on the map }. issue: changing this one instead.
//   onSaved(issue)
export function IssueReportDialog({ enclosures, start = {}, issue = null, onSaved, onCancel }) {
    const detailsRef = useRef(null);
    const fileRef = useRef(null);
    const [place, setPlace] = useState(issue ? enclosures.find((e) => e.id === issue.enclosureId) ?? null : (start.place ?? null));
    const [nearby, setNearby] = useState(Boolean(start.nearby));
    const [details, setDetails] = useState(issue?.details ?? "");
    const [urgent, setUrgent] = useState(issue?.urgent ?? false);
    const [photos, setPhotos] = useState([]);
    const [previews, setPreviews] = useState([]);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    useEffect(() => {
        if (!URL.createObjectURL) return;
        const urls = photos.map((photo) => URL.createObjectURL(photo));
        setPreviews(urls);
        return () => urls.forEach((url) => URL.revokeObjectURL(url));
    }, [photos]);
    function pickPhotos(event) {
        const { files, tooMany } = photosWithRoom(event.target.files ?? [], photos.length);
        setPhotos((list) => [...list, ...files]);
        setProblem(tooMany ? `An issue can have up to ${MAX_ISSUE_PHOTOS} photos.` : null);
        // (the same photo can be picked again)
        event.target.value = "";
    }

    async function save(event) {
        event.preventDefault();
        const { values, error } = checkIssue({ place, details, urgent });
        if (error) {
            setProblem(error);
            return;
        }
        setBusy(true);
        setProblem(null);
        try {
            const point = start.point ?? [null, null];
            onSaved(issue ? await saveIssue(issue.id, values) : await addIssue({ ...values, mapX: point[0], mapY: point[1], photos }));
        } catch (failure) {
            setProblem(failure.message);
            setBusy(false);
        }
    }

    return (
        <Dialog title={issue ? "Change Issue" : "Report Issue"} onClose={onCancel} busy={busy} firstRef={detailsRef}>
            <form className="Issues-form" onSubmit={save} noValidate>
                <div className="MaintenancePage-field">
                    <span className="MaintenancePage-label">Enclosure or Introcage</span>
                    <PlacePicker
                        places={maintenancePlaces(enclosures)}
                        enclosures={enclosures}
                        chosen={place}
                        onChoose={(p) => {
                            setPlace(p);
                            setNearby(false);
                        }}
                        note={nearby ? "The nearest to your pin" : null}
                    />
                </div>
                <label className="MaintenancePage-field">
                    <span className="MaintenancePage-label">What's Wrong</span>
                    <textarea
                        ref={detailsRef}
                        className="IntegrationPage-report"
                        rows={3}
                        value={details}
                        placeholder="e.g. Fence down beside the gate"
                        onChange={(e) => setDetails(e.target.value)}
                    />
                </label>
                <div className="Issues-row">
                    <UrgentButtons value={urgent} onChange={setUrgent} />
                    {!issue && (
                        <>
                            <input
                                ref={fileRef}
                                type="file"
                                accept="image/*"
                                hidden
                                multiple
                                aria-label="Photos"
                                onChange={pickPhotos}
                            />
                            {photos.length < MAX_ISSUE_PHOTOS && (
                                <button type="button" className="Modal-edit is-soft" onClick={() => fileRef.current?.click()}>
                                    <IconCamera size={16} aria-hidden="true" />
                                    Add Photos
                                </button>
                            )}
                        </>
                    )}
                </div>
                {photos.length > 0 && (
                    <ul className="Issues-photoList" aria-label="Photos chosen">
                        {photos.map((photo, index) => (
                            <li key={`${photo.name}-${index}`}>
                                {previews[index] && <img src={previews[index]} alt="" />}
                                <button
                                    type="button"
                                    aria-label={`Remove photo ${index + 1}`}
                                    title="Remove"
                                    onClick={() => setPhotos((list) => list.filter((_, i) => i !== index))}
                                >
                                    <IconX size={14} aria-hidden="true" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
                {problem && (
                    <p className="RecordsPage-problem" role="alert">
                        {problem}
                    </p>
                )}
                <div className="RecordsPage-dialogButtons">
                    <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                        {busy ? "Saving…" : issue ? "Save" : "Report Issue"}
                    </button>
                    <button type="button" className="Modal-edit is-cancel" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                </div>
            </form>
        </Dialog>
    );
}

const todayText = () => dayText(new Date());

// Mark Fixed: the normal Maintenance report, filled in, and it goes under the
// issue's place. Close Without Report: only a reason.
//   onDone({ issue, report }) (no report if it was closed)
export function IssueFixDialog({ issue, enclosures, onDone, onCancel }) {
    const firstRef = useRef(null);
    const place = enclosures.find((e) => e.id === issue.enclosureId);
    const [closing, setClosing] = useState(false);
    const [doneOn, setDoneOn] = useState(todayText());
    const [kind, setKind] = useState("repair");
    const [details, setDetails] = useState(issue.details);
    const [reason, setReason] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    async function attempt(action) {
        setBusy(true);
        setProblem(null);
        try {
            onDone(await action());
        } catch (failure) {
            setProblem(failure.message);
            setBusy(false);
        }
    }
    function fix(event) {
        event.preventDefault();
        if (!doneOn) return setProblem("Please give the date.");
        if (doneOn > todayText()) return setProblem("The date can't be in the future.");
        if (!details.trim()) return setProblem("Please say what was done.");
        attempt(() => fixIssue(issue, { doneOn, kind, details: details.trim() }));
    }
    function close(event) {
        event.preventDefault();
        const checked = checkClose(reason);
        if (checked.error) return setProblem(checked.error);
        attempt(async () => ({ issue: await closeIssue(issue, checked.reason) }));
    }

    return (
        <Dialog title={closing ? "Close Without Report" : "Mark Fixed"} onClose={onCancel} busy={busy} firstRef={firstRef}>
            <p className="Issues-reminder">
                <b>{place ? fullName(place.name) : "An enclosure"}:</b> {issue.details}
            </p>
            {closing ? (
                <form className="Issues-form" onSubmit={close} noValidate>
                    <label className="MaintenancePage-field">
                        <span className="MaintenancePage-label">Reason</span>
                        <textarea
                            ref={firstRef}
                            className="IntegrationPage-report"
                            rows={2}
                            value={reason}
                            placeholder="e.g. A duplicate, or a false alarm"
                            onChange={(e) => setReason(e.target.value)}
                        />
                    </label>
                    {problem && (
                        <p className="RecordsPage-problem" role="alert">
                            {problem}
                        </p>
                    )}
                    <div className="RecordsPage-dialogButtons">
                        <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                            {busy ? "Saving…" : "Close Issue"}
                        </button>
                        <button
                            type="button"
                            className="Modal-edit is-cancel"
                            disabled={busy}
                            onClick={() => {
                                setClosing(false);
                                setProblem(null);
                            }}
                        >
                            Back
                        </button>
                    </div>
                </form>
            ) : (
                <form className="Issues-form" onSubmit={fix} noValidate>
                    <div className="IntegrationPage-dates">
                        <label>
                            <span>Date Done</span>
                            <input type="date" value={doneOn} max={todayText()} onChange={(e) => setDoneOn(e.target.value)} />
                        </label>
                        {maintenanceKindsAvailable() && (
                            <div className="MaintenancePage-field">
                                <span className="MaintenancePage-label">Maintenance Type</span>
                                <TypeButtons value={kind} onChange={setKind} />
                            </div>
                        )}
                    </div>
                    <label className="MaintenancePage-field">
                        <span className="MaintenancePage-label">Maintenance Details</span>
                        <textarea
                            ref={firstRef}
                            className="IntegrationPage-report"
                            rows={3}
                            value={details}
                            onChange={(e) => setDetails(e.target.value)}
                        />
                    </label>
                    {problem && (
                        <p className="RecordsPage-problem" role="alert">
                            {problem}
                        </p>
                    )}
                    <div className="RecordsPage-dialogButtons">
                        <button type="submit" className="Modal-edit is-confirm" disabled={busy}>
                            {busy ? "Saving…" : "Save Report"}
                        </button>
                        <button type="button" className="Modal-edit is-cancel" onClick={onCancel} disabled={busy}>
                            Cancel
                        </button>
                    </div>
                    <button
                        type="button"
                        className="Issues-closeLink"
                        disabled={busy}
                        onClick={() => {
                            setClosing(true);
                            setProblem(null);
                        }}
                    >
                        Close Without Report
                    </button>
                </form>
            )}
        </Dialog>
    );
}

// An issue's photo (private: fetched when it's shown), tap for the full size
function IssuePhoto({ path }) {
    const [url, setUrl] = useState(null);
    useEffect(() => {
        let cancelled = false;
        setUrl(null);
        issuePhotoUrl(path)
            .then((found) => !cancelled && setUrl(found))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [path]);
    if (!url) return null;
    return (
        <a className="Issues-photo" href={url} target="_blank" rel="noreferrer" aria-label="See the photo">
            <img src={url} alt="" />
        </a>
    );
}

// All of an issue's photos
export function IssuePhotos({ paths }) {
    if (!paths.length) return null;
    return (
        <div className="Issues-photos">
            {paths.map((path) => (
                <IssuePhoto key={path} path={path} />
            ))}
        </div>
    );
}

// Add Photos on an open issue, while there's room. onAdded(issue)
export function AddPhotosButton({ issue, onAdded }) {
    const fileRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    async function pick(event) {
        const { files, tooMany } = photosWithRoom(event.target.files ?? [], issue.photoPaths.length);
        event.target.value = "";
        setProblem(tooMany ? `An issue can have up to ${MAX_ISSUE_PHOTOS} photos.` : null);
        if (!files.length) return;
        setBusy(true);
        try {
            onAdded(await addIssuePhotos(issue, files));
        } catch (failure) {
            setProblem(failure.message);
        }
        setBusy(false);
    }
    if (issue.photoPaths.length >= MAX_ISSUE_PHOTOS) return null;
    return (
        <>
            <input ref={fileRef} type="file" accept="image/*" multiple hidden aria-label={`Photos for: ${issue.details}`} onChange={pick} />
            <button type="button" className="Modal-edit is-soft" disabled={busy} onClick={() => fileRef.current?.click()}>
                <IconCamera size={16} aria-hidden="true" />
                {busy ? "Adding…" : "Add Photos"}
            </button>
            {problem && (
                <p className="RecordsPage-problem Issues-photoProblem" role="alert">
                    {problem}
                </p>
            )}
        </>
    );
}

// "Reported by Sam · 2 days ago"
export const reportedWords = (issue, now = new Date()) =>
    `${issue.reportedBy ? `Reported by ${issue.reportedBy}` : "Reported"} · ${daysAgo(issue.reportedAt, now)}`;

// One issue in a list
function IssueItem({ issue, enclosures, me, showPlace = true, onFix, onEdit, onDelete, onChanged }) {
    const place = enclosures.find((e) => e.id === issue.enclosureId);
    const when = (issue.closedAt ?? "").slice(0, 10);
    return (
        <li className={`Issues-item${issue.urgent && isOpen(issue) ? " is-urgent" : ""}`}>
            <div className="Issues-itemMain">
                <div className="Issues-itemTop">
                    {showPlace &&
                        (place ? (
                            <a className="MaintenancePage-place" href={enclosureHash(place)}>
                                {fullName(place.name)}
                            </a>
                        ) : (
                            <span className="MaintenancePage-place">–</span>
                        ))}
                    {issue.urgent && isOpen(issue) && <UrgentBadge />}
                </div>
                <p className="Issues-details">{issue.details}</p>
                <IssuePhotos paths={issue.photoPaths} />
                <span className="MaintenanceLog-who">{reportedWords(issue)}</span>
                {issue.status === "fixed" && (
                    <span className="MaintenanceLog-who">
                        Fixed{issue.closedByName ? ` by ${issue.closedByName}` : ""}
                        {when && `, ${when}`}
                    </span>
                )}
                {issue.status === "closed" && (
                    <span className="MaintenanceLog-who">
                        Closed{issue.closedByName ? ` by ${issue.closedByName}` : ""}
                        {when && `, ${when}`}: {issue.closeReason}
                    </span>
                )}
            </div>
            <div className="Issues-itemSide">
                {(onEdit || onDelete) && !me.offline && (
                    <span className="MaintenanceLog-icons">
                        {onEdit && isOpen(issue) && (
                            <button type="button" className="MaintenanceLog-icon is-edit" aria-label={`Change the issue: ${issue.details}`} title="Change" onClick={() => onEdit(issue)}>
                                <IconPencil size={16} aria-hidden="true" />
                            </button>
                        )}
                        {onDelete && me.isAdmin && (
                            <button type="button" className="MaintenanceLog-icon is-delete" aria-label={`Delete the issue: ${issue.details}`} title="Delete" onClick={() => onDelete(issue)}>
                                <IconTrash size={16} aria-hidden="true" />
                            </button>
                        )}
                    </span>
                )}
                {isOpen(issue) && (
                    <span className="Issues-itemButtons">
                        <AddPhotosButton issue={issue} onAdded={onChanged} />
                        <button type="button" className="Modal-edit is-confirm" onClick={() => onFix(issue)}>
                            Mark Fixed
                        </button>
                    </span>
                )}
            </div>
        </li>
    );
}

function DeleteDialog({ issue, onConfirm, onCancel }) {
    const cancelRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    async function confirm() {
        setBusy(true);
        setProblem(null);
        try {
            await onConfirm();
        } catch (failure) {
            setProblem(failure.message);
            setBusy(false);
        }
    }
    return (
        <Dialog title="Delete this issue?" onClose={onCancel} busy={busy} firstRef={cancelRef}>
            <p>{issue.details}</p>
            {problem && (
                <p className="RecordsPage-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="RecordsPage-dialogButtons">
                <button type="button" className="Modal-edit is-danger" onClick={confirm} disabled={busy}>
                    {busy ? "Deleting…" : "Delete"}
                </button>
                <button type="button" className="Modal-edit is-cancel" onClick={onCancel} disabled={busy} ref={cancelRef}>
                    Cancel
                </button>
            </div>
        </Dialog>
    );
}

const placed = (list, issue) => (list.some((i) => i.id === issue.id) ? list.map((i) => (i.id === issue.id ? issue : i)) : [issue, ...list]);

// Records → Maintenance → Issues: Open or Past, and Report Issue
export function IssuesTab({ enclosures, me = {}, onReportAdded = () => {} }) {
    const [issues, setIssues] = useState(null); // null (loading), "failed", or the list
    const [show, setShow] = useState("open");
    // Open: { report: true }, { fix }, { edit } or { remove }
    const [open, setOpen] = useState(null);
    useEffect(() => {
        loadMaintenanceIssues()
            .then(setIssues)
            .catch(() => setIssues("failed"));
    }, []);
    if (issues === null) return <p className="RecordsPage-none">Loading…</p>;
    if (issues === "failed") {
        return <p className="RecordsPage-none RecordsPage-problem">Couldn't load the maintenance issues. Please check your connection and try again.</p>;
    }
    const waiting = openIssues(issues);
    const shown = show === "open" ? waiting : pastIssues(issues);
    return (
        <>
            <div className="Issues-bar">
                <div className="MaintenancePage-types" role="group" aria-label="Show">
                    <button type="button" aria-pressed={show === "open"} onClick={() => setShow("open")}>
                        Open ({waiting.length})
                    </button>
                    <button type="button" aria-pressed={show === "past"} onClick={() => setShow("past")}>
                        Past
                    </button>
                </div>
                <button type="button" className="Modal-edit is-action-outline" onClick={() => setOpen({ report: true })}>
                    <IconPlus size={16} aria-hidden="true" />
                    Report Issue
                </button>
            </div>
            {shown.length ? (
                <ol className="Issues-list">
                    {shown.map((issue) => (
                        <IssueItem
                            key={issue.id}
                            issue={issue}
                            enclosures={enclosures}
                            me={me}
                            onFix={(fix) => setOpen({ fix })}
                            onEdit={(edit) => setOpen({ edit })}
                            onDelete={(remove) => setOpen({ remove })}
                            onChanged={(changed) => setIssues((list) => placed(list, changed))}
                        />
                    ))}
                </ol>
            ) : (
                <p className="RecordsPage-none">{show === "open" ? "No open issues." : "No past issues yet."}</p>
            )}
            {(open?.report || open?.edit) && (
                <IssueReportDialog
                    enclosures={enclosures}
                    issue={open.edit ?? null}
                    onSaved={(issue) => {
                        setIssues((list) => placed(list, issue));
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                />
            )}
            {open?.fix && (
                <IssueFixDialog
                    issue={open.fix}
                    enclosures={enclosures}
                    onDone={({ issue, report }) => {
                        setIssues((list) => placed(list, issue));
                        if (report) onReportAdded(report);
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                />
            )}
            {open?.remove && (
                <DeleteDialog
                    issue={open.remove}
                    onConfirm={async () => {
                        await deleteIssue(open.remove);
                        setIssues((list) => list.filter((i) => i.id !== open.remove.id));
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                />
            )}
        </>
    );
}

// An enclosure's page: its open issues (and its introcages'), above its log.
//   onReportAdded(report): fixing one added to the log
export function EnclosureIssues({ enclosure, enclosures, me = {}, onReportAdded = () => {} }) {
    const [issues, setIssues] = useState([]);
    const [open, setOpen] = useState(null);
    useEffect(() => {
        let cancelled = false;
        loadMaintenanceIssues()
            .then((list) => !cancelled && setIssues(list))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [enclosure.id]);
    const here = openIssues(issuesAt(issues, enclosure, enclosures));
    const children = enclosures.some((e) => e.parentId === enclosure.id);
    return (
        <div className="Issues-enclosure">
            {here.length > 0 && (
                <>
                    <h4>Open Issues ({here.length})</h4>
                    <ol className="Issues-list">
                        {here.map((issue) => (
                            <IssueItem
                                key={issue.id}
                                issue={issue}
                                enclosures={enclosures}
                                me={me}
                                showPlace={children}
                                onFix={(fix) => setOpen({ fix })}
                                onChanged={(changed) => setIssues((list) => placed(list, changed))}
                            />
                        ))}
                    </ol>
                </>
            )}
            <button type="button" className="Modal-edit is-action-outline" onClick={() => setOpen({ report: true })}>
                <IconPlus size={16} aria-hidden="true" />
                Report Issue
            </button>
            {open?.report && (
                <IssueReportDialog
                    enclosures={enclosures}
                    start={{ place: enclosure }}
                    onSaved={(issue) => {
                        setIssues((list) => placed(list, issue));
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                />
            )}
            {open?.fix && (
                <IssueFixDialog
                    issue={open.fix}
                    enclosures={enclosures}
                    onDone={({ issue, report }) => {
                        setIssues((list) => placed(list, issue));
                        if (report) onReportAdded(report);
                        setOpen(null);
                    }}
                    onCancel={() => setOpen(null)}
                />
            )}
        </div>
    );
}

