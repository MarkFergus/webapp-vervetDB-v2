import { useEffect, useState } from "react";
import { useAuth } from "./auth";
import PastReports from "./PastReports";
import { loadWeeklySettings, saveWeeklySettings } from "./monkeyData";
import { DAYS, DEFAULT_SETTINGS, SECTIONS, hourText, nextReport, weekRunsText } from "./weeklyReportRules";
import "./MaintenanceRecordsPage.css";
import "./WeeklyReports.css";

// Weekly Reports (Admin Dashboard → Weekly Reports, #admin/reports): your
// own weekly report email (weeklyReportRules.js): on or off, the days your week
// runs, when it's emailed, and what's in it. Each admin sets their own.
// Then Past Reports (PastReports.jsx): any week's report.

// Monday first, as the week usually runs
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const HOURS = Array.from({ length: 24 }, (_, h) => h);

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function WeeklyReports() {
    const { user } = useAuth();
    // null: loading; { problem }: couldn't load
    const [saved, setSaved] = useState(null);
    const [form, setForm] = useState(DEFAULT_SETTINGS);
    // null, "saving", "saved" or { problem }
    const [status, setStatus] = useState(null);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        loadWeeklySettings(user.id)
            .then((settings) => {
                if (cancelled) return;
                setSaved(settings ?? DEFAULT_SETTINGS);
                setForm(settings ?? DEFAULT_SETTINGS);
            })
            .catch((error) => !cancelled && setSaved({ problem: error.message }));
        return () => {
            cancelled = true;
        };
    }, [user]);

    if (saved === null) return <p className="Admin-note">Loading…</p>;
    if (saved.problem) return <p className="Admin-note is-error">{saved.problem}</p>;

    const change = (values) => {
        setForm((f) => ({ ...f, ...values }));
        setStatus(null);
    };
    const toggleSection = (id) =>
        change({
            sections: SECTIONS.map((s) => s.id).filter((s) =>
                s === id ? !form.sections.includes(id) : form.sections.includes(s)
            ),
        });
    const changed = !same(form, saved);

    async function save() {
        if (form.enabled && !form.sections.length) return setStatus({ problem: "Please tick at least one section to include." });
        setStatus("saving");
        try {
            await saveWeeklySettings(user.id, form);
            setSaved(form);
            setStatus("saved");
        } catch (error) {
            setStatus({ problem: error.message });
        }
    }

    return (
        <>
            <section className="Admin-card Weekly" aria-labelledby="Weekly-title">
                <h2 id="Weekly-title">Weekly Report Email</h2>
                <p className="Admin-note">
                    A summary of your week, emailed to <b>{user.email}</b>. Only you see these settings.
                </p>

                <div className="MaintenancePage-types" role="group" aria-label="Weekly Report Email">
                    <button type="button" aria-pressed={!form.enabled} onClick={() => change({ enabled: false })}>
                        Off
                    </button>
                    <button type="button" aria-pressed={form.enabled} onClick={() => change({ enabled: true })}>
                        On
                    </button>
                </div>

                <div className="Weekly-fields">
                    <label className="Weekly-field">
                        <span>My Week Runs</span>
                        <select
                            value={form.weekStarts}
                            onChange={(e) => change({ weekStarts: Number(e.target.value) })}
                        >
                            {DAY_ORDER.map((d) => (
                                <option key={d} value={d}>
                                    {weekRunsText(d)}
                                </option>
                            ))}
                        </select>
                    </label>
                    <div className="Weekly-field" role="group" aria-labelledby="Weekly-sendOn">
                        <span id="Weekly-sendOn">Send On</span>
                        <div className="Weekly-when">
                            <select
                                aria-label="Send day"
                                value={form.sendDay}
                                onChange={(e) => change({ sendDay: Number(e.target.value) })}
                            >
                                {DAY_ORDER.map((d) => (
                                    <option key={d} value={d}>
                                        {DAYS[d]}
                                    </option>
                                ))}
                            </select>
                            <select
                                aria-label="Send time"
                                value={form.sendHour}
                                onChange={(e) => change({ sendHour: Number(e.target.value) })}
                            >
                                {HOURS.map((h) => (
                                    <option key={h} value={h}>
                                        {hourText(h)}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
                <p className="Weekly-next">
                    {form.enabled ? <>Next email: {nextReport(form).text}</> : "Off: no emails are sent."}
                </p>

                <fieldset className="Weekly-include">
                    <legend>Include</legend>
                    {SECTIONS.map((s) => (
                        <label key={s.id} className="Weekly-section">
                            <input
                                type="checkbox"
                                checked={form.sections.includes(s.id)}
                                onChange={() => toggleSection(s.id)}
                            />
                            <span>
                                <b>{s.title}</b>
                                <span className="Weekly-sub">{s.sub}</span>
                            </span>
                        </label>
                    ))}
                </fieldset>
                <p className="Admin-note">
                    Each section lists that week's records by their dates, then anything missing, such as a troop not
                    monitored or a day with no milk total.
                </p>

                {status?.problem && (
                    <p className="Admin-note is-error" role="alert">
                        {status.problem}
                    </p>
                )}
                <div className="Weekly-actions">
                    {/* Saved! while the settings are as saved; Save once anything changes */}
                    <button
                        type="button"
                        className="Modal-edit is-confirm"
                        disabled={status === "saving"}
                        onClick={() => changed && save()}
                    >
                        {status === "saving" ? "Saving…" : changed ? "Save" : "Saved!"}
                    </button>
                </div>
            </section>
            {/* (your saved week: a new one starts the weeks again) */}
            <PastReports key={saved.weekStarts} weekStarts={saved.weekStarts} sections={saved.sections} />
        </>
    );
}
