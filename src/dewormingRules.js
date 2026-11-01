// Deworming's workings (DewormingRecordsPage.jsx, supabase/deworming.sql):
// the sessions and their cycle, the dewormers, the deworming groups, and
// who's on a new sheet (with what) to start with.
import { ageInYears } from "./ages";
import { hasTroop } from "./enclosures";
import { monkeysIn } from "./stats";

// The sessions, in the cycle's order: 6-Month (every monkey), its F/U
// (14 days after its last day), 3-Month (3 months after the 6-Month
// started), its F/U, then the next 6-Month
export const SESSIONS = {
    "6_month": "6-Month",
    "6_month_fu": "6-Month F/U",
    "3_month": "3-Month",
    "3_month_fu": "3-Month F/U",
};
const CYCLE = ["6_month", "6_month_fu", "3_month", "3_month_fu"];
export const isFollowUp = (session) => session.endsWith("_fu");
// A F/U's main deworming ("6_month_fu" → "6_month")
export const mainOf = (session) => session.replace(/_fu$/, "");

// The dewormers: how many days each is given (once a day). Albendazole
// and Pyrantel work as 1 or 3 days, Panacur needs all 3, Milbeworm is 1
// day only. Others (e.g. Milbemax) are typed in, with their days chosen.
// dose: each one's usual dose, filled in when it's chosen (changed for a
// youngster's half dose)
export const DEWORMERS = [
    { name: "Albendazole", days: 3, dose: "1/4 tab" },
    { name: "Panacur", days: 3, dose: "1/2 tsp" },
    { name: "Milbeworm", days: 1, dose: "1/2 tab" },
    { name: "Pyrantel", days: 3, dose: "1/16 tsp" },
];
export const daysFor = (medication) => DEWORMERS.find((d) => d.name === medication)?.days ?? null;
export const usualDose = (medication) => DEWORMERS.find((d) => d.name === medication)?.dose ?? null;

// Doses: an amount and a unit, saved as "1/4 tab"
export const AMOUNTS = ["1/16", "1/8", "1/4", "1/2", "3/4", "1", "1 1/4", "1 1/2", "1 3/4", "2"];
export const UNITS = ["tab", "tsp", "ml"];
export const doseText = (amount, unit) => `${amount} ${unit}`;
// "1 1/2 tab" → { amount: "1 1/2", unit: "tab" }
export function splitDose(dose) {
    const match = /^(.*) (\S+)$/.exec(dose ?? "");
    return match ? { amount: match[1], unit: match[2] } : { amount: "", unit: UNITS[0] };
}

// The line under a printed sheet's title, unless the admin changes it
export const DEFAULT_INSTRUCTIONS =
    "Add 2 drops milk thistle & protexin to each dose (Albendazole also needs 2 drops flax oil).";

// Adults are dewormed every 6-Month: aged 3 and over (or age unknown)
export const ADULT_AGE = 3;
export const isAdult = (monkey, today = new Date()) => {
    const age = ageInYears(monkey.year, today);
    return age === null || age >= ADULT_AGE;
};

// The sections whose introcages are dewormed together, apart from their
// troops ("Top Section ICs"; Bachelor Block's are in Top's). Any other
// troop (Global, James) is dewormed with its introcages.
const IC_SECTIONS = ["Top", "Middle", "Bottom"];
const byName = (a, b) => a.name.localeCompare(b.name);

// The deworming groups, in order (named as on the paper sheets: "D&D",
// "H&B", not their full names; Global and James: "Global Troop", their
// introcages included): each troop (Top, Middle, Bottom), the
// three sections' introcages, then the troops done with their introcages
//   → [{ key, name, monkeys: [{ monkey, introcage: true if it lives in one }] }]
export function dewormingGroups(enclosures, monkeys) {
    const sectionOrder = (e) => {
        const i = IC_SECTIONS.indexOf(e.section);
        return i === -1 ? IC_SECTIONS.length : i;
    };
    const ordered = [...enclosures].sort(
        (a, b) => sectionOrder(a) - sectionOrder(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
    const entry = (m) => ({ monkey: m, introcage: Boolean(m.introcage) });
    const groups = [];
    for (const troop of ordered.filter((e) => hasTroop(e) && IC_SECTIONS.includes(e.section))) {
        groups.push({
            key: `troop:${troop.id}`,
            name: `${troop.name} Troop`,
            monkeys: [...monkeysIn(monkeys, troop, "troop")].sort(byName).map(entry),
        });
    }
    for (const section of IC_SECTIONS) {
        const places = ordered.filter((e) => e.section === section && (hasTroop(e) || e.type === "block"));
        groups.push({
            key: `ics:${section}`,
            name: `${section} Section ICs`,
            monkeys: places
                .flatMap((p) => monkeysIn(monkeys, p, "introcages"))
                .sort(byName)
                .map(entry),
        });
    }
    for (const troop of ordered.filter((e) => hasTroop(e) && !IC_SECTIONS.includes(e.section))) {
        groups.push({
            key: `enclosure:${troop.id}`,
            name: `${troop.name} Troop`,
            monkeys: [...monkeysIn(monkeys, troop)].sort(byName).map(entry),
        });
    }
    return groups;
}

// A sheet's title: "D&D Troop 6-Month F/U Deworming"
export const sheetTitle = (sheet) => `${sheet.groupName} ${SESSIONS[sheet.session]} Deworming`;

// A group's sheets, newest first
const groupSheets = (sheets, groupKey) =>
    sheets.filter((s) => s.groupKey === groupKey).sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id);

// The session a group's next sheet is: the one after its latest in the
// cycle (none yet: 6-Month)
export function nextSession(sheets, groupKey) {
    const latest = groupSheets(sheets, groupKey)[0];
    return latest ? CYCLE[(CYCLE.indexOf(latest.session) + 1) % CYCLE.length] : CYCLE[0];
}

// A monkey's latest dewormer and dose (any sheet), or null
export function lastDose(sheets, monkeyId) {
    const sorted = [...sheets].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id);
    for (const sheet of sorted) {
        const line = sheet.lines.find((l) => l.monkeyId === monkeyId);
        if (line) return { medication: line.medication, dose: line.dose, days: line.days };
    }
    return null;
}

// Who's on a new sheet to start with, and with what:
//   6-Month        every adult (3+)
//   3-Month F/U    the 3-Month's monkeys (the group's latest), and the
//                  introcage adults
//   3-Month, 6-Month F/U   the introcage adults (they're dewormed every
//                  session); the rest are chosen
// Every monkey in the group comes with a dewormer and dose ready, for when
// it's ticked: a F/U's main deworming's (the same dewormer), or else its
// last one, or none yet.
//   → { [monkeyId]: { on, medication, dose, days } } (medication "": none)
export function startingLines(group, session, sheets, today = new Date()) {
    const main = isFollowUp(session) ? groupSheets(sheets, group.key).find((s) => s.session === mainOf(session)) : null;
    const lines = {};
    for (const { monkey, introcage } of group.monkeys) {
        const adult = isAdult(monkey, today);
        const fromMain = main?.lines.find((l) => l.monkeyId === monkey.id) ?? null;
        const on =
            session === "6_month" ? adult : (introcage && adult) || (session === "3_month_fu" && Boolean(fromMain));
        const last = fromMain ?? lastDose(sheets, monkey.id);
        lines[monkey.id] = last
            ? { on, medication: last.medication, dose: last.dose, days: last.days }
            : { on, medication: "", dose: "", days: 3 };
    }
    return lines;
}

// A printed sheet's order: by dewormer (the list's order, others after),
// then name
export function printOrder(lines) {
    const rank = (m) => {
        const i = DEWORMERS.findIndex((d) => d.name === m);
        return i === -1 ? DEWORMERS.length : i;
    };
    return [...lines].sort(
        (a, b) =>
            rank(a.medication) - rank(b.medication) ||
            a.medication.localeCompare(b.medication) ||
            a.name.localeCompare(b.name)
    );
}
