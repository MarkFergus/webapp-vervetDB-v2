import { ageOn, intakeReport, intakeYears, INTAKE_LISTS } from "./intakeReport";
import { sheetRows } from "./intakeExcel";

const monkey = (fields) => ({
    sex: "female",
    species: "vervet",
    year: "",
    troop: null,
    status: "sanctuary",
    statusOn: null,
    statusDetails: null,
    arrivalDate: null,
    arrivalReason: null,
    arrivalCondition: null,
    birthDate: null,
    birthDateApprox: false,
    ...fields,
});

const MONKEYS = [
    monkey({ id: 1, name: "Mia", arrivalDate: "2024-02-18", arrivalReason: "orphaned", arrivalCondition: "healthy", birthDate: "2024-01-07", birthDateApprox: true }),
    monkey({ id: 2, name: "Duimpie", arrivalDate: "2024-01-18", arrivalReason: "injured", sex: "male", year: 2022 }),
    // arrived and released the same year
    monkey({ id: 3, name: "Rokk", sex: "male", arrivalDate: "2024-04-04", status: "released", statusOn: "2024-06-12", statusDetails: "Back to their troop in Tzaneen" }),
    // arrived the year before
    monkey({ id: 4, name: "Old", arrivalDate: "2023-12-30" }),
    monkey({ id: 5, name: "Luxi", status: "deceased", statusOn: "2024-01-09", statusDetails: "Passed away in Sickbay", troop: "H&B" }),
    monkey({ id: 6, name: "Django", sex: "male", status: "escaped", statusOn: "2024-07-18", troop: "Global" }),
    monkey({ id: 7, name: "Bugaloo", sex: "male", status: "missing", statusOn: "2024-01-21", troop: "Skunkey", species: "samango" }),
    // died another year
    monkey({ id: 8, name: "Later", status: "deceased", statusOn: "2025-02-01" }),
];

const report = intakeReport(MONKEYS, 2024, { 1: " Mother killed by a car. ", 3: "Found at the mine" });
const list = (id) => report.find((l) => l.id === id);
const names = (id) => list(id).rows.map((r) => r.name);

test("four lists in the form's order, each with its own columns", () => {
    expect(report.map((l) => l.title)).toEqual([
        "Sanctuary Arrivals",
        "Released Monkeys",
        "Deceased Monkeys",
        "Escaped or Missing Monkeys",
    ]);
    expect(list("deceased").columns.map((c) => c.label)).toEqual(["No.", "Date of Death", "Name", "Sex", "Species", "Troop", "Details"]);
});

test("Arrivals: that year's, oldest first, numbered, with their age, reason, condition, notes and status now", () => {
    expect(names("arrivals")).toEqual(["Duimpie", "Mia", "Rokk"]);
    expect(list("arrivals").rows[1]).toEqual({
        no: "2",
        date: "18th February 2024",
        name: "Mia",
        sex: "F",
        species: "Vervet",
        age: "6 weeks",
        reason: "Orphaned",
        condition: "Healthy",
        notes: "Mother killed by a car.",
        status: "Sanctuary",
    });
    expect(list("arrivals").rows[0]).toMatchObject({ sex: "M", age: "1 year", reason: "Injured", condition: "", notes: "" });
    expect(list("arrivals").rows[2].status).toBe("Released");
});

test("Released, Deceased, and Escaped or Missing: by their status date that year", () => {
    expect(list("released").rows).toEqual([
        { no: "1", date: "12th June 2024", name: "Rokk", sex: "M", species: "Vervet", age: "", notes: "Back to their troop in Tzaneen" },
    ]);
    expect(list("deceased").rows).toEqual([
        { no: "1", date: "9th January 2024", name: "Luxi", sex: "F", species: "Vervet", troop: "Holt & Barrington", notes: "Passed away in Sickbay" },
    ]);
    expect(names("gone")).toEqual(["Bugaloo", "Django"]);
    expect(list("gone").rows[0]).toMatchObject({ species: "Samango", troop: "Skunkey", reason: "Missing" });
    expect(list("gone").rows[1].reason).toBe("Escaped");
});

test("an empty year: every list empty", () => {
    expect(intakeReport(MONKEYS, 2019).every((l) => l.rows.length === 0)).toBe(true);
});

test("age on a day: from the birth date, or else the birth year", () => {
    expect(ageOn(monkey({ birthDate: "2024-03-01" }), "2024-03-15")).toBe("2 weeks");
    expect(ageOn(monkey({ birthDate: "2024-03-15" }), "2024-03-15")).toBe("Newborn");
    expect(ageOn(monkey({ year: 2024 }), "2024-03-15")).toBe("Under 1 year");
    expect(ageOn(monkey({ year: 2020 }), "2024-03-15")).toBe("3 years");
    expect(ageOn(monkey({}), "2024-03-15")).toBe("");
});

test("the years: this one back to 2018", () => {
    const years = intakeYears(new Date(2026, 10, 11));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2018);
});

test("Excel: each sheet has the title, the list's band, orange headings, then the monkeys", () => {
    const rows = sheetRows(list("released"), 2024, "11th November 2026");
    const width = INTAKE_LISTS.find((l) => l.id === "released").columns.length;
    expect(rows[0][0]).toMatchObject({ value: "VMF Monkey Intake Form 2024", columnSpan: width });
    expect(rows[1][0].value).toBe("Arrivals, Releases & Deaths · Updated: 11th November 2026");
    expect(rows[2][0]).toMatchObject({ value: "Released Monkeys", backgroundColor: "#E9F29D" });
    expect(rows[3].map((c) => c.value)).toEqual(["No.", "Date of Release", "Name", "Sex", "Species", "Approx Age", "Release Information"]);
    expect(rows[3][0].backgroundColor).toBe("#FFB86C");
    expect(rows[4].map((c) => c.value)).toEqual(["1", "12th June 2024", "Rokk", "M", "Vervet", "", "Back to their troop in Tzaneen"]);
    expect(rows).toHaveLength(5);
    // none: says so
    const empty = sheetRows({ ...list("released"), rows: [] }, 2024, "today");
    expect(empty.at(-1)[0].value).toBe("No releases");
});
