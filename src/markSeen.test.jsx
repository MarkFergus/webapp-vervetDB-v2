// Mark Seen in the pop-up: a monkey missing from its last monitoring
// session, ticked off on its own (editors and admins)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import { addSpotSighting, loadMonitoring, loadMonkeySightings } from "./monkeyData";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegration: vi.fn().mockResolvedValue([]),
    loadInjuries: vi.fn().mockResolvedValue([]),
    loadConditions: vi.fn().mockResolvedValue([]),
    loadMonitoring: vi.fn(),
    loadMonkeySightings: vi.fn(),
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

const open = (staff) => render(<Modal isModalOpen monkey={MONKEY} onClose={() => {}} handlePrevNext={() => {}} staff={staff} />);

beforeEach(() => {
    vi.clearAllMocks();
    loadMonitoring.mockResolvedValue({ conditionCheck: false, notes: "", updatedByName: null, updatedAt: null });
});

test("missing: under Monitoring, with Mark Seen; once marked, who saw it", async () => {
    const user = userEvent.setup();
    loadMonkeySightings.mockResolvedValueOnce({ sessions: MISSED_TWO, spots: [] });
    open(EDITOR);
    expect(await screen.findByText(/Not seen in the last 2 sessions · last seen 12th Oct 2026/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Mark Nita Seen" }));
    const form = screen.getByRole("group", { name: "Mark Nita Seen" });
    const date = within(form).getByLabelText("Seen On").value;
    addSpotSighting.mockResolvedValue({ id: 1 });
    loadMonkeySightings.mockResolvedValueOnce({
        sessions: MISSED_TWO,
        spots: [{ id: 1, monkeyId: 7, date: "2026-10-30", note: "", by: "Sam", at: "2026-10-30T09:00:00Z" }],
    });
    await user.click(within(form).getByRole("button", { name: "Confirm" }));
    expect(addSpotSighting).toHaveBeenCalledWith(7, { date, note: "" });
    await waitFor(() => expect(screen.getByText(/30th Oct 2026 by Sam/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Mark Nita Seen" })).toBeNull();
});

test("seen in the last session: nothing to show; maintenance staff see missing, without Mark Seen", async () => {
    loadMonkeySightings.mockResolvedValueOnce({ sessions: [session(3, "2026-10-26", true)], spots: [] });
    const { unmount } = open(EDITOR);
    await waitFor(() => expect(loadMonkeySightings).toHaveBeenCalledWith(7));
    expect(screen.queryByText(/Missing:/)).toBeNull();
    unmount();
    loadMonkeySightings.mockResolvedValueOnce({ sessions: MISSED_TWO, spots: [] });
    open(MAINTENANCE);
    expect(await screen.findByText(/Not seen in the last 2 sessions/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Nita Seen" })).toBeNull();
});
