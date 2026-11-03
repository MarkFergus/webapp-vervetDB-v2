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
// IC (a section's introcages; "Introcage(s)" too; on its own, every
// section's: "Introcage 3m deworming"), 3m, 6m ("3-month", "6 Month" too). A title
// without a session ("Bobo deworming": a special one) is left out; one
// with a session that can't be read → Other Scheduled Dewormings (for admins, never
// guessed). The session can come after ("Goliath deworming due 3m"), and
// other ways of writing it are read the same (tidyTitle: "follow up",
// "Dino & Daniel", "and", "Gismo Troop", "Deworming - Gismo 3m"…), as
// whoever's scheduling may not know the usual way.
// Other words after "deworming" ("due this week") don't matter, and a deworming entered over several days
// counts once, from its first day.

import { isFollowUp, nextSession, sessionAfter } from "./dewormingRules";

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
// ("Top Section IC", "Top IC's", "Top Introcage", or just "Top Section")
const IC_WORDS = /\s+(?:section(?:\s+(?:ic'?s?|introcages?))?|ic'?s?|introcages?)$/i;
// ("Introcage 3m deworming": every section's introcages)
const ALL_ICS = /^(all\s+)?(ic'?s?|introcages?)$/i;
const FU = /\bF\/?U\b/i;
// An extra round ("Goliath extra 6m deworming", "Global 2nd 6m
// deworming"), to catch monkeys missed: it gets its own F/U, but the next
// main deworming still counts from the usual one
const EXTRA = /\b(?:additional|extra|second|2nd|redo|repeat)\b/i;
// ("Goliath deworming due 3m": the session after "deworming")
const SESSION_AFTER = new RegExp(String.raw`^(.*?)(\s+F\/?U)?\s+deworm\w*\b.*?\b${SESSION}(\s*F\/?U)?`, "i");

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
        if (ALL_ICS.test(part)) {
            groupKeys.push(...groups.filter((g) => g.key.startsWith("ics:")).map((g) => g.key));
            continue;
        }
        // ("Gismo Troop": the troop's name)
        const name = part.replace(IC_WORDS, "").replace(/\s+troop$/i, "").trim().toLowerCase();
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
    const text = tidyTitle(title);
    // ("Goliath extra 6m deworming": an extra round, each part)
    const before = /^(.*?)\s+deworm/i.exec(text)?.[1] ?? "";
    if (EXTRA.test(before)) {
        const parts = readParts(text.replace(new RegExp(EXTRA.source, "gi"), " ").replace(/\s+/g, " "), groups);
        return parts && parts.map((p) => ({ ...p, extra: true }));
    }
    return readParts(text, groups);
}

function readParts(text, groups) {
    // (the session after "deworming", none before: moved in front)
    const after = SESSION_AFTER.exec(text);
    if (after && !HAS_SESSION.test(after[1])) {
        const fu = after[2] || after[4] ? " F/U" : "";
        return readParts(`${after[1]} ${after[3]}m${fu} deworming`, groups);
    }
    const head = /^(.*?)\s+deworm\w*(.*)$/i.exec(text);
    if (!head) return null;
    let before = head[1];
    const split = /\s*,\s*|\s+\+\s+/;
    // ("Gismo 3m deworming F/U": the F/U after, with the session; with
    // several sessions, whose it is can't be told)
    if (FU.test(head[2]) && !FU.test(before)) {
        if (split.test(before)) return null;
        before = before.replace(new RegExp(SESSION, "i"), "$& F/U");
    }
    const parts = before.split(split).map((part) => readTitle(`${part} deworming`, groups));
    return parts.every(Boolean) ? parts : null;
}

// Ways people write a title, the same as the usual one:
//   "(follow up)", "follow-up" → F/U; "three month" → 3 month; "Dino &
//   Daniel" → D&D, "Holt and Barrington" → H&B; "and" → &;
//   "Deworming - Gismo 3m" → "Gismo 3m deworming"
export function tidyTitle(title) {
    const text = title
        .replace(/[()]/g, " ")
        .replace(/\bfollow[\s-]*up\b/gi, "F/U")
        .replace(/\b(three|six)(?=\s*-?\s*months?\b)/gi, (w) => (w.toLowerCase() === "three" ? "3" : "6"))
        .replace(/\bdino\s*(?:&|and)\s*daniel\b/gi, "D&D")
        .replace(/\bholt\s*(?:&|and)\s*barrington\b/gi, "H&B")
        .replace(/\s+and\s+/gi, " & ")
        .replace(/\s+/g, " ")
        .trim();
    const first = /^deworm\w*\s*[-–:]?\s*(.+)$/i.exec(text);
    return first ? `${first[1]} deworming` : text;
}

// Days between two "YYYY-MM-DD" dates
const daysApart = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

// Outlook's events read into dewormings, one for each group: [{ date,
// groupKey, groupName, session, extra }] by date (a group's same session
// within a week of an earlier one: that one), and those that couldn't be
// read: [{ title, startsOn }]
function readEntries(events, groups) {
    const nameOf = Object.fromEntries(groups.map((g) => [g.key, g.name]));
    const entries = [];
    const unread = [];
    for (const event of events) {
        // (no session: a special deworming, not the schedule's)
        if (!HAS_SESSION.test(tidyTitle(event.title))) continue;
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
                    extra: Boolean(read.extra),
                });
            }
        }
    }
    entries.sort(byDate);
    for (let i = entries.length - 1; i >= 0; i--) {
        const e = entries[i];
        const earlier = entries.some(
            (x, j) =>
                j < i &&
                x.groupKey === e.groupKey &&
                x.session === e.session &&
                x.extra === e.extra &&
                daysApart(e.date, x.date) <= SAME_DEWORMING_DAYS
        );
        if (earlier) entries.splice(i, 1);
    }
    return { entries, unread };
}

const byDate = (a, b) => a.date.localeCompare(b.date) || a.groupName.localeCompare(b.groupName);

// Each Outlook date's list: each list counts for one date, the nearest
// within 2 weeks of its session, or else of the same kind (a 3m done as a
// 6m; a F/U only ever a F/U) → Map(entry → its list)
function listsFor(entries, sheets) {
    const pairs = [];
    for (const sheet of sheets) {
        for (const entry of entries) {
            const apart = Math.abs(daysApart(sheet.startDate, entry.date));
            if (sheet.groupKey !== entry.groupKey || apart > MATCH_DAYS) continue;
            const same = sheet.session === entry.session;
            if (!same && isFollowUp(sheet.session) !== isFollowUp(entry.session)) continue;
            pairs.push({ sheet, entry, rank: same ? 0 : 1, apart });
        }
    }
    pairs.sort((a, b) => a.rank - b.rank || a.apart - b.apart);
    const found = new Map();
    const used = new Set();
    for (const { sheet, entry } of pairs) {
        if (found.has(entry) || used.has(sheet)) continue;
        found.set(entry, sheet);
        used.add(sheet);
    }
    return found;
}

// What a new list for a group, starting on a day, is expected to be:
// Outlook's deworming nearest it (within 2 weeks, not already another
// list's), or else the next in the group's cycle
//   → { session, extra, date (Outlook's, or null) }
export function expectedSession(events, groups, sheets, groupKey, startDate) {
    const { entries } = readEntries(events ?? [], groups);
    const lists = listsFor(entries, sheets);
    const [near] = entries
        .filter(
            (e) =>
                e.groupKey === groupKey && !lists.has(e) && Math.abs(daysApart(e.date, startDate)) <= MATCH_DAYS
        )
        .sort((a, b) => Math.abs(daysApart(a.date, startDate)) - Math.abs(daysApart(b.date, startDate)));
    if (near) return { session: near.session, extra: near.extra, date: near.date };
    return { session: nextSession(sheets, groupKey), extra: false, date: null };
}

// The Schedule: Outlook's dewormings, read, against vervetDB's lists
//   events: [{ uid, title, startsOn }]; groups: dewormingGroups'; sheets:
//   the deworming lists; today: "YYYY-MM-DD"
//   → { due: [{ date, groupKey, groupName, session, extra, sheet (its
//        list, if prepared), doneAs (its list's session, if it's another:
//        a 3m done as a 6m) }], soonest first;
//       overdue: [{ date, groupKey, groupName, session, extra }] (the
//        date's passed, no list for it, and not put on a later date);
//       unscheduled: [{ groupKey, groupName, session (next), extra, date
//        (when it's due, or null: no past deworming found), late }];
//       unread: [{ title, startsOn }] }
//   Each with previous: the main deworming before it.
export function scheduleOf(events, groups, sheets, today, overdueFrom = OVERDUE_FROM) {
    const { entries, unread } = readEntries(events, groups);
    const lists = listsFor(entries, sheets);
    const due = entries
        .filter((e) => e.date >= today)
        .map((e) => {
            const sheet = lists.get(e) ?? null;
            return { ...e, sheet, ...(sheet && sheet.session !== e.session && { doneAs: sheet.session }) };
        });
    // (passed, since lists started in vervetDB: the latest for each group
    // and session, with no list for it or from its day on (any session:
    // it's moved on), and not moved to a later date (within 2 months) in
    // Outlook)
    const same = (a) => (b) => a.groupKey === b.groupKey && a.session === b.session;
    const latest = new Map();
    for (const e of entries.filter((x) => x.date < today && x.date >= overdueFrom)) {
        const key = `${e.groupKey}|${e.session}`;
        if (!latest.has(key) || e.date > latest.get(key).date) latest.set(key, e);
    }
    const overdue = [...latest.values()].filter(
        (e) =>
            !lists.has(e) &&
            !sheets.some((s) => s.groupKey === e.groupKey && s.startDate >= e.date) &&
            !due.some((x) => same(e)(x) && daysApart(x.date, e.date) <= RESCHEDULE_DAYS)
    );

    // A group's dewormings: its lists (extra if Outlook's date for it is),
    // and Outlook's dates without a list (before vervetDB, on paper)
    //   → [{ session, extra, start, lastDay }], newest first
    //   upTo: only those before this day
    const extraLists = new Set([...lists].filter(([e]) => e.extra).map(([, s]) => s));
    const historyOf = (key, upTo) =>
        [
            ...sheets
                .filter((s) => s.groupKey === key)
                .map((s) => {
                    const start = s.startedOn ?? s.startDate;
                    const days = s.lines?.some((l) => l.day4 === true) ? 4 : 3;
                    return {
                        session: s.session,
                        extra: extraLists.has(s),
                        start,
                        lastDay: addTo(start, { days: days - 1 }),
                    };
                }),
            ...entries
                .filter((e) => e.groupKey === key && !lists.has(e))
                .map((e) => ({ session: e.session, extra: e.extra, start: e.date, lastDay: addTo(e.date, { days: 2 }) })),
        ]
            .filter((h) => h.start < upTo)
            .sort((a, b) => b.start.localeCompare(a.start));
    // The usual main deworming (3-Month or 6-Month, not an extra) before
    // one: { session, date (its first day) } or null (to check the dates
    // add up). Not the same deworming's own list or date.
    const previousMain = (key, item) => {
        const upTo = item.date ?? addTo(today, { days: 1 });
        const main = historyOf(key, upTo).find(
            (h) =>
                !h.extra &&
                !isFollowUp(h.session) &&
                !(item.date && h.session === item.session && Math.abs(daysApart(h.start, item.date)) <= MATCH_DAYS)
        );
        return main ? { session: main.session, date: main.start } : null;
    };

    // Unscheduled: a group with nothing coming up in Outlook, nothing
    // overdue there, and no list in progress (not approved yet): what's
    // next, from its past dewormings (lists, or past Outlook dates: those
    // before vervetDB were done on paper). Each main deworming since the
    // usual one (an extra too) needs its F/U, 14 days after its last day
    // (each F/U goes with the earliest main before it still without one);
    // then the next main, 3 months after the usual one started.
    const unscheduled = [];
    for (const group of groups) {
        const key = group.key;
        if (group.monkeys && !group.monkeys.length) continue;
        if (due.some((e) => e.groupKey === key) || overdue.some((e) => e.groupKey === key)) continue;
        if (sheets.some((s) => s.groupKey === key && s.status !== "approved")) continue;
        const add = (session, date, extra = false) =>
            unscheduled.push({
                groupKey: key,
                groupName: group.name,
                session,
                ...(extra && { extra }),
                date,
                late: Boolean(date && date < today),
            });
        const history = historyOf(key, today);
        const usual = history.find((h) => !h.extra && !isFollowUp(h.session));
        if (!usual) {
            const last = history[0];
            if (!last) add("6_month", null);
            else {
                const session = sessionAfter(last.session);
                add(session, isFollowUp(session) ? addTo(last.lastDay, { days: FOLLOW_UP_DAYS }) : null);
            }
            continue;
        }
        const waiting = [];
        for (const h of history.filter((x) => x.start >= usual.start).reverse()) {
            if (!isFollowUp(h.session)) waiting.push(h);
            else {
                const paired = waiting.findIndex((m) => m.start < h.start);
                if (paired >= 0) waiting.splice(paired, 1);
            }
        }
        if (waiting.length) {
            for (const main of waiting) add(`${main.session}_fu`, addTo(main.lastDay, { days: FOLLOW_UP_DAYS }), main.extra);
        } else {
            add(usual.session === "6_month" ? "3_month" : "6_month", addTo(usual.start, { months: MAIN_MONTHS }));
        }
    }
    // (overdue first, then soonest; no date last)
    unscheduled.sort(
        (a, b) =>
            Number(b.late) - Number(a.late) ||
            (a.date ?? "9999").localeCompare(b.date ?? "9999") ||
            a.groupName.localeCompare(b.groupName)
    );

    // (each with the main deworming before it)
    const withPrevious = (list) => list.map((item) => ({ ...item, previous: previousMain(item.groupKey, item) }));
    return {
        due: withPrevious(due),
        overdue: withPrevious(overdue.sort(byDate)),
        unscheduled: withPrevious(unscheduled),
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
