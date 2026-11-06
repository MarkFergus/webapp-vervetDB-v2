import { useState } from "react";
import { IconEye, IconMail } from "@tabler/icons-react";
import { emailMeWeeklyReport, loadWeeklyReport } from "./monkeyData";
import { SECTIONS, pastWeeks } from "./weeklyReportRules";

// Past Reports (Admin Dashboard → Weekly Reports): any week's report, the
// sections ticked: View (on the page) or
// Email Me (to your sign-in email, now: one a minute at most).
// The weeks run as your own do (My Week Runs, as saved).
//   weekStarts / sections: your saved settings (to start with)

// A week's report on the page: each section, its groups ("None this week"
// when empty), then what's missing in red
export function ReportView({ report }) {
    return (
        <article className="Weekly-report" aria-label={report.title}>
            <h3 className="Weekly-reportTitle">{report.title}</h3>
            {!report.ended && <p className="Admin-note">This week isn't over yet: only the days so far are checked.</p>}
            {report.sections.map((section) => (
                <section key={section.id} className="Weekly-reportSection" aria-label={section.title}>
                    <h4>{section.title}</h4>
                    {section.groups.map((group) => (
                        <div key={group.title} className="Weekly-group">
                            <h5>{group.title}</h5>
                            {group.table ? (
                                <div className="Weekly-tableWrap">
                                    <table className="Weekly-table">
                                        <thead>
                                            <tr>
                                                {group.table.head.map((h, i) => (
                                                    <th key={i} scope="col">
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {group.table.rows.map((row) => (
                                                <tr key={row[0]}>
                                                    {row.map((cell, i) =>
                                                        i === 0 ? (
                                                            <th key={i} scope="row">
                                                                {cell}
                                                            </th>
                                                        ) : (
                                                            <td key={i}>{cell}</td>
                                                        )
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : group.lines.length ? (
                                <ul className="Weekly-lines">
                                    {group.lines.map((line, i) => (
                                        <li key={i} className={line.alert ? "is-alert" : undefined}>
                                            {line.text}
                                            {line.sub?.map((sub, j) => (
                                                <span key={j} className="Weekly-lineSub">
                                                    {sub}
                                                </span>
                                            ))}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="Weekly-none">None this week</p>
                            )}
                        </div>
                    ))}
                    {section.missing.length > 0 && (
                        <div className="Weekly-missing" role="group" aria-label={`${section.title}: Missing`}>
                            <h5>Missing</h5>
                            <ul>
                                {section.missing.map((m) => (
                                    <li key={m}>{m}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </section>
            ))}
        </article>
    );
}

export default function PastReports({ weekStarts, sections: savedSections }) {
    const weeks = pastWeeks(weekStarts);
    // (last week to start with: the latest that's over)
    const [from, setFrom] = useState(weeks[1].from);
    const [sections, setSections] = useState(savedSections.length ? savedSections : SECTIONS.map((s) => s.id));
    // null, "loading", "emailing", { report } (to show), { sentTo } or
    // { problem }
    const [state, setState] = useState(null);

    const toggle = (id) => {
        setSections((list) =>
            SECTIONS.map((s) => s.id).filter((s) => (s === id ? !list.includes(id) : list.includes(s)))
        );
        setState(null);
    };

    async function view() {
        setState("loading");
        try {
            setState({ report: await loadWeeklyReport(from, sections) });
        } catch (error) {
            setState({ problem: error.message });
        }
    }

    async function emailMe() {
        setState("emailing");
        try {
            setState({ sentTo: await emailMeWeeklyReport(from, sections) });
        } catch (error) {
            setState({ problem: error.message });
        }
    }

    const busy = state === "loading" || state === "emailing";
    return (
        <section className="Admin-card Weekly" aria-labelledby="Past-title">
            <h2 id="Past-title">Past Reports</h2>
            <p className="Admin-note">Any week's report, to look at, keep as a PDF or email to yourself.</p>
            <div className="Weekly-fields">
                <label className="Weekly-field">
                    <span>Week</span>
                    <select
                        value={from}
                        onChange={(e) => {
                            setFrom(e.target.value);
                            setState(null);
                        }}
                    >
                        {weeks.map((w) => (
                            <option key={w.from} value={w.from}>
                                {w.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <fieldset className="Weekly-include">
                <legend>Include</legend>
                <div className="Weekly-ticks">
                    {SECTIONS.map((s) => (
                        <label key={s.id}>
                            <input type="checkbox" checked={sections.includes(s.id)} onChange={() => toggle(s.id)} />
                            {s.title}
                        </label>
                    ))}
                </div>
            </fieldset>
            {state?.problem && (
                <p className="Admin-note is-error" role="alert">
                    {state.problem}
                </p>
            )}
            <div className="Weekly-actions">
                <button type="button" className="Modal-edit is-blue" disabled={busy || !sections.length} onClick={view}>
                    <IconEye size={16} aria-hidden="true" />
                    {state === "loading" ? "Loading…" : "View"}
                </button>
                <button
                    type="button"
                    className="Modal-edit is-soft"
                    disabled={busy || !sections.length}
                    onClick={emailMe}
                >
                    <IconMail size={16} aria-hidden="true" />
                    {state === "emailing" ? "Sending…" : "Email Me"}
                </button>
            </div>
            {state?.sentTo && (
                <p className="Weekly-saved Weekly-sent" role="status">
                    Sent to {state.sentTo}. It should arrive in a minute or two.
                </p>
            )}
            {state?.report && <ReportView report={state.report} />}
        </section>
    );
}
