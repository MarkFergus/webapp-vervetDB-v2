// Monitoring sessions' workings (MonitoringRecordsPage.jsx,
// supabase/monitoring-sessions.sql): the choices, when a monkey was last
// seen and how many sessions in a row it's been missed, when a troop is
// overdue, the alerts after a session, and its WhatsApp summary.
import { fullName } from "./places";

export const FOODS_USED = { seeds: "Seeds", corn: "Corn", pellets: "Pellets", sprouts: "Sprouts" };
export const FENCE = { good: "Good", low: "Low", not_working: "Not Working" };
export const WATERS = { good: "Good", low: "Low", bad: "Bad" };
export const FOOD_LEVELS = { good: "Good", low: "Low", too_much: "Too Much" };
// The good answer for each check (anything else: a red !)
export const ALL_GOOD = { fence: "good", waters: "good", food: "good" };
// A check's short note ("North corner sagging"): this long at most
export const CHECK_NOTE_MAX = 50;

// This many days or more since a troop's last session: it's overdue
export const OVERDUE_DAYS = 5;
// Missed this many sessions in a row: Must See
export const MUST_SEE_AFTER = 2;

const parts = (date) => date.split("-").map(Number);
// "2026-10-26" → "26.10" (the WhatsApp summary) / "26/10" (the alerts)
export const dotDate = (date) => `${String(parts(date)[2]).padStart(2, "0")}.${String(parts(date)[1]).padStart(2, "0")}`;
export const slashDate = (date) => `${String(parts(date)[2]).padStart(2, "0")}/${String(parts(date)[1]).padStart(2, "0")}`;

// Days from one day ("2026-10-16") to another
export function daysBetween(from, to) {
    const at = (date) => Date.UTC(parts(date)[0], parts(date)[1] - 1, parts(date)[2]);
    return Math.round((at(to) - at(from)) / 86400000);
}

// A troop's finished sessions, newest first (leaving out one: the session
// being entered, so its own ticks don't count yet)
export function troopSessions(sessions, enclosureId, leaveOut = null) {
    return sessions
        .filter((s) => s.enclosureId === enclosureId && s.status === "finished" && s.id !== leaveOut)
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.finishedAt).localeCompare(String(a.finishedAt)));
}

// The finished sessions that came before a session (its own ticks not
// counted): for one in progress, every finished one; for a finished one
// (History, or changing it), only those before it
export function sessionsBefore(sessions, enclosureId, session) {
    const list = troopSessions(sessions, enclosureId, session?.id);
    if (!session || session.status !== "finished") return list;
    return list.filter(
        (s) => s.date < session.date || (s.date === session.date && String(s.finishedAt) < String(session.finishedAt))
    );
}

// Seen every day by the people feeding and cleaning, so never "not seen":
// a monkey in Sickbay, in its introcage, or staying in one for now. (Only
// monkeys out in their troop are looked for in a session.)
export const seenDaily = (monkey) => Boolean(monkey.inSickbay || monkey.introcage || monkey.stay);

// A monkey's record in those sessions (newest first): { lastSeen (a day or
// null), missed (sessions in a row it wasn't seen, up to the latest),
// spot (the sighting it was last seen in, if that's how) }. Sessions it
// wasn't on the checklist for don't count. spots: sightings between
// sessions ([{ monkeyId, date, by, note }]): one counts as seen, so only
// the sessions after it count as missed (the same day: after the session)
//   daily: seen every day where it is now (seenDaily): last seen today,
//   never missed
//   back: the day it moved back out to its troop (its latest move: from
//   Sickbay or an introcage), seen every day until then: counts as seen
//   that day
export function sightingRecord(sessions, monkeyId, spots = [], { daily = false, back = null, today = null } = {}) {
    if (daily) return { lastSeen: today, missed: 0, spot: null };
    const spot = latestSpot(spots, monkeyId);
    // (the latest of a sighting between sessions and the move back out)
    const seen = back && (!spot || back > spot.date) ? { date: back, spot: null } : spot ? { date: spot.date, spot } : null;
    let missed = 0;
    for (const session of sessions) {
        if (seen && seen.date >= session.date) return { lastSeen: seen.date, missed, spot: seen.spot };
        const sighting = session.sightings.find((s) => s.monkeyId === monkeyId);
        if (!sighting) continue;
        if (sighting.seen) return { lastSeen: session.date, missed, spot: null };
        missed += 1;
    }
    return seen ? { lastSeen: seen.date, missed, spot: seen.spot } : { lastSeen: null, missed, spot: null };
}

// A monkey's latest sighting between sessions (or null)
export function latestSpot(spots, monkeyId) {
    let latest = null;
    for (const s of spots) {
        if (s.monkeyId !== monkeyId) continue;
        if (!latest || s.date > latest.date || (s.date === latest.date && String(s.at) > String(latest.at))) latest = s;
    }
    return latest;
}

// Each troop's latest finished session day: enclosure id → "2026-10-26"
export function latestSessionDays(sessions) {
    const latest = new Map();
    for (const s of sessions) {
        if (s.status !== "finished") continue;
        if (!latest.has(s.enclosureId) || s.date > latest.get(s.enclosureId)) latest.set(s.enclosureId, s.date);
    }
    return latest;
}

// Whether a troop's overdue a session (none yet, or the last too long ago)
export const isOverdue = (lastDay, today) => !lastDay || daysBetween(lastDay, today) >= OVERDUE_DAYS;

// The top of Monitoring: every monitored troop once, at the stage it's at, from
// the most urgent to the least: in progress; overdue, longest first (never
// monitored: first of all); the rest, nearest to overdue first; then finished
// in the last 48 hours, the newest last. A session entered late for an old date doesn't stop
// a troop being overdue. Troops outside the monitored list only show while
// they've a session in progress or just finished.
//   → [{ troop, stage ("progress", "overdue", "recent", "rest"), session, days
//   (since the last session; null: none yet) }]
export function troopStages(troops, sessions, monitored, today, now = Date.now()) {
    const latest = latestSessionDays(sessions);
    const rows = troops.map((troop) => {
        const own = sessions.filter((s) => s.enclosureId === troop.id);
        const last = latest.get(troop.id);
        const days = last ? daysBetween(last, today) : null;
        const open = own.find((s) => s.status === "in_progress");
        if (open) return { troop, stage: "progress", session: open, days };
        const isMonitored = monitored.includes(troop.section);
        const recent = own
            .filter((s) => s.status === "finished" && s.finishedAt && now - new Date(s.finishedAt) < 2 * 86400000)
            .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))[0];
        if (isMonitored && isOverdue(last, today)) return { troop, stage: "overdue", session: null, days };
        if (recent) return { troop, stage: "recent", session: recent, days };
        return isMonitored ? { troop, stage: "rest", session: null, days } : null;
    });
    const order = ["progress", "overdue", "rest", "recent"];
    const away = (row) => row.days ?? Infinity;
    return rows
        .filter(Boolean)
        .sort(
            (a, b) =>
                order.indexOf(a.stage) - order.indexOf(b.stage) ||
                (a.stage === "recent" ? String(a.session.finishedAt).localeCompare(String(b.session.finishedAt)) : away(b) - away(a))
        );
}

// "Malawi", "Malawi and Daisy Mae", "Malawi, Rox and Daisy Mae"
export function joinNames(names) {
    if (names.length <= 1) return names.join("");
    return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

// The seen line: "All seen", or "All seen except Malawi and Daisy Mae
// (both seen 26.10)" (different days: "Malawi (seen 26.10) and Rox (seen
// 19.10)"; never: "(not seen before)")
//   missing: [{ name, lastSeen }] (before this session); total: on the list
export function seenLine(missing, total) {
    if (!missing.length) return "✅ All seen";
    if (missing.length === total) return "None seen";
    const days = new Set(missing.map((m) => m.lastSeen));
    const seenOn = (day) => (day ? `seen ${dotDate(day)}` : "not seen before");
    const names = joinNames(missing.map((m) => m.name));
    if (days.size === 1 && missing.length > 1) {
        const [day] = days;
        const all = missing.length === 2 ? "both" : "all";
        return `All seen except ${names} (${day ? `${all} seen ${dotDate(day)}` : `${all} not seen before`})`;
    }
    return `All seen except ${joinNames(missing.map((m) => `${m.name} (${seenOn(m.lastSeen)})`))}`;
}

// The priority monkeys who were seen: "Victoria seen", "Victoria and
// Hocus both seen", "Victoria, Hocus and Rox all seen"
export function prioritySeenLine(names) {
    if (!names.length) return "";
    const all = names.length === 2 ? " both" : names.length > 2 ? " all" : "";
    return `${joinNames(names)}${all} seen`;
}

// The checks as words in the summary: good / low / not working, good /
// low / bad, good / low / too much
const word = (v) => String(v).replace(/_/g, " ");

// The WhatsApp summary, as staff post it (general notes in italics under
// the title: WhatsApp shows _text_ in italics):
//   📋 Skunkey Monitoring 30.10
//   _Raining, low sightings_
//
//   All seen except Malawi and Daisy Mae (both seen 26.10)
//   Victoria and Hocus both seen
//   ⚠️ Malawi not seen for 2 sessions (since 26.10)
//
//   🐒 Paradise eye almost back to normal
//
//   🥗 good
//   💧 low (top trough)
//   ⚡️ good
//
//   🔧 Branches need cutting by the fence
// (everyone seen: "✅ All seen"; the checks all good, no notes: "🥗💧⚡️ all good")
// troop: its name; missing: [{ name, lastSeen }]; total; prioritySeen:
// [names] (priority checks and Must See monkeys seen this time); mustSee:
// [{ name, missed, lastSeen }]; notes: [{ name, text }] (added this
// session); checkNotes: { fence, waters, food } (short notes); maintenance
export function whatsappText({
    troop,
    date,
    missing,
    total,
    prioritySeen = [],
    mustSee = [],
    notes = [],
    fence,
    waters,
    food,
    checkNotes = {},
    introcagesChecked = false,
    perimeterChecked = false,
    generalNotes = "",
    maintenance = "",
}) {
    // (the title in bold: WhatsApp's *…*)
    const lines = [`📋 *${fullName(troop)} Monitoring ${dotDate(date)}*`];
    // (a line at a time, each in italics: WhatsApp's _…_ stops at a new line)
    for (const line of generalNotes.split("\n").map((l) => l.trim()).filter(Boolean)) lines.push(`_${line}_`);
    lines.push("", seenLine(missing, total));
    // (even with everyone seen: so the chat can be searched for their names)
    if (prioritySeen.length) lines.push(prioritySeenLine(prioritySeen));
    for (const m of mustSee) {
        lines.push(`⚠️ ${m.name} not seen for ${m.missed} sessions${m.lastSeen ? ` (since ${dotDate(m.lastSeen)})` : ""}`);
    }
    if (notes.length) {
        lines.push("");
        for (const n of notes) lines.push(`🐒 ${n.name} ${n.text}`);
    }
    const note = (check) => (checkNotes[check]?.trim() ? ` (${checkNotes[check].trim()})` : "");
    const allGood = fence === ALL_GOOD.fence && waters === ALL_GOOD.waters && food === ALL_GOOD.food;
    if (allGood && !note("fence") && !note("waters") && !note("food")) lines.push("", "🥗💧⚡️ all good");
    else lines.push("", `🥗 ${word(food)}${note("food")}`, `💧 ${word(waters)}${note("waters")}`, `⚡️ ${word(fence)}${note("fence")}`);
    // (the Introcages and Perimeter Checks, under the enclosure's: those done)
    const checked = [introcagesChecked && "Introcages", perimeterChecked && "Perimeter"].filter(Boolean);
    if (checked.length) lines.push(`☑️ ${checked.join(" & ")} checked`);
    const jobs = maintenance.split("\n").map((l) => l.trim()).filter(Boolean);
    if (jobs.length) lines.push("", ...jobs.map((job) => `🔧 ${job}`));
    return lines.join("\n");
}

// The alerts after a session: [{ level ("danger" / "warn"), text, check
// (true: the fence, waters or food, shown with a red ! rather than the
// monkeys' ⚠) }]
//   mustSee: [{ name, missed, lastSeen }]; staleInjuries: [{ name, since }]
//   (no update since); and the session's fence, waters and food (and their
//   short notes)
export function sessionAlerts({ mustSee = [], staleInjuries = [], fence, waters, food, checkNotes = {} }) {
    const alerts = mustSee.map((m) => ({
        level: "danger",
        text: m.lastSeen
            ? `${m.name} not seen last ${m.missed} sessions, last seen ${slashDate(m.lastSeen)}`
            : `${m.name} not seen last ${m.missed} sessions`,
    }));
    for (const i of staleInjuries) {
        alerts.push({ level: "warn", text: `${i.name}'s injury has not been updated since ${slashDate(i.since)}` });
    }
    const note = (check) => (checkNotes[check]?.trim() ? ` (${checkNotes[check].trim()})` : "");
    if (fence && fence !== ALL_GOOD.fence) alerts.push({ level: "danger", check: true, text: `Fence: ${FENCE[fence]}${note("fence")}` });
    if (waters && waters !== ALL_GOOD.waters) alerts.push({ level: "danger", check: true, text: `Waters: ${WATERS[waters]}${note("waters")}` });
    if (food && food !== ALL_GOOD.food) alerts.push({ level: "danger", check: true, text: `Food: ${FOOD_LEVELS[food]}${note("food")}` });
    return alerts;
}
