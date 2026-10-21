// Integration Reports: staff reports on how a monkey's integration is
// going, in the Integration tab of the monkey's page (Records). No longer
// on the pop-up.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import { addIntegration, deleteIntegration, loadIntegration, saveIntegration } from "./monkeyData";
import { newReportDates, periodText, MAX_REPORT, useIntegration } from "./IntegrationReports";
import { IntegrationRecords } from "./MonkeyRecords";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegration: vi.fn(),
    addIntegration: vi.fn(),
    saveIntegration: vi.fn(),
    deleteIntegration: vi.fn(),
    loadInjuries: vi.fn().mockResolvedValue([]),
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

// The Integration tab's list, with the real loading hook
function Integration({ staff }) {
    return <IntegrationRecords integration={useIntegration(MONKEY.id, staff)} />;
}
const open = (staff) => render(<Integration staff={staff} />);
const newButton = () => screen.findByRole("button", { name: "New Integration Report" });
const rowOf = (text) => screen.getByText(text).closest("[role='row']");

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

test("the pop-up no longer has Integration Reports (Quick Actions or a list)", async () => {
    loadIntegration.mockResolvedValue([entry(1)]);
    render(<Modal isModalOpen monkey={MONKEY} onClose={() => {}} handlePrevNext={() => {}} onWhereabouts={vi.fn()} staff={ADMIN} />);
    await userEvent.click(await screen.findByRole("button", { name: "Quick Actions" }));
    expect(screen.getByRole("button", { name: "New Injury" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Integration Report" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Integration Reports/ })).not.toBeInTheDocument();
    expect(loadIntegration).not.toHaveBeenCalled();
});

describe("adding", () => {
    test("+ New Integration Report: Date Start and Date End side by side, the report, Confirm and Cancel", async () => {
        const created = entry(1, { from: "2026-10-04", to: "2026-10-11", report: "Settling in well" });
        addIntegration.mockResolvedValue(created);
        open(EDITOR);
        await userEvent.click(await newButton());
        expect(screen.getByLabelText("Date Start")).toBeInTheDocument();
        expect(screen.getByLabelText("Date End")).toBeInTheDocument();
        const box = screen.getByLabelText("Integration Report");
        expect(box).toHaveAttribute("maxlength", String(MAX_REPORT));
        await userEvent.type(box, "  Settling in well ");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(addIntegration).toHaveBeenCalledTimes(1));
        const [id, values] = addIntegration.mock.calls[0];
        expect(id).toBe(7);
        expect(values).toEqual({ from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), report: "Settling in well" });
        // In the list, with its dates in their columns
        const row = rowOf("Settling in well");
        expect(within(row).getAllByRole("cell")[0]).toHaveTextContent("4th Oct 2026");
        expect(within(row).getAllByRole("cell")[1]).toHaveTextContent("11th Oct 2026");
        expect(screen.getByRole("button", { name: "New Integration Report" })).toBeInTheDocument();
    });

    test("Cancel closes it without saving", async () => {
        open(EDITOR);
        await userEvent.click(await newButton());
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByLabelText("Integration Report")).not.toBeInTheDocument();
        expect(addIntegration).not.toHaveBeenCalled();
    });

    test("it needs a report, and the end can't be before the start", async () => {
        open(EDITOR);
        await userEvent.click(await newButton());
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Please write the report.");
        fireEvent.change(screen.getByLabelText("Date Start"), { target: { value: "2026-10-09" } });
        fireEvent.change(screen.getByLabelText("Date End"), { target: { value: "2026-10-01" } });
        await userEvent.type(screen.getByLabelText("Integration Report"), "x");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("The end date can't be before the start date.");
        expect(addIntegration).not.toHaveBeenCalled();
    });

    test("a failed save says so and keeps what was typed", async () => {
        addIntegration.mockRejectedValue(new Error("Couldn't save right now."));
        open(EDITOR);
        await userEvent.click(await newButton());
        await userEvent.type(screen.getByLabelText("Integration Report"), "Keep me");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save right now.");
        expect(screen.getByLabelText("Integration Report")).toHaveValue("Keep me");
    });
});

describe("the list", () => {
    test("columns Date Start | Date End | Integration Report, newest first", async () => {
        loadIntegration.mockResolvedValue([entry(2, { report: "Newer" }), entry(1, { report: "Older" })]);
        open(EDITOR);
        await screen.findByText("Newer");
        const rows = screen.getAllByRole("row");
        expect(within(rows[0]).getAllByRole("columnheader").map((c) => c.textContent)).toEqual([
            "Date Start",
            "Date End",
            "Integration Report",
        ]);
        expect(rows.slice(1).map((r) => within(r).getAllByRole("cell")[2].textContent)).toEqual([
            "NewerAdded by Sam",
            "OlderAdded by Sam",
        ]);
    });

    test("none yet says so", async () => {
        open(EDITOR);
        expect(await screen.findByText("No integration reports yet.")).toBeInTheDocument();
    });

    test("visitors: nothing is loaded for them", () => {
        open(null);
        expect(loadIntegration).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "New Integration Report" })).not.toBeInTheDocument();
    });

    test("maintenance staff can read them but not add or change", async () => {
        loadIntegration.mockResolvedValue([entry(1)]);
        open(MAINTENANCE);
        expect(await screen.findByText("Report 1")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "New Integration Report" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    test("no adding before integration-reports.sql has run (or offline)", async () => {
        loadIntegration.mockRejectedValue({ code: "42P01" });
        open(EDITOR);
        await waitFor(() => expect(loadIntegration).toHaveBeenCalled());
        expect(screen.queryByRole("button", { name: "New Integration Report" })).not.toBeInTheDocument();
    });

    test("an editor can edit or delete their own, not someone else's", async () => {
        loadIntegration.mockResolvedValue([entry(2, { loggedBy: "someone-else", report: "Theirs" }), entry(1, { report: "Mine" })]);
        open(EDITOR);
        await screen.findByText("Mine");
        expect(within(rowOf("Mine")).getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(within(rowOf("Mine")).getByRole("button", { name: "Delete" })).toBeInTheDocument();
        expect(within(rowOf("Theirs")).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(within(rowOf("Theirs")).queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    });

    test("an admin can change anyone's", async () => {
        loadIntegration.mockResolvedValue([entry(1, { loggedBy: "someone-else", report: "Theirs" })]);
        open(ADMIN);
        await screen.findByText("Theirs");
        expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });

    test("editing: the same fields, Confirm saves the change", async () => {
        loadIntegration.mockResolvedValue([entry(1, { report: "Mine" })]);
        saveIntegration.mockResolvedValue(entry(1, { report: "Mine, updated" }));
        open(EDITOR);
        await screen.findByText("Mine");
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
        await screen.findByText("Mine");
        await userEvent.click(screen.getByRole("button", { name: "Delete" }));
        expect(screen.getByText("Delete this report?")).toBeInTheDocument();
        expect(deleteIntegration).not.toHaveBeenCalled();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(deleteIntegration).toHaveBeenCalledWith(1));
        await waitFor(() => expect(screen.queryByText("Mine")).not.toBeInTheDocument());
    });
});
