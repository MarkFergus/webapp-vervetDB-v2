// Injuries: a section of the pop-up, and New Injury under Quick Actions
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import { addInjury, addInjuryUpdate, deleteInjuryUpdate, loadInjuries, loadMonitoring, setInjuryHealed } from "./monkeyData";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegration: vi.fn().mockResolvedValue([]),
    loadInjuries: vi.fn(),
    addInjury: vi.fn(),
    saveInjury: vi.fn(),
    setInjuryHealed: vi.fn(),
    deleteInjury: vi.fn(),
    // (monitoring.sql has run)
    injuryUpdatesAvailable: () => true,
    addInjuryUpdate: vi.fn(),
    saveInjuryUpdate: vi.fn(),
    deleteInjuryUpdate: vi.fn(),
    loadMonitoring: vi.fn(),
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
    loadMonitoring.mockResolvedValue({ conditionCheck: false, notes: "", updatedByName: null, updatedAt: null });
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

test("limited accounts see injuries, but can't change even their own (staff who wrote one can)", async () => {
    const mine = [injury(1, { loggedBy: "u-lim", updates: [] })];
    const WRITER = { canSee: true, canAdd: false, userId: "u-lim", isAdmin: false };
    loadInjuries.mockResolvedValue(mine);
    const { unmount } = open(WRITER);
    expect(await screen.findByText("Cut 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    unmount();
    open({ ...WRITER, readOnly: true });
    expect(await screen.findByText("Cut 1")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
});

test("visitors (not staff) never load injuries", () => {
    open(null);
    expect(loadInjuries).not.toHaveBeenCalled();
});

describe("updates on an injury", () => {
    const update = (id, extra = {}) => ({
        id, date: "2026-10-19", details: `Update ${id}`, loggedBy: "u-admin", loggedByName: "Sam", loggedAt: "2026-10-19T09:00:00Z", ...extra,
    });

    test("listed under the injury, oldest first; Add Update asks the date (today) and the details", async () => {
        loadInjuries.mockResolvedValue([injury(1, { updates: [update(5, { date: "2026-10-12" })] })]);
        addInjuryUpdate.mockImplementation(async (_id, values) => update(6, values));
        open(ADMIN);
        const item = (await screen.findByText("Cut 1")).closest("li");
        expect(within(within(item).getByRole("list", { name: "Updates" })).getByText("Update 5")).toBeInTheDocument();
        await userEvent.click(within(item).getByRole("button", { name: "Add Update" }));
        const date = screen.getByLabelText("Date");
        expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        await userEvent.type(screen.getByRole("textbox", { name: "Details" }), " Healing well ");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(addInjuryUpdate).toHaveBeenCalledWith(1, { date: date.value, details: "Healing well" });
        const updates = within(screen.getByRole("list", { name: "Updates" })).getAllByRole("listitem").map((li) => li.textContent);
        expect(updates.at(-1)).toMatch(/Healing well/);
    });

    test("asks for the details before saving", async () => {
        loadInjuries.mockResolvedValue([injury(1)]);
        open(ADMIN);
        await userEvent.click(await screen.findByRole("button", { name: "Add Update" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please write the update.");
        expect(addInjuryUpdate).not.toHaveBeenCalled();
    });

    test("deleting one (admins, or whoever added it), with a red confirm", async () => {
        loadInjuries.mockResolvedValue([injury(1, { updates: [update(5)] })]);
        deleteInjuryUpdate.mockResolvedValue();
        open(ADMIN);
        await userEvent.click(await screen.findByRole("button", { name: "Delete update" }));
        const bubble = screen.getByRole("dialog", { name: "Delete this update?" });
        expect(within(bubble).getByRole("button", { name: "Confirm" })).toHaveClass("is-danger");
        await userEvent.click(within(bubble).getByRole("button", { name: "Confirm" }));
        expect(deleteInjuryUpdate).toHaveBeenCalledWith(5);
        expect(screen.queryByText("Update 5")).not.toBeInTheDocument();
    });

    test("maintenance staff see the updates, but can't add, change or delete them; healed injuries take no more", async () => {
        loadInjuries.mockResolvedValue([injury(1, { updates: [update(5, { loggedBy: "u-admin" })] })]);
        open(MAINTENANCE);
        expect(await screen.findByText("Update 5")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Add Update" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete update" })).not.toBeInTheDocument();
    });
});

describe("Monitoring in the pop-up (staff)", () => {
    test("Condition Check and the Notes for Monitoring, once there's something", async () => {
        loadMonitoring.mockResolvedValue({ conditionCheck: true, notes: "Check she's eating ok", updatedByName: "Sam", updatedAt: null });
        open(MAINTENANCE);
        const section = (await screen.findByRole("heading", { name: "Monitoring" })).closest("section");
        expect(section).toHaveTextContent("Priority Condition Check");
        expect(section).toHaveTextContent("Check she's eating ok");
    });

    test("nothing set: no Monitoring section; visitors never load it", async () => {
        open(MAINTENANCE);
        await screen.findByRole("heading", { name: "Bio" });
        expect(screen.queryByRole("heading", { name: "Monitoring" })).not.toBeInTheDocument();
        loadMonitoring.mockClear();
        open(null);
        expect(loadMonitoring).not.toHaveBeenCalled();
    });
});

describe("an open form holds the pop-up until its Cancel", () => {
    const OTHER = { ...MONKEY, id: 8, name: "Rocio" };
    const openWithNeighbours = () => {
        const handlePrevNext = vi.fn();
        const onClose = vi.fn();
        render(
            <Modal
                isModalOpen monkey={MONKEY} onClose={onClose} handlePrevNext={handlePrevNext}
                prevMonkey={OTHER} nextMonkey={OTHER} staff={ADMIN}
            />
        );
        return { handlePrevNext, onClose };
    };

    test("no arrow keys to other monkeys, no Escape, no close or previous / next buttons; back after Cancel", async () => {
        loadInjuries.mockResolvedValue([injury(1)]);
        const { handlePrevNext, onClose } = openWithNeighbours();
        await userEvent.click(await screen.findByRole("button", { name: "Add Update" }));
        const details = screen.getByRole("textbox", { name: "Details" });
        // Typing: the arrows move the cursor
        await userEvent.type(details, "Healing{arrowleft}{arrowright}");
        // Not typing (focus elsewhere in the pop-up): still held
        details.blur();
        await userEvent.keyboard("{ArrowRight}{ArrowLeft}{Escape}");
        expect(handlePrevNext).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
        expect(screen.getByRole("button", { name: "Next monkey" })).toBeDisabled();
        // Cancel: free again
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: "Close" })).toBeEnabled();
        await userEvent.keyboard("{ArrowRight}");
        expect(handlePrevNext).toHaveBeenCalledWith("next");
    });

    test("New Injury (Quick Actions) holds it too", async () => {
        const { handlePrevNext, onClose } = openWithNeighbours();
        await screen.findByRole("button", { name: "Quick Actions" });
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "New Injury" }));
        await userEvent.keyboard("{ArrowLeft}{Escape}");
        expect(handlePrevNext).not.toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
    });
});
