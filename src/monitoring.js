// The Troop Monitoring Sheet: a troop's monkeys, A–Z, to tick off during
// monitoring. The troop first (the grown-ups, and anyone whose birth year
// isn't known), then the youngest four birth years, each under its own
// heading (they're small, so easier to tell apart this way). Then, in
// sections of their own at the end, the monkeys in the introcages at the
// troop's enclosure (troop adults are sometimes in one for a while, so
// they're not missed), by introcage; and the Bachelor Block's monkeys on
// Gismo's sheet.
import { currentBabySeason } from "./ages";

// The troops that are monitored: the ones living in an enclosure in one
// of the sanctuary's sections (not the Bandits, a wild troop living
// around the sanctuary: on record, but not in our care).
//   homeOf(troop): its enclosure's name (troopHome in monkeyData.js)
export const MONITORED_SECTIONS = ["Top", "Middle", "Bottom", "Sickbay"];
export function monitoredTroops(troops, enclosures, homeOf) {
    return troops.filter((troop) => {
        const home = enclosures.find((e) => e.type === "troop" && e.name === homeOf(troop));
        return Boolean(home) && MONITORED_SECTIONS.includes(home.section);
    });
}

// A block (no troop of its own) whose monkeys are monitored on a troop's
// sheet, under its own heading: Gismo's sheet has the Bachelor Block
export const SHEET_BLOCKS = { Gismo: "Bachelor Block" };

// How many of the youngest birth years get their own heading
export const YOUNG_YEARS = 4;

const byName = (a, b) => a.name.localeCompare(b.name);

// By introcage ("Goliath B" before "Goliath B1", "A2" before "A10"), then name
const byCage = (a, b) => a.introcage.localeCompare(b.introcage, undefined, { numeric: true }) || byName(a, b);

// [{ title (null for the troop), monkeys }], empty groups left out.
//   home: the troop's enclosure (the same name as the troop, by default)
export function monitoringGroups(monkeys, troop, today = new Date(), home = troop) {
    const inTroop = monkeys.filter((m) => m.troop === troop && !m.introcage).sort(byName);
    // Monkeys in an introcage (not a care unit's area) of an enclosure
    const inCages = (enclosure) =>
        monkeys
            .filter((m) => m.introcage && m.introcageType !== "area" && m.enclosure === enclosure)
            .sort(byCage);
    const newest = currentBabySeason(today);
    const years = Array.from({ length: YOUNG_YEARS }, (_, i) => newest - (YOUNG_YEARS - 1) + i);
    const isYoung = (m) => years.includes(Number(m.year));
    return [
        { title: null, monkeys: inTroop.filter((m) => !isYoung(m)) },
        ...years.map((year) => ({ title: `Orphans ${year}`, monkeys: inTroop.filter((m) => Number(m.year) === year) })),
        { title: "Introcages", monkeys: inCages(home) },
        ...(SHEET_BLOCKS[troop] ? [{ title: SHEET_BLOCKS[troop], monkeys: inCages(SHEET_BLOCKS[troop]) }] : []),
    ].filter((g) => g.monkeys.length > 0);
}

// A big troop over more than one page: up to 60 monkeys fit on one; more
// than that go 50 to a page (so the last page is never just a few). An
// Orphans group is kept together, moving on to the next page if it won't
// fit; the troop itself (the big group) is split where it must be.
// [[{ title, monkeys }]]: the groups on each page
export const ONE_PAGE_MAX = 60;
export const PER_PAGE = 50;
export function monitoringPages(groups) {
    const total = groups.reduce((n, g) => n + g.monkeys.length, 0);
    if (total <= ONE_PAGE_MAX) return [groups];
    const pages = [[]];
    let room = PER_PAGE;
    for (const group of groups) {
        let rest = group.monkeys;
        while (rest.length) {
            // An Orphans group that won't fit: on to a new page (unless
            // this one's empty, or it's too big for any page)
            if (group.title && rest.length > room && room < PER_PAGE && rest.length <= PER_PAGE) {
                pages.push([]);
                room = PER_PAGE;
            }
            const here = rest.slice(0, room);
            pages.at(-1).push({ title: group.title, monkeys: here });
            rest = rest.slice(here.length);
            room -= here.length;
            if (rest.length) {
                pages.push([]);
                room = PER_PAGE;
            }
        }
        if (room === 0) {
            pages.push([]);
            room = PER_PAGE;
        }
    }
    return pages.filter((page) => page.length > 0);
}

// The checks above the monkeys (bold, on grey)
export const MONITORING_CHECKS = ["Date", "Initials", "Food Used", "Fence?", "Food?", "Bowls/taps/misters?", "Perimeter check"];

// How many sessions fit across the page
export const MONITORING_COLUMNS = 15;
