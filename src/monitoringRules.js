// Monitoring sessions' workings (MonitoringRecordsPage.jsx,
// supabase/monitoring-sessions.sql): the choices, when a monkey was last
// seen and how many sessions in a row it's been missed, when a troop is
// overdue, the alerts after a session, and its WhatsApp summary.
import { fullName } from "./places";

export const FOODS_USED = { seeds: "Seeds", corn: "Corn", pellets: "Pellets", sprouts: "Sprouts" };
export const FENCE = { good: "Good", low: "Low", not_working: "Not Working" };
export const WATERS = { ok: "OK", not_ok: "Not OK" };
export const FOOD_LEVELS = { good: "Good", high: "High", low: "Low" };
// The good answer for each check (anything else: ⚠)
export const ALL_GOOD = { fence: "good", waters: "ok", food: "good" };

// A troop needs a session at least once a week: more than this many days
// since its last one, it's overdue
export const OVERDUE_DAYS = 7;
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

// A monkey's record in those sessions (newest first): { lastSeen (a day or
// null), missed (sessions in a row it wasn't seen, up to the latest) }.
// Sessions it wasn't on the checklist for don't count.
export function sightingRecord(sessions, monkeyId) {
    let missed = 0;
    for (const session of sessions) {
        const sighting = session.sightings.find((s) => s.monkeyId === monkeyId);
        if (!sighting) continue;
        if (sighting.seen) return { lastSeen: session.date, missed };
        missed += 1;
    }
    return { lastSeen: null, missed };
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

// Whether a troop's due a session (none yet, or the last over a week ago)
export const isOverdue = (lastDay, today) => !lastDay || daysBetween(lastDay, today) > OVERDUE_DAYS;

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
    if (!missing.length) return "All seen";
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

// The checks as words in the summary: good / high / low, good / not ok,
// good / low / not working
const WORDS = {
    food: (v) => v,
    waters: (v) => (v === "ok" ? "good" : "not ok"),
    fence: (v) => (v === "not_working" ? "not working" : v),
};

// The WhatsApp summary, as staff post it (general notes in italics under
// the title: WhatsApp shows _text_ in italics):
//   📋 Skunkey Monitoring 30.10
//   _Raining, low sightings_
//
//   All seen except Malawi and Daisy Mae (both seen 26.10)
//   ⚠️ Malawi not seen for 2 sessions (since 26.10)
//
//   🐒 Paradise eye almost back to normal
//
//   🥗 good
//   💧 good
//   ⚡️ good
// troop: its name; missing: [{ name, lastSeen }]; total; mustSee: [{ name,
// missed, lastSeen }]; notes: [{ name, text }] (added this session)
export function whatsappText({ troop, date, missing, total, mustSee = [], notes = [], fence, waters, food, generalNotes = "" }) {
    const lines = [`📋 ${fullName(troop)} Monitoring ${dotDate(date)}`];
    // (a line at a time, each in italics: WhatsApp's _…_ stops at a new line)
    for (const line of generalNotes.split("\n").map((l) => l.trim()).filter(Boolean)) lines.push(`_${line}_`);
    lines.push("", seenLine(missing, total));
    for (const m of mustSee) {
        lines.push(`⚠️ ${m.name} not seen for ${m.missed} sessions${m.lastSeen ? ` (since ${dotDate(m.lastSeen)})` : ""}`);
    }
    if (notes.length) {
        lines.push("");
        for (const n of notes) lines.push(`🐒 ${n.name} ${n.text}`);
    }
    lines.push("", `🥗 ${WORDS.food(food)}`, `💧 ${WORDS.waters(waters)}`, `⚡️ ${WORDS.fence(fence)}`);
    return lines.join("\n");
}

// The alerts after a session: [{ level ("danger" / "warn"), text, check
// (true: the fence, waters or food, shown with a red ! rather than the
// monkeys' ⚠) }]
//   mustSee: [{ name, missed, lastSeen }]; staleInjuries: [{ name, since }]
//   (no update since); and the session's fence, waters and food
export function sessionAlerts({ mustSee = [], staleInjuries = [], fence, waters, food }) {
    const alerts = mustSee.map((m) => ({
        level: "danger",
        text: m.lastSeen
            ? `${m.name} has not been seen since ${slashDate(m.lastSeen)}, missing on the last ${m.missed} sessions`
            : `${m.name} has not been seen in the last ${m.missed} sessions`,
    }));
    for (const i of staleInjuries) {
        alerts.push({ level: "warn", text: `${i.name}'s injury has not been updated since ${slashDate(i.since)}` });
    }
    if (fence && fence !== ALL_GOOD.fence) alerts.push({ level: "danger", check: true, text: `Fence: ${FENCE[fence]}` });
    if (waters && waters !== ALL_GOOD.waters) alerts.push({ level: "danger", check: true, text: `Waters: ${WATERS[waters]}` });
    if (food && food !== ALL_GOOD.food) alerts.push({ level: "danger", check: true, text: `Food: ${FOOD_LEVELS[food]}` });
    return alerts;
}
