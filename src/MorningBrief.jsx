import { useEffect, useState } from "react";
import { IconMail } from "@tabler/icons-react";
import { emailMorningBrief, loadMorningBrief } from "./morningBriefData";
import "./WeeklyReports.css";

// The Morning Brief (#admin/brief, admins only while it's being tried out):
// today's brief, as the 06:50 email has it.
export default function MorningBrief() {
    // null while loading; then { brief } or { problem }
    const [state, setState] = useState(null);
    const [sending, setSending] = useState(false);
    // { sent: true } or { problem }
    const [email, setEmail] = useState(null);

    useEffect(() => {
        let cancelled = false;
        loadMorningBrief()
            .then((brief) => !cancelled && setState({ brief }))
            .catch((error) => {
                console.error("Loading the Morning Brief failed:", error);
                if (!cancelled) setState({ problem: "Couldn't load the Morning Brief. Please try again in a moment." });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    async function send() {
        setSending(true);
        setEmail(null);
        try {
            await emailMorningBrief();
            setEmail({ sent: true });
        } catch (error) {
            setEmail({ problem: error.message });
        } finally {
            setSending(false);
        }
    }

    if (!state) return <p className="Admin-note" role="status">Loading…</p>;
    if (state.problem) return <p className="Admin-note is-error" role="alert">{state.problem}</p>;
    const { brief } = state;
    return (
        <section className="Admin-card Weekly" aria-label="Morning Brief">
            <h2>{brief.title}</h2>
            {brief.allClear && <p className="Admin-note">All clear ✓</p>}
            {brief.sections.map((section) => (
                <section key={section.id} className="Weekly-reportSection" aria-label={section.title}>
                    <h4>{section.title}</h4>
                    {section.groups.map((group) => (
                        <div key={group.title} className="Weekly-group">
                            <h5>{group.title}</h5>
                            <ul className="Weekly-lines">
                                {group.lines.map((line) => (
                                    <li key={line.text} className={line.alert ? "is-alert" : line.toDo ? "is-toDo" : undefined}>
                                        {line.text}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </section>
            ))}
            <div className="Weekly-actions">
                <button type="button" className="Modal-edit is-soft" disabled={sending} onClick={send}>
                    <IconMail size={16} aria-hidden="true" />
                    Email Me
                </button>
            </div>
            {email?.sent && <p className="Admin-note" role="status">Sent. It should arrive in a minute or so.</p>}
            {email?.problem && <p className="Admin-note is-error" role="alert">{email.problem}</p>}
        </section>
    );
}
