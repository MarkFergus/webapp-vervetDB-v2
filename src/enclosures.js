// Working things out about enclosures from the monkeys (nothing is stored
// twice: counts and residents always match the monkeys' records).
// An enclosure is { id, name, type, parentId, section, … } (enclosuresArr.js).
import { homeName, inIntrocage } from "./places";
import { ageInYears } from "./ages";

const byName = (a, b) => a.name.localeCompare(b.name);

// The kinds of enclosure (supabase/enclosure-types.sql). Enclosures:
//   troop      a troop enclosure (Robert): a troop, plus its introcages
//   block      Bachelor Block: introcages, no troop
//   care_unit  Baby Care, Quarantine, Sickbay Care Unit: where new arrivals
//              go; areas, no troop
// and inside them, where monkeys not in a troop live: introcage (in a
// troop enclosure or block) and area (in a care unit)
export const isInside = (place) => place.type === "introcage" || place.type === "area";
export const isEnclosure = (place) => !isInside(place);
export const hasTroop = (place) => place.type === "troop";
export const isCareUnit = (place) => place.type === "care_unit";
export const TYPE_NAMES = {
    troop: "Troop Enclosure", block: "Block", care_unit: "Care Unit", introcage: "Introcage", area: "Area",
};

// Links: by id, so renaming an enclosure never breaks a link or a QR code
export const enclosureHash = (enclosure) => `#enclosure/${enclosure.id}`;
export const ENCLOSURES_HASH = "#enclosures";
export const isEnclosuresRoute = (route) => route === "enclosures" || route.startsWith("enclosure/");

// The enclosure a route points to ("enclosure/57"), or null
export function enclosureFromRoute(route, enclosures) {
    const match = /^enclosure\/(\d+)$/.exec(route);
    return match ? enclosures.find((e) => e.id === Number(match[1])) ?? null : null;
}

// An enclosure's introcages / areas, in order
export function introcagesOf(enclosure, enclosures) {
    return enclosures
        .filter((e) => e.parentId === enclosure.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

// A care unit that's one space (Quarantine): its one area, named the same
// as itself, or null. The website shows the unit instead of the area.
export function soleArea(enclosure, enclosures) {
    if (!isCareUnit(enclosure)) return null;
    const areas = introcagesOf(enclosure, enclosures);
    return areas.length === 1 && areas[0].name === enclosure.name ? areas[0] : null;
}
// Is this area its care unit's only one (see soleArea)?
export function isSoleArea(place, enclosures) {
    if (place.type !== "area") return false;
    const unit = enclosures.find((e) => e.id === place.parentId);
    return Boolean(unit) && soleArea(unit, enclosures)?.id === place.id;
}

// The page of where a monkey lives: its introcage's or area's (a one-area
// care unit's: the unit's), or its troop's enclosure's ("#enclosure/57"),
// or null if it has none (the Bandits)
export function placeHash(monkey, enclosures) {
    let place = inIntrocage(monkey)
        ? enclosures.find((e) => isInside(e) && e.name === monkey.introcage)
        : enclosures.find((e) => hasTroop(e) && e.name === homeName(monkey));
    if (place && isSoleArea(place, enclosures)) place = enclosures.find((e) => e.id === place.parentId);
    return place ? enclosureHash(place) : null;
}

// "C1" for "H&B C1" (its name without the enclosure's)
export function introcageCode(introcage, parent) {
    const prefix = `${parent.name} `;
    return introcage.name.startsWith(prefix) ? introcage.name.slice(prefix.length) : introcage.name;
}

// The troop living in a troop enclosure
export const troopMonkeys = (enclosure, monkeys) =>
    monkeys.filter((m) => !inIntrocage(m) && homeName(m) === enclosure.name).sort(byName);

// Monkeys in any of an enclosure's introcages / areas
export const introcageMonkeys = (enclosure, monkeys) =>
    monkeys.filter((m) => inIntrocage(m) && homeName(m) === enclosure.name).sort(byName);

// How many monkeys an enclosure has, as its card and the Monkeys sort
// count them: a troop enclosure's troop, or (a block or care unit, which
// has no troop) the monkeys in its introcages / areas
export const monkeyCount = (enclosure, monkeys) =>
    (hasTroop(enclosure) ? troopMonkeys(enclosure, monkeys) : introcageMonkeys(enclosure, monkeys)).length;

// What the places inside it are called on screen: a care unit's are
// "areas" (Dreamland), everyone else's "introcages"
export const introcageWord = (enclosure) => (isCareUnit(enclosure) ? "area" : "introcage");

// Who's in one introcage
export const residents = (introcage, monkeys) => monkeys.filter((m) => m.introcage === introcage.name).sort(byName);

// 600 → "600 m²", 1250 → "1,250 m²" (null: none)
export function sizeText(size) {
    return size == null ? null : `${size.toLocaleString("en-GB")} m²`;
}

// "2014-03" → "March 2014"
export function establishedText(established) {
    if (!established) return null;
    const [year, month] = established.split("-").map(Number);
    return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// The enclosures (not what's inside them), grouped by section in the
// sections' order: [{ section, enclosures: [...] }] (sections with none
// left out)
export function bySection(enclosures, sections) {
    const all = enclosures.filter(isEnclosure).sort((a, b) => a.sortOrder - b.sortOrder);
    return sections
        .map((section) => ({ section, enclosures: all.filter((e) => e.section === section) }))
        .filter((group) => group.enclosures.length > 0);
}

// Stepping through the records (previous / next on a record page):
// enclosures through the enclosures, introcages and areas through every
// introcage and area, enclosure by enclosure, in section order (round from
// the last to the first; a one-area care unit's area left out: it's shown
// as the unit). { prev, next, number, total }, or null if it isn't listed.
export function stepsFrom(enclosure, enclosures, sections) {
    const inOrder = bySection(enclosures, sections).flatMap((group) => group.enclosures);
    const all = isInside(enclosure)
        ? inOrder.flatMap((e) => (soleArea(e, enclosures) ? [] : introcagesOf(e, enclosures)))
        : inOrder;
    const index = all.findIndex((e) => e.id === enclosure.id);
    if (index === -1 || all.length < 2) return null;
    return {
        prev: all[(index - 1 + all.length) % all.length],
        next: all[(index + 1) % all.length],
        number: index + 1,
        total: all.length,
    };
}

// What the monkey form's Enclosure and Location boxes offer, in the troops'
// order, then the blocks and care units: [{ key (the Enclosure box's value:
// the troop's name, or "enclosure:<id>" for a block or care unit), troop
// (null for a block or care unit: its monkeys are always in one of its
// introcages / areas), enclosure ("Robert", or the troop's name if it has
// no enclosure, like the Bandits), noTroop, introcages: [{ id, name }] }].
// homeOf(troop) gives a troop's enclosure name. withIntrocages false:
// troops only (the database can't save introcage monkeys yet).
// careUnitsOnly: just the care units (a new arrival always starts in one).
export function placeChoices(troops, enclosures, homeOf, withIntrocages = true, careUnitsOnly = false) {
    const cagesOf = (enclosure) => introcagesOf(enclosure, enclosures).map((e) => ({ id: e.id, name: e.name }));
    const troopChoices = troops.map((troop) => {
        const enclosure = enclosures.find((e) => hasTroop(e) && e.name === homeOf(troop));
        return {
            key: troop,
            troop,
            enclosure: enclosure?.name ?? troop,
            noTroop: false,
            introcages: enclosure && withIntrocages ? cagesOf(enclosure) : [],
        };
    });
    if (!withIntrocages) return troopChoices;
    const otherChoices = enclosures
        .filter((e) => isEnclosure(e) && !hasTroop(e) && (!careUnitsOnly || isCareUnit(e)))
        // (blocks before care units, each in their order)
        .sort((a, b) => isCareUnit(a) - isCareUnit(b) || a.sortOrder - b.sortOrder)
        .map((enclosure) => ({
            key: `enclosure:${enclosure.id}`,
            troop: null,
            enclosure: enclosure.name,
            noTroop: true,
            introcages: cagesOf(enclosure),
        }));
    return careUnitsOnly ? otherChoices : [...troopChoices, ...otherChoices];
}

// 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th", 22 → "22nd"
export function ordinal(n) {
    const teen = n % 100 >= 11 && n % 100 <= 13;
    const suffix = teen ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
    return `${n}${suffix}`;
}

// Where an item comes when the items are put in order, biggest first (1 =
// the biggest; equal values share a place). valueOf(item) gives the number
// to compare, or null if it isn't known (left out). null if the item's own
// value isn't known.
export function rankOf(item, items, valueOf) {
    const value = valueOf(item);
    if (value == null) return null;
    return 1 + items.filter((other) => valueOf(other) != null && valueOf(other) > value).length;
}

// The troop enclosures in order of size, and of how many troop monkeys
// they have: e.g. 3 (the 3rd largest), or null if its size isn't recorded
// (blocks and care units aren't counted: they have no troop)
export function sizeRank(enclosure, enclosures) {
    const troopEnclosures = enclosures.filter(hasTroop);
    return rankOf(enclosure, troopEnclosures, (e) => e.size ?? null);
}
export function troopRank(enclosure, enclosures, monkeys) {
    const troopEnclosures = enclosures.filter(hasTroop);
    return rankOf(enclosure, troopEnclosures, (e) => troopMonkeys(e, monkeys).length);
}

// The average age (years, to one decimal place) of the monkeys whose birth
// year is known, or null if none is
export function averageAge(monkeys, today = new Date()) {
    const ages = monkeys.map((m) => ageInYears(m.year, today)).filter((age) => age !== null);
    if (!ages.length) return null;
    return Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10;
}
