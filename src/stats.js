// The Statistics page's figures (StatisticsPage.jsx), worked out from the
// monkeys. Sanctuary monkeys only: not the Bandits (the wild troop), who
// can be chosen on their own. Age groups: the same as the Filters panel's,
// with unknown ages counted on their own.
// Everything goes by where a monkey lives (its home): a monkey in Sickbay
// or staying in an introcage for now still counts with its troop.
import { AGE_GROUPS, ageFromBirthDate, ageInYears, currentBabySeason } from "./ages";
import { homeName, inIntrocage } from "./places";
import { hasTroop, isEnclosure } from "./enclosures";
import { amPlate, fedBy, hasFeeding } from "./feeding";

// The age groups (the Filters panel's too: ages.js)
export const STAT_AGE_GROUPS = AGE_GROUPS;

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
// in an introcage, as on the AM Plates List): how many Mainfeed feed and
// how many Sickbay do; and of Mainfeed's, how many have each kind
// of plate (a baby's, and those in with them: cut small + fruit) and how many a metal plate
//   → { localTeam, sickbay, normal, cutSmall, cutSmallFruit, fruit, metal }
export function amPlatesFor(monkeys, today = new Date()) {
    const fed = monkeys.filter(hasFeeding);
    const local = fed.filter((m) => fedBy(m) !== "sickbay").map((m) => amPlate(m, today, fed));
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

const todayText = (today = new Date()) =>
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

// A baby's age from its birth date: "5 days old", "3 weeks old", "4 months
// old" (the Full Profile's too: ages.js); null without a birth date
export const babyAgeText = (birthDate, today = new Date()) => ageFromBirthDate(birthDate, today);

// This season's Baby Care babies, wherever they are now: those who arrived into
// Baby Care or one of its areas (they've moved on since, some of them), and any
// there now whose arrival place wasn't recorded. Born on site, or arrived
// elsewhere: not theirs. (Baby Care's stats, e.g. Baby Care 2026)
export function seasonBabies(monkeys, enclosures, today = new Date()) {
    const unit = enclosures.find((e) => e.type === "care_unit" && e.name === BABY_CARE);
    const places = new Set(unit ? [unit.id, ...enclosures.filter((e) => e.parentId === unit.id).map((e) => e.id)] : []);
    return sanctuaryMonkeys(monkeys).filter(
        (m) => Number(m.year) === currentBabySeason(today) && (places.has(m.arrivalPlaceId) || homeName(m) === BABY_CARE)
    );
}

// Baby Care's youngest and oldest (by birth date; babies without one can't
// be placed)
//   → { youngest, oldest } (monkeys, or null)
export function youngestOldest(babies) {
    const dated = babies.filter((m) => m.birthDate).sort((a, b) => a.birthDate.localeCompare(b.birthDate));
    return { youngest: dated.at(-1) ?? null, oldest: dated[0] ?? null };
}

// The youngest to arrive: the least age at arrival → { baby, days, age ("2
// days old"), date }, or null (needs both dates)
export function youngestArrival(babies) {
    const dayOf = (date) => new Date(`${date}T00:00:00Z`).getTime();
    const dated = babies
        .filter((m) => m.birthDate && m.arrivalDate && m.arrivalDate >= m.birthDate)
        .map((m) => ({ baby: m, days: Math.round((dayOf(m.arrivalDate) - dayOf(m.birthDate)) / 86400000), date: m.arrivalDate }))
        .sort((a, b) => a.days - b.days);
    if (!dated.length) return null;
    const top = dated[0];
    const words = babyAgeText(top.baby.birthDate, new Date(`${top.date}T00:00:00`));
    return { ...top, age: words === "Born today" ? "Same day" : words };
}

// All the milk these babies have drunk, in ml
export function totalMilk(feeds, babies) {
    const ids = new Set(babies.map((m) => m.id));
    return feeds.reduce((sum, f) => (ids.has(f.monkeyId) ? sum + f.ml : sum), 0);
}

// "9,850 ml", then from 5 figures, litres to one decimal: "12.4 L"
export const milkAmount = (ml) => (ml < 10000 ? `${ml.toLocaleString("en-GB")} ml` : `${(ml / 1000).toLocaleString("en-GB", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} L`);

// The highest single day's milk total among these babies → { baby, ml, date },
// or null (the first to reach it, if it's been matched)
//   feeds: [{ monkeyId, date, ml }]
export function highestMilk(feeds, babies) {
    const byId = new Map(babies.map((m) => [m.id, m]));
    const top = feeds
        .filter((f) => byId.has(f.monkeyId))
        .sort((a, b) => b.ml - a.ml || a.date.localeCompare(b.date))[0];
    return top ? { baby: byId.get(top.monkeyId), ml: top.ml, date: top.date } : null;
}

// The heaviest of these babies, by each one's latest weighing → { baby, grams,
// date }, or null
//   weights: [{ monkeyId, date, grams }]
export function heaviestBaby(weights, babies) {
    const byId = new Map(babies.map((m) => [m.id, m]));
    const latest = new Map();
    for (const w of weights) {
        if (byId.has(w.monkeyId) && !(latest.get(w.monkeyId)?.date >= w.date)) latest.set(w.monkeyId, w);
    }
    const top = [...latest.values()].sort((a, b) => b.grams - a.grams)[0];
    return top ? { baby: byId.get(top.monkeyId), grams: top.grams, date: top.date } : null;
}

// The largest gain between a baby's weighing and their next → { baby, gain,
// date (the later weighing's) }, or null. Weighings can run a little late, but
// over this many days apart it isn't a week's gain any more, so it doesn't count.
const WEEK_GAIN_MAX_DAYS = 10;
export function largestWeeklyGain(weights, babies) {
    const dayOf = (date) => new Date(`${date}T00:00:00Z`).getTime() / 86400000;
    let best = null;
    for (const baby of babies) {
        const list = weights.filter((w) => w.monkeyId === baby.id).sort((x, y) => x.date.localeCompare(y.date));
        list.forEach((w, i) => {
            const before = list[i - 1];
            if (!before || dayOf(w.date) - dayOf(before.date) > WEEK_GAIN_MAX_DAYS) return;
            const gain = w.grams - before.grams;
            if (gain > 0 && (!best || gain > best.gain)) best = { baby, gain, date: w.date };
        });
    }
    return best;
}

// Whole weeks old on a date (a baby's first week is 0), or null: no birth
// date, or a record from before it
export function ageInWeeks(birthDate, date) {
    if (!birthDate) return null;
    const days = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${birthDate}T00:00:00Z`)) / 86400000);
    return days < 0 ? null : Math.floor(days / 7);
}

// Each baby's figure for each week of their age: { week → { baby → value } }
function byAgeWeek(records, birthDates, pick) {
    const weeks = new Map();
    for (const r of records) {
        const week = ageInWeeks(birthDates.get(r.monkeyId), r.date);
        if (week === null) continue;
        if (!weeks.has(week)) weeks.set(week, new Map());
        const babies = weeks.get(week);
        babies.set(r.monkeyId, [...(babies.get(r.monkeyId) ?? []), r]);
    }
    return new Map([...weeks].map(([week, babies]) => [week, new Map([...babies].map(([id, list]) => [id, pick(list)]))]));
}

// Growth by age: what's typical at each week of a baby's age, across every
// baby with a birth date (past babies too), and one baby's own line to set
// against it
//   records: [{ monkeyId, date, … }]; monkeys: everyone (for birth dates)
//   pick(a baby's records that week) → their figure
//   → { points: [{ x: week, y: the average, babies: how many, own: the baby's
//     figure or null }] oldest first, babies: how many in all }
function growthByAge(records, monkeys, pick, babyId) {
    const birthDates = new Map(monkeys.filter((m) => m.birthDate).map((m) => [m.id, m.birthDate]));
    const weeks = byAgeWeek(records, birthDates, pick);
    const all = new Set();
    const points = [...weeks]
        .sort(([a], [b]) => a - b)
        .map(([x, babies]) => {
            const values = [...babies.values()];
            for (const id of babies.keys()) all.add(id);
            return {
                x,
                y: Math.round(values.reduce((n, v) => n + v, 0) / values.length),
                babies: values.length,
                own: babyId !== null && babies.has(babyId) ? Math.round(babies.get(babyId)) : null,
            };
        });
    return { points, babies: all.size };
}

// Milk by age: each baby's average ml a day that week
export const milkByAge = (feeds, monkeys, babyId = null) =>
    growthByAge(feeds, monkeys, (list) => list.reduce((n, f) => n + f.ml, 0) / list.length, babyId);

// Weight by age: each baby's last weighing that week
export const weightByAge = (weights, monkeys, babyId = null) =>
    growthByAge(weights, monkeys, (list) => [...list].sort((a, b) => a.date.localeCompare(b.date)).at(-1).grams, babyId);
