// Injuries: a section of the pop-up, and New Injury under Quick Actions
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import { addInjury, loadInjuries, setInjuryHealed } from "./monkeyData";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegration: vi.fn().mockResolvedValue([]),
    loadInjuries: vi.fn(),
    addInjury: vi.fn(),
    saveInjury: vi.fn(),
    setInjuryHealed: vi.fn(),
    deleteInjury: vi.fn(),
}));

const MONKEY = {
    id: 7, name: "Nita", sex: "female", chip: "123", troop: "Goliath", introcage: null, introcageType: null,
    enclosure: "Goliath", year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "",
};
const ADMIN = { canSee: true, canAdd: true, userId: "u-admin", isAdmin: true };
const MAINTENANCE = { canSee: true, canAdd: false, userId: "u-maint", isAdmin: false };

const injury = (id, extra = {}) => ({
    id, date: "2026-10-10", description: `Cut ${id}`, loggedBy: "u-admin", loggedByName: "Sam",
    loggedAt: "2026-10-10T09:00:00Z", healedOn: null, healedByName: null, ...extra,
});

const open = (staff, monkey = MONKEY) =>
    render(<Modal isModalOpen monkey={monkey} onClose={() => {}} handlePrevNext={() => {}} staff={staff} />);
const quickActions = () => userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));

beforeEach(() => {
    vi.clearAllMocks();
    loadInjuries.mockResolvedValue([]);
});

test("New Injury asks the date (today) and a description, then lists it under Injuries", async () => {
    addInjury.mockImplementation(async (_id, values) => injury(1, values));
    open(ADMIN);
    // (no Injuries section until there's been an injury)
    await screen.findByRole("button", { name: "Quick Actions" });
    expect(screen.queryByRole("button", { name: /Injuries \(/ })).not.toBeInTheDocument();
    await quickActions();
    await userEvent.click(screen.getByRole("button", { name: "New Injury" }));
    const date = screen.getByLabelText("Date");
    expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await userEvent.type(screen.getByLabelText("Description"), "  Bite on left arm ");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(addInjury).toHaveBeenCalledWith(7, { date: date.value, description: "Bite on left arm" });
    expect(await screen.findByRole("button", { name: /Injuries \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("Bite on left arm")).toBeInTheDocument();
});

test("asks for a description before saving", async () => {
    open(ADMIN);
    await screen.findByRole("button", { name: "Quick Actions" });
    await quickActions();
    await userEvent.click(screen.getByRole("button", { name: "New Injury" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please describe the injury.");
    expect(addInjury).not.toHaveBeenCalled();
});

test("Healed? moves an injury to the Injury History, where it stays on record", async () => {
    loadInjuries.mockResolvedValue([injury(1), injury(2, { healedOn: "2026-10-01", healedByName: "Jo" })]);
    setInjuryHealed.mockResolvedValue(injury(1, { healedOn: "2026-10-13", healedByName: "Sam" }));
    open(ADMIN);
    expect(await screen.findByRole("button", { name: /Injuries \(1\)/ })).toBeInTheDocument();
    // The healed one: folded away under Injury History
    expect(screen.queryByText("Cut 2")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Healed?" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(setInjuryHealed).toHaveBeenCalledWith(1, true);
    expect(await screen.findByRole("button", { name: /Injuries \(0\)/ })).toBeInTheDocument();
    expect(screen.getByText("No current injuries.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Injury History \(2\)/ }));
    const cut = screen.getByText("Cut 1").closest("li");
    expect(within(cut).getByText(/Healed on 13th Oct 2026/)).toBeInTheDocument();
    expect(within(cut).getByRole("button", { name: "Reopen" })).toBeInTheDocument();
});

test("maintenance staff see injuries, but can't add them or mark them healed", async () => {
    loadInjuries.mockResolvedValue([injury(1, { loggedBy: "someone-else" })]);
    open(MAINTENANCE);
    expect(await screen.findByText("Cut 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Healed?" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
});

test("visitors (not staff) never load injuries", () => {
    open(null);
    expect(loadInjuries).not.toHaveBeenCalled();
});
