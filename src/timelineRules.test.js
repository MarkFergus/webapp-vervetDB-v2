// A monkey's Timeline (timelineRules.js)
import { lastDeworming, rightNow, timelineMonths, weightChange, weightText } from "./timelineRules";

const DAISY = { id: 7, name: "Daisy", troop: "Koko", introcage: "Koko A", enclosure: "Koko", arrivalDate: "2024-03-15", arrivalReason: "orphaned" };
const entriesOf = (months) => months.flatMap((m) => m.entries);

test("weights: grams up to 1 kg, then kg to 2 decimals", () => {
    expect(weightText(410)).toBe("410 g");
    expect(weightText(999)).toBe("999 g");
    expect(weightText(1000)).toBe("1.00 kg");
    expect(weightText(2140)).toBe("2.14 kg");
    expect(weightChange(85)).toBe("+85 g");
    expect(weightChange(-1200)).toBe("−1.20 kg");
    expect(weightChange(0)).toBe("±0 g");
});

describe("the story", () => {
    test("newest first, by month, with moves worded by place", () => {
        const months = timelineMonths(DAISY, {
            records: [
                { id: 1, section: "rehabilitation", date: "2026-10-12", category: "movement", details: "Moved from Dreamland to Koko A: Visiting", loggedByName: "Jo" },
                { id: 2, section: "rehabilitation", date: "2026-11-03", category: "movement", details: "Home changed from Dreamland to Koko A" },
            ],
        });
        expect(months.map((m) => m.title)).toEqual(["November 2026", "October 2026", "March 2024"]);
        const [home, moved] = entriesOf(months);
        expect(home).toMatchObject({ label: "Home Changed", text: "Dreamland to Koko A", filters: ["moves", "milestones"] });
        expect(moved).toMatchObject({ label: "Moved", text: "Dreamland to Koko A", note: "Visiting", by: "Jo" });
    });

    test("an injury keeps its updates, newest first, and says if it's healed", () => {
        const [current, healed] = entriesOf(
            timelineMonths({ ...DAISY, arrivalDate: null }, {
                injuries: [
                    { id: 1, date: "2026-10-17", description: "Cut", healedOn: null, updates: [{ id: 1, date: "2026-10-18", details: "Swollen" }, { id: 2, date: "2026-10-20", details: "Better" }] },
                    { id: 2, date: "2026-10-01", description: "Bite", healedOn: "2026-10-09", updates: [] },
                ],
            })
        );
        expect(current.label).toBe("Injury · Current");
        expect(current.updates.map((u) => u.text)).toEqual(["Better", "Swollen"]);
        expect(healed.label).toMatch(/^Injury · Healed Fri 9 Oct/);
    });

    test("weights: the first with their arrival, then one a month: its last, with the change", () => {
        const entries = entriesOf(
            timelineMonths(DAISY, {
                weights: [
                    { date: "2024-03-15", value: 410 },
                    { date: "2026-10-05", value: 1950 },
                    { date: "2026-10-26", value: 2055 },
                    { date: "2026-11-02", value: 2140 },
                ],
            })
        );
        expect(entries.filter((e) => e.kind === "weight").map((e) => e.text)).toEqual(["2.14 kg (+85 g)", "2.06 kg (+1.65 kg)"]);
        expect(entries.find((e) => e.kind === "arrival")).toMatchObject({ text: "Orphaned", note: "Arrival Weight: 410 g" });
    });

    test("no arrival date: the first weight is an ordinary one", () => {
        const entries = entriesOf(timelineMonths({ ...DAISY, arrivalDate: null }, { weights: [{ date: "2026-10-05", value: 900 }] }));
        expect(entries.map((e) => e.text)).toEqual(["900 g"]);
    });

    test("integrations: started and finished are Milestones", () => {
        const entries = entriesOf(
            timelineMonths({ ...DAISY, arrivalDate: null }, {
                integrations: [{ id: 1, kind: "foster_mum", startedOn: "2026-10-28", status: "completed", statusOn: "2026-11-02" }],
            })
        );
        expect(entries.map((e) => e.text)).toEqual(["Completed foster-mum integration", "Started foster-mum integration"]);
        const [placed] = entriesOf(
            timelineMonths({ ...DAISY, arrivalDate: null }, {
                integrations: [{ id: 2, kind: "foster_mum", startedOn: "2026-10-28", status: "active", place: "Koko A" }],
            })
        );
        expect(placed.text).toBe("Started foster-mum integration at Koko A");
        expect(entries.every((e) => e.filters.includes("milestones"))).toBe(true);
    });

    test("sightings: one quiet line a month, not counting sessions they weren't seen in", () => {
        const session = (date, seen) => ({ date, sightings: [{ monkeyId: 7, seen }] });
        const entries = entriesOf(
            timelineMonths({ ...DAISY, arrivalDate: null }, {
                sessions: [session("2026-10-05", true), session("2026-10-29", true), session("2026-10-12", false)],
                spots: [{ monkeyId: 7, date: "2026-10-20" }, { monkeyId: 9, date: "2026-10-21" }],
            })
        );
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({ quiet: true, filters: ["seen"] });
        expect(entries[0].text).toBe("Seen in 2 sessions and 1 other time · 5 Oct – 29 Oct");
    });
});

test("photos: by upload day, left off for the bulk move and for the placeholder", () => {
    const at = (day) => `https://x/daisy-${Date.parse(`${day}T10:00:00Z`)}.webp`;
    const photos = [at("2026-10-02"), at("2026-10-23"), at("2026-10-23"), at("2026-11-05"), "https://i/blank-image-min.jpg"];
    const entries = entriesOf(timelineMonths({ ...DAISY, arrivalDate: null, img: photos }, {}));
    expect(entries.map((e) => [e.date, e.photos.length])).toEqual([["2026-11-05", 1], ["2026-10-23", 2]]);
    expect(entries[0].filters).toContain("milestones");
});

describe("Right Now", () => {
    const labels = (rows) => Object.fromEntries(rows.map((r) => [r.label, r.text]));

    test("the latest of each, and an injury overdue an update in red", () => {
        const rows = rightNow(
            { ...DAISY, introcage: null },
            {
                records: [
                    { category: "deworming", date: "2026-10-19", details: "6-Month - 1/4 tab Albendazole, once a day for 3 days" },
                    { category: "deworming", date: "2026-04-01", details: "6-Month - 1/2 tab Milbeworm, one dose only" },
                ],
                injuries: [{ id: 1, date: "2026-10-01", description: "Cut", healedOn: null, updates: [] }],
                weights: [{ date: "2026-10-05", value: 900 }, { date: "2026-11-02", value: 2140 }],
                sessions: [{ date: "2026-11-03", sightings: [{ monkeyId: 7, seen: true }] }],
                next: { date: "2026-11-07", words: "Koko Troop 3-Month" },
            },
            "2026-11-06"
        );
        const seen = labels(rows);
        expect(seen["Last Seen"]).toMatch(/^Tue 3 Nov.*, during monitoring$/);
        expect(seen["Where"]).toBe("Koko Troop");
        expect(seen["Latest Weight"]).toMatch(/^2\.14 kg, Mon 2 Nov/);
        expect(seen["Last Deworming"]).toMatch(/^Albendazole, Mon 19 Oct/);
        expect(seen["Next Deworming"]).toMatch(/^Sat 7 Nov.*, Koko Troop 3-Month$/);
        expect(rows.map((r) => r.label).indexOf("Last Deworming")).toBe(rows.map((r) => r.label).indexOf("Next Deworming") - 1);
        expect(rows.find((r) => r.label === "Current Injury")).toMatchObject({ text: "Cut, update needed", alert: true });
    });

    test("in an introcage: seen every day, as everywhere else", () => {
        expect(labels(rightNow(DAISY, {}, "2026-11-06"))["Last Seen"]).toMatch(/^Fri 6 Nov/);
    });

    test("nothing known: says so, and no empty rows", () => {
        const seen = labels(rightNow({ ...DAISY, inSickbay: true }, {}, "2026-11-06"));
        expect(seen["Where"]).toBe("Sickbay");
        expect(seen["Last Deworming"]).toBe("None on record");
        expect(seen["Latest Weight"]).toBeUndefined();
        expect(seen["Next Deworming"]).toBeUndefined();
    });

    test("a dewormer we don't know: the record's own words", () => {
        expect(lastDeworming([{ category: "deworming", date: "2026-01-01", details: "Something else" }]).dewormer).toBe("Something else");
        expect(lastDeworming([])).toBeNull();
    });
});
