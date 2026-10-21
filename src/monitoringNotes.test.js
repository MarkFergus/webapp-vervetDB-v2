// The Troop Monitoring Notes' content: Priority Checks and Monitoring Notes
import { injuryText, monitoringNotes, priorityChecks, shortDate } from "./monitoringNotes";

const TODAY = new Date("2026-10-21T12:00:00");
const monkey = (id, name, extra = {}) => ({ id, name, year: 2015, introcage: null, ...extra });
// Like monitoringGroups(): the troop, an Orphans group, then the introcages
const GROUPS = [
    { title: null, monkeys: [monkey(1, "Max"), monkey(2, "Bliss"), monkey(3, "Piglet"), monkey(4, "Maggie Mae")] },
    { title: "Orphans 2026", monkeys: [monkey(5, "Tiny", { year: 2026 })] },
    { title: "Introcages", monkeys: [monkey(6, "Rocio", { introcage: "Goliath C" }), monkey(7, "Nita", { introcage: "Goliath B" })] },
];

test("dates as day/month", () => {
    expect(shortDate("2026-10-13")).toBe("13/10");
});

test("an injury on one line, its updates after it", () => {
    const injury = {
        date: "2026-10-13",
        description: "minor wound on left thigh, moving ok",
        updates: [{ date: "2026-10-19", details: "wound healing well" }],
    };
    expect(injuryText(injury)).toBe("13/10 minor wound on left thigh, moving ok, 19/10 wound healing well");
    expect(injuryText({ date: "2026-10-16", description: "coat looking scruffy" })).toBe("16/10 coat looking scruffy");
});

test("Condition Check: troop and introcage monkeys apart, A–Z; Notes for Monitoring under Other Notes", () => {
    const monitoring = {
        1: { conditionCheck: true, notes: "" },
        2: { conditionCheck: true, notes: "" },
        7: { conditionCheck: true, notes: "Old lady, check condition and she's eating ok" },
        6: { conditionCheck: true, notes: "Recently moved back with Hope group, check interactions" },
        4: { conditionCheck: false, notes: "Seen jumping in & out of enclosure recently" },
        // (not on this troop's sheet: left out)
        99: { conditionCheck: true, notes: "Someone else" },
    };
    const notes = monitoringNotes({ groups: GROUPS, monitoring, today: TODAY });
    expect(notes.condition).toEqual({ troop: ["Bliss", "Max"], introcages: ["Nita", "Rocio"] });
    expect(notes.other.map((o) => o.name)).toEqual(["Maggie Mae", "Nita", "Rocio"]);
});

test("Check <season> babies only when the troop has this season's babies", () => {
    expect(monitoringNotes({ groups: GROUPS, today: TODAY }).babies).toBe(2026);
    expect(monitoringNotes({ groups: [GROUPS[0]], today: TODAY }).babies).toBeNull();
});

test("Monitoring Notes: the troop's current injuries, oldest first, by name", () => {
    const injuries = [
        { id: 2, monkeyId: 1, date: "2026-10-16", description: "coat looking scruffy", updates: [] },
        { id: 1, monkeyId: 3, date: "2026-10-13", description: "minor wound on left thigh", updates: [] },
        // (another troop's monkey: left out)
        { id: 3, monkeyId: 99, date: "2026-10-01", description: "not here", updates: [] },
    ];
    expect(monitoringNotes({ groups: GROUPS, injuries, today: TODAY }).injuries).toEqual([
        { name: "Piglet", text: "13/10 minor wound on left thigh" },
        { name: "Max", text: "16/10 coat looking scruffy" },
    ]);
});

test("the Priority Checks: numbered in order, leaving out empty ones", () => {
    const full = monitoringNotes({
        groups: GROUPS,
        monitoring: { 2: { conditionCheck: true, notes: "" }, 7: { conditionCheck: true, notes: "Old lady" } },
        today: TODAY,
    });
    expect(priorityChecks(full)).toEqual([
        { title: "Check 2026 babies" },
        {
            title: "Priority Condition Checks:",
            lines: [
                { label: "Troop:", text: "Bliss" },
                { label: "Introcages:", text: "Nita" },
            ],
        },
        { title: "Other Notes:", lines: [{ name: "Nita", text: "Old lady" }] },
    ]);
    // Nothing ticked or written, no babies: nothing to check
    expect(priorityChecks(monitoringNotes({ groups: [GROUPS[0]], today: TODAY }))).toEqual([]);
});
