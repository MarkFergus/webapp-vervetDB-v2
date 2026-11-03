// The Full Profile's Monitoring (staff; monkeys in monitoring sessions):
// Last Seen (Mark As Seen when missing: editors and admins), Current
// Injuries, Latest Condition, Priority Check, Notes for Monitoring
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonkeyPage from "./MonkeyPage";
import { addSpotSighting, loadConditions, loadInjuries, loadMonitoring, loadMonkeySightings } from "./monkeyData";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadRecords: vi.fn().mockResolvedValue([]),
    loadIntegration: vi.fn().mockResolvedValue([]),
    loadInjuries: vi.fn(),
    loadConditions: vi.fn(),
    loadMonitoring: vi.fn(),
    loadMonkeySightings: vi.fn(),
    // (no moves on record)
    loadLastMoves: vi.fn().mockResolvedValue({}),
    addSpotSighting: vi.fn(),
}));

const MONKEY = {
    id: 7, name: "Nita", sex: "female", chip: "123", troop: "Goliath", introcage: null, introcageType: null,
    enclosure: "Goliath", year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "",
};
const EDITOR = { canSee: true, canAdd: true, userId: "u-1", isAdmin: false };
const MAINTENANCE = { canSee: true, canAdd: false, userId: "u-2", isAdmin: false };
const session = (id, date, seen) => ({ id, date, status: "finished", finishedAt: `${date}T10:00:00Z`, sightings: [{ monkeyId: 7, seen }] });
const MISSED_TWO = [session(3, "2026-10-26", false), session(2, "2026-10-19", false), session(1, "2026-10-12", true)];

const open = (staff, monkey = MONKEY) => render(<MonkeyPage monkey={monkey} staff={staff} />);
const row = (label) => screen.getByText(label, { selector: "dt" }).closest("div");

beforeEach(() => {
    vi.clearAllMocks();
    loadInjuries.mockResolvedValue([]);
    loadConditions.mockResolvedValue([]);
    loadMonitoring.mockResolvedValue({ conditionCheck: false, notes: "", updatedByName: null, updatedAt: null });
    loadMonkeySightings.mockResolvedValue({ sessions: [session(3, "2026-10-26", true)], spots: [] });
});

test("Monitoring, above Records: Last Seen, Current Injuries, Latest Condition, Priority Check, Notes for Monitoring", async () => {
    loadInjuries.mockResolvedValue([
        {
            id: 1, date: "2026-10-10", description: "Bite on tail", loggedBy: "u-1", healedOn: null,
            updates: [{ id: 2, date: "2026-10-20", details: "Healing well", loggedBy: "u-1" }],
        },
    ]);
    loadConditions.mockResolvedValue([{ id: 1, monkeyId: 7, date: "2026-10-26", description: "Looking thin" }]);
    loadMonitoring.mockResolvedValue({ conditionCheck: true, notes: "Check her weight", updatedByName: null, updatedAt: null });
    open(EDITOR);
    const section = (await screen.findByRole("button", { name: "Monitoring", expanded: true })).closest("section");
    expect(section.nextElementSibling).toHaveTextContent(/^Records/);
    await waitFor(() => expect(within(section).getAllByRole("term").map((t) => t.textContent)).toEqual([
        "Last Seen", "Current Injuries", "Latest Condition", "Priority Check", "Notes for Monitoring",
    ]));
    await waitFor(() => expect(row("Last Seen")).toHaveTextContent("26th Oct 2026"));
    await waitFor(() => expect(row("Current Injuries")).toHaveTextContent("Bite on tail · 10th Oct 2026Latest Update: Healing well · 20th Oct 2026"));
    await waitFor(() => expect(row("Latest Condition")).toHaveTextContent("Looking thin · 26th Oct 2026"));
    await waitFor(() => expect(row("Priority Check")).toHaveTextContent("Yes"));
    expect(row("Notes for Monitoring")).toHaveTextContent("Check her weight");
    // (seen: no Mark As Seen)
    expect(screen.queryByRole("button", { name: "Mark Nita As Seen" })).toBeNull();
});

test("missing: why, in red, with Mark As Seen; once marked, the day and who saw it", async () => {
    const user = userEvent.setup();
    loadMonkeySightings.mockResolvedValueOnce({ sessions: MISSED_TWO, spots: [] });
    open(EDITOR);
    await waitFor(() => expect(row("Last Seen")).toHaveTextContent("12th Oct 2026Not seen in the last 2 sessions"));
    await user.click(screen.getByRole("button", { name: "Mark Nita As Seen" }));
    const form = screen.getByRole("group", { name: "Mark Nita As Seen" });
    const date = within(form).getByLabelText("Seen On").value;
    addSpotSighting.mockResolvedValue({ id: 1 });
    loadMonkeySightings.mockResolvedValueOnce({
        sessions: MISSED_TWO,
        spots: [{ id: 1, monkeyId: 7, date: "2026-10-30", note: "By the gate", by: "Sam", at: "2026-10-30T09:00:00Z" }],
    });
    await user.click(within(form).getByRole("button", { name: "Confirm" }));
    expect(addSpotSighting).toHaveBeenCalledWith(7, { date, note: "" });
    await waitFor(() => expect(row("Last Seen")).toHaveTextContent("30th Oct 2026 · by Sam · By the gate"));
    expect(screen.queryByRole("button", { name: "Mark Nita As Seen" })).toBeNull();
});

test("maintenance staff see missing, without Mark As Seen; not in a session yet says so", async () => {
    loadMonkeySightings.mockResolvedValueOnce({ sessions: MISSED_TWO, spots: [] });
    const { unmount } = open(MAINTENANCE);
    await waitFor(() => expect(row("Last Seen")).toHaveTextContent("Not seen in the last 2 sessions"));
    expect(screen.queryByRole("button", { name: "Mark Nita As Seen" })).toBeNull();
    unmount();
    loadMonkeySightings.mockResolvedValueOnce({ sessions: [], spots: [] });
    open(EDITOR);
    await waitFor(() => expect(row("Last Seen")).toHaveTextContent("Not in a monitoring session yet"));
});

test("a new arrival in a care unit: no Monitoring (looked after daily as part of its care)", async () => {
    open(EDITOR, { ...MONKEY, troop: "Quarantine", enclosure: "Quarantine", introcage: "Quarantine 1", introcageType: "area" });
    await screen.findByRole("button", { name: "Records", expanded: true });
    expect(screen.queryByRole("button", { name: "Monitoring" })).toBeNull();
    expect(loadMonkeySightings).not.toHaveBeenCalled();
    expect(loadMonitoring).not.toHaveBeenCalled();
});
