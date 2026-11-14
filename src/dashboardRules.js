// My Dashboard's workings (StaffDashboard.jsx): this week's and month's
// checklist keys, the to-do list's order, and My Alerts for the sections
// someone looks after.
import { mondayOf } from "./babyRecords";
import { hasTroop } from "./enclosures";
import { MONITORED_SECTIONS } from "./monitoring";
import { MUST_SEE_AFTER, daysBetween, isOverdue, latestSessionDays, sessionsBefore, sightingRecord, seenDaily } from "./monitoringRules";
import { updateNeeded } from "./injuryRules";
import { monkeysIn } from "./stats";
import { fullName } from "./places";

export const DASHBOARD_HASH = "#dashboard";
export const MAX_TODO = 200;

// The sections to choose for My Alerts
export const ALERT_SECTIONS = MONITORED_SECTIONS;

// A checklist's period now: the week's Monday ("2026-11-09"), or the month
// ("2026-11")
export const periodOf = (every, today) => (every === "week" ? mondayOf(today) : today.slice(0, 7));

// A to-do's due state: "overdue", "today" or null
export function dueState(todo, today) {
    if (!todo.dueOn || todo.doneAt) return null;
    if (todo.dueOn < today) return "overdue";
    return todo.dueOn === today ? "today" : null;
}

// The to-do list: still to do (those with a due date first, soonest first;
// then the rest, oldest first), and done (the latest done first)
export function sortTodos(todos) {
    const open = todos
        .filter((t) => !t.doneAt)
        .sort(
            (a, b) =>
                (a.dueOn ? 0 : 1) - (b.dueOn ? 0 : 1) ||
                String(a.dueOn ?? "").localeCompare(String(b.dueOn ?? "")) ||
                String(a.createdAt).localeCompare(String(b.createdAt))
        );
    const done = todos.filter((t) => t.doneAt).sort((a, b) => String(b.doneAt).localeCompare(String(a.doneAt)));
    return { open, done };
}

// The troops in these sections, by name
export function troopsIn(enclosures, sections) {
    return enclosures
        .filter((e) => hasTroop(e) && sections.includes(e.section))
        .sort((a, b) => fullName(a.name).localeCompare(fullName(b.name)));
}

// The monkeys these sections look after: their troops' (introcages too),
// and Sickbay's when it's chosen
export function sectionMonkeys(monkeys, enclosures, sections) {
    const found = new Map();
    for (const troop of troopsIn(enclosures, sections)) for (const m of monkeysIn(monkeys, troop)) found.set(m.id, m);
    if (sections.includes("Sickbay")) for (const m of monkeysIn(monkeys, null)) if (m.inSickbay) found.set(m.id, m);
    return [...found.values()];
}

// My Alerts, the most urgent first:
//   [{ id, level ("urgent" / "warning"), kind ("monitoring", "missing",
//   "injury"), text, monkey?, troop?, href? }]
//   sessions / spots: Monitoring's; lastMoves: { monkeyId: day moved back
//   out }; muted: Set of monkey ids with Mute Alerts; injuries: their
//   current injuries
export function myAlerts({ monkeys, enclosures, sections, sessions = [], spots = [], lastMoves = {}, muted = new Set(), injuries = [], today }) {
    const alerts = [];
    const latest = latestSessionDays(sessions);
    for (const troop of troopsIn(enclosures, sections)) {
        const last = latest.get(troop.id);
        if (MONITORED_SECTIONS.includes(troop.section) && isOverdue(last, today)) {
            alerts.push({
                id: `overdue-${troop.id}`,
                level: "urgent",
                kind: "monitoring",
                troop,
                text: last
                    ? `${fullName(troop.name)} Troop: no monitoring session for ${daysBetween(last, today)} days`
                    : `${fullName(troop.name)} Troop: no monitoring session yet`,
                href: "#records/sections/monitoring",
            });
        }
        const past = sessionsBefore(sessions, troop.id, null);
        for (const monkey of monkeysIn(monkeys, troop)) {
            if (muted.has(monkey.id) || seenDaily(monkey)) continue;
            const { missed } = sightingRecord(past, monkey.id, spots, { back: lastMoves[monkey.id], today });
            if (missed >= MUST_SEE_AFTER) {
                alerts.push({ id: `missing-${monkey.id}`, level: "urgent", kind: "missing", monkey, troop, text: `Must See: not seen in the last ${missed} sessions` });
            } else if (missed === 1) {
                alerts.push({ id: `missing-${monkey.id}`, level: "warning", kind: "missing", monkey, troop, text: "Not seen last session" });
            }
        }
    }
    const mine = new Set(sectionMonkeys(monkeys, enclosures, sections).map((m) => m.id));
    for (const injury of injuries) {
        if (!mine.has(injury.monkeyId) || !updateNeeded(injury, today)) continue;
        const monkey = monkeys.find((m) => m.id === injury.monkeyId);
        if (!monkey) continue;
        alerts.push({ id: `injury-${injury.id}`, level: "warning", kind: "injury", monkey, text: `Injury update needed: ${injury.description}` });
    }
    const order = { urgent: 0, warning: 1 };
    return alerts.sort((a, b) => order[a.level] - order[b.level]);
}
