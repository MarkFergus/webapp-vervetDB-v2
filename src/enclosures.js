// Working things out about enclosures from the monkeys (nothing is stored
// twice: counts and residents always match the monkeys' records).
// An enclosure is { id, name, type, parentId, section, … } (enclosuresArr.js).
import { homeName, inIntrocage } from "./places";
import { ageInYears } from "./ages";

const byName = (a, b) => a.name.localeCompare(b.name);

// Links: by id, so renaming an enclosure never breaks a link or a QR code
export const enclosureHash = (enclosure) => `#enclosure/${enclosure.id}`;
export const ENCLOSURES_HASH = "#enclosures";
export const isEnclosuresRoute = (route) => route === "enclosures" || route.startsWith("enclosure/");

// The enclosure a route points to ("enclosure/57"), or null
export function enclosureFromRoute(route, enclosures) {
    const match = /^enclosure\/(\d+)$/.exec(route);
    return match ? enclosures.find((e) => e.id === Number(match[1])) ?? null : null;
}

// A troop enclosure's introcages, in order
export function introcagesOf(enclosure, enclosures) {
    return enclosures
        .filter((e) => e.parentId === enclosure.id)
        .sort((a, b) => a.sortOrder - b.sortOrder);
}

// "C1" for "H&B C1" (its name without the enclosure's)
export function introcageCode(introcage, parent) {
    const prefix = `${parent.name} `;
    return introcage.name.startsWith(prefix) ? introcage.name.slice(prefix.length) : introcage.name;
}

// The troop living in a troop enclosure
export const troopMonkeys = (enclosure, monkeys) =>
    monkeys.filter((m) => !inIntrocage(m) && homeName(m) === enclosure.name).sort(byName);

// Monkeys in any of a troop enclosure's introcages
export const introcageMonkeys = (enclosure, monkeys) =>
    monkeys.filter((m) => inIntrocage(m) && homeName(m) === enclosure.name).sort(byName);

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

// The troop enclosures, grouped by section in the sections' order:
// [{ section, enclosures: [...] }] (sections with none left out)
export function bySection(enclosures, sections) {
    const troopEnclosures = enclosures.filter((e) => e.type === "troop").sort((a, b) => a.sortOrder - b.sortOrder);
    return sections
        .map((section) => ({ section, enclosures: troopEnclosures.filter((e) => e.section === section) }))
        .filter((group) => group.enclosures.length > 0);
}

// What the monkey form's Enclosure and Location boxes offer, in the troops'
// order: [{ troop, enclosure ("Robert", or the troop's name if it has no
// enclosure, like the Bandits), introcages: [{ id, name }] }]. homeOf(troop)
// gives a troop's enclosure name. withIntrocages false: troops only (the
// database can't save introcage monkeys yet).
export function placeChoices(troops, enclosures, homeOf, withIntrocages = true) {
    return troops.map((troop) => {
        const enclosure = enclosures.find((e) => e.type === "troop" && e.name === homeOf(troop));
        return {
            troop,
            enclosure: enclosure?.name ?? troop,
            introcages:
                enclosure && withIntrocages
                    ? introcagesOf(enclosure, enclosures).map((e) => ({ id: e.id, name: e.name }))
                    : [],
        };
    });
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
export function sizeRank(enclosure, enclosures) {
    const troopEnclosures = enclosures.filter((e) => e.type === "troop");
    return rankOf(enclosure, troopEnclosures, (e) => e.size ?? null);
}
export function troopRank(enclosure, enclosures, monkeys) {
    const troopEnclosures = enclosures.filter((e) => e.type === "troop");
    return rankOf(enclosure, troopEnclosures, (e) => troopMonkeys(e, monkeys).length);
}

// The average age (years, to one decimal place) of the monkeys whose birth
// year is known, or null if none is
export function averageAge(monkeys, today = new Date()) {
    const ages = monkeys.map((m) => ageInYears(m.year, today)).filter((age) => age !== null);
    if (!ages.length) return null;
    return Math.round((ages.reduce((sum, age) => sum + age, 0) / ages.length) * 10) / 10;
}
