// The Troop Monitoring Notes: what to look out for while monitoring a troop
// (the Priority Checks), then its current injuries (the Monitoring Notes),
// with room below for staff to write more by hand. The same monkeys as the
// troop's Monitoring Sheet (monitoringGroups in monitoring.js).
import { currentBabySeason } from "./ages";

const byName = (a, b) => a.name.localeCompare(b.name);

// "2026-10-13" → "13/10"
export const shortDate = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

// An injury on one line: its date and description, then each update the
// same way ("13/10 minor wound on left thigh, 19/10 healing well")
export const injuryText = (injury) =>
    [injury, ...(injury.updates ?? [])]
        .map((entry) => `${shortDate(entry.date)} ${entry.description ?? entry.details}`)
        .join(", ");

// What goes on a troop's notes:
//   groups: the troop's Monitoring Sheet groups (monitoringGroups)
//   monitoring: monkey id → { conditionCheck, notes } (loadMonitoringFor)
//   injuries: the current injuries of those monkeys (loadCurrentInjuries)
// → {
//     babies: this season's year if the troop has babies of it, or null
//     condition: { troop: [names], introcages: [names] }: Condition Check
//     other: [{ name, notes }]: Notes for Monitoring
//     injuries: [{ name, text }]: oldest first
//   }
export function monitoringNotes({ groups, monitoring = {}, injuries = [], today = new Date() }) {
    const season = currentBabySeason(today);
    const monkeys = groups.flatMap((g) => g.monkeys);
    const byId = new Map(monkeys.map((m) => [m.id, m]));
    const ticked = monkeys.filter((m) => monitoring[m.id]?.conditionCheck).sort(byName);
    return {
        babies: monkeys.some((m) => Number(m.year) === season) ? season : null,
        condition: {
            troop: ticked.filter((m) => !m.introcage).map((m) => m.name),
            introcages: ticked.filter((m) => m.introcage).map((m) => m.name),
        },
        other: monkeys
            .filter((m) => monitoring[m.id]?.notes)
            .sort(byName)
            .map((m) => ({ name: m.name, notes: monitoring[m.id].notes })),
        injuries: [...injuries]
            .filter((i) => byId.has(i.monkeyId))
            .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
            .map((i) => ({ name: byId.get(i.monkeyId).name, text: injuryText(i) })),
    };
}

// The Priority Checks, numbered in order, leaving out any with nothing in
// them: [{ title, lines? }] (lines: [{ label?, name?, text }])
export function priorityChecks(notes) {
    const checks = [];
    if (notes.babies) checks.push({ title: `Check ${notes.babies} babies` });
    const { troop, introcages } = notes.condition;
    if (troop.length || introcages.length) {
        checks.push({
            title: "Priority Condition Checks:",
            lines: [
                ...(troop.length ? [{ label: "Troop:", text: troop.join(", ") }] : []),
                ...(introcages.length ? [{ label: "Introcages:", text: introcages.join(", ") }] : []),
            ],
        });
    }
    if (notes.other.length) {
        checks.push({ title: "Other Notes:", lines: notes.other.map((o) => ({ name: o.name, text: o.notes })) });
    }
    return checks;
}
