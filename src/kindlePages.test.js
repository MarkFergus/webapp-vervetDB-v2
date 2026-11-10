// The Kindle dashboard's Monitoring and Deworming pages (scripts/kindlePages.js)
import { dewormingPage, monitoringPage } from "../scripts/kindlePages";

const troop = (id, name, section = "Top") => ({ id, name, type: "troop", section });
const TODAY = "2026-11-10";
const NOW = new Date("2026-11-10T08:00:00Z").getTime();
const session = (id, enclosureId, date, status = "finished", extra = {}) => ({
    id, enclosureId, date, status, startedAt: `${date}T05:30:00Z`, finishedAt: status === "finished" ? `${date}T07:00:00Z` : null,
    startedByName: "Sam Smith", sightings: [], ...extra,
});

test("Monitoring: in progress, overdue (in bold), coming up by when it's due, then recently done", () => {
    const troops = [troop(1, "Gismo"), troop(2, "Koko"), troop(3, "Royal"), troop(4, "D&D"), troop(5, "Skrow")];
    const sessions = [
        session(1, 1, TODAY, "in_progress"),
        session(2, 2, "2026-11-03"),
        session(3, 3, "2026-11-07"),
        session(4, 4, "2026-11-09"),
        session(5, 5, "2026-11-08"),
    ];
    const page = monitoringPage(troops, sessions, TODAY, NOW);
    const by = Object.fromEntries(page.groups.map((g) => [g.title, g.lines]));
    expect(page.groups.map((g) => g.title)).toEqual(["In Progress", "Overdue", "Coming Up", "Recently Done"]);
    expect(by["In Progress"][0].text).toBe("Gismo · started Tue 10 Nov 07:30 · Sam");
    expect(by.Overdue).toEqual([{ text: "Koko · 7 days since monitored", alert: true }]);
    expect(by["Coming Up"].map((l) => l.text)).toEqual(["Royal · 3 days ago · due in 2 days", "Skrow · 2 days ago · due in 3 days"]);
    expect(by["Recently Done"][0].text).toBe("Dino & Daniel · Mon 9 Nov · Sam");
});

test("Deworming: lists under way first, then the schedule's buckets", () => {
    const sheets = [
        { id: 1, groupKey: "troop:1", groupName: "H&B Troop", session: "3_month", status: "ready", startDate: "2026-11-09", daysDone: [1],
          lines: [{ monkeyId: 1, doses: { 1: { result: "full" } } }] },
        { id: 2, groupKey: "custom:1", groupName: "Full Moon Deworming", session: "custom", status: "submitted", startDate: "2026-11-05", daysDone: [1, 2, 3], lines: [] },
    ];
    const page = dewormingPage(sheets, [], [], TODAY, NOW);
    expect(page.groups[0]).toEqual({
        title: "In Progress",
        lines: [{ text: "Holt & Barrington Troop 3-Month Deworming · In Progress · Day 2" }, { text: "Full Moon Deworming · Awaiting Approval" }],
    });
});
