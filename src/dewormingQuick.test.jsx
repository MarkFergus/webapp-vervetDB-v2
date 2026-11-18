// Quicker deworming entry: Tick All (Full for everyone still to do) with
// Food for All, and the staff for each day (beside the Day tabs)
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ResultsForm, resultsOf } from "./DewormingResults";
import { allStaffNames, staffText } from "./dewormingRules";
import { saveDewormingResults } from "./monkeyData";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    saveDewormingResults: vi.fn().mockResolvedValue("ready"),
}));

const SHEET = {
    id: 1,
    groupKey: "D&D",
    groupName: "D&D",
    session: "3_month",
    startDate: "2026-11-02",
    status: "ready",
    staffNames: "",
    dayStaff: {},
    dayNotes: {},
    photos: [],
    daysDone: [],
};
const LINES = [
    { id: 11, monkeyId: 1, name: "Ash", medication: "Albendazole", dose: "1/4 tab", days: 3, doses: {} },
    { id: 12, monkeyId: 2, name: "Meggy", medication: "Albendazole", dose: "1/4 tab", days: 3, doses: { 1: { result: "none" } } },
    { id: 13, monkeyId: 3, name: "Sybil", medication: "Milbeworm", dose: "1/2 tab", days: 1, doses: {} },
];

const form = (sheet = SHEET, lines = LINES) =>
    render(<ResultsForm sheet={{ ...sheet, lines }} lines={lines} onSaved={vi.fn()} onCancel={vi.fn()} />);

beforeEach(() => vi.clearAllMocks());

describe("Tick All and Food for All", () => {
    test("Tick All: Full for everyone with no result yet, with Food for All's food", async () => {
        const user = userEvent.setup();
        form();
        await user.selectOptions(screen.getByLabelText("Food for All"), "Banana");
        await user.click(screen.getByRole("button", { name: "Tick All" }));
        expect(within(screen.getByRole("group", { name: "Ash: Day 1" })).getByRole("button", { name: "Full" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("Food for Ash")).toHaveValue("Banana");
        expect(screen.getByLabelText("Food for Sybil")).toHaveValue("Banana");
        // (Meggy's Miss kept)
        expect(within(screen.getByRole("group", { name: "Meggy: Day 1" })).getByRole("button", { name: "Miss" })).toHaveAttribute("aria-pressed", "true");
        // (nobody left: Tick All can't be pressed)
        expect(screen.getByRole("button", { name: "Tick All" })).toBeDisabled();
    });

    test("Food for All after: the food for everyone given a dose (not a Miss)", async () => {
        const user = userEvent.setup();
        form();
        await user.click(screen.getByRole("button", { name: "Tick All" }));
        expect(screen.getByLabelText("Food for Ash")).toHaveValue("");
        await user.selectOptions(screen.getByLabelText("Food for Sybil"), "Other…");
        await user.type(screen.getByLabelText("Other food for Sybil"), "Grape");
        await user.selectOptions(screen.getByLabelText("Food for All"), "JS");
        expect(screen.getByLabelText("Food for Ash")).toHaveValue("JS");
        // (Other's box goes: JS is on the list)
        expect(screen.getByLabelText("Food for Sybil")).toHaveValue("JS");
        expect(screen.queryByLabelText("Other food for Sybil")).toBeNull();
        expect(screen.queryByLabelText("Food for Meggy")).toBeNull();
        await user.click(screen.getByRole("button", { name: "Save Day 1" }));
        const [, saved] = saveDewormingResults.mock.calls[0];
        expect(saved.lines.map((l) => l.doses[1])).toEqual([
            { result: "full", food: "JS", note: null },
            { result: "none", food: null, note: null },
            { result: "full", food: "JS", note: null },
        ]);
    });
});

describe("staff for each day", () => {
    test("beside the days: each day its own, saved with everyone in staffNames", async () => {
        const user = userEvent.setup();
        form({ ...SHEET, daysDone: [1], dayStaff: { 1: "Lindi" } }, LINES.map((l) => ({ ...l, doses: { 1: { result: "full" } } })));
        expect(screen.getByLabelText("Staff for Day 2")).toHaveValue("");
        await user.click(screen.getByRole("tab", { name: "Day 1 (complete)" }));
        expect(screen.getByLabelText("Staff for Day 1")).toHaveValue("Lindi");
        await user.click(screen.getByRole("tab", { name: "Day 2" }));
        await user.type(screen.getByLabelText("Staff for Day 2"), "Sam, lindi");
        await user.click(screen.getByRole("button", { name: "Tick All" }));
        await user.click(screen.getByRole("button", { name: "Save Day 2" }));
        const [, saved] = saveDewormingResults.mock.calls[0];
        expect(saved).toMatchObject({ dayStaff: { 1: "Lindi", 2: "Sam, lindi" }, staffNames: "Lindi, Sam" });
    });

    test("an older sheet (one name for it all): that name on the days already done", () => {
        form({ ...SHEET, daysDone: [1], staffNames: "Jo" }, LINES.map((l) => ({ ...l, doses: { 1: { result: "full" } } })));
        expect(screen.getByLabelText("Staff for Day 2")).toHaveValue("");
        expect(resultsOf({ ...SHEET, staffNames: "Jo" }, []).staffNames).toBe("Jo");
    });

    test("said once on the sheet: one name, or day by day", () => {
        expect(staffText({ dayStaff: { 1: "Lindi", 2: "Lindi" } })).toBe("Lindi");
        expect(staffText({ dayStaff: { 2: "Sam", 1: "Lindi" } })).toBe("Day 1: Lindi · Day 2: Sam");
        expect(staffText({ dayStaff: {}, staffNames: "Jo" })).toBe("Jo");
        expect(allStaffNames({ 1: "Lindi & Sam", 2: "sam and Jo" })).toBe("Lindi, Sam, Jo");
        expect(allStaffNames({ 1: "x".repeat(100), 2: "y".repeat(30) })).toBe("x".repeat(100));
    });
});
