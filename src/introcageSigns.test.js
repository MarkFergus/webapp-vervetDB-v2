import enclosuresArr, { SECTION_NAMES } from "./enclosuresArr";
import monkeysArr from "./monkeysArr";
import {
    FULL_SCALE,
    FULL_SIGN,
    HALF_SIGN,
    lineCount,
    matchChoices,
    signChoices,
    signFor,
    signHeight,
    signPages,
} from "./introcageSigns";

// (1 Oct 2026: a new baby season, so ages are as of then)
const TODAY = new Date(2026, 9, 16);
const byName = (name) => enclosuresArr.find((e) => e.name === name);
// A monkey living in an introcage (made up if it's not in the built-in copy)
const living = (name, introcage, changes = {}) => ({
    ...(monkeysArr.find((m) => m.name === name) ?? { name, sex: "female", year: "2015", bio: "" }),
    troop: null,
    introcage,
    ...changes,
});

describe("choosing the introcages", () => {
    const choices = signChoices(enclosuresArr, SECTION_NAMES, [living("Aroha", "H&B C1")]);

    test("every introcage (Bachelor Block's too), not the care units' areas, in section order", () => {
        const names = choices.map((c) => c.name);
        expect(names[0]).toBe("Goliath A");
        expect(names).toContain("Bachelor Block A");
        expect(names).not.toContain("Dreamland");
        expect(names).not.toContain("Quarantine");
        expect(names.indexOf("Goliath J")).toBeLessThan(names.indexOf("Gismo A"));
    });

    test("full names to show, and how many monkeys live there", () => {
        expect(choices.find((c) => c.name === "H&B C1")).toMatchObject({ label: "Holt & Barrington C1", count: 1 });
        expect(choices.find((c) => c.name === "H&B C2").count).toBe(0);
    });

    test("the search finds short or full names, any case", () => {
        expect(matchChoices(choices, "holt").map((c) => c.name)).toEqual(["H&B A", "H&B B", "H&B C1", "H&B C2"]);
        expect(matchChoices(choices, "h&b c1").map((c) => c.name)).toEqual(["H&B C1"]);
        expect(matchChoices(choices, "  ")).toEqual([]);
    });
});

describe("a sign", () => {
    test("its name, section, and each monkey (oldest first, Age Unknown first of all) with sex, age and bio", () => {
        const monkeys = [
            living("Aroha", "H&B C1", { sex: "male", year: "2020", bio: "" }),
            living("Bea", "H&B C1", { sex: "female", year: "2022", bio: "" }),
            living("Pocus", "H&B C1", { sex: "female", year: "", bio: "" }),
        ];
        const sign = signFor(byName("H&B C1"), monkeys, enclosuresArr, TODAY);
        // (its enclosure before the section)
        expect(sign).toMatchObject({
            title: "Holt & Barrington C1", section: "Holt & Barrington – Bottom Section", full: false, scale: 1,
        });
        expect(sign.monkeys).toEqual([
            { name: "Pocus", details: "Female · Age Unknown", bio: "" },
            { name: "Aroha", details: "Male · 6 years old", bio: "" },
            { name: "Bea", details: "Female · 4 years old", bio: "" },
        ]);
    });

    test("its QR code's link: the introcage's page on the live site, by its id", () => {
        const cage = byName("Gismo A");
        expect(signFor(cage, [], enclosuresArr, TODAY).link).toBe(`https://vervetdb.com/#enclosure/${cage.id}`);
    });

    test("Bachelor Block's: the block's name before the section", () => {
        expect(signFor(byName("Bachelor Block A"), [], enclosuresArr, TODAY).section).toBe("Bachelor Block – Top Section");
    });

    test("an empty introcage: its features instead (e.g. who it's opened for)", () => {
        const koko = { ...byName("Koko C"), features: "Usually opened for Koko D group." };
        expect(signFor(koko, [], enclosuresArr, TODAY)).toMatchObject({ monkeys: [], info: "Usually opened for Koko D group." });
        expect(signFor({ ...koko, features: "" }, [], enclosuresArr, TODAY).info).toBe("");
    });

    test("more than three monkeys: a whole page", () => {
        const names = ["Aroha", "Hocus", "Pocus", "Millie"];
        const monkeys = names.map((n) => living(n, "H&B C1"));
        expect(signFor(byName("H&B C1"), monkeys.slice(0, 3), enclosuresArr, TODAY).full).toBe(false);
        expect(signFor(byName("H&B C1"), monkeys, enclosuresArr, TODAY).full).toBe(true);
        const short = monkeys.map((m) => ({ ...m, bio: "" }));
        expect(signFor(byName("H&B C1"), short, enclosuresArr, TODAY)).toMatchObject({ full: true, scale: FULL_SCALE });
    });

    test("too much to fit: smaller text, and if that's not enough, a whole page", () => {
        const long = "A long story about this monkey, who arrived as an orphan and grew up here. ".repeat(9).trim();
        const two = ["Aroha", "Hocus"].map((n) => living(n, "H&B C1", { bio: long }));
        const shrunk = signFor(byName("H&B C1"), two, enclosuresArr, TODAY);
        expect(shrunk.full).toBe(false);
        expect(shrunk.scale).toBeLessThan(1);
        const three = ["Aroha", "Hocus", "Pocus"].map((n) => living(n, "H&B C1", { bio: long.repeat(2) }));
        expect(signFor(byName("H&B C1"), three, enclosuresArr, TODAY).full).toBe(true);
    });

    test("five monkeys with the longest bios (330 letters) still fit their whole page, a little smaller", () => {
        const bio = "x".repeat(9).concat(" ").repeat(33).trim();
        const five = ["Aroha", "Hocus", "Pocus", "Millie", "Luxi"].map((n) => living(n, "H&B C1", { bio }));
        const sign = signFor(byName("H&B C1"), five, enclosuresArr, TODAY);
        expect(sign.scale).toBeLessThan(FULL_SCALE);
        expect(sign.scale).toBeGreaterThanOrEqual(0.8);
        expect(signHeight(sign, sign.scale, FULL_SIGN)).toBeLessThan(FULL_SIGN.height - 2 * FULL_SIGN.padding);
    });

    test("lines are counted with whole words, as printed", () => {
        expect(lineCount("Goliath", 30, 1000, true)).toBe(1);
        expect(lineCount("one two three four", 20, 60)).toBeGreaterThan(1);
        expect(lineCount("first\nsecond", 12, 1000)).toBe(2);
        expect(HALF_SIGN.width).toBeCloseTo(340.2, 1);
    });
});

describe("the pages", () => {
    const half = (id) => ({ id, full: false });
    const full = (id) => ({ id, full: true });
    const ids = (pages) => pages.map((p) => p.signs.map((s) => s.id));

    test("half signs two to a page, in the list's order; a whole page's sign on its own", () => {
        expect(ids(signPages([half(1), half(2), half(3)]))).toEqual([[1, 2], [3]]);
        expect(ids(signPages([half(1), full(2), half(3)]))).toEqual([[1, 3], [2]]);
        expect(signPages([full(1)])[0].full).toBe(true);
        expect(signPages([])).toEqual([]);
    });
});
