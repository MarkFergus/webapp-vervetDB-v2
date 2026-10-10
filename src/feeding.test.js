// Feeding and the AM Plates List (examples from the plates board's sheet)
import enclosuresArr from "./enclosuresArr";
import { AM_GROUPS, DEFAULT_FEEDING, amSummary, amText, groupOf, hasFeeding, namesText, pmText, summaryDate } from "./feeding";

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026: babies are the 2025 season
const byName = (name) => enclosuresArr.find((e) => e.name === name);
const parentOf = (e) => enclosuresArr.find((p) => p.id === e.parentId);

// A monkey in an introcage, Local Team, 1 plate, adult, unless given
let nextId = 1;
const monkey = (name, introcage, feeding = {}, extra = {}) => ({
    id: nextId++, name, troop: null, introcage, introcageType: "introcage", year: 2015,
    feeding: { ...DEFAULT_FEEDING, ...feeding }, ...extra,
});
const summary = (monkeys) => amSummary(monkeys, enclosuresArr, TODAY);
const group = (monkeys, title) => summary(monkeys).find((g) => g.title === title);

describe("a monkey's feeding", () => {
    test("only for monkeys in an introcage, once the database has it", () => {
        expect(hasFeeding(monkey("Elf", "Goliath B"))).toBe(true);
        expect(hasFeeding({ ...monkey("Elf", "Goliath B"), feeding: undefined })).toBe(false);
        expect(hasFeeding({ ...monkey("Baby", "Dreamland"), introcageType: "area" })).toBe(false);
        expect(hasFeeding({ name: "Bobo", troop: "Goliath", introcage: null, introcageType: null })).toBe(false);
    });

    test("AM food and PM food in words", () => {
        const elf = monkey("Elf", "Goliath B", { amPlates: 2, amCutSmall: true, amFruit: true, amMetalPlate: true, pmCutSmall: true });
        expect(amText(elf, TODAY)).toBe("2 plates, cut small + fruit, metal plate");
        expect(pmText(elf)).toBe("1 bowl, cut small");
        expect(amText(monkey("Kesie", "Goliath B", { amCutSmall: true }), TODAY)).toBe("1 plate, cut small");
        expect(amText(monkey("Jo", "Goliath B", { amFruit: true }), TODAY)).toBe("1 plate, add fruit");
        expect(pmText(monkey("Jo", "Goliath B", { pmBowls: 2 }))).toBe("2 bowls");
    });

    test("babies' plates are always cut small with fruit", () => {
        expect(amText(monkey("Tiny", "Goliath B", {}, { year: 2025 }), TODAY)).toBe("1 plate, cut small + fruit");
        expect(amText(monkey("Tiny", "Goliath B", {}, { year: 2024 }), TODAY)).toBe("1 plate");
    });
});

describe("the groups", () => {
    test("the sections, with Jalamango, Calypso's Corner and Engeltjie 1 and 1A made with Sickbay", () => {
        expect(AM_GROUPS.map((g) => g.title)).toEqual([
            "Top Section", "Middle Section", "Bottom Section", "Sickbay Section + Calypso",
        ]);
        const titleOf = (name) => groupOf(byName(name), parentOf(byName(name)))?.title;
        expect(titleOf("Bachelor Block A")).toBe("Top Section");
        expect(titleOf("Engeltjie 2")).toBe("Middle Section");
        expect(titleOf("Engeltjie 1")).toBe("Sickbay Section + Calypso");
        expect(titleOf("Engeltjie 1A")).toBe("Sickbay Section + Calypso");
        expect(titleOf("Calypso's Corner A")).toBe("Sickbay Section + Calypso");
        expect(titleOf("Jalamango A")).toBe("Sickbay Section + Calypso");
        expect(titleOf("H&B C1")).toBe("Bottom Section");
        // Every introcage is in one
        for (const e of enclosuresArr.filter((x) => x.type === "introcage")) {
            expect(groupOf(e, parentOf(e)), e.name).not.toBeNull();
        }
    });

    test("names: \"Roman & Queenie\", \"Armies, Bainne & BeeBee\"", () => {
        expect(namesText([])).toBe("");
        expect(namesText(["Roman"])).toBe("Roman");
        expect(namesText(["Roman", "Queenie"])).toBe("Roman & Queenie");
        expect(namesText(["Armies", "Bainne", "BeeBee"])).toBe("Armies, Bainne & BeeBee");
    });

    test("the date as the sheet has it", () => {
        expect(summaryDate(new Date(2026, 8, 25))).toBe("25th Sep 2026");
        expect(summaryDate(TODAY)).toBe("10th Oct 2026");
    });
});

describe("the AM Plates List", () => {
    test("one line per introcage: up to three names, then the cage's group", () => {
        const top = group(
            [
                monkey("Ace", "Goliath A"), monkey("Clare", "Goliath A"),
                monkey("Kesie", "Goliath C", { amCutSmall: true }),
                monkey("Elf", "Goliath D", { amPlates: 2 }),
                ...["Hope", "Faith", "Joy", "Grace"].map((n) => monkey(n, "Goliath B1", { amCutSmall: true })),
            ],
            "Top Section"
        );
        expect(top.rows).toEqual(["Ace/Clare x2", "Goliath B1 group x4 (cut small)", "Kesie (cut small)", "Elf x2"]);
        expect(top.plates).toBe(9);
        expect(top.counts).toEqual(["5 cut small"]);
    });

    test("some plates special: how many; all of them: just which", () => {
        const sickbay = group(
            [
                monkey("Leelo", "Global A", { amPlates: 2 }), monkey("Leila", "Global A", { amCutSmall: true }),
                ...["A", "B", "C", "D", "E"].map((n) => monkey(n, "Calypso's Corner B", { amCutSmall: true })),
            ],
            "Sickbay Section + Calypso"
        );
        // (Calypso's Corner is at Engeltjie, before Global)
        expect(sickbay.rows).toEqual(["Calypso B group x5 (cut small)", "Leelo/Leila x3 (1 cut small)"]);
        expect(sickbay.counts).toEqual(["6 cut small"]);
    });

    test("metal plates and cut small + fruit counted on their own", () => {
        const bottom = group(
            [
                ...["Q", "A", "T", "O", "X"].map((n) => monkey(n, "Robert A", { amMetalPlate: true })),
                monkey("Minkey", "Robert C", { amCutSmall: true, amFruit: true }),
                monkey("Mini", "Robert C", {}, { year: 2025 }), // a baby
            ],
            "Bottom Section"
        );
        expect(bottom.rows).toEqual(["Robert A group x5 (metal plates)", "Mini/Minkey x2 (cut small + fruit)"]);
        expect(bottom.counts).toEqual(["2 cut small + fruit", "5 on metal plates"]);
        expect(bottom.plates).toBe(7);
        // (cut small, with or without fruit: for the total at the bottom)
        expect(bottom.cutSmall).toBe(2);
    });

    test("fed by Sickbay: not counted, listed under the group", () => {
        const top = group(
            [
                monkey("Rocio", "Goliath A", { fedBy: "sickbay", amPlates: 2 }),
                monkey("Nita", "Goliath A", { fedBy: "sickbay" }),
                monkey("Seuntjie", "Goliath A"),
                monkey("Armies", "Gismo A", { fedBy: "sickbay" }),
            ],
            "Top Section"
        );
        expect(top.rows).toEqual(["Seuntjie"]);
        expect(top.plates).toBe(1);
        expect(top.sickbay).toBe("Nita, Rocio & Armies");
    });

    test("troop monkeys and care units' areas aren't on it; an empty group is 0", () => {
        const groups = summary([
            { id: 99, name: "Bobo", troop: "Goliath", introcage: null, introcageType: null, year: 2015, feeding: DEFAULT_FEEDING },
            { ...monkey("Baby", "Dreamland"), introcageType: "area" },
        ]);
        expect(groups.map((g) => g.plates)).toEqual([0, 0, 0, 0]);
        expect(groups.every((g) => g.rows.length === 0 && g.sickbay === "")).toBe(true);
    });
});
