// Admin Dashboard → Staff Activity (#admin/activity): what staff have added,
// changed or deleted, by day; who, how far back and what to show
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminPage from "./AdminPage";
import { loadStaff, loadStaffActivity } from "./monkeyData";
import { changeLines, inGroup, periodFor, valueText } from "./activityWords";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadStaff: vi.fn(),
    loadStaffActivity: vi.fn(),
}));

const now = new Date().toISOString();
const CHANGES = [
    { changed_at: now, changed_by: "u-1", changed_by_name: "Sam Smith", source: "monkey", action: "changed", title: "Abby",
        monkey_id: 1, lines: ["Bio: a → b"], old_row: null, new_row: null },
    { changed_at: now, changed_by: "u-1", changed_by_name: "Sam Smith", source: "injuries", action: "changed", title: "Abby",
        monkey_id: 1, lines: null,
        old_row: { id: 3, monkey_id: 1, injury_date: "2026-10-20", description: "Bite on tail", healed_on: null, logged_by: "u-1" },
        new_row: { id: 3, monkey_id: 1, injury_date: "2026-10-20", description: "Deep bite on tail", healed_on: "2026-10-29", logged_by: "u-1" } },
    { changed_at: now, changed_by: "u-2", changed_by_name: "Jo Bloggs", source: "maintenance", action: "added", title: "D&D A",
        monkey_id: null, lines: null, old_row: null,
        new_row: { id: 9, enclosure_id: 4, done_on: "2026-10-29", kind: "repair", details: "Fixed the door", logged_at: now } },
];

beforeEach(() => {
    vi.clearAllMocks();
    loadStaff.mockResolvedValue([
        { userId: "u-2", name: "Jo Bloggs", email: "jo@x.com", role: "editor" },
        { userId: "u-1", name: "Sam Smith", email: "sam@x.com", role: "editor" },
    ]);
    loadStaffActivity.mockResolvedValue(CHANGES);
});

describe("putting a change into words", () => {
    test("changed: each part that changed, before → after", () => {
        expect(changeLines(CHANGES[1])).toEqual(["Description: Bite on tail → Deep bite on tail", "Healed: (blank) → 29 Oct 2026"]);
    });
    test("added (or deleted): what it had, ids and who-and-when left out", () => {
        expect(changeLines(CHANGES[2])).toEqual(["Date Done: 29 Oct 2026", "Type: Repair", "Details: Fixed the door"]);
        expect(changeLines({ ...CHANGES[2], action: "deleted", old_row: CHANGES[2].new_row, new_row: null })).toHaveLength(3);
    });
    test("monkeys and enclosures: their own lines; an unknown table: its parts by name", () => {
        expect(changeLines(CHANGES[0])).toEqual(["Bio: a → b"]);
        expect(changeLines({ source: "new_table", action: "added", new_row: { id: 1, colour_code: "red", logged_by: "x" } })).toEqual([
            "Colour Code: red",
        ]);
    });
    test("values: grams, yes / no, words, long text shortened", () => {
        expect(valueText(1512, "g")).toBe("1,512 g");
        expect(valueText(true, "yesno")).toBe("Yes");
        expect(valueText("foster_mum", "words")).toBe("Foster Mum");
        expect(valueText("x".repeat(200))).toHaveLength(121);
    });
    test("the period: the last few days up to now, or Custom: the whole of From to the whole of To", () => {
        const now = new Date(2026, 9, 30, 15, 0);
        expect(periodFor(14, "", "", now)).toEqual({ since: new Date(2026, 9, 16, 15, 0), until: now });
        expect(periodFor("custom", "2026-10-20", "2026-10-22", now)).toEqual({
            since: new Date(2026, 9, 20),
            until: new Date(2026, 9, 23),
        });
    });
    test("the What filter", () => {
        expect(inGroup(CHANGES, "medical").map((c) => c.source)).toEqual(["injuries"]);
        expect(inGroup(CHANGES, "all")).toHaveLength(3);
    });
});

test("the page: everyone's this week, by day, with who; then one person, a longer period and a group", async () => {
    render(<AdminPage route="admin/activity" />);
    expect(screen.getByRole("heading", { level: 1, name: "Staff Activity" })).toBeInTheDocument();
    expect(await screen.findByText("3 changes in the last 7 days")).toBeInTheDocument();
    const [, since, until] = loadStaffActivity.mock.calls[0];
    expect(loadStaffActivity.mock.calls[0][0]).toBeNull();
    expect(Math.round((until - since) / 86400000)).toBe(7);
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["24 Hours", "7 Days", "14 Days", "30 Days", "Custom"]);
    expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByText("Description: Bite on tail → Deep bite on tail")).toBeInTheDocument();
    // (full place names; who, when it's everyone's)
    expect(screen.getByText(/Dino & Daniel A/)).toBeInTheDocument();
    expect(screen.getAllByText("by Sam Smith")).toHaveLength(2);

    // the staff list, by name
    const who = screen.getByLabelText("Staff Member");
    await waitFor(() => expect(within(who).getAllByRole("option").map((o) => o.textContent)).toEqual(["Everyone", "Jo Bloggs", "Sam Smith"]));
    await userEvent.selectOptions(who, "u-1");
    await waitFor(() => expect(loadStaffActivity.mock.lastCall[0]).toBe("u-1"));
    await screen.findByText("3 changes in the last 7 days");
    expect(screen.queryByText("by Sam Smith")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "30 Days" }));
    await screen.findByText("3 changes in the last 30 days");
    const [, s30, u30] = loadStaffActivity.mock.lastCall;
    expect(Math.round((u30 - s30) / 86400000)).toBe(30);

    await userEvent.selectOptions(screen.getByLabelText("What"), "medical");
    expect(screen.getByText("1 change in the last 30 days")).toBeInTheDocument();
    expect(screen.queryByText("Bio: a → b")).toBeNull();
});

test("Custom: From and To dates (the whole of each day); From after To asks again", async () => {
    render(<AdminPage route="admin/activity" />);
    await screen.findByText("3 changes in the last 7 days");
    expect(screen.queryByLabelText("From")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Custom" }));
    const from = screen.getByLabelText("From");
    const to = screen.getByLabelText("To");
    // (starts on the last 14 days)
    expect(to.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    fireEvent.change(from, { target: { value: "2026-10-20" } });
    fireEvent.change(to, { target: { value: "2026-10-22" } });
    expect(await screen.findByText("3 changes from 20 Oct 2026 to 22 Oct 2026")).toBeInTheDocument();
    const [, since, until] = loadStaffActivity.mock.lastCall;
    expect(since).toEqual(new Date(2026, 9, 20));
    expect(until).toEqual(new Date(2026, 9, 23));

    fireEvent.change(to, { target: { value: "2026-10-20" } });
    expect(await screen.findByText("3 changes on 20 Oct 2026")).toBeInTheDocument();
    const calls = loadStaffActivity.mock.calls.length;
    fireEvent.change(from, { target: { value: "2026-10-25" } });
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose a From date on or before the To date.");
    expect(loadStaffActivity.mock.calls.length).toBe(calls);
});

test("nothing, or a problem: says so", async () => {
    loadStaffActivity.mockResolvedValueOnce([]);
    const { unmount } = render(<AdminPage route="admin/activity" />);
    expect(await screen.findByText("No changes in the last 7 days.")).toBeInTheDocument();
    unmount();
    loadStaffActivity.mockRejectedValueOnce(new Error("Staff Activity isn't ready yet: supabase/staff-activity-dates.sql needs to be run."));
    render(<AdminPage route="admin/activity" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("staff-activity-dates.sql");
});
