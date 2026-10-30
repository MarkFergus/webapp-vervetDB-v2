// Records → Maintenance: Add (find the place, the date, Routine or Repair,
// what was done) and View (every report: a search, Routine / Repair, Edit
// and Delete their own); Meds & Sickbay coming soon
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import { addMaintenance, deleteMaintenance, loadAllMaintenance, saveMaintenance } from "./monkeyData";
import { checkReport, filterReports, maintenancePlaces, placeSub } from "./maintenanceRecords";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadAllMaintenance: vi.fn(),
    addMaintenance: vi.fn(),
    saveMaintenance: vi.fn(),
    deleteMaintenance: vi.fn(),
    maintenanceKindsAvailable: () => true,
}));

const place = (id, name, type, parentId = null, sortOrder = id) => ({ id, name, type, parentId, sortOrder });
const ENCLOSURES = [
    place(1, "Goliath", "troop"),
    place(2, "Goliath A", "introcage", 1),
    place(3, "H&B", "troop"),
    place(4, "H&B C1", "introcage", 3),
    place(5, "Quarantine", "care_unit"),
    // (its one area, named the same: the unit's shown instead)
    place(6, "Quarantine", "area", 5),
];

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const report = (id, enclosureId, doneOn, kind, details, loggedById = "me") => ({
    id, enclosureId, doneOn, kind, details, loggedBy: "Sam", loggedById, loggedAt: `${doneOn}T09:00:00Z`,
});
const REPORTS = [
    report(3, 2, "2026-10-27", "repair", "Fixed the slide door."),
    report(2, 4, "2026-10-25", "routine", "Cleaned the water bowls.", "someone-else"),
    report(1, 1, "2026-10-20", "routine", "Cut back the grass."),
];

beforeEach(() => {
    vi.clearAllMocks();
    loadAllMaintenance.mockResolvedValue(REPORTS);
});

const open = (route = "records/maintenance", maintenance = {}) => {
    const user = userEvent.setup();
    render(
        <RecordsPage
            route={route}
            monkeys={[]}
            enclosures={ENCLOSURES}
            maintenance={{ live: true, canLog: true, me: { userId: "me", isAdmin: false }, ...maintenance }}
        />
    );
    return { user };
};

describe("the workings", () => {
    test("the places: every enclosure and introcage by name; a one-area care unit once", () => {
        expect(maintenancePlaces(ENCLOSURES).map((p) => p.id)).toEqual([1, 2, 3, 4, 5]);
        expect(placeSub(ENCLOSURES[3], ENCLOSURES)).toBe("Introcage · Holt & Barrington");
        expect(placeSub(ENCLOSURES[0], ENCLOSURES)).toBe("Troop Enclosure");
    });

    test("filtering: Routine / Repair, and a search (an enclosure finds its introcages too)", () => {
        expect(filterReports(REPORTS, { type: "routine" }, ENCLOSURES).map((r) => r.id)).toEqual([2, 1]);
        expect(filterReports(REPORTS, { search: "goliath" }, ENCLOSURES).map((r) => r.id)).toEqual([3, 1]);
        expect(filterReports(REPORTS, { search: "holt c1", type: "routine" }, ENCLOSURES).map((r) => r.id)).toEqual([2]);
        // (picked from the list: that place; an enclosure, its introcages too)
        expect(filterReports(REPORTS, { placeId: 1 }, ENCLOSURES).map((r) => r.id)).toEqual([3, 1]);
        expect(filterReports(REPORTS, { placeId: 2 }, ENCLOSURES).map((r) => r.id)).toEqual([3]);
    });

    test("checking a new report", () => {
        const ok = { place: ENCLOSURES[1], doneOn: "2026-10-27", kind: "repair", details: " Fixed it. " };
        expect(checkReport(ok, "2026-10-28")).toEqual({ values: { doneOn: "2026-10-27", kind: "repair", details: "Fixed it." } });
        expect(checkReport({ ...ok, place: null }, "2026-10-28").error).toMatch(/enclosure or introcage/);
        expect(checkReport({ ...ok, doneOn: "2026-10-29" }, "2026-10-28").error).toMatch(/future/);
        expect(checkReport({ ...ok, kind: "" }, "2026-10-28").error).toMatch(/Routine or Repair/);
        expect(checkReport({ ...ok, details: "  " }, "2026-10-28").error).toMatch(/what was done/);
    });
});

test("Records: Maintenance and Sections, then Meds & Sickbay (coming soon, not a link)", () => {
    open("records");
    expect(screen.getByRole("link", { name: /Maintenance/ })).toHaveAttribute("href", "#records/maintenance");
    expect(screen.getByRole("link", { name: /Maintenance/ })).toHaveTextContent("Reports");
    expect(screen.getByRole("link", { name: /Sections/ })).toHaveAttribute("href", "#records/sections");
    expect(screen.getByRole("link", { name: /Sections/ })).toHaveTextContent("Injuries");
    const card = screen.getByText("Meds & Sickbay").closest(".RecordsPage-choice");
    expect(card.tagName).not.toBe("A");
    expect(card).toHaveTextContent("Coming soon…");
});

test("a team coming soon: says so", () => {
    open("records/meds-sickbay");
    expect(screen.getByRole("heading", { level: 1, name: "Meds & Sickbay" })).toBeInTheDocument();
    expect(screen.getByText("Coming soon…")).toBeInTheDocument();
});

describe("Add", () => {
    test("find the introcage, then the date, Routine or Repair and the details; saved, ready for the next", async () => {
        addMaintenance.mockResolvedValue({ ...report(9, 4, today(), "repair", "New perch."), enclosureId: undefined });
        const { user } = open();
        await user.type(await screen.findByRole("searchbox", { name: "Search enclosures and introcages" }), "holt");
        const found = within(screen.getByRole("list", { name: "Places found" }));
        expect(found.getAllByRole("button").map((b) => b.textContent)).toEqual([
            "Holt & BarringtonTroop Enclosure",
            "Holt & Barrington C1Introcage · Holt & Barrington",
        ]);
        await user.click(found.getByRole("button", { name: /C1/ }));
        expect(screen.getByLabelText("Date Done")).toHaveValue(today());
        await user.click(screen.getByRole("button", { name: "Repair" }));
        await user.type(screen.getByLabelText("Maintenance Details"), "New perch.");
        await user.click(screen.getByRole("button", { name: "Save Report" }));
        await waitFor(() => expect(addMaintenance).toHaveBeenCalledWith(4, { doneOn: today(), kind: "repair", details: "New perch." }));
        expect(await screen.findByText("Saved for Holt & Barrington C1.")).toBeInTheDocument();
        expect(screen.getByLabelText("Maintenance Details")).toHaveValue("");
        // (and it's in View)
        await user.click(screen.getByRole("tab", { name: "View" }));
        expect(screen.getByText("New perch.")).toBeInTheDocument();
    });

    test("something missing: says what, nothing saved", async () => {
        const { user } = open();
        await user.click(await screen.findByRole("button", { name: "Save Report" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please choose the enclosure or introcage.");
        expect(addMaintenance).not.toHaveBeenCalled();
    });
});

describe("View", () => {
    test("every report, newest first: the date, type, place (a link) and details", async () => {
        const { user } = open();
        await user.click(await screen.findByRole("tab", { name: "View" }));
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(3);
        expect(items[0]).toHaveTextContent("27th Oct 2026");
        expect(items[0]).toHaveTextContent("Repair");
        expect(within(items[0]).getByRole("link", { name: "Goliath A" })).toHaveAttribute("href", "#enclosure/2");
        expect(items[0]).toHaveTextContent("Fixed the slide door.");
        expect(screen.getByText("3 reports")).toBeInTheDocument();
    });

    test("Routine / Repair and the search narrow it down", async () => {
        const { user } = open();
        await user.click(await screen.findByRole("tab", { name: "View" }));
        await user.click(within(screen.getByRole("group", { name: "Show" })).getByRole("button", { name: "Routine" }));
        expect(screen.getByText("2 reports")).toBeInTheDocument();
        await user.type(screen.getByRole("searchbox", { name: "Search enclosures and introcages" }), "goliath");
        expect(screen.getByText("1 report")).toBeInTheDocument();
        expect(screen.getByText("Cut back the grass.")).toBeInTheDocument();
        await user.type(screen.getByRole("searchbox"), " zzz");
        expect(screen.getByText(/No reports match/)).toBeInTheDocument();
    });

    test("pick a place from the search's list: just its reports (an enclosure: its introcages too); Clear for all", async () => {
        const { user } = open();
        await user.click(await screen.findByRole("tab", { name: "View" }));
        await user.type(screen.getByRole("searchbox", { name: "Search enclosures and introcages" }), "gol");
        const found = within(screen.getByRole("list", { name: "Places found" }));
        await user.click(found.getByRole("button", { name: /^GoliathTroop/ }));
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.getByText("With its introcages")).toBeInTheDocument();
        expect(screen.getByText("2 reports")).toBeInTheDocument();
        expect(screen.queryByText("Cleaned the water bowls.")).toBeNull();
        // (another place: Clear, then pick it)
        await user.click(screen.getByRole("button", { name: "Clear" }));
        expect(screen.getByText("3 reports")).toBeInTheDocument();
        await user.type(screen.getByRole("searchbox"), "goliath a");
        await user.click(within(screen.getByRole("list", { name: "Places found" })).getByRole("button", { name: /Goliath A/ }));
        expect(screen.getByText("1 report")).toBeInTheDocument();
        expect(screen.getByText("Fixed the slide door.")).toBeInTheDocument();
    });

    test("Edit and Delete: their own only (admins: anyone's); Delete asks first, in red", async () => {
        saveMaintenance.mockResolvedValue(report(3, undefined, "2026-10-27", "repair", "Fixed the slide door and the lock."));
        deleteMaintenance.mockResolvedValue();
        const { user } = open();
        await user.click(await screen.findByRole("tab", { name: "View" }));
        const [mine, theirs] = screen.getAllByRole("listitem");
        expect(within(theirs).queryByRole("button", { name: /Edit/ })).toBeNull();

        await user.click(within(mine).getByRole("button", { name: "Edit the report from 27th Oct 2026" }));
        const details = within(mine).getByLabelText("What was done");
        await user.clear(details);
        await user.type(details, "Fixed the slide door and the lock.");
        await user.click(within(mine).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saveMaintenance).toHaveBeenCalledWith(3, expect.objectContaining({ details: "Fixed the slide door and the lock." })));
        expect(await screen.findByText("Fixed the slide door and the lock.")).toBeInTheDocument();
        // (still linked to its place)
        expect(screen.getByRole("link", { name: "Goliath A" })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Delete the report from 27th Oct 2026" }));
        const ask = screen.getByRole("dialog", { name: "Delete this report?" });
        const confirm = within(ask).getByRole("button", { name: "Delete" });
        expect(confirm).toHaveClass("is-danger");
        await user.click(confirm);
        await waitFor(() => expect(deleteMaintenance).toHaveBeenCalledWith(3));
        expect(screen.getByText("2 reports")).toBeInTheDocument();
    });

    test("an admin can change anyone's", async () => {
        const { user } = open("records/maintenance", { me: { userId: "me", isAdmin: true } });
        await user.click(await screen.findByRole("tab", { name: "View" }));
        expect(screen.getAllByRole("button", { name: /^Edit the report/ })).toHaveLength(3);
    });
});

test("offline, or before the database has the log: says so", () => {
    open("records/maintenance", { live: false });
    expect(screen.getByText(/will show here once vervetDB is online/)).toBeInTheDocument();
    expect(loadAllMaintenance).not.toHaveBeenCalled();
});

test("Records: the teams in alphabetical order", () => {
    open("records");
    const names = [...document.querySelectorAll(".RecordsPage-choiceTitle")].map((el) => el.textContent);
    expect(names).toEqual(["Baby Care", "Integration", "Maintenance", "Meds & Sickbay", "Sections"]);
});
