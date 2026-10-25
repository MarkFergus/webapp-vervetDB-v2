// The Statistics page's figures (StatisticsPage.jsx), worked out from the
// monkeys. Sanctuary monkeys only: not the Bandits (the wild troop), who
// can be chosen on their own. Age groups: the page's own (finer than the
// Filters panel's), with unknown ages counted on their own.
// Everything goes by where a monkey lives (its home): a monkey in Sickbay
// or staying in an introcage for now still counts with its troop.
import { ageInYears } from "./ages";
import { homeName, inIntrocage } from "./places";
import { hasTroop, isEnclosure } from "./enclosures";
import { amPlate, fedBy, hasFeeding } from "./feeding";

// The page's age groups, by age on the 1 October birthday (finer than the
// Filters panel's, ages.js)
export const STAT_AGE_GROUPS = [
    { id: "babies", label: "Babies", hint: "<1", test: (age) => age === 0 },
    { id: "juveniles", label: "Juveniles", hint: "1–3", test: (age) => age >= 1 && age <= 3 },
    { id: "youngAdults", label: "Young Adults", hint: "4–10", test: (age) => age >= 4 && age <= 10 },
    { id: "seniorAdults", label: "Senior Adults", hint: "11–19", test: (age) => age >= 11 && age <= 19 },
    { id: "goldenOldies", label: "Golden Oldies", hint: "20+", test: (age) => age >= 20 },
];

// The Bandits (the wild troop): not in the sanctuary's figures, but there
// to choose on their own
export const BANDITS = "Bandits";

// What the stats can be for: "troop" (the troop only), "introcages" (its
// introcages only) or "all" (both)
export const PARTS = [
    { id: "all", label: "All" },
    { id: "troop", label: "Troop" },
    { id: "introcages", label: "Introcages" },
];

export const sanctuaryMonkeys = (monkeys) => monkeys.filter((m) => m.troop !== BANDITS);
export const banditMonkeys = (monkeys) => monkeys.filter((m) => m.troop === BANDITS);

// The monkeys living in an enclosure (its troop and its introcages or
// areas), or one part of them; no enclosure: the whole sanctuary
//   part: "all", "troop" or "introcages"
export function monkeysIn(monkeys, enclosure, part = "all") {
    const all = sanctuaryMonkeys(monkeys);
    const here = enclosure ? all.filter((m) => homeName(m) === enclosure.name) : all;
    if (part === "troop") return here.filter((m) => !inIntrocage(m));
    if (part === "introcages") return here.filter(inIntrocage);
    return here;
}

// A whole number percentage of the total (0 when there's none)
export const percent = (count, total) => (total ? Math.round((count / total) * 100) : 0);

// The figures for a group of monkeys
//   → { total, sex: { female, male, unknown }, ages: { babies, juveniles,
//      youngAdults, seniorAdults, goldenOldies, unknown }, averageAge (null: no known ages),
//      troop, introcages, species: { vervet: n, … } }
export function statsFor(monkeys) {
    const sex = { female: 0, male: 0, unknown: 0 };
    const ages = { ...Object.fromEntries(STAT_AGE_GROUPS.map((g) => [g.id, 0])), unknown: 0 };
    const species = {};
    let ageTotal = 0;
    let aged = 0;
    let troop = 0;
    for (const m of monkeys) {
        sex[m.sex === "female" || m.sex === "male" ? m.sex : "unknown"] += 1;
        const age = ageInYears(m.year);
        if (age === null) {
            ages.unknown += 1;
        } else {
            ages[STAT_AGE_GROUPS.find((g) => g.test(age)).id] += 1;
            ageTotal += age;
            aged += 1;
        }
        if (!inIntrocage(m)) troop += 1;
        if (m.species) species[m.species] = (species[m.species] ?? 0) + 1;
    }
    return {
        total: monkeys.length,
        sex,
        ages,
        averageAge: aged ? Math.round((ageTotal / aged) * 10) / 10 : null,
        troop,
        introcages: monkeys.length - troop,
        species,
    };
}

// How many sanctuary monkeys live in each enclosure (its troop and its
// introcages or areas), most first; empty ones left out
//   → [{ enclosure, count, troop, introcages }]
export function countsByEnclosure(monkeys, enclosures) {
    const all = sanctuaryMonkeys(monkeys);
    return enclosures
        .filter(isEnclosure)
        .map((enclosure) => {
            const here = all.filter((m) => homeName(m) === enclosure.name);
            const introcages = here.filter(inIntrocage).length;
            return { enclosure, count: here.length, troop: here.length - introcages, introcages };
        })
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count || a.enclosure.name.localeCompare(b.enclosure.name));
}

// How many sanctuary monkeys live in each section (by their home
// enclosure's section), in the sections' order
//   → [{ section, count }]
export function countsBySection(monkeys, enclosures, sections) {
    const sectionOf = Object.fromEntries(enclosures.filter(isEnclosure).map((e) => [e.name, e.section]));
    const all = sanctuaryMonkeys(monkeys);
    return sections.map((section) => ({
        section,
        count: all.filter((m) => sectionOf[homeName(m)] === section).length,
    }));
}

// A section's name in full: "Top Section", but "Care Units"
export const sectionLabel = (section) => (section === "Care Units" ? section : `${section} Section`);

// Space: each troop monkey's share of its troop enclosure (its recorded
// size ÷ the monkeys in the troop), in m²; null if the size isn't recorded
// or there's no troop. (Introcages: later.)
export function spacePerMonkey(enclosure, monkeys) {
    const troop = monkeysIn(monkeys, enclosure, "troop").length;
    return enclosure.size && troop ? Math.round(enclosure.size / troop) : null;
}

// Every troop enclosure's space per monkey, most space first (sizes not
// recorded last)
//   → [{ enclosure, troop: monkeys in the troop, perMonkey (m², or null) }]
export function spaceByEnclosure(monkeys, enclosures) {
    const rows = enclosures
        .filter(hasTroop)
        .map((enclosure) => ({
            enclosure,
            troop: monkeysIn(monkeys, enclosure, "troop").length,
            perMonkey: spacePerMonkey(enclosure, monkeys),
        }))
        .filter((row) => row.troop > 0);
    return ranked(rows, (row) => row.perMonkey);
}

// Rows in order of a value: highest first (or lowest, highFirst false);
// rows with no value (null) always last; then by enclosure name
export function ranked(rows, valueOf, highFirst = true) {
    return [...rows].sort((a, b) => {
        const va = valueOf(a);
        const vb = valueOf(b);
        return (
            (va === null) - (vb === null) ||
            (highFirst ? (vb ?? 0) - (va ?? 0) : (va ?? 0) - (vb ?? 0)) ||
            a.enclosure.name.localeCompare(b.enclosure.name)
        );
    });
}

// Each troop's female / male split (troop monkeys: not the introcages),
// the most female first
//   → [{ enclosure, total, female, male, unknown, femaleShare (%) }]
export function sexByTroop(monkeys, enclosures) {
    const rows = enclosures
        .filter(hasTroop)
        .map((enclosure) => {
            const { total, sex } = statsFor(monkeysIn(monkeys, enclosure, "troop"));
            return { enclosure, total, ...sex, femaleShare: percent(sex.female, total) };
        })
        .filter((row) => row.total > 0);
    return ranked(rows, (row) => row.femaleShare);
}

// The AM plates, by monkey (introcage monkeys, and troop monkeys staying
// in an introcage, as on the AM Plates List): how many the Local Team feed
// and how many Sickbay do; and of the Local Team's, how many have each kind
// of plate (a baby's: cut small + fruit) and how many a metal plate
//   → { localTeam, sickbay, normal, cutSmall, cutSmallFruit, fruit, metal }
export function amPlatesFor(monkeys, today = new Date()) {
    const fed = monkeys.filter(hasFeeding);
    const local = fed.filter((m) => fedBy(m) !== "sickbay").map((m) => amPlate(m, today));
    const count = (test) => local.filter(test).length;
    return {
        localTeam: local.length,
        sickbay: fed.length - local.length,
        normal: count((p) => !p.cutSmall && !p.fruit),
        cutSmall: count((p) => p.cutSmall && !p.fruit),
        cutSmallFruit: count((p) => p.cutSmall && p.fruit),
        fruit: count((p) => !p.cutSmall && p.fruit),
        metal: count((p) => p.metal),
    };
}

// ---- Baby Care ----

export const BABY_CARE = "Baby Care";

// The days between two dates ("2026-10-01", "2026-10-24")
const DAY = 24 * 60 * 60 * 1000;
const daysBetween = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY);
const todayText = (today = new Date()) =>
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

// A baby's age from its birth date: "5 days old", "3 weeks old", "4 months
// old"; null without a birth date
export function babyAgeText(birthDate, today = new Date()) {
    if (!birthDate) return null;
    const days = Math.max(0, daysBetween(birthDate, todayText(today)));
    const say = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} old`;
    if (days < 14) return say(days, "day");
    if (days < 63) return say(Math.floor(days / 7), "week");
    return say(Math.floor(days / 30.44), "month");
}

// Baby Care's youngest and oldest (by birth date; babies without one can't
// be placed)
//   → { youngest, oldest } (monkeys, or null)
export function youngestOldest(babies) {
    const dated = babies.filter((m) => m.birthDate).sort((a, b) => a.birthDate.localeCompare(b.birthDate));
    return { youngest: dated.at(-1) ?? null, oldest: dated[0] ?? null };
}

// The Monday a date's week starts on ("2026-10-22" → "2026-10-19")
export function weekStart(date) {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return todayText(d);
}

// Milk drunk per day, in ml: one baby's (babyId), or all of them together
// (null)
//   feeds: [{ monkeyId, date ("2026-10-24"), ml, notes }] (a day's total
//   each: milk-totals.sql)
//   → [{ x: date, y: ml, notes: [that day's notes] }], oldest first
export function milkPerDay(feeds, babyId = null) {
    const byDay = new Map();
    for (const f of feeds) {
        if (babyId !== null && f.monkeyId !== babyId) continue;
        const day = byDay.get(f.date) ?? { y: 0, notes: [] };
        day.y += f.ml;
        if (f.notes) day.notes.push(f.notes);
        byDay.set(f.date, day);
    }
    return [...byDay].sort(([a], [b]) => a.localeCompare(b)).map(([x, day]) => ({ x, ...day }));
}

// One baby's every weighing, in grams, on its day (a weighing can be late,
// or more than one a week), oldest first
//   weights: [{ monkeyId, date, grams }]
//   → [{ x: date, y: grams }]
export function weightsByDate(weights, babyId) {
    return weights
        .filter((w) => w.monkeyId === babyId)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((w) => ({ x: w.date, y: w.grams }));
}

// Weight per week, in grams (by the week's Monday): one baby's (its last
// weighing that week), or all of them (the average of each baby's last
// weighing that week)
//   weights: [{ monkeyId, date, grams }]
//   → [{ x: week's Monday, y: grams }], oldest first
export function weightPerWeek(weights, babyId = null) {
    const last = new Map(); // "week|baby" → { date, grams }
    for (const w of weights) {
        if (babyId !== null && w.monkeyId !== babyId) continue;
        const key = `${weekStart(w.date)}|${w.monkeyId}`;
        const seen = last.get(key);
        if (!seen || w.date >= seen.date) last.set(key, w);
    }
    const byWeek = new Map();
    for (const [key, w] of last) {
        const week = key.split("|")[0];
        byWeek.set(week, [...(byWeek.get(week) ?? []), w.grams]);
    }
    return [...byWeek]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([x, all]) => ({ x, y: Math.round(all.reduce((n, g) => n + g, 0) / all.length) }));
}
