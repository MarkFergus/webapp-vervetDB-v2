import { useEffect, useState } from "react";
import { IconCirclePlus, IconPencil, IconTool, IconTrash } from "@tabler/icons-react";
import { supabase } from "./supabase";
import "./MyChanges.css";

// The changelog: the signed-in person's own recent changes, newest first
// (supabase/enclosure-history.sql): monkeys and enclosures added, changed
// or deleted, and maintenance logged. Shown in the account pop-up for now, until there's
// an account page.

const MAX_ROWS = 50;

// How each kind of change looks: its icon, its word and its colour
const KINDS = {
    added: { icon: IconCirclePlus, word: "Added" },
    changed: { icon: IconPencil, word: "Changed" },
    deleted: { icon: IconTrash, word: "Deleted" },
    maintenance: { icon: IconTool, word: "Maintenance" },
};

// Shown beside an enclosure's name (monkeys show their troop instead)
const SUBJECTS = { enclosure: "Enclosure", introcage: "Introcage" };

// "Today", "Yesterday", or e.g. "3 October 2026"
export function dayLabel(date, now = new Date()) {
    const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysAgo = Math.round((day(now) - day(date)) / 86400000);
    if (daysAgo === 0) return "Today";
    if (daysAgo === 1) return "Yesterday";
    return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

const timeText = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function MyChanges() {
    // null while loading; then { changes } or { problem }
    const [result, setResult] = useState(null);

    useEffect(() => {
        let cancelled = false;
        supabase
            .rpc("my_changes", { max_rows: MAX_ROWS })
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) {
                    console.error("Couldn't load the changelog:", error);
                    setResult({ problem: "Couldn't load your changes right now. Please try again in a moment." });
                } else {
                    setResult({ changes: data ?? [] });
                }
            });
        return () => {
            cancelled = true;
        };
    }, []);

    if (!result) {
        return (
            <p className="MyChanges-note is-loading" role="status">
                Loading your changes…
            </p>
        );
    }
    if (result.problem) {
        return (
            <p className="MyChanges-problem" role="alert">
                {result.problem}
            </p>
        );
    }
    if (!result.changes.length) {
        return <p className="MyChanges-note">No changes yet. Monkeys you edit and maintenance you log will show here.</p>;
    }

    // Grouped by day
    const days = [];
    for (const change of result.changes) {
        const at = new Date(change.changed_at);
        const label = dayLabel(at);
        if (days.at(-1)?.label !== label) days.push({ label, changes: [] });
        days.at(-1).changes.push({ ...change, at });
    }

    return (
        <div className="MyChanges">
            {days.map((day) => (
                <section key={day.label} className="MyChanges-day">
                    <h2 className="MyChanges-dayLabel">{day.label}</h2>
                    <ul className="MyChanges-list">
                        {day.changes.map((change, i) => {
                            const kind = KINDS[change.kind] ?? KINDS.changed;
                            const Icon = kind.icon;
                            return (
                                <li key={i} className={`MyChanges-item is-${change.kind}`}>
                                    <span className="MyChanges-icon" aria-hidden="true">
                                        <Icon stroke={2} size={16} />
                                    </span>
                                    <div className="MyChanges-body">
                                        <p className="MyChanges-heading">
                                            <span className="MyChanges-kind">{kind.word}</span> {change.title}
                                            {/* a monkey's troop, or "Enclosure" / "Introcage" */}
                                            {(change.troop || SUBJECTS[change.subject]) && (
                                                <span className="MyChanges-troop">
                                                    {" "}
                                                    ({change.troop || SUBJECTS[change.subject]})
                                                </span>
                                            )}
                                            <span className="MyChanges-time">{timeText(change.at)}</span>
                                        </p>
                                        {change.lines?.length > 0 && (
                                            <ul className="MyChanges-lines">
                                                {change.lines.map((line, j) => (
                                                    <li key={j}>{line}</li>
                                                ))}
                                            </ul>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}
            {result.changes.length === MAX_ROWS && (
                <p className="MyChanges-note">Showing your latest {MAX_ROWS} changes.</p>
            )}
        </div>
    );
}

export default MyChanges;
