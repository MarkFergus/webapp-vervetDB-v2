// The Monkey Archive: Status Update (admins) in the pop-up, the archive's
// list on the Admin Dashboard, and an archived monkey's Full Profile, where
// its status can change again or it's restored (monkey-archive.sql)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import AdminPage from "./AdminPage";
import StatusUpdate from "./StatusUpdate";
import { RecordList, otherRows, useRecords } from "./MonkeyRecords";
import { loadArchive, loadRecords, saveStatus } from "./monkeyData";
import { supabase } from "./supabase";
import { DEFAULT_FEEDING } from "./feeding";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";
import { archiveIdFromRoute, archivePageHash, removeWarning, restoreWarning } from "./monkeyStatus";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadArchive: vi.fn(),
    loadRecords: vi.fn(),
    saveStatus: vi.fn(),
}));
beforeEach(() => {
    loadRecords.mockResolvedValue([]);
});
afterEach(() => {
    vi.clearAllMocks();
});

const ADMIN = { canSee: true, canAdd: true, userId: "admin-1", isAdmin: true };

const MONKEY = {
    id: 1, name: "Nita", sex: "female", chip: "123", troop: "Goliath", introcage: null, enclosure: "Goliath",
    year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "", feeding: DEFAULT_FEEDING, inSickbay: false, status: "sanctuary",
};

const archived = (overrides) => ({ ...MONKEY, statusChanges: [], ...overrides });
const POPPY = archived({
    id: 12, name: "Poppy", status: "deceased", statusOn: "2026-10-20", statusDetails: "Found in the troop", year: 2012, chip: "1011",
    statusChanges: [
        { id: 2, date: "2026-10-20", details: "Status changed from Missing to Deceased: Found in the troop", by: "Mark" },
        { id: 1, date: "2026-09-01", details: "Status changed from Sanctuary to Missing: Not seen since August", by: "Sam" },
    ],
});
const RUDI = archived({ id: 13, name: "Rudi", sex: "male", status: "missing", statusOn: "2026-10-25", statusDetails: "Not seen", chip: null });
const WILL = archived({ id: 14, name: "Wild Will", status: "released", statusOn: "2026-10-12", statusDetails: null, year: "" });

describe("the address of an archived monkey's page", () => {
    test("its name and id", () => {
        expect(archivePageHash(POPPY)).toBe("#admin/archive/poppy-12");
        expect(archiveIdFromRoute("admin/archive/poppy-12")).toBe(12);
        expect(archiveIdFromRoute("admin/archive")).toBe(null);
        expect(archiveIdFromRoute("admin/staff")).toBe(null);
    });

    test("the warnings' words", () => {
        expect(removeWarning("Nita")).toBe(
            "This will remove Nita from current records. They can still be viewed and restored from the Monkey Archive."
        );
        expect(restoreWarning("Rudi", "Gismo Troop")).toBe("This will return Rudi to current records, at their home location (Gismo Troop).");
    });
});

describe("Status Update's form", () => {
    const fill = async ({ status = "deceased", details = "Found in the troop" } = {}) => {
        await userEvent.selectOptions(screen.getByLabelText("New Status"), status);
        if (details) await userEvent.type(screen.getByLabelText("Status Details"), details);
    };

    test("the date's label follows the status; details are needed", async () => {
        render(<StatusUpdate name="Nita" choices={["deceased", "escaped", "missing"]} onSave={vi.fn()} onCancel={vi.fn()} />);
        const choices = within(screen.getByLabelText("New Status")).getAllByRole("option").map((o) => o.textContent);
        expect(choices).toEqual(["Choose…", "Deceased", "Escaped", "Missing"]);
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "missing");
        expect(screen.getByLabelText("Last Seen").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "escaped");
        expect(screen.getByLabelText("Date Escaped")).toBeInTheDocument();
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "deceased");
        expect(screen.getByLabelText("Date of Death")).toBeInTheDocument();
        // (no details yet, or only spaces)
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Status Details"), "   ");
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        await userEvent.type(screen.getByLabelText("Status Details"), "Found in the troop");
        expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    });

    test("Confirm warns first; a red Confirm then saves", async () => {
        const onSave = vi.fn().mockResolvedValue();
        render(<StatusUpdate name="Nita" choices={["deceased", "escaped", "missing"]} onSave={onSave} onCancel={vi.fn()} />);
        await fill();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(onSave).not.toHaveBeenCalled();
        expect(screen.getByRole("alert")).toHaveTextContent(removeWarning("Nita"));
        const confirm = screen.getByRole("button", { name: "Confirm" });
        expect(confirm).toHaveClass("is-danger");
        await userEvent.click(confirm);
        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0]).toEqual({
            status: "deceased",
            date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
            details: "Found in the troop",
        });
    });

    test("Back goes back to the form, as it was", async () => {
        render(<StatusUpdate name="Nita" choices={["deceased", "escaped", "missing"]} onSave={vi.fn()} onCancel={vi.fn()} />);
        await fill({ status: "escaped", details: "Over the fence" });
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await userEvent.click(screen.getByRole("button", { name: "Back" }));
        expect(screen.getByLabelText("New Status")).toHaveValue("escaped");
        expect(screen.getByLabelText("Status Details")).toHaveValue("Over the fence");
    });

    test("a restore: its own warning, and a green Confirm", async () => {
        render(<StatusUpdate name="Rudi" home="Gismo Troop" choices={["sanctuary", "deceased"]} onSave={vi.fn()} onCancel={vi.fn()} />);
        expect(within(screen.getByLabelText("New Status")).getByRole("option", { name: "Sanctuary (Restore)" })).toBeInTheDocument();
        await fill({ status: "sanctuary", details: "Back with the troop" });
        expect(screen.getByLabelText("Date Returned")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("alert")).toHaveTextContent(restoreWarning("Rudi", "Gismo Troop"));
        expect(screen.getByRole("button", { name: "Confirm" })).toHaveClass("is-confirm");
    });

    test("a failed save says so, and stays open", async () => {
        const onSave = vi.fn().mockRejectedValue(new Error("Couldn't save right now."));
        render(<StatusUpdate name="Nita" choices={["deceased"]} onSave={onSave} onCancel={vi.fn()} />);
        await userEvent.type(screen.getByLabelText("Status Details"), "Found");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByText("Couldn't save right now.")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeEnabled();
    });
});

describe("the pop-up's Status Update (admins)", () => {
    const open = (onStatusUpdate) =>
        render(<Modal isModalOpen monkey={MONKEY} onClose={() => {}} handlePrevNext={() => {}} onStatusUpdate={onStatusUpdate} />);

    test("last in Quick Actions; saves through onStatusUpdate", async () => {
        const onStatusUpdate = vi.fn().mockResolvedValue();
        open(onStatusUpdate);
        await userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Status Update" }));
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "missing");
        await userEvent.type(screen.getByLabelText("Status Details"), "Not seen at monitoring for 3 weeks");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
        const [monkey, values] = onStatusUpdate.mock.calls[0];
        expect(monkey.id).toBe(1);
        expect(values).toMatchObject({ status: "missing", details: "Not seen at monitoring for 3 weeks" });
    });

    test("Cancel closes it without saving", async () => {
        const onStatusUpdate = vi.fn();
        open(onStatusUpdate);
        await userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Status Update" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onStatusUpdate).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("New Status")).not.toBeInTheDocument();
    });

    test("not there unless it's given (admins only)", () => {
        open(undefined);
        expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
    });
});

describe("the Monkey Archive's list", () => {
    const renderArchive = () => render(<AdminPage route="admin/archive" staff={ADMIN} />);
    const names = () => screen.queryAllByRole("link").filter((a) => a.classList.contains("Archive-link")).map((a) => a.textContent);

    test("newest status change first; each opens its Full Profile", async () => {
        loadArchive.mockResolvedValue([WILL, POPPY, RUDI]);
        renderArchive();
        expect(await screen.findByRole("link", { name: "Rudi" })).toHaveAttribute("href", "#admin/archive/rudi-13");
        expect(names()).toEqual(["Rudi", "Poppy", "Wild Will"]);
        expect(screen.getByRole("heading", { level: 1, name: "Monkey Archive" })).toBeInTheDocument();
    });

    test("the status pills (with counts) and the search", async () => {
        loadArchive.mockResolvedValue([WILL, POPPY, RUDI]);
        renderArchive();
        await screen.findByRole("link", { name: "Rudi" });
        const pills = within(screen.getByRole("group", { name: "Status" })).getAllByRole("button");
        expect(pills.map((p) => p.textContent)).toEqual(["All3", "Deceased1", "Escaped0", "Missing1", "Released1"]);
        await userEvent.click(screen.getByRole("button", { name: /^Released/ }));
        expect(names()).toEqual(["Wild Will"]);
        await userEvent.click(screen.getByRole("button", { name: /^Escaped/ }));
        expect(screen.getByText("No archived monkeys match.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: /^All/ }));
        await userEvent.type(screen.getByRole("searchbox"), "1011");
        expect(names()).toEqual(["Poppy"]);
    });

    test("the + shows the details and every status change", async () => {
        loadArchive.mockResolvedValue([POPPY]);
        renderArchive();
        const plus = await screen.findByRole("button", { name: "Show details for Poppy" });
        await userEvent.click(plus);
        expect(screen.getByRole("button", { name: "Hide details for Poppy" })).toHaveAttribute("aria-expanded", "true");
        expect(screen.getByText("Found in the troop")).toBeInTheDocument();
        expect(screen.getByText(/Status changed from Sanctuary to Missing/)).toHaveTextContent("(Sam)");
        expect(screen.getByText("1st Sep 2026")).toBeInTheDocument();
    });

    test("empty, not loading, or the database not ready", async () => {
        loadArchive.mockResolvedValue([]);
        const { unmount } = renderArchive();
        expect(await screen.findByText("No monkeys in the archive yet.")).toBeInTheDocument();
        unmount();
        loadArchive.mockRejectedValue(Object.assign(new Error("no column"), { code: "42703" }));
        const second = renderArchive();
        expect(await screen.findByText(/needs supabase\/monkey-archive.sql/)).toBeInTheDocument();
        second.unmount();
        loadArchive.mockRejectedValue(new Error("offline"));
        renderArchive();
        expect(await screen.findByText(/Couldn't load the Monkey Archive/)).toBeInTheDocument();
    });
});

describe("an archived monkey's Full Profile", () => {
    test("its status at the top, back to the archive, and Status Update", async () => {
        loadArchive.mockResolvedValue([POPPY]);
        render(<AdminPage route="admin/archive/poppy-12" staff={ADMIN} />);
        expect(await screen.findByRole("heading", { level: 1, name: "Poppy" })).toBeInTheDocument();
        expect(screen.getByRole("note")).toHaveTextContent("Deceased · 20th Oct 2026");
        expect(screen.getByRole("note")).toHaveTextContent("Found in the troop");
        expect(screen.getByRole("link", { name: /Monkey Archive/ })).toHaveAttribute("href", "#admin/archive");
        expect(screen.getByText("Status").closest("div")).toHaveTextContent("Deceased");
        // (no pop-up, and no Edit)
        expect(screen.queryByTitle("View Card")).not.toBeInTheDocument();
        expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
        await userEvent.click(screen.getByTitle("Status Update"));
        const choices = within(screen.getByLabelText("New Status")).getAllByRole("option").map((o) => o.textContent);
        expect(choices).toEqual(["Choose…", "Sanctuary (Restore)", "Released", "Escaped", "Missing"]);
    });

    test("each records tab says how many it has", async () => {
        loadArchive.mockResolvedValue([{ ...POPPY, arrivalDate: "2026-01-02", arrivalReason: "orphaned" }]);
        loadRecords.mockResolvedValue([
            { id: 7, section: "rehabilitation", date: "2026-10-20", category: "status", details: "Status changed", loggedBy: "a", loggedByName: "M" },
            { id: 8, section: "medical", date: "2026-10-19", category: "vet_visit", details: "Checked", loggedBy: "a", loggedByName: "M" },
        ]);
        render(<AdminPage route="admin/archive/poppy-12" staff={ADMIN} />);
        // (Rehabilitation: its Status record and its arrival)
        expect(await screen.findByRole("tab", { name: "Rehabilitation (2)" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Medical (1)" })).toBeInTheDocument();
    });

    test("admins can add records afterwards (e.g. what's found out later)", async () => {
        loadArchive.mockResolvedValue([POPPY]);
        render(<AdminPage route="admin/archive/poppy-12" staff={ADMIN} />);
        expect(await screen.findByRole("button", { name: /New Rehabilitation Record/ })).toBeInTheDocument();
        await userEvent.click(screen.getByRole("tab", { name: /Medical/ }));
        expect(screen.getByRole("button", { name: /New Medical Record/ })).toBeInTheDocument();
    });

    test("a new status: saved, and the archive loaded again", async () => {
        loadArchive.mockResolvedValue([POPPY]);
        saveStatus.mockResolvedValue(null);
        render(<AdminPage route="admin/archive/poppy-12" staff={ADMIN} />);
        await userEvent.click(await screen.findByTitle("Status Update"));
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "escaped");
        await userEvent.type(screen.getByLabelText("Status Details"), "A mistake: she escaped");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saveStatus).toHaveBeenCalledWith(12, expect.objectContaining({ status: "escaped" })));
        await waitFor(() => expect(loadArchive).toHaveBeenCalledTimes(2));
    });

    test("restored: back in the current records (onRestored)", async () => {
        loadArchive.mockResolvedValue([RUDI]);
        const back = { ...RUDI, status: "sanctuary" };
        saveStatus.mockResolvedValue(back);
        const onRestored = vi.fn();
        render(<AdminPage route="admin/archive/rudi-13" staff={ADMIN} onRestored={onRestored} />);
        await userEvent.click(await screen.findByTitle("Status Update"));
        await userEvent.selectOptions(screen.getByLabelText("New Status"), "sanctuary");
        await userEvent.type(screen.getByLabelText("Status Details"), "Found with the troop");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("alert")).toHaveTextContent("at their home location (Goliath Troop)");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(onRestored).toHaveBeenCalledWith(back));
    });

    test("not in the archive: not found", async () => {
        loadArchive.mockResolvedValue([POPPY]);
        render(<AdminPage route="admin/archive/someone-99" staff={ADMIN} />);
        expect(await screen.findByText(/couldn't be found/)).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Monkey Archive/ })).toHaveAttribute("href", "#admin/archive");
    });
});

describe("Status records (added by the database)", () => {
    const change = {
        id: 7, section: "rehabilitation", date: "2026-10-20", category: "status",
        details: "Status changed from Sanctuary to Deceased: Found in the troop", loggedBy: "admin-1", loggedByName: "Mark",
    };
    function Records({ staff }) {
        return <RecordList section="rehabilitation" records={useRecords(1, staff)} others={[]} />;
    }

    test("called Status; never edited, and only admins delete one", async () => {
        loadRecords.mockResolvedValue([change]);
        const { unmount } = render(<Records staff={ADMIN} />);
        const row = (await screen.findByText(change.details)).closest("[role='row']");
        expect(within(row).getByText("Status")).toBeInTheDocument();
        expect(within(row).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
        unmount();
        render(<Records staff={{ ...ADMIN, isAdmin: false }} />);
        const theirs = (await screen.findByText(change.details)).closest("[role='row']");
        expect(within(theirs).queryByRole("button")).not.toBeInTheDocument();
    });
});

describe("saving a status (the database)", () => {
    test("through set_monkey_status", async () => {
        const { saveStatus: realSave } = await vi.importActual("./monkeyData");
        const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: null });
        await expect(realSave(12, { status: "deceased", date: "2026-10-20", details: " Found " })).resolves.toBe(null);
        expect(rpc).toHaveBeenCalledWith("set_monkey_status", {
            monkey_id: 12,
            new_status: "deceased",
            status_on: "2026-10-20",
            details: "Found",
        });
        rpc.mockRestore();
    });

    test("a release before monkey-archive.sql: saved as before", async () => {
        const { saveRelease } = await vi.importActual("./monkeyData");
        const rpc = vi.spyOn(supabase, "rpc").mockResolvedValue({ data: null, error: { code: "PGRST202" } });
        const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
        const from = vi.spyOn(supabase, "from").mockReturnValue({ update });
        await saveRelease(5, { date: "2026-10-27", details: "At the dam" });
        expect(update).toHaveBeenCalledWith({ status: "released", released_on: "2026-10-27", release_details: "At the dam" });
        rpc.mockRestore();
        from.mockRestore();
    });
});

describe("its arrival, at the start of Rehabilitation", () => {
    const NO_INJURIES = { current: [], healed: [] };
    function Rehab({ monkey }) {
        return (
            <RecordList
                section="rehabilitation"
                records={useRecords(1, ADMIN)}
                others={otherRows("rehabilitation", { injuries: NO_INJURIES, monkey })}
            />
        );
    }

    test("its date and reason; under anything else that day", async () => {
        loadRecords.mockResolvedValue([
            { id: 3, section: "rehabilitation", date: "2026-10-20", category: "movement",
                details: "Moved from Quarantine to Sickbay", loggedBy: "admin-1", loggedByName: "Mark" },
        ]);
        render(<Rehab monkey={{ ...MONKEY, arrivalDate: "2026-10-20", arrivalReason: "orphaned" }} />);
        await screen.findByText("Moved from Quarantine to Sickbay");
        const rows = screen.getAllByRole("row").slice(1);
        expect(rows.map((r) => r.querySelector(".Records-text").textContent)).toEqual([
            "Moved from Quarantine to Sickbay",
            "Arrived at the sanctuary: Orphaned",
        ]);
        expect(within(rows[1]).getByText("Arrival")).toBeInTheDocument();
        // (changed in Edit, not here)
        expect(within(rows[1]).queryByRole("button")).not.toBeInTheDocument();
    });

    test("none without an arrival date; never in Medical", () => {
        expect(otherRows("rehabilitation", { injuries: NO_INJURIES, monkey: { ...MONKEY, arrivalDate: null } })).toEqual([]);
        expect(otherRows("medical", { injuries: NO_INJURIES, monkey: { ...MONKEY, arrivalDate: "2026-10-20" } })).toEqual([]);
    });
});

describe("its weights (the Records page's), in Medical", () => {
    const NO_INJURIES = { current: [], healed: [] };
    const weigh = (date, value, extra = {}) => ({ monkeyId: 1, date, value, notes: null, loggedByName: "Sam", ...extra });

    test("each weighing: the weight, the change since the one before, and its note", () => {
        const rows = otherRows("medical", {
            injuries: NO_INJURIES,
            monkey: MONKEY,
            weights: [weigh("2026-10-18", 474), weigh("2026-10-25", 512, { notes: "A day late" })],
        });
        expect(rows.map((r) => [r.date, r.category, r.details, r.by])).toEqual([
            ["2026-10-25", "weight", "512 g (+38 g): A day late", "Weight by Sam"],
            ["2026-10-18", "weight", "474 g", "Weight by Sam"],
        ]);
        // (never in Rehabilitation)
        expect(otherRows("rehabilitation", { injuries: NO_INJURIES, monkey: MONKEY, weights: [weigh("2026-10-18", 474)] })).toEqual([]);
    });

    test("listed as Weight, in with the rest, not changed here", async () => {
        render(
            <RecordList
                section="medical"
                records={{ entries: [], available: true, canAdd: false, canEdit: () => true, canDelete: () => true }}
                others={otherRows("medical", { injuries: NO_INJURIES, monkey: MONKEY, weights: [weigh("2026-10-25", 512)] })}
            />
        );
        const row = screen.getByText("512 g").closest("[role='row']");
        expect(within(row).getByText("Weight")).toBeInTheDocument();
        expect(within(row).queryByRole("button")).not.toBeInTheDocument();
    });
});

describe("its injuries, in Medical: one row each, its updates with it", () => {
    const injury = (id, extra) => ({ id, date: "2026-10-10", description: `Injury ${id}`, loggedByName: "Sam", healedOn: null, updates: [], ...extra });
    const UPDATES = [
        { id: 5, date: "2026-10-14", details: "Healing well", loggedByName: "Sam" },
        { id: 6, date: "2026-10-21", details: "Stitches out", loggedByName: "Jo" },
    ];
    const show = (injuries) =>
        render(
            <RecordList
                section="medical"
                records={{ entries: [], available: true, canAdd: false, canEdit: () => false, canDelete: () => false }}
                others={otherRows("medical", { injuries, monkey: MONKEY })}
            />
        );

    test("current: its Latest Update and date; All Updates opens them all, newest first", async () => {
        show({ current: [injury(1, { updates: UPDATES })], healed: [] });
        // (one row: the updates aren't rows of their own)
        expect(screen.getAllByRole("row")).toHaveLength(2);
        const row = screen.getByText("Injury 1").closest("[role='row']");
        expect(row.querySelector(".Records-injuryState")).toHaveTextContent("Latest Update · 21st Oct 2026: Stitches out");
        expect(within(row).queryByRole("list", { name: "Updates" })).toBeNull();
        await userEvent.click(within(row).getByRole("button", { name: /All Updates \(2\)/ }));
        const items = within(within(row).getByRole("list", { name: "Updates" })).getAllByRole("listitem");
        expect(items.map((li) => li.textContent)).toEqual(["21st Oct 2026 Stitches out · Jo", "14th Oct 2026 Healing well · Sam"]);
    });

    test("healed: Healed and its date (the final word), its updates still under All Updates; none: no extras", () => {
        show({ current: [injury(2)], healed: [injury(1, { healedOn: "2026-10-25", updates: UPDATES })] });
        const healed = screen.getByText("Injury 1").closest("[role='row']");
        expect(healed.querySelector(".Records-injuryState")).toHaveTextContent(/^Healed · 25th Oct 2026$/);
        expect(within(healed).getByRole("button", { name: /All Updates \(2\)/ })).toBeInTheDocument();
        const plain = screen.getByText("Injury 2").closest("[role='row']");
        expect(plain.querySelector(".Records-injuryState")).toBeNull();
        expect(within(plain).queryByRole("button")).toBeNull();
    });
});
