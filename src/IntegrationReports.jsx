import { useEffect, useState } from "react";
import { addIntegration, deleteIntegration, loadIntegration, saveIntegration } from "./monkeyData";
import { summaryDate } from "./feeding";
import useScrollIntoView from "./useScrollIntoView";
import { useFormLock } from "./formLock";
import "./IntegrationReports.css";

// Integration Reports: staff reports on how a monkey's integration is going
// (usually weekly). Listed on the monkey's page, in Records → Integration
// (MonkeyRecords.jsx), for staff only; editors and admins add them, admins
// or whoever wrote one can change or delete it.
// (supabase/integration-reports.sql)

export const MAX_REPORT = 500;

const dateText = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// A new report usually covers the last week
export function newReportDates(today = new Date()) {
    const weekAgo = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7);
    return { from: dateText(weekAgo), to: dateText(today) };
}

// "4th Oct – 11th Oct 2026", or with both years when they differ
export function periodText(from, to) {
    const a = new Date(`${from}T00:00:00`);
    const b = new Date(`${to}T00:00:00`);
    if (from === to) return summaryDate(b);
    const full = (d) => summaryDate(d);
    return a.getFullYear() === b.getFullYear()
        ? `${full(a).replace(/ \d{4}$/, "")} – ${full(b)}`
        : `${full(a)} – ${full(b)}`;
}

// The reports of one monkey, loaded when staff open it. available: the
// database has them (false before integration-reports.sql, or offline),
// and this is staff.
//   staff: { canSee, canAdd, userId, isAdmin, readOnly (limited) } or null
export function useIntegration(monkeyId, staff) {
    const enabled = Boolean(staff?.canSee && monkeyId != null);
    const [state, setState] = useState({ entries: [], available: false });
    useEffect(() => {
        if (!enabled) {
            setState({ entries: [], available: false });
            return;
        }
        let cancelled = false;
        loadIntegration(monkeyId)
            .then((entries) => !cancelled && setState({ entries, available: true }))
            .catch(() => !cancelled && setState({ entries: [], available: false }));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled]);

    // Newest period first
    const sorted = (list) => [...list].sort((a, b) => b.to.localeCompare(a.to) || b.id - a.id);
    const change = (fn) => setState((s) => ({ ...s, entries: sorted(fn(s.entries)) }));
    return {
        available: state.available,
        entries: state.entries,
        canAdd: state.available && Boolean(staff?.canAdd),
        // Admins, or whoever wrote it
        canChange: (entry) =>
            state.available && !staff?.readOnly && Boolean(staff?.isAdmin || (staff?.userId && entry.loggedBy === staff.userId)),
        async add(values) {
            const saved = await addIntegration(monkeyId, values);
            change((list) => [...list, saved]);
        },
        async update(id, values) {
            const saved = await saveIntegration(id, values);
            change((list) => list.map((e) => (e.id === id ? saved : e)));
        },
        async remove(id) {
            await deleteIntegration(id);
            change((list) => list.filter((e) => e.id !== id));
        },
    };
}

// Date Start / Date End side by side, then the report, then Confirm and Cancel.
//   initial: { from, to, report }; onSave(values) async (throws a message
//   to show); onCancel(); scrollIntoView: scroll to it as it opens (Edit)
export function IntegrationForm({ initial, onSave, onCancel, scrollIntoView = false }) {
    // (holds the pop-up while it's open: see formLock.js)
    useFormLock();
    // Editing in a list: brought fully into view as it opens
    const formRef = useScrollIntoView(scrollIntoView);
    const [values, setValues] = useState(initial);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const report = values.report.trim();
    const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });

    async function confirm() {
        if (!values.from || !values.to) return setProblem("Please choose both dates.");
        if (values.to < values.from) return setProblem("The end date can't be before the start date.");
        if (!report) return setProblem("Please write the report.");
        setBusy(true);
        setProblem(null);
        try {
            await onSave({ from: values.from, to: values.to, report });
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
        }
    }

    return (
        <div className="Integration-form" ref={formRef}>
            <div className="Integration-dates">
                <label>
                    <span>Date Start</span>
                    <input type="date" value={values.from} max={values.to || undefined} onChange={set("from")} />
                </label>
                <label>
                    <span>Date End</span>
                    <input type="date" value={values.to} min={values.from || undefined} onChange={set("to")} />
                </label>
            </div>
            <label>
                <span>Integration Report</span>
                <textarea
                    rows={5}
                    value={values.report}
                    maxLength={MAX_REPORT}
                    onChange={set("report")}
                    placeholder="How is the integration going?"
                />
            </label>
            <span className="Integration-count">
                {values.report.length} / {MAX_REPORT}
            </span>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            <div className="Integration-actions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={confirm}>
                    {busy ? "Saving…" : "Confirm"}
                </button>
                <button type="button" className="Modal-edit is-quiet" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
