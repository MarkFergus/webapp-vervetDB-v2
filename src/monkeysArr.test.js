// Checks every monkey entry, so typos are caught when new monkeys are added.
// If one of these fails, the message names the monkey to fix.
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";

const ALLOWED_FIELDS = ["name", "sex", "chip", "troop", "year", "img", "bio", "desc"];
const troops = groupsArr.filter((g) => g !== "All Troops");
const thisYear = new Date().getFullYear();

describe.each(monkeysArr.map((m) => [m.name, m]))("%s", (name, monkey) => {
    test("only has known fields (no typos like 'female:')", () => {
        expect(Object.keys(monkey).filter((k) => !ALLOWED_FIELDS.includes(k))).toEqual([]);
    });

    test("name has no spaces at the start or end", () => {
        expect(monkey.name).toBe(monkey.name.trim());
        expect(monkey.name).not.toBe("");
    });

    test("sex is male, female, or empty if unknown", () => {
        expect(["male", "female", ""]).toContain(monkey.sex);
    });

    test("troop is one of the troops in the filter", () => {
        expect(troops).toContain(monkey.troop);
    });

    test("year is a number (no quotes), or empty if unknown", () => {
        if (monkey.year !== "") {
            expect(typeof monkey.year).toBe("number");
            expect(monkey.year).toBeGreaterThan(1980);
            expect(monkey.year).toBeLessThanOrEqual(thisYear);
        }
    });

    test('chip is a number, empty, or two chips written "A & B"', () => {
        const ok =
            typeof monkey.chip === "number" ||
            monkey.chip === "" ||
            /^\d+ & \d+$/.test(monkey.chip);
        expect(ok, `chip ${JSON.stringify(monkey.chip)}`).toBe(true);
    });

    test("has at least one photo, each an ImgBB link", () => {
        expect(monkey.img.length).toBeGreaterThan(0);
        for (const url of monkey.img) {
            expect(url).toMatch(/^https:\/\/i\.ibb\.co\/.+\.(webp|jpe?g|png)$/);
        }
    });

    test("bio and description have no stray spaces", () => {
        for (const text of [monkey.bio, monkey.desc]) {
            if (text === undefined) continue;
            expect(text).toBe(text.trim());
            expect(text).not.toMatch(/ {2}/);
        }
    });
});
