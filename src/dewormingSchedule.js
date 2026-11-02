// Deworming's Schedule (Records → Sections → Deworming → Schedule): the
// dewormings planned in Outlook (supabase/deworming-calendar.sql fetches
// its events), read into groups and sessions, with what's due and what's
// overdue.
//
// Outlook's titles, as written there:
//   "Gismo 6m deworming"           a troop (its name, as in vervetDB)
//   "Robert 3m F/U deworming"      a follow-up
//   "Top Section IC 6m deworming"  a section's introcages
//   "Top & Middle IC 3m deworming", "H&B & Jala 6m deworming",
//   "Global & James 6m deworming", "H&B/Jala 3m deworming"
//                                  groups done together: each one's own
//   "Global 3m + James 3m F/U deworming", "Gismo 3m, Royal 6m deworming"
//                                  together, each its own session
// The only short names: D&D, H&B (troops' own names), Jala (Jalamango),
// IC (a section's introcages), 3m, 6m ("3-month", "6 Month" too). A title
// without a session ("Bobo deworming": a special one) is left out; one
// with a session that can't be read → Couldn't Read (for admins, never
// guessed). Words after "deworming" ("due
// this week") don't matter, and a deworming entered over several days
// counts once, from its first day.

import { isFollowUp, sessionAfter } from "./dewormingRules";

// Deworming lists started in vervetDB on this day: dates before it were
// done on paper, so never overdue
export const OVERDUE_FROM = "2026-11-02";

// A list counts for an Outlook date when it starts within 2 weeks of it
export const MATCH_DAYS = 14;
// A passed date moved later in Outlook (within 2 months): not overdue
const RESCHEDULE_DAYS = 60;
// The same deworming entered day by day (often ~5 days, "… due this
// week"): one, on its first day
const SAME_DEWORMING_DAYS = 7;

// "6m F/U" → "6_month_fu"
// (the session: "3m", "3-month", "6 Month", "6months")
const SESSION = String.raw`([36])\s*-?\s*(?:m|months?)\b`;
const TITLE = new RegExp(String.raw`^(.+?)\s+${SESSION}(\s*F\/?U)?\s+deworm`, "i");
const HAS_SESSION = new RegExp(SESSION, "i");
const ALIASES = { jala: "jalamango" };
const IC_WORDS = /\s+(section\s+)?ics?$/i;

// A title → { groupKeys, session }, or null (not read)
//   groups: dewormingGroups' (key, name: "D&D Troop", "Top Section ICs")
export function readTitle(title, groups) {
    const match = TITLE.exec(title.trim());
    if (!match) return null;
    const session = `${match[2]}_month${match[3] ? "_fu" : ""}`;
    // (on a spaced "&" or a "/": "H&B" stays whole; "H&B/Jala" is both)
    const parts = match[1].split(/\s+&\s+|\s*\/\s*/).map((p) => p.trim());
    // ("Top & Middle IC": the IC goes with each)
    const introcages = IC_WORDS.test(parts.at(-1));
    const groupKeys = [];
    for (const part of parts) {
        const name = part.replace(IC_WORDS, "").trim().toLowerCase();
        const group = introcages
            ? groups.find((g) => g.key === `ics:${name.charAt(0).toUpperCase()}${name.slice(1)}`)
            : groups.find(
                  (g) =>
                      !g.key.startsWith("ics:") &&
                      g.name.replace(/ Troop$/, "").toLowerCase() === (ALIASES[name] ?? name)
              );
        if (!group) return null;
        groupKeys.push(group.key);
    }
    return { groupKeys: [...new Set(groupKeys)], session };
}

// "2026-11-02" plus days, or months → "2026-11-16"
function addTo(date, { days = 0, months = 0 }) {
    const [y, m, d] = date.split("-").map(Number);
    const day = new Date(Date.UTC(y, m - 1 + months, d + days));
    return day.toISOString().slice(0, 10);
}

// A F/U is due 14 days after its main deworming's last day; the next main
// 3 months after the last one started
const FOLLOW_UP_DAYS = 14;
const MAIN_MONTHS = 3;

// A whole title, its parts on "+" or "," each with their own session
// ("Global 3m + James 3m F/U deworming", "Gismo 3m, Royal 6m deworming") → [{ groupKeys, session }], or null if any
// part can't be read
export function readEvent(title, groups) {
    const head = /^(.*?)\s+deworm/i.exec(title.trim());
    if (!head) return null;
    const parts = head[1].split(/\s*,\s*|\s+\+\s+/).map((part) => readTitle(`${part} deworming`, groups));
    return parts.every(Boolean) ? parts : null;
}

// Days between two "YYYY-MM-DD" dates
const daysApart = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// The Schedule: Outlook's dewormings, read, against vervetDB's lists
//   events: [{ uid, title, startsOn }]; groups: dewormingGroups'; sheets:
//   the deworming lists; today: "YYYY-MM-DD"
//   → { due: [{ date, groupKey, groupName, session, sheet (its list, if
//        prepared) }], soonest first;
//       overdue: [{ date, groupKey, groupName, session }] (the date's
//        passed, no list for it, and not put on a later date);
//       unscheduled: [{ groupKey, groupName, session (next), date (when
//        it's due, or null: no past deworming found), late (overdue) }];
//       unread: [{ title, startsOn }] }
export function scheduleOf(events, groups, sheets, today, overdueFrom = OVERDUE_FROM) {
    const nameOf = Object.fromEntries(groups.map((g) => [g.key, g.name]));
    const listFor = (groupKey, session, date) =>
        sheets.find(
            (s) =>
                s.groupKey === groupKey && s.session === session && Math.abs(daysApart(s.startDate, date)) <= MATCH_DAYS
        ) ?? null;
    const entries = [];
    const unread = [];
    for (const event of events) {
        // (no session: a special deworming, not the schedule's)
        if (!HAS_SESSION.test(event.title)) continue;
        const parts = readEvent(event.title, groups);
        if (!parts) {
            unread.push({ title: event.title, startsOn: event.startsOn });
            continue;
        }
        for (const read of parts) {
            for (const groupKey of read.groupKeys) {
                entries.push({
                    date: event.startsOn,
                    groupKey,
                    groupName: nameOf[groupKey],
                    session: read.session,
                });
            }
        }
    }
    const byDate = (a, b) => a.date.localeCompare(b.date) || a.groupName.localeCompare(b.groupName);
    // (a group's same session within a week of an earlier one: that one)
    entries.sort(byDate);
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const earlier = entries.some(
            (x, j) =>
                j < i &&
                x.groupKey === e.groupKey &&
                x.session === e.session &&
                daysApart(e.date, x.date) <= SAME_DEWORMING_DAYS
        );
        if (earlier) entries.splice(i, 1);
    }
    const due = entries
        .filter((e) => e.date >= today)
        .map((e) => ({ ...e, sheet: listFor(e.groupKey, e.session, e.date) }))
        .sort(byDate);
    // (passed, since lists started in vervetDB: the latest for each group
    // and session, with no list for it
    // or after it, and not moved to a later date (within 2 months) in Outlook)
    const same = (a) => (b) => a.groupKey === b.groupKey && a.session === b.session;
    const latest = new Map();
    for (const e of entries.filter((x) => x.date < today && x.date >= overdueFrom)) {
        const key = `${e.groupKey}|${e.session}`;
        if (!latest.has(key) || e.date > latest.get(key).date) latest.set(key, e);
    }
    const overdue = [...latest.values()].filter(
        (e) =>
            !listFor(e.groupKey, e.session, e.date) &&
            // (a later list for the group, any session: it's moved on)
            !sheets.some((s) => s.groupKey === e.groupKey && s.startDate > e.date) &&
            !due.some((x) => same(e)(x) && daysApart(x.date, e.date) <= RESCHEDULE_DAYS)
    );

    // Unscheduled: a group with nothing coming up in Outlook, nothing
    // overdue there, and no list in progress (not approved yet): its next
    // session and when it's due, from its last deworming (a list, or a
    // past Outlook date: those before vervetDB were done on paper)
    const unscheduled = [];
    for (const group of groups) {
        const key = group.key;
        if (group.monkeys && !group.monkeys.length) continue;
        if (due.some((e) => e.groupKey === key) || overdue.some((e) => e.groupKey === key)) continue;
        if (sheets.some((s) => s.groupKey === key && s.status !== "approved")) continue;
        // (each past deworming: its session, first and last day)
        const history = [
            ...sheets
                .filter((s) => s.groupKey === key)
                .map((s) => {
                    const start = s.startedOn ?? s.startDate;
                    const days = s.lines?.some((l) => l.day4 === true) ? 4 : 3;
                    return { session: s.session, start, lastDay: addTo(start, { days: days - 1 }) };
                }),
            ...entries
                .filter((e) => e.groupKey === key && e.date < today)
                .map((e) => ({ session: e.session, start: e.date, lastDay: addTo(e.date, { days: 2 }) })),
        ].sort((a, b) => b.start.localeCompare(a.start));
        const last = history[0];
        if (!last) {
            unscheduled.push({ groupKey: key, groupName: group.name, session: "6_month", date: null, late: false });
            continue;
        }
        const session = sessionAfter(last.session);
        let date = null;
        if (isFollowUp(session)) date = addTo(last.lastDay, { days: FOLLOW_UP_DAYS });
        else {
            const main = history.find((h) => !isFollowUp(h.session));
            if (main) date = addTo(main.start, { months: MAIN_MONTHS });
        }
        unscheduled.push({ groupKey: key, groupName: group.name, session, date, late: Boolean(date && date < today) });
    }
    // (overdue first, then soonest; no date last)
    unscheduled.sort(
        (a, b) =>
            Number(b.late) - Number(a.late) ||
            (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
            a.groupName.localeCompare(b.groupName)
    );

    return {
        due,
        overdue: overdue.sort(byDate),
        unscheduled,
        unread: unread.sort((a, b) => a.startsOn.localeCompare(b.startsOn)),
    };
}

// The Schedule at a glance: everything with a date, in order, under
// Overdue, This Week (to Sunday: weeks run Monday to Sunday) and then each month ("December
// 2026"); the groups with no date at all under No Date Yet
//   → [{ label, items: [{ kind ("outlook": in Outlook; "estimate": not in
//        it, worked out), date, groupKey, groupName, session, sheet, late }] }]
const MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
];
export function scheduleBuckets({ due, overdue, unscheduled }, today) {
    const [y, m, d] = today.split("-").map(Number);
    const weekEnds = addTo(today, { days: (7 - new Date(Date.UTC(y, m - 1, d)).getUTCDay()) % 7 });
    const items = [
        ...overdue.map((e) => ({ ...e, kind: "outlook", sheet: null, late: true })),
        ...due.map((e) => ({ ...e, kind: "outlook", late: false })),
        ...unscheduled.map((u) => ({ ...u, kind: "estimate", sheet: null })),
    ];
    const labelOf = (item) => {
        if (!item.date) return "No Date Yet";
        if (item.late) return "Overdue";
        if (item.date <= weekEnds) return "This Week";
        const [y, m] = item.date.split("-").map(Number);
        return `${MONTH_NAMES[m - 1]} ${y}`;
    };
    const order = (a, b) =>
        (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.groupName.localeCompare(b.groupName);
    const buckets = [];
    for (const item of items.sort(order)) {
        const label = labelOf(item);
        let bucket = buckets.find((b) => b.label === label);
        if (!bucket) buckets.push((bucket = { label, items: [] }));
        bucket.items.push(item);
    }
    // (Overdue first, No Date Yet last; the rest in date order already)
    const rank = (b) => (b.label === "Overdue" ? 0 : b.label === "No Date Yet" ? 2 : 1);
    return buckets.sort((a, b) => rank(a) - rank(b));
}

// "Today", "Tomorrow", "In 3 days", "In 2 weeks", "Yesterday", "5 days ago"
export function relativeDay(date, today) {
    const n = daysApart(date, today);
    if (n === 0) return "Today";
    if (n === 1) return "Tomorrow";
    if (n === -1) return "Yesterday";
    const amount = Math.abs(n) < 14 ? `${Math.abs(n)} days` : `${Math.round(Math.abs(n) / 7)} weeks`;
    return n > 0 ? `In ${amount}` : `${amount} ago`;
}
