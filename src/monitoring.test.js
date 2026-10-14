// The Troop Monitoring Sheet's monkeys
import {
    monitoredTroops, monitoringGroups, monitoringPages, MONITORED_SECTIONS, MONITORING_CHECKS, MONITORING_COLUMNS,
} from "./monitoring";

const TODAY = new Date(2026, 8, 10); // 10 Sep 2026: the youngest are the 2025 season
let id = 1;
const monkey = (name, year, extra = {}) => ({ id: id++, name, year, sex: "female", troop: "Gismo", introcage: null, ...extra });

test("the troop A–Z (unknown birth years with them), then the youngest four years, each A–Z", () => {
    const groups = monitoringGroups(
        [
            monkey("Uh-Oh", 2008), monkey("Abel", 2008), monkey("Mystery", ""), monkey("Josh", 2021),
            monkey("Sal", 2025), monkey("Timmy", 2023), monkey("Basie", 2023), monkey("Felix", 2022),
        ],
        "Gismo",
        TODAY
    );
    expect(groups.map((g) => [g.title, g.monkeys.map((m) => m.name)])).toEqual([
        [null, ["Abel", "Josh", "Mystery", "Uh-Oh"]],
        ["Orphans 2022", ["Felix"]],
        ["Orphans 2023", ["Basie", "Timmy"]],
        ["Orphans 2025", ["Sal"]], // (no 2024s: no heading)
    ]);
});

test("the years move on each October", () => {
    const groups = monitoringGroups([monkey("Felix", 2022), monkey("Neo", 2026)], "Gismo", new Date(2026, 9, 1));
    expect(groups.map((g) => g.title)).toEqual([null, "Orphans 2026"]); // 2022s are grown-ups now
});

test("not other troops' monkeys", () => {
    const groups = monitoringGroups([monkey("Abel", 2008), monkey("Bobo", 2010, { troop: "Goliath" })], "Gismo", TODAY);
    expect(groups.flatMap((g) => g.monkeys.map((m) => m.name))).toEqual(["Abel"]);
});

describe("the introcage monkeys at the end", () => {
    const cage = (name, introcage, enclosure, extra = {}) =>
        monkey(name, 2008, { troop: null, introcage, enclosure, introcageType: "introcage", ...extra });
    const names = (groups, title) => groups.find((g) => g.title === title)?.monkeys.map((m) => m.name);

    test("the troop enclosure's introcage monkeys: an Introcages section, by introcage then name", () => {
        const groups = monitoringGroups(
            [
                monkey("Abel", 2008),
                cage("Zed", "Gismo A", "Gismo"), cage("Kit", "Gismo A10", "Gismo"), cage("Ann", "Gismo A2", "Gismo"),
                cage("Bo", "Gismo A", "Gismo"),
                cage("Far", "Goliath A", "Goliath"), // another enclosure's
                cage("Baby", "Gismo C", "Gismo", { year: 2025 }), // (babies too: by introcage, not Orphans)
            ],
            "Gismo",
            TODAY
        );
        expect(groups.map((g) => g.title)).toEqual([null, "Introcages"]);
        expect(names(groups, "Introcages")).toEqual(["Bo", "Zed", "Ann", "Kit", "Baby"]);
    });

    test("their introcage is on the monkey, for the sheet to show", () => {
        const groups = monitoringGroups([cage("Zed", "Gismo A", "Gismo")], "Gismo", TODAY);
        expect(groups[0].monkeys[0].introcage).toBe("Gismo A");
    });

    test("the Bachelor Block is on Gismo's sheet, in a section of its own", () => {
        const all = [
            cage("Rex", "Bachelor Block B", "Bachelor Block"), cage("Max", "Bachelor Block A", "Bachelor Block"),
            cage("Zed", "Gismo A", "Gismo"),
        ];
        const gismo = monitoringGroups(all, "Gismo", TODAY);
        expect(gismo.map((g) => g.title)).toEqual(["Introcages", "Bachelor Block"]);
        expect(names(gismo, "Bachelor Block")).toEqual(["Max", "Rex"]);
        // ...and only there
        expect(monitoringGroups(all, "Goliath", TODAY)).toEqual([]);
    });

    test("a care unit's areas aren't included", () => {
        const area = cage("Ziggy", "Dreamland", "Gismo", { introcageType: "area" });
        expect(monitoringGroups([area], "Gismo", TODAY)).toEqual([]);
    });

    test("the troop's enclosure can have another name", () => {
        const groups = monitoringGroups([cage("Zed", "D&D A", "D&D")], "Dino & Daniel", TODAY, "D&D");
        expect(names(groups, "Introcages")).toEqual(["Zed"]);
    });
});

test("the checks at the top, and 15 sessions across", () => {
    expect(MONITORING_CHECKS).toEqual(["Date", "Initials", "Food Used", "Fence?", "Food?", "Bowls/taps/misters?", "Perimeter check"]);
    expect(MONITORING_COLUMNS).toBe(15);
});

describe("over more than one page", () => {
    const names = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix}${i}` }));
    const shape = (pages) => pages.map((page) => page.map((g) => [g.title, g.monkeys.length]));

    test("up to 60: one page", () => {
        const groups = [{ title: null, monkeys: names(55, "a") }, { title: "Orphans 2025", monkeys: names(5, "b") }];
        expect(monitoringPages(groups)).toEqual([groups]);
    });

    test("Camelot (73): 50 on the first page, the troop split, the Orphans groups kept whole", () => {
        const groups = [
            { title: null, monkeys: names(63, "a") },
            { title: "Orphans 2022", monkeys: names(7, "b") },
            { title: "Orphans 2023", monkeys: names(3, "c") },
        ];
        expect(shape(monitoringPages(groups))).toEqual([
            [[null, 50]],
            [[null, 13], ["Orphans 2022", 7], ["Orphans 2023", 3]],
        ]);
    });

    test("an Orphans group that won't fit moves on to the next page", () => {
        const groups = [
            { title: null, monkeys: names(45, "a") },
            { title: "Orphans 2022", monkeys: names(8, "b") },
            { title: "Orphans 2023", monkeys: names(9, "c") },
        ];
        expect(shape(monitoringPages(groups))).toEqual([
            [[null, 45]],
            [["Orphans 2022", 8], ["Orphans 2023", 9]],
        ]);
    });

    test("never more than 50 on a page", () => {
        const pages = monitoringPages([{ title: null, monkeys: names(120, "a") }]);
        expect(pages.map((p) => p[0].monkeys.length)).toEqual([50, 50, 20]);
    });
});

test("the troops monitored: the ones in Top, Middle, Bottom and Sickbay, not the Bandits (a wild troop)", () => {
    const enclosures = [
        { type: "troop", name: "Gismo", section: "Top" },
        { type: "troop", name: "James", section: "Sickbay" },
        { type: "care_unit", name: "Baby Care", section: "Care Units" },
    ];
    const homeOf = (troop) => (troop === "Bandits" ? null : troop);
    expect(monitoredTroops(["Gismo", "Bandits", "James"], enclosures, homeOf)).toEqual(["Gismo", "James"]);
    expect(MONITORED_SECTIONS).toEqual(["Top", "Middle", "Bottom", "Sickbay"]);
});
