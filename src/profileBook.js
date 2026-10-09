import { ageInYears, currentBabySeason } from "./ages";
import { fullName } from "./places";

// What goes in a Profile Book, and in what order. Books are made for one
// troop, or for this season's orphans/babies from every troop.

// From this age, monkeys are adult size and listed by sex
export const ADULT_AGE = 4;

// The troop picker's extra choice: this season's orphans/babies, every troop
export const BABIES_BOOK = "Orphans/Babies";

const byName = (a, b) => a.name.localeCompare(b.name);

// The monkeys in a book: a troop's, or this season's babies (born this baby
// season or since, so a July baby joins straight away)
export function bookMonkeys(monkeys, book, today = new Date()) {
    if (book === BABIES_BOOK) {
        const season = currentBabySeason(today);
        return monkeys.filter((m) => m.year && Number(m.year) >= season);
    }
    return monkeys.filter((m) => m.troop === book);
}

// The book's sections, in order, each A–Z:
//   Adult Females, Adult Males (4 and over), Adults (Sex Unknown). Monkeys
//   with no birth year count as adults: most are older monkeys from before
//   records were kept.
//   "2023 Orphans/Babies", "2024 Orphans/Babies"…: younger monkeys by
//   birth season, oldest first, males and females together
// Empty sections are left out.
export function bookSections(monkeys, today = new Date()) {
    const adultFemales = [];
    const adultMales = [];
    const adultsSexUnknown = [];
    const bySeason = new Map();

    for (const m of monkeys) {
        const age = ageInYears(m.year, today);
        if (age === null || age >= ADULT_AGE) {
            if (m.sex === "female") adultFemales.push(m);
            else if (m.sex === "male") adultMales.push(m);
            else adultsSexUnknown.push(m);
        } else {
            const season = Number(m.year);
            if (!bySeason.has(season)) bySeason.set(season, []);
            bySeason.get(season).push(m);
        }
    }

    const young = [...bySeason.entries()]
        .sort(([a], [b]) => a - b)
        .map(([season, list]) => ({ title: `${season} Orphans/Babies`, monkeys: list }));

    return [
        { title: "Adult Females", monkeys: adultFemales },
        { title: "Adult Males", monkeys: adultMales },
        { title: "Adults (Sex Unknown)", monkeys: adultsSexUnknown },
        ...young,
    ]
        .filter((s) => s.monkeys.length > 0)
        .map((s) => ({ ...s, monkeys: [...s.monkeys].sort(byName) }));
}

// The book's title, e.g. "Goliath Troop" or "2025 Orphans/Babies"
export function bookTitle(book, today = new Date()) {
    return book === BABIES_BOOK ? `${currentBabySeason(today)} Orphans/Babies` : `${fullName(book)} Troop`;
}
