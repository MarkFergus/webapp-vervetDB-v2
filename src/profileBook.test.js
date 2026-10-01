import { ageInYears, currentBabySeason } from "./ages";
import { BABIES_BOOK, bookMonkeys, bookSections, bookTitle } from "./profileBook";

// A fixed "today", so the ages don't change as time passes
const OCT_2026 = new Date(2026, 9, 1);
const NOV_2026 = new Date(2026, 10, 1);

const monkey = (name, year, sex, troop = "Goliath") => ({ name, year, sex, troop });

describe("ages: everyone is a year older on 1 November", () => {
    test("the current baby season", () => {
        expect(currentBabySeason(OCT_2026)).toBe(2025);
        expect(currentBabySeason(NOV_2026)).toBe(2026);
        expect(currentBabySeason(new Date(2027, 2, 15))).toBe(2026); // March
    });

    test("age in years; babies are 0; no birth year is null", () => {
        expect(ageInYears(2016, OCT_2026)).toBe(9);
        expect(ageInYears(2016, NOV_2026)).toBe(10);
        expect(ageInYears(2025, OCT_2026)).toBe(0);
        expect(ageInYears(2026, OCT_2026)).toBe(0); // born this July
        expect(ageInYears("", OCT_2026)).toBeNull();
    });
});

describe("book order", () => {
    const troop = [
        monkey("Zola", 2010, "female"),
        monkey("Abe", 2015, "male"),
        monkey("Bella", 2018, "female"),
        monkey("Old Tom", "", "male"), // no birth year: counts as an adult
        monkey("Nell", "", "female"),
        monkey("Mystery", 2012, ""),
        monkey("Kito", 2022, "male"), // 3 in Oct 2026: still young
        monkey("Ayo", 2022, "female"),
        monkey("Pip", 2024, "male"),
        monkey("Dot", 2025, "female"), // this season's baby
        monkey("Ash", 2021, "female"), // 4: adult
    ];

    test("adult females, adult males, then each younger season (oldest first), all A–Z", () => {
        const sections = bookSections(troop, OCT_2026);
        expect(sections.map((s) => [s.title, s.monkeys.map((m) => m.name)])).toEqual([
            ["Adult Females", ["Ash", "Bella", "Nell", "Zola"]],
            ["Adult Males", ["Abe", "Old Tom"]],
            ["Adults (Sex Unknown)", ["Mystery"]],
            ["2022 Orphans/Babies", ["Ayo", "Kito"]],
            ["2024 Orphans/Babies", ["Pip"]],
            ["2025 Orphans/Babies", ["Dot"]],
        ]);
    });

    test("on 1 November the oldest youngsters become adults", () => {
        const sections = bookSections(troop, NOV_2026);
        expect(sections.find((s) => s.title === "Adult Males").monkeys.map((m) => m.name)).toEqual([
            "Abe",
            "Kito",
            "Old Tom",
        ]);
        expect(sections.some((s) => s.title === "2022 Orphans/Babies")).toBe(false);
    });

    test("empty sections are left out", () => {
        const sections = bookSections([monkey("Solo", 2010, "male")], OCT_2026);
        expect(sections.map((s) => s.title)).toEqual(["Adult Males"]);
    });
});

describe("which monkeys are in a book", () => {
    const all = [
        monkey("A", 2010, "male", "Goliath"),
        monkey("B", 2025, "female", "Goliath"),
        monkey("C", 2025, "male", "Skrow"),
        monkey("D", 2026, "male", "Royal"), // a July 2026 baby
        monkey("E", 2024, "female", "Skrow"),
        monkey("F", "", "female", "Skrow"),
    ];

    test("a troop's book: just that troop", () => {
        expect(bookMonkeys(all, "Goliath", OCT_2026).map((m) => m.name)).toEqual(["A", "B"]);
        expect(bookTitle("Goliath")).toBe("Goliath Troop");
    });

    test("Orphans/Babies: this season's babies (and newer) from every troop", () => {
        expect(bookMonkeys(all, BABIES_BOOK, OCT_2026).map((m) => m.name)).toEqual(["B", "C", "D"]);
        expect(bookTitle(BABIES_BOOK, OCT_2026)).toBe("2025 Orphans/Babies");
        // After 1 November, the 2025 babies are 1 and drop out
        expect(bookMonkeys(all, BABIES_BOOK, NOV_2026).map((m) => m.name)).toEqual(["D"]);
    });
});
