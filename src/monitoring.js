// The Troop Monitoring Sheet: a troop's monkeys, A–Z, to tick off during
// monitoring. The troop first (the grown-ups, and anyone whose birth year
// isn't known), then the youngest four birth years, each under its own
// heading (they're small, so easier to tell apart this way). Troop monkeys
// only: introcage monkeys are on the monitoring notes.
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

// How many of the youngest birth years get their own heading
export const YOUNG_YEARS = 4;

const byName = (a, b) => a.name.localeCompare(b.name);

// [{ title (null for the troop), monkeys }], empty groups left out
export function monitoringGroups(monkeys, troop, today = new Date()) {
    const inTroop = monkeys.filter((m) => m.troop === troop && !m.introcage).sort(byName);
    const newest = currentBabySeason(today);
    const years = Array.from({ length: YOUNG_YEARS }, (_, i) => newest - (YOUNG_YEARS - 1) + i);
    const isYoung = (m) => years.includes(Number(m.year));
    return [
        { title: null, monkeys: inTroop.filter((m) => !isYoung(m)) },
        ...years.map((year) => ({ title: `Orphans ${year}`, monkeys: inTroop.filter((m) => Number(m.year) === year) })),
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
