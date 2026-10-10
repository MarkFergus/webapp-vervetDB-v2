// The Troop Monitoring Sheet's monkeys
import {
    monitoredTroops, monitoringGroups, monitoringPages, MONITORED_SECTIONS, MONITORING_CHECKS, MONITORING_COLUMNS,
} from "./monitoring";

const TODAY = new Date(2026, 9, 10); // 10 Oct 2026: the youngest are the 2025 season
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

test("the years move on each November", () => {
    const groups = monitoringGroups([monkey("Felix", 2022), monkey("Neo", 2026)], "Gismo", new Date(2026, 10, 1));
    expect(groups.map((g) => g.title)).toEqual([null, "Orphans 2026"]); // 2022s are grown-ups now
});

test("troop monkeys only: not other troops, nor the troop's introcage monkeys", () => {
    const groups = monitoringGroups(
        [monkey("Abel", 2008), monkey("Bobo", 2010, { troop: "Goliath" }), monkey("Kesie", 2010, { troop: null, introcage: "Gismo A" })],
        "Gismo",
        TODAY
    );
    expect(groups.flatMap((g) => g.monkeys.map((m) => m.name))).toEqual(["Abel"]);
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
