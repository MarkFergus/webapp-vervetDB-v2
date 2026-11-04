import { useCallback, useEffect, useState } from "react";
import { IconEye } from "@tabler/icons-react";
import { addSpotSighting, loadLastMoves, loadMonkeySightings } from "./monkeyData";
import { seenDaily, sightingRecord } from "./monitoringRules";
import { dayText } from "./babyRecords";
import { summaryDate } from "./feeding";
import { useFormLock } from "./formLock";
import "./IntegrationReports.css";
import "./MarkSeen.css";

// Mark As Seen: a missing monkey seen between monitoring sessions, ticked off
// on its own (supabase/monkey-sightings.sql). It counts as last seen, so it
// clears Not Seen Last Session and Must See. Editors and admins; only for
// a monkey that's missing (not seen in its last session).
//   Records → Sections → Monitoring: the Missing box
//   the monkey's Full Profile: Monitoring → Last Seen

export const NOTE_MAX = 200;
const longDate = (date) => summaryDate(new Date(`${date}T00:00:00`));

// Why it's missing: "Not seen in the last 2 sessions · last seen 12th Oct
// 2026" (never: "not seen in a session yet")
export function missingText(record) {
    const sessions = record.missed === 1 ? "Not seen last session" : `Not seen in the last ${record.missed} sessions`;
    return `${sessions} · ${record.lastSeen ? `last seen ${longDate(record.lastSeen)}` : "not seen in a session yet"}`;
}

// The date (today unless changed) and an optional note, then Confirm.
// onSave({ date, note }) (throws a message to show)
export function MarkSeenForm({ name, onSave, onCancel }) {
    // (holds the pop-up while it's open: see formLock.js)
    useFormLock();
    const today = dayText(new Date());
    const [date, setDate] = useState(today);
    const [note, setNote] = useState("");
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    async function confirm() {
        if (!date || date > today) return setProblem("Please choose the date (not in the future).");
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ date, note: note.trim() });
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <div className="Integration-form MarkSeen-form" aria-label={`Mark ${name} As Seen`} role="group">
            <label>
                <span>Seen On</span>
                <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label>
                <span>Note (optional)</span>
                <input
                    type="text"
                    value={note}
                    maxLength={NOTE_MAX}
                    placeholder="e.g. By the gate, looking well"
                    onChange={(e) => setNote(e.target.value)}
                />
            </label>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="Integration-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={confirm}>
                    {busy ? "Saving…" : "Confirm"}
                </button>
                <button type="button" className="Modal-edit is-cancel" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}

// The Mark As Seen button
export function MarkSeenButton({ name, onClick }) {
    return (
        <button type="button" className="Modal-edit is-sickbay MarkSeen-button" aria-label={`Mark ${name} As Seen`} onClick={onClick}>
            <IconEye size={16} aria-hidden="true" />
            Mark As Seen
        </button>
    );
}

// The Full Profile: whether a monkey's missing ({ missed, lastSeen, spot }, or
// null while loading / not on any checklist yet), and reload(). In an
// introcage or Sickbay: seen every day; moved back out to its troop: seen
// that day (its latest move)
export function useMissing(monkey, enabled) {
    const monkeyId = monkey?.id;
    const daily = Boolean(monkey && seenDaily(monkey));
    const [record, setRecord] = useState(null);
    const reload = useCallback(() => {
        if (!enabled || monkeyId == null) {
            setRecord(null);
            return Promise.resolve();
        }
        return Promise.all([loadMonkeySightings(monkeyId), loadLastMoves([monkeyId])])
            .then(([{ sessions, spots }, moves]) =>
                setRecord(
                    sessions.length
                        ? sightingRecord(sessions, monkeyId, spots, {
                              daily,
                              back: moves[monkeyId],
                              today: dayText(new Date()),
                          })
                        : null
                )
            )
            .catch(() => setRecord(null));
    }, [monkeyId, enabled, daily]);
    useEffect(() => {
        reload();
    }, [reload]);
    return { record, reload };
}

// Last Seen (the Full Profile's Monitoring): the day, and who saw it if
// it was between sessions; missing (not seen in its last session): why, in
// red, with Mark As Seen (editors and admins)
//   record: useMissing's (null: not on a checklist yet)
export function LastSeen({ monkey, record, canMark, onMarked, muted = false }) {
    const [open, setOpen] = useState(false);
    if (!record) return <span className="Enclosures-unset">Not in a monitoring session yet</span>;
    const missed = record.missed === 1 ? "Not seen last session" : `Not seen in the last ${record.missed} sessions`;
    return (
        <div className="MarkSeen-lastSeen">
            <span>
                {record.lastSeen ? longDate(record.lastSeen) : "Not seen in a session yet"}
                {record.spot && (
                    <span className="MarkSeen-by">
                        {" "}
                        · by {record.spot.by}
                        {record.spot.note ? ` · ${record.spot.note}` : ""}
                    </span>
                )}
                {/* (Mute Alerts: why it's never shown as missing) */}
                {muted && <span className="MarkSeen-by"> · Missing alerts muted</span>}
            </span>
            {record.missed > 0 && (
                <div className="MarkSeen-line is-missing">
                    <b>{missed}</b>
                    {canMark && !open && <MarkSeenButton name={monkey.name} onClick={() => setOpen(true)} />}
                    {open && (
                        <MarkSeenForm
                            name={monkey.name}
                            onCancel={() => setOpen(false)}
                            onSave={async (values) => {
                                await addSpotSighting(monkey.id, values);
                                setOpen(false);
                                await onMarked();
                            }}
                        />
                    )}
                </div>
            )}
        </div>
    );
}
