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
// The session after one in the cycle ("3_month_fu" → "6_month")
export const sessionAfter = (session) => CYCLE[(CYCLE.indexOf(session) + 1) % CYCLE.length];
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
// Introcages (and areas) in the sanctuary's order: their enclosure's (as the
// Enclosures page lists them: Skrow, Robert, Skunkey, H&B, Jalamango…), then
// their own. → name → its place in that order (unknown: after them all)
export function introcageRanks(enclosures) {
    const byId = new Map(enclosures.map((e) => [e.id, e]));
    const inside = enclosures
        .filter((e) => e.parentId != null)
        .sort((a, b) => {
            const pa = byId.get(a.parentId);
            const pb = byId.get(b.parentId);
            return (pa?.sortOrder ?? 0) - (pb?.sortOrder ?? 0) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
        });
    const ranks = new Map(inside.map((e, i) => [e.name, i]));
    return (name) => (name && ranks.has(name) ? ranks.get(name) : inside.length);
}

export function dewormingGroups(enclosures, monkeys) {
    const sectionOrder = (e) => {
        const i = IC_SECTIONS.indexOf(e.section);
        return i === -1 ? IC_SECTIONS.length : i;
    };
    const ordered = [...enclosures].sort(
        (a, b) => sectionOrder(a) - sectionOrder(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
    const entry = (m) => ({ monkey: m, introcage: Boolean(m.introcage) });
    const rank = introcageRanks(enclosures);
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
            // (by introcage, in the sanctuary's order, then by name)
            monkeys: places
                .flatMap((p) => monkeysIn(monkeys, p, "introcages"))
                .sort((a, b) => rank(a.introcage) - rank(b.introcage) || byName(a, b))
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
        // (not an accidental dose: it wasn't chosen for them)
        const line = sheet.lines.find((l) => l.monkeyId === monkeyId && l.kind !== "accidental");
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

// A sheet's order, on paper and on screen: the troop's monkeys, then those
// living in introcages, by introcage in the sanctuary's order (placeRank:
// introcageRanks'); each by name, with the monkeys staff added at the end of
// their part (added, then accidental)
const KIND_ORDER = ["list", "added", "accidental"];
export function printOrder(lines) {
    return [...lines].sort(
        (a, b) =>
            Number(Boolean(a.introcage)) - Number(Boolean(b.introcage)) ||
            KIND_ORDER.indexOf(a.kind ?? "list") - KIND_ORDER.indexOf(b.kind ?? "list") ||
            (a.placeRank ?? 0) - (b.placeRank ?? 0) ||
            a.name.localeCompare(b.name)
    );
}

// ---- Completing a sheet (supabase/deworming-results.sql) ----
// A monkey's line carries its doses by day: { 1: { result, food, note,
// medication, dose }, … } (medication / dose: a change of dewormer from
// that day on; result null: changed, not given yet)

// What happened each day: only Full counts as a dose (a partial is a miss,
// though staff may carry on). "none" is shown as Miss.
export const RESULTS = [
    ["full", "Full"],
    ["3/4", "3/4"],
    ["1/2", "1/2"],
    ["1/4", "1/4"],
    ["none", "Miss"],
    ["skipped", "Skipped"],
];
export const PARTIALS = ["3/4", "1/2", "1/4"];
// The foods doses are hidden in (others typed in)
export const FOODS = ["JS", "BS", "Banana", "Date", "Raisins"];
// (Day 4: only for the monkeys whose course started a day late, e.g.
// missed Day 1, then full doses on Day 2 and 3: their 3rd dose)
export const DAYS = [1, 2, 3, 4];

// Monkeys added by staff while completing a sheet (deworming-additions.sql):
//   kind "list"        on the sheet as prepared
//        "added"       added to the course from a day on (fromDay)
//        "accidental"  an accidental dose, on that day only
// day4: Day 4 decided (true: their 3rd dose then; false: finished at Day 3)

// Is a monkey's row on a day? (not before it was added; an accidental dose
// only on its day; Day 4 only for those who need it)
export function onDay(line, day) {
    const from = line.fromDay ?? 1;
    if (line.kind === "accidental") return day === from;
    if (day < from) return false;
    return day <= 3 || line.day4 === true || Boolean(line.doses?.[day]);
}

const doseOf = (line, day) => line.doses?.[day] ?? null;
const isFull = (line, day) => doseOf(line, day)?.result === "full";

// The dewormer and dose given on a day: the latest change up to then, or
// the sheet's → { medication, dose }
export function givenOn(line, day) {
    let given = { medication: line.medication, dose: line.dose };
    for (let d = 1; d <= day; d++) {
        const dose = doseOf(line, d);
        if (dose?.medication) given = { medication: dose.medication, dose: dose.dose ?? given.dose };
    }
    return given;
}

// How many days a dewormer is given (one typed in when changing: 3)
const daysNeeded = (line, medication) => (medication === line.medication ? line.days : (daysFor(medication) ?? 3));
// Albendazole and Pyrantel work as 1 or 3 days (2 is pointless)
const ONE_OR_THREE = ["Albendazole", "Pyrantel"];

// The full doses of the same dewormer in a row, up to (not including) a day
function runBefore(line, day, medication) {
    let run = 0;
    for (let d = day - 1; d >= 1 && isFull(line, d) && givenOn(line, d).medication === medication; d--) run++;
    return run;
}

// Before a day: is the monkey done, or is there something to know?
//   → null, or { text, done (nothing more needed), warn (a choice to make) }
export function dayAdvice(line, day) {
    if (line.kind === "accidental") return null;
    const { medication } = givenOn(line, day);
    const need = daysNeeded(line, medication);
    const fulls = DAYS.filter((d) => d < day && isFull(line, d) && givenOn(line, d).medication === medication);
    if (need === 1 && fulls.length) return { text: `Finished course: one dose on Day ${fulls[0]}`, done: true };
    const run = runBefore(line, day, medication);
    if (run >= 3) return { text: "Finished course: 3 days in a row", done: true };
    // a day missed after some doses (they must be on days in a row)
    if (run === 0 && fulls.length && day > 1 && !isFull(line, day - 1)) {
        const missed = day - 1;
        if (medication === "Panacur") {
            return {
                text: `Missed Day ${missed}: Panacur needs 3 days in a row. Restart, or switch to Milbeworm?`,
                warn: true,
            };
        }
        if (ONE_OR_THREE.includes(medication)) {
            const before = runBefore(line, missed, medication);
            return before >= 2
                ? { text: `Missed Day ${missed} after 2 doses: switch to Milbeworm, or finish here?`, warn: true }
                : { text: `Finished course as missed dose on Day ${missed}`, done: true, missed };
        }
    }
    return null;
}

// After Day 3: does a monkey's course need a Day 4? Full doses on Day 2
// and 3 only (Day 1 missed, or they were added on Day 2) of a 3-day
// dewormer → "must" (Panacur: all 3 days), "ask" (Albendazole, Pyrantel,
// others: staff decide), or null
export function needsDay4(line) {
    if (line.kind === "accidental") return null;
    const { medication } = givenOn(line, 3);
    if (!isFull(line, 2) || !isFull(line, 3) || givenOn(line, 2).medication !== medication) return null;
    if (isFull(line, 1) && givenOn(line, 1).medication === medication) return null;
    if (daysNeeded(line, medication) === 1) return null;
    return medication === "Panacur" ? "must" : "ask";
}

// Why a monkey's course started on Day 2: "missed Day 1" or "was added on
// Day 2"
export const lateStart = (line) =>
    line.kind === "added" && (line.fromDay ?? 1) === 2 ? "was added on Day 2" : "missed Day 1";

// Which of a 3-day course's doses a day's is ("1st", "2nd", "3rd"), or
// null (a one-dose dewormer, an accidental dose, or the course done)
const ORDINALS = ["1st", "2nd", "3rd"];
export function doseNumber(line, day) {
    if (line.kind === "accidental") return null;
    const { medication } = givenOn(line, day);
    if (daysNeeded(line, medication) === 1) return null;
    return ORDINALS[runBefore(line, day, medication)] ?? null;
}

// "Day 2", "Day 1 and 3", "Day 1, 2 and 4"
function dayList(days) {
    const list = days.length > 1 ? `${days.slice(0, -1).join(", ")} and ${days.at(-1)}` : `${days[0]}`;
    return `Day ${list}`;
}

// "Sybil", "Sybil and Leeloo", "Sybil, Leeloo and Laser"
export const nameList = (names) =>
    names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];

// A monkey's Medical record, worded from its results (the admin can change
// it before approving):
//   "6-Month - 1/2 tab Milbeworm, one dose only"
//   "3-Month F/U - 1/2 tsp Panacur, once a day for 3 days"
//   "6-Month F/U - 1/4 tab Albendazole, took one dose on Day 2 only"
//   a change of dewormer: "… - 1/2 tsp Panacur on Day 1, then 1/2 tab
//   Milbeworm on Day 3"; partial doses after: "; 3/4 dose on Day 2"
//   3 days from Day 2: "… once a day for 3 days (Day 2–4, missed dose on
//   Day 1)"; an accidental dose: "… - Accidental dose: 1/4 tab Albendazole
//   on Day 1" ("1/2 dose of 1/4 tab…" when partial)
export function recordText(session, line) {
    if (line.kind === "accidental") {
        const day = line.fromDay ?? 1;
        const given = givenOn(line, day);
        const result = doseOf(line, day)?.result;
        const part = PARTIALS.includes(result) ? `${result} dose of ` : "";
        return `${SESSIONS[session]} - Accidental dose: ${part}${given.dose} ${given.medication} on Day ${day}`;
    }
    const fulls = DAYS.filter((d) => isFull(line, d));
    const partials = DAYS.filter((d) => PARTIALS.includes(doseOf(line, d)?.result));
    const meds = [...new Set(fulls.map((d) => givenOn(line, d).medication))];
    let words;
    if (meds.length > 1) {
        words = meds
            .map((m) => {
                const days = fulls.filter((d) => givenOn(line, d).medication === m);
                return `${givenOn(line, days[0]).dose} ${m} on ${dayList(days)}`;
            })
            .join(", then ");
    } else {
        const given = givenOn(line, fulls[0] ?? 1);
        const need = daysNeeded(line, given.medication);
        const runStart = fulls.find((d) => fulls.includes(d + 1) && fulls.includes(d + 2));
        // (from Day 2: which days, and why)
        const late =
            runStart > 1
                ? ` (Day ${runStart}–${runStart + 2}${
                      ["none", "skipped"].includes(doseOf(line, runStart - 1)?.result)
                          ? `, missed dose on Day ${runStart - 1}`
                          : ""
                  })`
                : "";
        const how = !fulls.length
            ? "not taken"
            : need === 1
              ? "one dose only"
              : runStart
                ? `once a day for 3 days${late}`
                : fulls.length === 1
                  ? `took one dose on Day ${fulls[0]} only`
                  : `took full doses on ${dayList(fulls)}`;
        words = `${given.dose} ${given.medication}, ${how}`;
    }
    const partial = partials.map((d) => `; ${doseOf(line, d).result} dose on Day ${d}`).join("");
    return `${SESSIONS[session]} - ${words}${partial}`;
}

// A day's WhatsApp summary:
//   *H&B Troop 3-Month Deworming*
//   _Day 2_
//   ✅ All took   (or: All took except Sybil, Leeloo and Laser)
//   (a blank line, then)
//   🐒 Minkey only got 3/4 dose today
//   🐒 Shanti-Ray and Toru skipped today (missed day 2 doses)
//   🐒 Ash didn't get a dose as they missed Day 2   (course finished)
//   🐒 Laser changed to Milbeworm
//   🐒 Bob added to the list: 1/4 tab Albendazole for 3 days
//   🐒 Bob got an accidental 1/4 tab Albendazole in Banana
//   and the day's note
// Only the monkeys with something entered that day; none: null.
//   lines: the sheet's monkeys, each with its name
export function daySummary(sheet, allLines, day, note = "") {
    const lines = allLines.filter((l) => onDay(l, day));
    const accidents = lines.filter((l) => l.kind === "accidental" && doseOf(l, day)?.result);
    const today = lines.filter((l) => l.kind !== "accidental" && doseOf(l, day)?.result);
    const switched = lines.filter((l) => doseOf(l, day)?.medication);
    if (!today.length && !switched.length && !accidents.length) return null;
    const named = (test) => today.filter(test).map((l) => l.name);
    const none = named((l) => doseOf(l, day).result === "none");
    const extras = [];
    for (const part of PARTIALS) {
        const names = named((l) => doseOf(l, day).result === part);
        if (names.length) extras.push(`🐒 ${nameList(names)} only got ${part} dose today`);
    }
    const skipped = today.filter((l) => doseOf(l, day).result === "skipped");
    for (const reason of [...new Set(skipped.map((l) => doseOf(l, day).note ?? ""))]) {
        const names = skipped.filter((l) => (doseOf(l, day).note ?? "") === reason).map((l) => l.name);
        extras.push(`🐒 ${nameList(names)} skipped today${reason ? ` (${reason})` : ""}`);
    }
    // (not given today because a day before was missed: course finished)
    const stopped = lines.filter((l) => !doseOf(l, day)?.result && dayAdvice(l, day)?.missed);
    for (const missed of [...new Set(stopped.map((l) => dayAdvice(l, day).missed))]) {
        const names = stopped.filter((l) => dayAdvice(l, day).missed === missed).map((l) => l.name);
        extras.push(`🐒 ${nameList(names)} didn't get a dose as they missed Day ${missed}`);
    }
    for (const l of switched) {
        extras.push(`🐒 ${l.name} changed to ${doseOf(l, day).medication}`);
    }
    for (const l of lines.filter((x) => x.kind === "added" && (x.fromDay ?? 1) === day)) {
        extras.push(
            `🐒 ${l.name} added to the list: ${l.dose} ${l.medication}${l.days === 1 ? ", one dose" : " for 3 days"}`
        );
    }
    for (const l of accidents) {
        const { result, food } = doseOf(l, day);
        const part = PARTIALS.includes(result) ? `${result} dose of ` : "";
        extras.push(`🐒 ${l.name} got an accidental ${part}${l.dose} ${l.medication}${food ? ` in ${food}` : ""}`);
    }
    if (note.trim()) extras.push(note.trim());
    return [
        `*${sheetTitle(sheet)}*`,
        `_Day ${day}_`,
        none.length ? `All took except ${nameList(none)}` : "✅ All took",
        ...(extras.length ? ["", ...extras] : []),
    ].join("\n");
}
