// The Statistics page's figures (StatisticsPage.jsx), worked out from the
// monkeys. Sanctuary monkeys only: not the Bandits (the wild troop), who
// can be chosen on their own. Age groups: the Filters panel's (ages.js),
// with unknown ages counted on their own.
// Everything goes by where a monkey lives (its home): a monkey in Sickbay
// or staying in an introcage for now still counts with its troop.
import { AGE_GROUPS, ageInYears } from "./ages";
import { homeName, inIntrocage } from "./places";
import { hasTroop, isEnclosure } from "./enclosures";
import { amPlate, fedBy, hasFeeding } from "./feeding";

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
//      adults, elderly, unknown }, averageAge (null: no known ages),
//      troop, introcages, species: { vervet: n, … } }
export function statsFor(monkeys) {
    const sex = { female: 0, male: 0, unknown: 0 };
    const ages = { ...Object.fromEntries(AGE_GROUPS.map((g) => [g.id, 0])), unknown: 0 };
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
            ages[AGE_GROUPS.find((g) => g.test(age)).id] += 1;
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
//   → [{ enclosure, count }]
export function countsByEnclosure(monkeys, enclosures) {
    const all = sanctuaryMonkeys(monkeys);
    return enclosures
        .filter(isEnclosure)
        .map((enclosure) => ({ enclosure, count: all.filter((m) => homeName(m) === enclosure.name).length }))
        .filter((row) => row.count > 0)
        .sort((a, b) => b.count - a.count || a.enclosure.name.localeCompare(b.enclosure.name));
}

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
