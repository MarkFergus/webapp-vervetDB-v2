// A monkey's Timeline (MonkeyTimeline.jsx): everything on record about them as
// one story, newest first, by month, and how they are right now.
import { DEWORMERS } from "./dewormingRules";
import { INTEGRATION_KINDS } from "./integrations";
import { updateNeeded } from "./injuryRules";
import { seenDaily, sightingRecord } from "./monitoringRules";
import { fullName, placeLabel } from "./places";
import { ARRIVAL_REASONS } from "./arrival";
import { isPlaceholderPhoto } from "./photoPaths";

// A photo's file name has its upload time ("maggie-1759240000000.webp"), but
// those before this day were all moved over in bulk, so their times don't say
// when they were really added: left off
const PHOTO_DATES_FROM = "2026-10-06";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "2026-11-05" → "Thu 5 Nov" (another year: "Thu 5 Nov 2024")
export function dayWords(date, thisYear = new Date().getFullYear()) {
    const [y, m, d] = date.split("-").map(Number);
    const day = `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${SHORT_MONTHS[m - 1]}`;
    return y === thisYear ? day : `${day} ${y}`;
}

// Grams up to 1 kg, then kg to 2 decimals: "850 g", "2.14 kg"
export const weightText = (grams) =>
    Math.abs(grams) < 1000 ? `${Math.abs(grams).toLocaleString("en-GB")} g` : `${(Math.abs(grams) / 1000).toFixed(2)} kg`;
// "+85 g", "−1.20 kg", "±0 g"
export const weightChange = (grams) => `${grams > 0 ? "+" : grams < 0 ? "−" : "±"}${weightText(grams)}`;

// Their latest Deworming record → { dewormer, date }, or null. (The dewormer's
// name if it's one we know, else the record's own words)
export function lastDeworming(records) {
    const latest = records.filter((r) => r.category === "deworming").sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!latest) return null;
    const known = DEWORMERS.find((d) => latest.details.includes(d.name));
    return { dewormer: known?.name ?? latest.details, date: latest.date };
}

const titleWords = (word) => word.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
// "Moved from A to B: why" → { words: "A to B", why }
const moveWords = (details) => {
    const match = /^(?:Moved|Home(?: location)? changed) from (.+?)(?:: ([\s\S]*))?$/.exec(details ?? "");
    return match ? { words: match[1], why: match[2] ?? null } : { words: details, why: null };
};

function recordEntry(r) {
    const base = { id: `record-${r.id}`, date: r.date, text: r.details, by: r.loggedByName ?? null };
    if (r.category === "movement") {
        const home = /^Home/.test(r.details ?? "");
        const { words, why } = moveWords(r.details);
        return {
            ...base,
            kind: home ? "home" : "move",
            label: home ? "Home Changed" : "Moved",
            filters: home ? ["moves", "milestones"] : ["moves"],
            text: words,
            note: why,
        };
    }
    if (r.category === "status") return { ...base, kind: "status", label: "Status Change", filters: ["milestones"] };
    if (r.category === "deworming") return { ...base, kind: "deworming", label: "Deworming", filters: ["medical"] };
    if (r.category === "observation") {
        return { ...base, kind: "observation", label: "Observation", filters: r.section === "medical" ? ["medical"] : ["seen"] };
    }
    return {
        ...base,
        kind: r.section === "medical" ? "medical" : "other",
        label: titleWords(r.category),
        filters: r.section === "medical" ? ["medical"] : [],
    };
}

const injuryEntry = (i) => ({
    id: `injury-${i.id}`,
    date: i.date,
    kind: "injury",
    label: i.healedOn ? `Injury · Healed ${dayWords(i.healedOn)}` : "Injury · Current",
    filters: ["medical"],
    text: i.description,
    by: i.loggedByName ?? null,
    updates: [...(i.updates ?? [])]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((u) => ({ id: u.id, date: u.date, text: u.details, by: u.loggedByName ?? null })),
});

const conditionEntry = (c) => ({
    id: `condition-${c.id}`,
    date: c.date,
    kind: "condition",
    label: "Condition",
    filters: ["medical"],
    text: c.description,
    by: c.loggedByName ?? null,
});

// Each integration: when it started, and when it finished
function integrationEntries(integration) {
    const kind = (INTEGRATION_KINDS[integration.kind] ?? integration.kind ?? "").toLowerCase();
    const entry = (when, label, verb) => ({
        id: `integration-${integration.id}-${label}`,
        date: when,
        kind: "integration",
        label,
        filters: ["milestones"],
        text: `${verb} ${kind} integration${integration.place ? ` at ${integration.place}` : ""}`,
        by: integration.loggedByName ?? null,
    });
    const list = [entry(integration.startedOn, "Integration Started", "Started")];
    if (integration.status === "completed" && integration.statusOn) list.push(entry(integration.statusOn, "Integration Finished", "Completed"));
    if (integration.status === "cancelled" && integration.statusOn) list.push(entry(integration.statusOn, "Integration Cancelled", "Cancelled"));
    return list;
}

// One a month: the month's last weight, and the change since the one before.
// (The first ever: with their arrival, when there is one)
function weightEntries(weights, hasArrival) {
    const sorted = [...weights].sort((a, b) => a.date.localeCompare(b.date));
    const lastOfMonth = sorted.filter((w, i) => w.date.slice(0, 7) !== sorted[i + 1]?.date.slice(0, 7));
    return lastOfMonth
        .filter((w) => !(hasArrival && w === sorted[0]))
        .map((w) => {
            const before = lastOfMonth[lastOfMonth.indexOf(w) - 1];
            return {
                id: `weight-${w.date}`,
                date: w.date,
                kind: "weight",
                label: "Weight",
                filters: ["weights"],
                text: before ? `${weightText(w.value)} (${weightChange(w.value - before.value)})` : weightText(w.value),
            };
        });
}

// A month's sightings as one quiet line: "Seen in 6 sessions · 5 Oct – 29 Oct"
function seenEntries(sessions, spots, monkeyId) {
    const dates = [
        ...sessions.filter((s) => s.sightings.some((x) => x.monkeyId === monkeyId && x.seen)).map((s) => ({ date: s.date, session: true })),
        ...spots.filter((s) => s.monkeyId === monkeyId).map((s) => ({ date: s.date, session: false })),
    ];
    const months = new Map();
    for (const d of dates) {
        const key = d.date.slice(0, 7);
        months.set(key, [...(months.get(key) ?? []), d]);
    }
    return [...months].map(([key, list]) => {
        const sorted = list.map((d) => d.date).sort();
        const short = (date) => dayWords(date).replace(/^\w+ /, "");
        const sessionCount = list.filter((d) => d.session).length;
        const others = list.length - sessionCount;
        const parts = [
            sessionCount && `in ${sessionCount} ${sessionCount === 1 ? "session" : "sessions"}`,
            others && `${others} other ${others === 1 ? "time" : "times"}`,
        ].filter(Boolean);
        const when = sorted[0] === sorted.at(-1) ? short(sorted[0]) : `${short(sorted[0])} – ${short(sorted.at(-1))}`;
        return {
            id: `seen-${key}`,
            date: sorted.at(-1),
            kind: "seen",
            filters: ["seen"],
            quiet: true,
            text: `Seen ${parts.join(" and ")} · ${when}`,
        };
    });
}

// Photos added: one entry a day, from their upload time
function photoEntries(monkey) {
    const days = new Map();
    for (const url of monkey.img ?? []) {
        if (isPlaceholderPhoto(url)) continue;
        const stamp = /-(\d{13})\.[a-z]+$/.exec(url)?.[1];
        if (!stamp) continue;
        const day = new Date(Number(stamp)).toISOString().slice(0, 10);
        if (day >= PHOTO_DATES_FROM) days.set(day, [...(days.get(day) ?? []), url]);
    }
    return [...days].map(([date, photos]) => ({
        id: `photos-${date}`,
        date,
        kind: "photos",
        label: "Photos Added",
        filters: ["milestones"],
        photos,
        text: null,
    }));
}

function arrivalEntry(monkey, weights) {
    if (!monkey.arrivalDate) return null;
    const first = [...weights].sort((a, b) => a.date.localeCompare(b.date))[0];
    return {
        id: "arrival",
        date: monkey.arrivalDate,
        kind: "arrival",
        label: "Arrived",
        filters: ["milestones", "moves"],
        text: ARRIVAL_REASONS[monkey.arrivalReason] ?? null,
        note: first ? `Arrival Weight: ${weightText(first.value)}` : null,
    };
}

// The story, newest first: [{ key, title ("October 2026"), entries }]
//   data: { records, injuries, conditions, integrations, weights, sessions, spots }
export function timelineMonths(monkey, { records = [], injuries = [], conditions = [], integrations = [], weights = [], sessions = [], spots = [] }) {
    const arrival = arrivalEntry(monkey, weights);
    const entries = [
        ...records.map(recordEntry),
        ...injuries.map(injuryEntry),
        ...conditions.map(conditionEntry),
        ...integrations.flatMap(integrationEntries),
        ...weightEntries(weights, Boolean(arrival)),
        ...seenEntries(sessions, spots, monkey.id),
        ...photoEntries(monkey),
        ...(arrival ? [arrival] : []),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const months = [];
    for (const entry of entries) {
        const key = entry.date.slice(0, 7);
        if (months.at(-1)?.key !== key) {
            const [y, m] = key.split("-").map(Number);
            months.push({ key, title: `${MONTHS[m - 1]} ${y}`, entries: [] });
        }
        months.at(-1).entries.push(entry);
    }
    return months;
}

// Right Now: [{ label, text, alert? }], only what's known. next: their next
// deworming ({ date, session words }) or null
export function rightNow(monkey, { records = [], injuries = [], weights = [], sessions = [], spots = [], lastMove = null, next = null }, today) {
    const rows = [];
    const newestFirst = [...sessions]
        .filter((s) => s.sightings.some((x) => x.monkeyId === monkey.id))
        .sort((a, b) => b.date.localeCompare(a.date));
    const daily = seenDaily(monkey);
    const { lastSeen, spot } = sightingRecord(newestFirst, monkey.id, spots, { daily, back: lastMove, today });
    const duringMonitoring = !daily && !spot && newestFirst.some((s) => s.date === lastSeen);
    rows.push({
        label: "Last Seen",
        text: lastSeen ? `${dayWords(lastSeen)}${duringMonitoring ? ", during monitoring" : ""}` : "Not seen during monitoring yet",
    });
    const where = monkey.inSickbay ? "Sickbay" : monkey.stay?.introcage ? fullName(monkey.stay.introcage) : placeLabel(monkey);
    rows.push({ label: "Where", text: where });
    for (const injury of injuries.filter((i) => !i.healedOn)) {
        const due = updateNeeded(injury, today);
        rows.push({
            label: "Current Injury",
            text: `${injury.description}${due ? ", update needed" : ""}`,
            alert: due,
        });
    }
    const latest = [...weights].sort((a, b) => b.date.localeCompare(a.date))[0];
    if (latest) rows.push({ label: "Latest Weight", text: `${weightText(latest.value)}, ${dayWords(latest.date)}` });
    const last = lastDeworming(records);
    rows.push({ label: "Last Deworming", text: last ? `${last.dewormer}, ${dayWords(last.date)}` : "None on record" });
    if (next) rows.push({ label: "Next Deworming", text: `${dayWords(next.date)}, ${next.words}` });
    return rows;
}
