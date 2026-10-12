// Integration Reports: staff reports on how a monkey's integration is
// going, under More Actions on the pop-up
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import { addIntegration, deleteIntegration, loadIntegration, saveIntegration } from "./monkeyData";
import { newReportDates, periodText, MAX_REPORT } from "./IntegrationReports";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegration: vi.fn(),
    addIntegration: vi.fn(),
    saveIntegration: vi.fn(),
    deleteIntegration: vi.fn(),
}));

const MONKEY = {
    id: 7, name: "Nita", sex: "female", chip: "123", troop: "Goliath", introcage: null, introcageType: null,
    enclosure: "Goliath", year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "",
};
const EDITOR = { canSee: true, canAdd: true, userId: "u-editor", isAdmin: false };
const ADMIN = { canSee: true, canAdd: true, userId: "u-admin", isAdmin: true };
const MAINTENANCE = { canSee: true, canAdd: false, userId: "u-maint", isAdmin: false };

const entry = (id, extra = {}) => ({
    id, from: "2026-10-01", to: "2026-10-07", report: `Report ${id}`, loggedBy: "u-editor",
    loggedByName: "Sam", loggedAt: "2026-10-08T09:00:00Z", ...extra,
});

const open = (staff) =>
    render(<Modal isModalOpen monkey={MONKEY} onClose={() => {}} handlePrevNext={() => {}} onSickbay={staff?.canAdd ? vi.fn() : undefined} staff={staff} />);
const moreActions = () => userEvent.click(screen.getByRole("button", { name: "More Actions" }));
const listToggle = () => screen.findByRole("button", { name: /^Integration Reports/ });

beforeEach(() => {
    vi.clearAllMocks();
    loadIntegration.mockResolvedValue([]);
});

test("the period reads like a date range", () => {
    expect(periodText("2026-10-04", "2026-10-11")).toBe("4th Oct – 11th Oct 2026");
    expect(periodText("2026-12-28", "2027-01-03")).toBe("28th Dec 2026 – 3rd Jan 2027");
    expect(periodText("2026-10-11", "2026-10-11")).toBe("11th Oct 2026");
    expect(newReportDates(new Date(2026, 9, 11))).toEqual({ from: "2026-10-04", to: "2026-10-11" });
});

describe("adding", () => {
    test("+ Integration Report opens From and To side by side, a text box, Confirm and Cancel", async () => {
        const created = entry(1, { from: "2026-10-04", to: "2026-10-11", report: "Settling in well", loggedBy: "u-editor" });
        addIntegration.mockResolvedValue(created);
        open(EDITOR);
        await moreActions();
        await userEvent.click(await screen.findByRole("button", { name: "+ Integration Report" }));
        expect(screen.getByLabelText("From")).toBeInTheDocument();
        expect(screen.getByLabelText("To")).toBeInTheDocument();
        const box = screen.getByLabelText("Integration Report");
        expect(box).toHaveAttribute("maxlength", String(MAX_REPORT));
        await userEvent.type(box, "  Settling in well ");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(addIntegration).toHaveBeenCalledTimes(1));
        const [id, values] = addIntegration.mock.calls[0];
        expect(id).toBe(7);
        expect(values).toEqual({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), report: "Settling in well" });
        // The list opens with the new entry
        expect(await screen.findByText("Settling in well")).toBeInTheDocument();
        expect(screen.getByText("4th Oct – 11th Oct 2026")).toBeInTheDocument();
    });

    test("Cancel closes it without saving", async () => {
        open(EDITOR);
        await moreActions();
        await userEvent.click(await screen.findByRole("button", { name: "+ Integration Report" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByLabelText("Integration Report")).not.toBeInTheDocument();
        expect(addIntegration).not.toHaveBeenCalled();
    });

    test("it needs a report, and To can't be before From", async () => {
        open(EDITOR);
        await moreActions();
        await userEvent.click(await screen.findByRole("button", { name: "+ Integration Report" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Please write the report.");
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-09" } });
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
        await userEvent.type(screen.getByLabelText("Integration Report"), "x");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("The To date can't be before the From date.");
        expect(addIntegration).not.toHaveBeenCalled();
    });

    test("a failed save says so and keeps what was typed", async () => {
        addIntegration.mockRejectedValue(new Error("Couldn't save right now."));
        open(EDITOR);
        await moreActions();
        await userEvent.click(await screen.findByRole("button", { name: "+ Integration Report" }));
        await userEvent.type(screen.getByLabelText("Integration Report"), "Keep me");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save right now.");
        expect(screen.getByLabelText("Integration Report")).toHaveValue("Keep me");
    });
});

describe("the list", () => {
    test("shows the entries to staff, folded out under More Actions", async () => {
        loadIntegration.mockResolvedValue([entry(2, { report: "Newer" }), entry(1, { report: "Older" })]);
        open(EDITOR);
        const toggle = await listToggle();
        expect(toggle).toHaveTextContent("Integration Reports (2)");
        expect(screen.queryByText("Newer")).not.toBeInTheDocument();
        await userEvent.click(toggle);
        expect(screen.getByText("Newer")).toBeInTheDocument();
        expect(screen.getAllByText("Added by Sam on 8th Oct 2026")).toHaveLength(2);
    });

    test("visitors see nothing, and nothing is loaded for them", () => {
        open(null);
        expect(loadIntegration).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: /Integration/ })).not.toBeInTheDocument();
    });

    test("hidden until there is at least one report", async () => {
        open(EDITOR);
        await moreActions();
        await waitFor(() => expect(loadIntegration).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: /^Integration Reports/ })).not.toBeInTheDocument();
    });

    test("maintenance staff can read them but not add", async () => {
        loadIntegration.mockResolvedValue([entry(1)]);
        open(MAINTENANCE);
        await userEvent.click(await listToggle());
        expect(screen.getByText("Report 1")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "More Actions" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    test("nothing shows before integration-reports.sql has run (or offline)", async () => {
        loadIntegration.mockRejectedValue({ code: "42P01" });
        open(EDITOR);
        await moreActions();
        await waitFor(() => expect(loadIntegration).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: "+ Integration Report" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Integration Reports/ })).not.toBeInTheDocument();
    });

    test("an editor can edit or delete their own, not someone else's", async () => {
        loadIntegration.mockResolvedValue([entry(2, { loggedBy: "someone-else", report: "Theirs" }), entry(1, { report: "Mine" })]);
        open(EDITOR);
        await userEvent.click(await listToggle());
        const mine = screen.getByText("Mine").closest("li");
        const theirs = screen.getByText("Theirs").closest("li");
        expect(within(mine).getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(within(mine).getByRole("button", { name: "Delete" })).toBeInTheDocument();
        expect(within(theirs).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(within(theirs).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    test("an admin can change anyone's", async () => {
        loadIntegration.mockResolvedValue([entry(1, { loggedBy: "someone-else", report: "Theirs" })]);
        open(ADMIN);
        await userEvent.click(await listToggle());
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    test("editing: the same fields, Confirm saves the change", async () => {
        loadIntegration.mockResolvedValue([entry(1, { report: "Mine" })]);
        saveIntegration.mockResolvedValue(entry(1, { report: "Mine, updated" }));
        open(EDITOR);
        await userEvent.click(await listToggle());
        await userEvent.click(screen.getByRole("button", { name: "Edit" }));
        const box = screen.getByLabelText("Integration Report");
        expect(box).toHaveValue("Mine");
        await userEvent.clear(box);
        await userEvent.type(box, "Mine, updated");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saveIntegration).toHaveBeenCalledWith(1, { from: "2026-10-01", to: "2026-10-07", report: "Mine, updated" }));
        expect(await screen.findByText("Mine, updated")).toBeInTheDocument();
    });

    test("deleting asks first", async () => {
        loadIntegration.mockResolvedValue([entry(1, { report: "Mine" })]);
        deleteIntegration.mockResolvedValue();
        open(EDITOR);
        await userEvent.click(await listToggle());
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(screen.getByText("Delete this report?")).toBeInTheDocument();
        expect(deleteIntegration).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(deleteIntegration).toHaveBeenCalledWith(1));
        await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
    });
});
