import { useEffect, useState } from "react";
import {
    IconArrowRight,
    IconBandage,
    IconClipboardText,
    IconEye,
    IconFlag,
    IconHeartbeat,
    IconHome,
    IconPhoto,
    IconPill,
    IconScale,
    IconStar,
    IconUsers,
} from "@tabler/icons-react";
import { BackLink } from "./EnclosuresPage";
import { dayText } from "./babyRecords";
import { SESSIONS, dewormingGroups } from "./dewormingRules";
import { scheduleOf } from "./dewormingSchedule";
import {
    loadConditions,
    loadDewormingCalendar,
    loadDewormingSheets,
    loadInjuries,
    loadLastMoves,
    loadMonkeyIntegrations,
    loadMonkeyWeights,
    loadRecords,
    loadSpotSightings,
    loadTimelineSessions,
} from "./monkeyData";
import { monkeyPageHash } from "./monkeyLink";
import { fallbackTo } from "./photoFallback";
import { thumbUrl } from "./photoPaths";
import { fullName } from "./places";
import { dayWords, rightNow, timelineMonths } from "./timelineRules";
import "./EnclosuresPage.css";
import "./MonkeyTimeline.css";

// A monkey's Timeline (#monkeys/<name>/timeline, staff only, from the Full
// Profile's top icons): how they are right now, then everything on record as
// one story, newest first, by month. To read, not edit: records are entered and
// changed where they always are. (timelineRules.js: what goes in it)

const FILTERS = [
    { id: "all", label: "All" },
    { id: "medical", label: "Medical" },
    { id: "moves", label: "Moves" },
    { id: "weights", label: "Weights" },
    { id: "seen", label: "Seen" },
    { id: "milestones", label: "Milestones" },
];

const ICONS = {
    arrival: IconStar,
    condition: IconHeartbeat,
    deworming: IconPill,
    home: IconHome,
    injury: IconBandage,
    integration: IconUsers,
    medical: IconClipboardText,
    move: IconArrowRight,
    observation: IconEye,
    photos: IconPhoto,
    other: IconClipboardText,
    seen: IconEye,
    status: IconFlag,
    weight: IconScale,
};

// Their next deworming, from the Schedule: their group's soonest → { date, words }
function nextDeworming(monkey, monkeys, enclosures, calendar, sheets, today) {
    const groups = dewormingGroups(enclosures, monkeys);
    const group = groups.find((g) => g.monkeys.some((m) => m.monkey.id === monkey.id));
    if (!group) return null;
    const { due, unscheduled } = scheduleOf(calendar.events, groups, sheets, today);
    const planned = due.find((e) => e.groupKey === group.key && e.date >= today && (!e.sheet || e.sheet.status === "ready"));
    const words = (item) => `${fullName(group.name)} ${SESSIONS[item.session]}`;
    if (planned) return { date: planned.date, words: words(planned) };
    const estimate = unscheduled.find((u) => u.groupKey === group.key && u.date);
    return estimate ? { date: estimate.date, words: `${words(estimate)} (estimated)` } : null;
}

function Entry({ entry }) {
    const Icon = ICONS[entry.kind] ?? IconClipboardText;
    return (
        <li className={`Timeline-entry is-${entry.kind}${entry.quiet ? " is-quiet" : ""}`}>
            <span className="Timeline-dot" aria-hidden="true">
                <Icon size={18} />
            </span>
            {entry.quiet ? (
                <p className="Timeline-quiet">{entry.text}</p>
            ) : (
                <div className="Timeline-card">
                    <p className="Timeline-meta">
                        <span className="Timeline-kind">{entry.label}</span>
                        <span>{dayWords(entry.date)}</span>
                    </p>
                    {entry.text && <p className="Timeline-text">{entry.text}</p>}
                    {entry.note && <p className="Timeline-note">{entry.note}</p>}
                    {entry.photos && (
                        <div className="Timeline-photos">
                            {entry.photos.map((url) => (
                                <img key={url} src={thumbUrl(url)} alt="" loading="lazy" onError={fallbackTo(url)} />
                            ))}
                        </div>
                    )}
                    {entry.updates?.length > 0 && (
                        <ul className="Timeline-updates">
                            {entry.updates.map((u) => (
                                <li key={u.id}>
                                    <span>
                                        {dayWords(u.date)}
                                        {u.by ? ` · ${u.by}` : ""}
                                    </span>
                                    {u.text}
                                </li>
                            ))}
                        </ul>
                    )}
                    {entry.by && <p className="Timeline-by">{entry.by}</p>}
                </div>
            )}
        </li>
    );
}

export default function MonkeyTimeline({ monkey, monkeys = [], enclosures = [], inert }) {
    // null while loading; then { data, partial (something couldn't be loaded) }
    const [state, setState] = useState(null);
    const [filter, setFilter] = useState("all");
    const id = monkey?.id;

    useEffect(() => {
        if (id == null) return undefined;
        let cancelled = false;
        setState(null);
        const parts = {
            records: loadRecords(id),
            injuries: loadInjuries(id),
            conditions: loadConditions([id]),
            integrations: loadMonkeyIntegrations(id),
            weights: loadMonkeyWeights(id),
            sessions: loadTimelineSessions(id),
            spots: loadSpotSightings([id]),
            moves: loadLastMoves([id]),
            calendar: loadDewormingCalendar(),
            sheets: loadDewormingSheets(),
        };
        const names = Object.keys(parts);
        Promise.allSettled(Object.values(parts)).then((results) => {
            if (cancelled) return;
            const data = {};
            let partial = false;
            results.forEach((r, i) => {
                if (r.status === "fulfilled") data[names[i]] = r.value;
                else {
                    console.error(`Loading the Timeline's ${names[i]} failed:`, r.reason);
                    partial = true;
                }
            });
            setState({ data, partial });
        });
        return () => {
            cancelled = true;
        };
    }, [id]);

    if (!monkey) return null;
    const today = dayText(new Date());
    const back = <BackLink href={monkeyPageHash(monkey)} label="Back" />;
    if (!state) {
        return (
            <div className="Enclosures Timeline" inert={inert}>
                <div className="Enclosures-topRow">{back}</div>
                <p className="Timeline-none" role="status">
                    Loading…
                </p>
            </div>
        );
    }

    const { data, partial } = state;
    const next =
        data.calendar && data.sheets ? nextDeworming(monkey, monkeys, enclosures, data.calendar, data.sheets, today) : null;
    const now = rightNow(monkey, { ...data, lastMove: data.moves?.[id] ?? null, next }, today);
    const months = timelineMonths(monkey, { ...data, enclosures })
        .map((m) => ({ ...m, entries: m.entries.filter((e) => filter === "all" || e.filters.includes(filter)) }))
        .filter((m) => m.entries.length);

    return (
        <div className="Enclosures Timeline" inert={inert}>
            <div className="Enclosures-topRow">{back}</div>
            <h1 className="Timeline-title">{monkey.name}</h1>
            <p className="Timeline-sub">Timeline</p>
            {partial && (
                <p className="Timeline-problem" role="alert">
                    Some records couldn't be loaded, so this may not be the whole story. Please try again in a moment.
                </p>
            )}
            <section className="Timeline-now" aria-labelledby="Timeline-nowTitle">
                <h2 id="Timeline-nowTitle">Right Now</h2>
                {now.map((row, i) => (
                    <p key={i} className={row.alert ? "is-alert" : undefined}>
                        <b>{row.label}:</b> {row.text}
                    </p>
                ))}
            </section>
            <div className="Timeline-filters" role="group" aria-label="Show">
                {FILTERS.map((f) => (
                    <button key={f.id} type="button" aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                        {f.label}
                    </button>
                ))}
            </div>
            {months.length === 0 && <p className="Timeline-none">Nothing on record here yet.</p>}
            {months.map((month) => (
                <section key={month.key} aria-label={month.title}>
                    <h3 className="Timeline-month">{month.title}</h3>
                    <ol className="Timeline-list">
                        {month.entries.map((entry) => (
                            <Entry key={entry.id} entry={entry} />
                        ))}
                    </ol>
                </section>
            ))}
        </div>
    );
}
