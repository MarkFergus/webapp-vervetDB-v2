import { seasonLabel, vasectomyStatus, vasectomyWhatsApp, vasectomyYears, vetFormProblems, vetName } from "./medsRules";
import { timelineMonths } from "./timelineRules";
import { tidyChanges } from "./activityWords";

const boy = (id, name, year, troop, extra = {}) => ({ id, name, sex: "male", year, troop, enclosure: troop, introcage: null, ...extra });

const MONKEYS = [
    boy(1, "Hermit", 2026, "Goliath"),
    boy(2, "Bruce", 2026, "Goliath", { vasectomised: true }),
    boy(3, "Coco", 2026, "Goliath"),
    boy(4, "Hector", 2026, "Gismo"),
    boy(5, "Luke", 2026, "Gismo"),
    boy(6, "Old Tom", 2019, "H&B"),
    boy(9, "Robin", 2026, "Bandits"),
    boy(10, "Dino", 2019, "D&D"),
    boy(11, "Tiny", 2019, null, { enclosure: "Dreamland" }),
    boy(7, "Mystery", "", null, { enclosure: "Dreamland" }),
    { id: 8, name: "Daisy", sex: "female", year: 2026, troop: "Goliath" },
];

test("the vets' names", () => {
    expect(vetName("serala")).toBe("Serala Animal Clinic");
    expect(vetName("on_site")).toBe("On Site");
    expect(vetName("other", " Hoedspruit Vets ")).toBe("Hoedspruit Vets");
});

test("a season's label", () => {
    expect(seasonLabel(2026)).toBe("2026/27");
    expect(seasonLabel(2099)).toBe("2099/00");
});

test("the form: what's missing", () => {
    const today = "2026-11-12";
    const fine = { monkeyId: 1, date: today, place: "serala", other: "", reason: "assessment", details: "" };
    expect(vetFormProblems(fine, today)).toEqual({});
    expect(Object.keys(vetFormProblems({ ...fine, monkeyId: null, date: "2026-11-13", reason: "" }, today))).toEqual([
        "monkey",
        "date",
        "reason",
    ]);
    expect(vetFormProblems({ ...fine, place: "other" }, today).other).toBe("Please type the vet's name.");
    // (a vasectomy has no reason)
    expect(vetFormProblems({ ...fine, reason: "" }, today, { needsReason: false })).toEqual({});
    expect(vetFormProblems({ ...fine, details: "x".repeat(501) }, today).details).toBeDefined();
});

test("By Birth Year: boys only, newest season first, unknown last; by troop then name; done from the field or a vasectomy", () => {
    const years = vasectomyYears(MONKEYS, [{ monkeyId: 4 }]);
    expect(years.map((y) => y.label)).toEqual(["2026/27", "2019/20", "Unknown"]);
    const [y2026] = years;
    // (troops in section order: Goliath before Gismo; the Bandits last)
    expect(y2026.boys.map((b) => `${b.home}:${b.monkey.name}:${b.done ? "done" : "not yet"}`)).toEqual([
        "Goliath:Bruce:done",
        "Goliath:Coco:not yet",
        "Goliath:Hermit:not yet",
        "Gismo:Hector:done",
        "Gismo:Luke:not yet",
        "Bandits:Robin:not yet",
    ]);
    expect(y2026.total).toBe(6);
    expect(y2026.doneCount).toBe(2);
    expect(years[2].boys[0].home).toBe("Dreamland");
    // (D&D first; somewhere that isn't a troop after the troops)
    expect(years[1].boys.map((b) => b.home)).toEqual(["D&D", "H&B", "Dreamland"]);
});

test("when a vasectomy's due: 1 July three years after the birth season, Overdue a year on", () => {
    // (born 2023/24: Due from 1 July 2026, Overdue from 1 July 2027, at 3)
    expect(vasectomyStatus(2023, false, "2026-06-30")).toBe("not_due");
    expect(vasectomyStatus(2023, false, "2026-07-01")).toBe("due");
    expect(vasectomyStatus("2023", false, "2027-06-30")).toBe("due");
    expect(vasectomyStatus(2023, false, "2027-07-01")).toBe("overdue");
    expect(vasectomyStatus(2010, true, "2027-07-01")).toBe("done");
    expect(vasectomyStatus("", false, "2027-07-01")).toBe("unknown");
    const [, y2019] = vasectomyYears(MONKEYS, [], "2026-11-13");
    expect(y2019.boys.map((b) => b.status)).toEqual(["overdue", "overdue", "overdue"]);
});

test("the WhatsApp copy: every boy by troop, ✅ after the done ones", () => {
    const [y2026] = vasectomyYears(MONKEYS);
    expect(vasectomyWhatsApp(y2026)).toBe(
        ["*Troop Vasectomies 2026/27*", "_Troop: 5 - Bandits: 1 · Done: 1_", "Goliath: Bruce ✅, Coco, Hermit", "Gismo: Hector, Luke", "Bandits: Robin"].join("\n")
    );
});

describe("elsewhere: the Timeline and Staff Activity", () => {
    test("Vet Visit and Vasectomy records on the Timeline, under Medical", () => {
        const records = [
            { id: 1, section: "medical", category: "vet_visit", date: "2026-11-02", details: "Vasectomy at Serala Animal Clinic" },
            { id: 2, section: "medical", category: "vasectomy", date: "2026-11-02", details: "At Serala Animal Clinic" },
        ];
        const entries = timelineMonths({ id: 1, name: "Bruce", img: [] }, { records })
            .flatMap((m) => m.entries)
            .filter((e) => e.kind === "vet" || e.kind === "vasectomy");
        expect(entries.map((e) => `${e.label}: ${e.text}`).sort()).toEqual([
            "Vasectomy: At Serala Animal Clinic",
            "Vet Visit: Vasectomy at Serala Animal Clinic",
        ]);
        expect(entries.every((e) => e.filters.includes("medical"))).toBe(true);
    });

    test("Staff Activity: the database linking a vet visit to its record isn't shown; a real change is", () => {
        const visit = { id: 9, visit_date: "2026-11-02", practice: "serala", reason: "assessment", details: null, record_id: null };
        const changes = [
            { source: "vet_visits", action: "added", new_row: visit },
            { source: "vet_visits", action: "changed", old_row: visit, new_row: { ...visit, record_id: 40 } },
            { source: "vet_visits", action: "changed", old_row: visit, new_row: { ...visit, reason: "surgery" } },
        ];
        expect(tidyChanges(changes).map((c) => c.action)).toEqual(["added", "changed"]);
    });
});
