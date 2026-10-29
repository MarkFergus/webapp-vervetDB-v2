import { useEffect, useRef, useState } from "react";
import { IconArrowLeft, IconCirclePlus, IconPencil, IconTrash } from "@tabler/icons-react";
import { supabase } from "./supabase";
import { dayLabel } from "./MyChanges";
import "./MyChanges.css";
import "./RecentEdits.css";

// Recent Edits (staff): what's been changed on a monkey's profile in the
// last 7 days, and by whom, newest first (supabase/latest-news.sql). Opened
// from the pop-up's clock button, over the pop-up; ← Back returns to it.
// The same look as the account's Changelog (MyChanges.jsx).

const DAYS = 7;

const KINDS = {
    added: { icon: IconCirclePlus, word: "Added" },
    changed: { icon: IconPencil, word: "Edited" },
    deleted: { icon: IconTrash, word: "Deleted" },
};

const timeText = (date) => date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

function RecentEdits({ monkey, onClose }) {
    // null while loading; then { edits } or { problem }
    const [result, setResult] = useState(null);
    const backRef = useRef(null);

    useEffect(() => {
        backRef.current?.focus();
    }, []);

    useEffect(() => {
        let cancelled = false;
        setResult(null);
        supabase.rpc("monkey_recent_edits", { monkey: monkey.id, days: DAYS }).then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                console.error("Couldn't load the recent edits:", error);
                setResult({ problem: "Couldn't load the recent edits right now. Please try again in a moment." });
            } else {
                setResult({ edits: data ?? [] });
            }
        });
        return () => {
            cancelled = true;
        };
    }, [monkey.id]);

    // Grouped by day
    const days = [];
    for (const edit of result?.edits ?? []) {
        const at = new Date(edit.changed_at);
        const label = dayLabel(at);
        if (days.at(-1)?.label !== label) days.push({ label, edits: [] });
        days.at(-1).edits.push({ ...edit, at });
    }

    return (
        <section className="RecentEdits" aria-labelledby="RecentEdits-title">
            <div className="RecentEdits-header">
                <button type="button" className="RecentEdits-back" onClick={onClose} ref={backRef}>
                    <IconArrowLeft size={18} aria-hidden="true" />
                    Back
                </button>
                <h2 id="RecentEdits-title" className="RecentEdits-title">
                    Recent Edits <span>· {monkey.name}</span>
                </h2>
            </div>
            <p className="RecentEdits-intro">Changes to this profile in the last {DAYS} days.</p>
            <div className="RecentEdits-body">
                {!result && (
                    <p className="MyChanges-note is-loading" role="status">
                        Loading the recent edits…
                    </p>
                )}
                {result?.problem && (
                    <p className="MyChanges-problem" role="alert">
                        {result.problem}
                    </p>
                )}
                {result?.edits && !result.edits.length && (
                    <p className="MyChanges-note">No edits in the last {DAYS} days.</p>
                )}
                {days.length > 0 && (
                    <div className="MyChanges RecentEdits-list">
                        {days.map((day) => (
                            <section key={day.label} className="MyChanges-day">
                                <h3 className="MyChanges-dayLabel">{day.label}</h3>
                                <ul className="MyChanges-list">
                                    {day.edits.map((edit, i) => {
                                        const kind = KINDS[edit.kind] ?? KINDS.changed;
                                        const Icon = kind.icon;
                                        return (
                                            <li key={i} className={`MyChanges-item is-${edit.kind}`}>
                                                <span className="MyChanges-icon" aria-hidden="true">
                                                    <Icon stroke={2} size={16} />
                                                </span>
                                                <div className="MyChanges-body">
                                                    <p className="MyChanges-heading">
                                                        <span className="MyChanges-kind">{kind.word}</span>
                                                        {edit.changed_by && <span className="MyChanges-troop">by {edit.changed_by}</span>}
                                                        <span className="MyChanges-time">{timeText(edit.at)}</span>
                                                    </p>
                                                    <ul className="MyChanges-lines">
                                                        {edit.lines?.length ? (
                                                            edit.lines.map((line, j) => <li key={j}>{line}</li>)
                                                        ) : (
                                                            // (a detail the history doesn't put into words)
                                                            <li>Other details</li>
                                                        )}
                                                    </ul>
                                                </div>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

export default RecentEdits;
