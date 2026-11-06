// The Morning Brief's rules (morningBriefRules.js)
import { briefDay, briefEmail, buildMorningBrief, sanctuaryToday } from "./morningBriefRules";

const today = "2026-11-05";
const daysAgo = (n) => new Date(Date.UTC(2026, 10, 5 - n)).toISOString().slice(0, 10);
const troop = (id, name, section = "Top") => ({ id, name, type: "troop", section, sortOrder: id });
const monkey = (id, name, troopName, extra = {}) => ({ id, name, troop: troopName, status: "sanctuary", ...extra });
const session = (id, enclosureId, n, sightings = [], extra = {}) => ({
    id,
    enclosureId,
    date: daysAgo(n),
    status: "finished",
    finishedAt: `${daysAgo(n)}T10:00:00Z`,
    fence: "good",
    waters: "good",
    food: "good",
    sightings,
    ...extra,
});
const base = {
    monkeys: [],
    enclosures: [],
    sessions: [],
    spots: [],
    lastMoves: {},
    monitoring: {},
    injuries: [],
    calendarEvents: [],
    sheets: [],
    milk: [],
    weights: [],
    news: [],
    today,
};
const brief = (data) => buildMorningBrief({ ...base, ...data });
const group = (b, section, title) =>
    b.sections.find((s) => s.id === section)?.groups.find((g) => g.title === title)?.lines ?? [];

describe("Morning Brief", () => {
    test("nothing to report: all clear, and the email says so", () => {
        const b = brief({ enclosures: [troop(1, "Gismo")], sessions: [session(1, 1, 1)] });
        expect(b.allClear).toBe(true);
        expect(b.sections).toEqual([]);
        const email = briefEmail(b);
        expect(email.subject).toBe("vervetDB Morning Brief · Thu 5 Nov · All clear");
        expect(email.text).toContain("All clear ✓");
    });

    test("troops: fine up to 4 days, overdue in red from 5; the Bandits aren't monitored", () => {
        const names = ["Four", "Five", "Eight"];
        const b = brief({
            enclosures: [...names.map((n, i) => troop(i + 1, n)), troop(9, "Bandits", "Wild")],
            sessions: [session(1, 1, 4), session(2, 2, 5), session(3, 3, 8)],
        });
        expect(group(b, "monitoring", "Overdue")).toEqual([
            { text: "Five: last monitored 5 days ago", alert: true },
            { text: "Eight: last monitored 8 days ago", alert: true },
        ]);
    });

    test("Must See and Not Seen Last Session; muted monkeys left out", () => {
        const seen = (id, was) => ({ monkeyId: id, seen: was });
        const b = brief({
            monkeys: [monkey(1, "Malawi", "Gismo"), monkey(2, "Daisy", "Gismo"), monkey(3, "Quiet", "Gismo")],
            enclosures: [troop(1, "Gismo")],
            sessions: [
                session(1, 1, 1, [seen(1, false), seen(2, false), seen(3, false)]),
                session(2, 1, 3, [seen(1, false), seen(2, true), seen(3, false)]),
                session(3, 1, 5, [seen(1, true), seen(2, true), seen(3, true)]),
            ],
            monitoring: { 3: { alertsMuted: true } },
        });
        expect(group(b, "monitoring", "Must See")).toEqual([
            { text: `Malawi (Gismo): not seen in 2 sessions, last seen ${briefDay(daysAgo(5))}`, alert: true },
        ]);
        expect(group(b, "monitoring", "Not Seen Last Session")).toEqual([
            { text: `Daisy (Gismo): not seen in 1 session, last seen ${briefDay(daysAgo(3))}` },
        ]);
    });

    test("problems by issue, not in red: the latest sessions only, no waters; sessions left open before today", () => {
        const b = brief({
            enclosures: [troop(1, "D&D"), troop(2, "Goliath"), troop(3, "Royal")],
            sessions: [
                session(1, 1, 1, [], { fence: "low", food: "too_much", waters: "bad" }),
                session(2, 1, 2, [], { fence: "not_working" }),
                session(3, 2, 1, [], { fence: "low", fenceNote: "North corner" }),
                session(4, 3, 1, [], { waters: "bad" }),
                session(5, 1, 1, [], { status: "in_progress", finishedAt: null }),
                session(6, 1, 0, [], { status: "in_progress", finishedAt: null }),
            ],
        });
        expect(group(b, "monitoring", "Problems")).toEqual([
            { text: "Fence Low: Dino & Daniel, Goliath" },
            { text: "Food Too Much: Dino & Daniel" },
        ]);
        expect(group(b, "monitoring", "Still In Progress")).toEqual([
            { text: `Dino & Daniel: session from ${briefDay(daysAgo(1))}` },
        ]);
    });

    test("Medical: injuries with no update for 14 days, and who's in Sickbay", () => {
        const b = brief({
            enclosures: [{ id: 5, name: "Sickbay", type: "care_unit", section: "Care Units" }],
            monkeys: [
                monkey(1, "Bruno", "Gismo"),
                monkey(2, "Pip", "Gismo", { inSickbay: true, sickbaySince: daysAgo(3) }),
                monkey(3, "Rescue", "", { enclosure: "Sickbay", introcage: "Sickbay", arrivalDate: daysAgo(20) }),
                monkey(4, "Away", "", { enclosure: "Sickbay", introcage: "Sickbay", stay: { enclosure: "Gismo", introcage: "Gismo A" } }),
            ],
            injuries: [
                { monkeyId: 1, date: daysAgo(20), description: "Cut on left arm", updates: [] },
                { monkeyId: 1, date: daysAgo(3), description: "Fresh scratch", updates: [] },
            ],
        });
        expect(group(b, "medical", "No Update for 14+ Days")).toEqual([{ text: "Bruno: Cut on left arm" }]);
        expect(group(b, "medical", "In Sickbay")).toEqual([{ text: "Pip: 3 days" }, { text: "Rescue (Injured Rescue): 20 days" }]);
        expect(group(b, "medical", "In Introcages")).toEqual([{ text: "Away: Gismo A" }]);
    });

    test("Deworming in the next 7 days: Needs List or List Ready, not in red; further off left out", () => {
        const on = (n) => new Date(Date.UTC(2026, 10, 5 + n)).toISOString().slice(0, 10);
        const b = brief({
            enclosures: [troop(1, "Gismo"), troop(2, "Royal"), troop(3, "Later")],
            calendarEvents: [
                { uid: "a", title: "Gismo 3m deworming", startsOn: on(2) },
                { uid: "b", title: "Royal 3m deworming", startsOn: on(4) },
                { uid: "c", title: "Later 3m deworming", startsOn: on(8) },
            ],
            sheets: [
                { id: 9, groupKey: "troop:2", groupName: "Royal Troop", session: "3_month", startDate: on(4), status: "ready", daysDone: [] },
            ],
        });
        expect(group(b, "deworming", "Next 7 Days")).toEqual([
            { text: `${briefDay(on(2))} · Gismo Troop 3-Month · Needs List` },
            { text: `${briefDay(on(4))} · Royal Troop 3-Month · List Ready` },
        ]);
    });

    test("a list submitted: Awaiting Approval, and full names", () => {
        const b = brief({
            sheets: [{ id: 1, groupKey: "troop:1", groupName: "D&D Troop", session: "6_month_fu", startDate: daysAgo(4), status: "submitted", daysDone: [1, 2, 3] }],
        });
        expect(group(b, "deworming", "Awaiting Approval")).toEqual([{ text: "Dino & Daniel Troop 6-Month F/U" }]);
    });

    test("Camelot's missing monkeys: apart at the bottom of Monitoring, listed by sessions missed, plain, and not in To Do", () => {
        const seen = (id, was) => ({ monkeyId: id, seen: was });
        const b = brief({
            monkeys: [
                monkey(1, "Arthur", "Camelot"),
                monkey(2, "Merlin", "Camelot"),
                monkey(3, "Malawi", "Gismo"),
                monkey(4, "Gawain", "Camelot"),
                monkey(5, "Lancelot", "Camelot"),
            ],
            enclosures: [troop(1, "Camelot"), troop(2, "Gismo")],
            sessions: [
                session(1, 1, 1, [seen(1, false), seen(2, false), seen(4, false), seen(5, true)]),
                session(2, 1, 3, [seen(1, true), seen(2, false), seen(4, false), seen(5, true)]),
                session(3, 2, 1, [seen(3, false)]),
                session(4, 2, 3, [seen(3, false)]),
            ],
        });
        const monitoring = b.sections.find((s) => s.id === "monitoring").groups;
        expect(monitoring.at(-1).title).toBe("Camelot: Not Seen");
        expect(monitoring.at(-1).lines).toEqual([
            { text: "Not seen in 2 sessions: Gawain, Merlin" },
            { text: "Not seen in 1 session: Arthur" },
        ]);
        expect(group(b, "monitoring", "Must See").map((l) => l.text)[0]).toMatch(/^Malawi/);
        expect(group(b, "monitoring", "Must See")).toHaveLength(1);
        expect(group(b, "to_do", "Check On").map((l) => l.text).join()).not.toContain("Merlin");
    });

    test("To Do first: who to check on, troops to monitor, deworming sheets to prepare", () => {
        const on = (n) => new Date(Date.UTC(2026, 10, 5 + n)).toISOString().slice(0, 10);
        const seen = (id, was) => ({ monkeyId: id, seen: was });
        const b = brief({
            monkeys: [monkey(1, "Malawi", "Gismo"), monkey(2, "Daisy", "Gismo")],
            enclosures: [troop(1, "Gismo"), troop(2, "Royal"), troop(3, "Skunkey")],
            sessions: [
                session(1, 1, 1, [seen(1, false), seen(2, false)]),
                session(2, 1, 3, [seen(1, false), seen(2, true)]),
                session(5, 1, 5, [seen(1, true), seen(2, true)]),
                session(3, 2, 6),
                session(4, 3, 9),
            ],
            calendarEvents: [
                { uid: "a", title: "Gismo 3m deworming", startsOn: on(2) },
                { uid: "b", title: "Royal 3m deworming", startsOn: on(9) },
            ],
        });
        expect(b.sections[0].id).toBe("to_do");
        expect(group(b, "to_do", "Check On")).toEqual([
            { text: `Malawi (Gismo): not seen in 2 sessions, last seen ${briefDay(daysAgo(5))} (5 days ago)`, toDo: true },
        ]);
        expect(group(b, "to_do", "Monitor")).toEqual([
            { text: "Skunkey: 9 days since last session", toDo: true },
            { text: "Royal: 6 days since last session", toDo: true },
        ]);
        expect(group(b, "to_do", "Prep Deworming Sheets")).toEqual([
            { text: `Gismo Troop 3-Month: ${briefDay(on(2))} (in 2 days)`, toDo: true },
        ]);
        expect(briefEmail(b).subject).toBe("vervetDB Morning Brief · Thu 5 Nov · 4 To Do");
        expect(briefEmail(b).html).toContain("color:#b26a00");
    });

    test("Baby Care, after Medical: yesterday's milk and weights with changes; missing in red, with the last entry", () => {
        const unit = { id: 7, name: "Baby Care", type: "care_unit", section: "Care Units" };
        const baby = (id, name) => monkey(id, name, "", { enclosure: "Baby Care", introcage: "Dreamland" });
        const b = brief({
            enclosures: [unit],
            monkeys: [baby(1, "Bean"), baby(2, "Kiko"), baby(3, "Nala")],
            milk: [
                { monkeyId: 1, date: daysAgo(2), ml: 500 },
                { monkeyId: 1, date: daysAgo(1), ml: 520 },
                { monkeyId: 2, date: daysAgo(3), ml: 400 },
            ],
            weights: [
                { monkeyId: 1, date: daysAgo(8), grams: 1200 },
                { monkeyId: 1, date: daysAgo(1), grams: 1235 },
                { monkeyId: 2, date: daysAgo(3), grams: 900 },
                { monkeyId: 3, date: daysAgo(9), grams: 800 },
            ],
        });
        const ids = b.sections.map((s) => s.id);
        expect(ids.indexOf("baby_care")).toBeGreaterThan(-1);
        expect(group(b, "baby_care", `Milk Totals (${briefDay(daysAgo(1))})`)).toEqual([
            { text: "Bean: 520 ml (+20 ml)" },
            { text: `Kiko: no total for yesterday, last entered ${briefDay(daysAgo(3))}` },
            { text: "Nala: no total for yesterday, none entered yet" },
        ]);
        expect(group(b, "baby_care", "Weights")).toEqual([
            { text: "Bean: 1,235 g (+35 g)" },
            { text: `Nala: no weight for over 7 days, last entered ${briefDay(daysAgo(9))}`, alert: true },
        ]);
        expect(b.allClear).toBe(false);
    });

    test("Good To Know comes last, and alone it's still all clear", () => {
        const b = brief({ news: [{ kind: "arrival", name: "Coco", details: "" }, { kind: "movement", name: "Milo", details: "Moved to H&B A" }] });
        expect(b.allClear).toBe(true);
        expect(b.sections.map((s) => s.id)).toEqual(["good_to_know"]);
        expect(group(b, "good_to_know", "Moved")).toEqual([{ text: "Milo: Moved to H&B A" }]);
    });

    test("the email: alerts counted in the subject, red lines, words made safe", () => {
        const email = briefEmail({
            title: "Morning Brief · Thu 5 Nov",
            allClear: false,
            sections: [{ id: "x", title: "X", groups: [{ title: "Y", lines: [{ text: "A <b> & c", alert: true }, { text: "Plain" }] }] }],
        });
        expect(email.subject).toBe("vervetDB Morning Brief · Thu 5 Nov · 1 alert");
        expect(email.html).toContain("A &lt;b&gt; &amp; c");
        expect(email.html).toContain("color:#b3261e");
        expect(email.text).toContain("  - Plain");
    });

    test("today is the sanctuary's: just after midnight there, still yesterday in UTC", () => {
        expect(sanctuaryToday(new Date("2026-11-04T22:30:00Z"))).toBe("2026-11-05");
    });
});
