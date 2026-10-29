import { useEffect, useState } from "react";
import { IconArrowsExchange, IconFirstAidKit, IconFlag, IconSparkles, IconTrees } from "@tabler/icons-react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";
import { dayLabel } from "./MyChanges";
import { fullName } from "./places";
import "./LatestNewsPage.css";

// Latest News (#news, in the menu): what's happened at the sanctuary in
// the last 48 hours, 7 days or 2 weeks, newest first, by day
// (supabase/latest-news.sql): new arrivals, releases, other status
// changes, moves and new injuries. Visitors get the arrivals and releases
// only; staff everything, with the details.

export const PERIODS = [
    { days: 2, label: "48 Hours" },
    { days: 7, label: "7 Days" },
    { days: 14, label: "2 Weeks" },
];

const PERIOD_KEY = "vervetdb-news-period";

// How each kind of news looks: its icon and its words
const KINDS = {
    arrival: { icon: IconSparkles, word: "New Arrival" },
    released: { icon: IconTrees, word: "Released to the Wild" },
    status: { icon: IconFlag, word: "Status Change" },
    movement: { icon: IconArrowsExchange, word: "Moved" },
    injury: { icon: IconFirstAidKit, word: "New Injury" },
};

// "2026-10-29" → that day, in the browser's own time
const localDay = (text) => {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
};

function savedPeriod() {
    try {
        const days = Number(localStorage.getItem(PERIOD_KEY));
        return PERIODS.some((p) => p.days === days) ? days : 7;
    } catch {
        return 7;
    }
}

//   monkeys: the monkeys at the sanctuary (a news item's name opens its
//   pop-up, if it's one of them); onOpenMonkey(monkey)
function LatestNewsPage({ monkeys = [], onOpenMonkey, inert = false }) {
    const { user, role, ready } = useAuth();
    const staff = Boolean(user && role);
    const [days, setDays] = useState(savedPeriod);
    // null while loading; then { news } or { problem }
    const [result, setResult] = useState(null);

    function choose(next) {
        setDays(next);
        try {
            localStorage.setItem(PERIOD_KEY, String(next));
        } catch {
            // Not remembered this time
        }
    }

    useEffect(() => {
        if (!ready) return undefined;
        let cancelled = false;
        setResult(null);
        supabase.rpc("latest_news", { days }).then(({ data, error }) => {
            if (cancelled) return;
            if (error) {
                console.error("Couldn't load the latest news:", error);
                setResult({ problem: "Couldn't load the latest news right now. Please try again in a moment." });
            } else {
                setResult({ news: data ?? [] });
            }
        });
        return () => {
            cancelled = true;
        };
        // (again when someone signs in or out: staff see more)
    }, [days, ready, user?.id]);

    const byId = new Map(monkeys.map((m) => [m.id, m]));
    const period = PERIODS.find((p) => p.days === days);

    // Grouped by day
    const groups = [];
    for (const item of result?.news ?? []) {
        const label = dayLabel(localDay(item.happened_on));
        if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
        groups.at(-1).items.push(item);
    }

    return (
        <div className="LatestNews" inert={inert}>
            <h1 className="LatestNews-title">Latest News</h1>
            <p className="LatestNews-intro">
                {staff
                    ? "New arrivals, releases, status changes, moves and new injuries, newest first."
                    : "New arrivals and releases at the sanctuary, newest first."}
            </p>
            <div className="LatestNews-periods" role="group" aria-label="Show the last">
                {PERIODS.map((p) => (
                    <button
                        key={p.days}
                        type="button"
                        className="LatestNews-period"
                        aria-pressed={p.days === days}
                        onClick={() => choose(p.days)}
                    >
                        {p.label}
                    </button>
                ))}
            </div>

            {!result && (
                <p className="LatestNews-note is-loading" role="status">
                    Loading the latest news…
                </p>
            )}
            {result?.problem && (
                <p className="LatestNews-problem" role="alert">
                    {result.problem}
                </p>
            )}
            {result?.news && !result.news.length && (
                <p className="LatestNews-note">Nothing new in the last {period.label.toLowerCase()}.</p>
            )}

            {groups.map((group) => (
                <section key={group.label} className="LatestNews-day">
                    <h2 className="LatestNews-dayLabel">{group.label}</h2>
                    <ul className="LatestNews-list">
                        {group.items.map((item, i) => {
                            const kind = KINDS[item.kind] ?? KINDS.status;
                            const Icon = kind.icon;
                            const monkey = byId.get(item.monkey_id);
                            return (
                                <li key={i} className={`LatestNews-item is-${item.kind}`}>
                                    <span className="LatestNews-icon" aria-hidden="true">
                                        <Icon stroke={2} size={18} />
                                    </span>
                                    <div className="LatestNews-body">
                                        <p className="LatestNews-heading">
                                            <span className="LatestNews-kind">{kind.word}</span>
                                            {/* (still at the sanctuary: tap for its pop-up) */}
                                            {monkey && onOpenMonkey ? (
                                                <button
                                                    type="button"
                                                    className="LatestNews-name"
                                                    onClick={() => onOpenMonkey(monkey)}
                                                >
                                                    {item.name}
                                                </button>
                                            ) : (
                                                <span className="LatestNews-name">{item.name}</span>
                                            )}
                                            {item.place && <span className="LatestNews-place">{fullName(item.place)}</span>}
                                        </p>
                                        {item.details && <p className="LatestNews-details">{item.details}</p>}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            ))}

            {!staff && result?.news && (
                <p className="LatestNews-note LatestNews-signIn">Staff: sign in to see moves, injuries and status changes too.</p>
            )}
        </div>
    );
}

export default LatestNewsPage;
