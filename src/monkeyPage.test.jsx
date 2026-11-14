import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import MonkeyPage from "./MonkeyPage";
import { RecordList, movementPlaces, movementText, otherRows, parseMovement, useRecords } from "./MonkeyRecords";
import monkeysArr from "./testMonkeys";
import { addRecord, loadMonkeyWeights, loadRecords } from "./monkeyData";
import { STAFF } from "./testStaff";
import { isMonkeyPageRoute, monkeyFromPageRoute, monkeyHash, monkeyPageHash } from "./monkeyLink";

// The records: from a mocked database (none, unless a test says)
vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    // (the pages' default monkeys: the sample ones, as in setupTests.js)
    BUILT_IN_DATA: { ...(await importOriginal()).BUILT_IN_DATA, monkeys: (await import("./testMonkeys")).default },
    loadRecords: vi.fn(),
    addRecord: vi.fn(),
    loadMonkeyWeights: vi.fn(),
}));
beforeEach(() => {
    loadRecords.mockResolvedValue([]);
    loadMonkeyWeights.mockResolvedValue([]);
});

// Signed in as staff (the full profile is staff only), unless a test
// signs out (visitor = true)
let visitor = false;
vi.mock("./auth", async (importOriginal) => ({
    ...(await importOriginal()),
    useAuth: () => (visitor ? { ...STAFF, user: null, role: null, canLogMaintenance: false } : STAFF),
}));
afterEach(() => {
    visitor = false;
});

const aroha = monkeysArr.find((m) => m.name === "Aroha");

test("a monkey's page address matches its pop-up's link", () => {
    expect(monkeyHash(aroha)).toBe("#monkey/aroha-h-b");
    expect(monkeyPageHash(aroha)).toBe("#monkeys/aroha-h-b");
    expect(isMonkeyPageRoute("monkeys/aroha-h-b")).toBe(true);
    expect(isMonkeyPageRoute("monkey/aroha-h-b")).toBe(false);
    expect(monkeyFromPageRoute("monkeys/aroha-h-b", monkeysArr)).toBe(aroha);
    expect(monkeyFromPageRoute("monkeys/nobody-here", monkeysArr)).toBe(null);
});

test("the page shows the name, the icon bar and the Profile facts", () => {
    render(<ShowPage route="monkeys/aroha-h-b" />);
    expect(screen.getByRole("heading", { level: 1, name: "Aroha" })).toBeInTheDocument();
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("button").map((b) => b.title)).toEqual(["Profile", "Arrival Info"]);
    expect(screen.getByText("Male")).toBeInTheDocument();
    expect(screen.getByText("2016")).toBeInTheDocument();
    expect(screen.getByText("Arrived as an orphan in 2016.")).toBeInTheDocument();
    expect(screen.getByText("Arrival Reason")).toBeInTheDocument();
    // Where it lives: its enclosure, then its troop (or introcage)
    expect(screen.getByText("Enclosure").closest("div")).toHaveTextContent("Holt & Barrington");
    expect(screen.getByText("Home Location").closest("div")).toHaveTextContent("Holt & Barrington Troop");
    // ...and where it is now (at home)
    expect(screen.getByText("Current Location").closest("div")).toHaveTextContent("Holt & Barrington Troop");
    // Visitors: no records
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // (no troop link under the name)
    expect(screen.queryByRole("link", { name: /Troop/ })).not.toBeInTheDocument();
});

test("Arrival: Condition Received once the database has it (arrival-condition.sql)", () => {
    const { unmount } = render(<MonkeyPage monkey={{ ...aroha, arrivalCondition: "injured" }} />);
    expect(screen.getByText("Condition Received").closest("div")).toHaveTextContent("Injured");
    unmount();
    render(<MonkeyPage monkey={aroha} />);
    expect(screen.queryByText("Condition Received")).toBeNull();
});

test("staff see Records: Rehabilitation and Medical tabs; the chip is in the Profile", async () => {
    const user = userEvent.setup();
    const staff = { canSee: true, canAdd: false, userId: "staff-1", isAdmin: false };
    render(<MonkeyPage monkey={{ ...aroha, inSickbay: true, sickbaySince: "2026-10-01", sickbayNote: "Limping" }} staff={staff} />);
    expect(screen.getByText("Current Location").closest("div")).toHaveTextContent("Sickbay");
    expect(screen.getByText("Microchip")).toBeInTheDocument();
    expect(screen.getByText("19806")).toBeInTheDocument();
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("button").map((b) => b.title)).toEqual([
        "Profile",
        "Arrival Info",
        "Medical Info",
        "Monitoring",
        "Records",
    ]);
    expect(screen.getByRole("tab", { name: "Rehabilitation" })).toHaveAttribute("aria-selected", "true");
    // (moves are Movement records of their own, from the database: none
    // made up from where it is now)
    expect(screen.getByText("No rehabilitation records yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Medical" }));
    expect(screen.getByText("No medical records yet.")).toBeInTheDocument();
    // Records folds away (its heading's button, not the icon bar's)
    await user.click(screen.getAllByRole("button", { name: "Records" }).find((b) => !bar.contains(b)));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});

test("the icon bar: one Records button for all its tabs; it opens Records when folded", async () => {
    const user = userEvent.setup();
    const staff = { canSee: true, canAdd: false, userId: "staff-1", isAdmin: false };
    render(<MonkeyPage monkey={aroha} staff={staff} />);
    const bar = screen.getByRole("navigation", { name: "On this page" });
    const lit = () => within(bar).getAllByRole("button").filter((b) => b.getAttribute("aria-current") === "true").map((b) => b.title);
    // (the test page is all on one screen: the bottom of the page, so the
    // last part that's there)
    await waitFor(() => expect(lit()).toEqual(["Records"]));
    // (a tab picked below: still Records)
    await user.click(screen.getByRole("tab", { name: "Medical" }));
    await waitFor(() => expect(lit()).toEqual(["Records"]));
    // (folded away: the button opens it again, on the same tab)
    const fold = screen.getAllByRole("button", { name: "Records" }).find((b) => !bar.contains(b));
    await user.click(fold);
    expect(screen.queryByRole("tab")).toBeNull();
    await user.click(within(bar).getByRole("button", { name: "Records" }));
    expect(screen.getByRole("tab", { name: "Medical" })).toHaveAttribute("aria-selected", "true");
});

test("Medical Info (staff): the last deworming and weight, side by side; none yet: said", async () => {
    const staff = { canSee: true, canAdd: false, userId: "staff-1", isAdmin: false };
    const nita = { ...aroha, id: 7 };
    loadRecords.mockResolvedValue([
        { id: 1, section: "medical", category: "deworming", date: "2026-09-01", details: "Albendazole 1/4 tab" },
        { id: 2, section: "medical", category: "deworming", date: "2026-11-01", details: "Milbeworm 1/2 tab" },
    ]);
    loadMonkeyWeights.mockResolvedValue([
        { monkeyId: 7, date: "2026-10-01", value: 2900 },
        { monkeyId: 7, date: "2026-11-05", value: 3140 },
    ]);
    const { unmount } = render(<MonkeyPage monkey={nita} staff={staff} />);
    const section = screen.getByRole("button", { name: "Medical Info", expanded: true }).closest("section");
    await waitFor(() => expect(within(section).getByText("Last Deworming").closest("div")).toHaveTextContent("Milbeworm · 1st Nov 2026"));
    await waitFor(() => expect(within(section).getByText("Last Weight").closest("div")).toHaveTextContent("3.14 kg · 5th Nov 2026"));
    unmount();
    loadRecords.mockResolvedValue([]);
    loadMonkeyWeights.mockResolvedValue([]);
    render(<MonkeyPage monkey={nita} staff={staff} />);
    await waitFor(() => expect(screen.getByText("Last Weight").closest("div")).toHaveTextContent("None on record"));
    expect(screen.getByText("Last Deworming").closest("div")).toHaveTextContent("None on record");
});

test("Medical Info: a boy's Vasectomised? (not in the Profile facts); none for girls", () => {
    const boy = { ...aroha, sex: "male", vasectomised: true };
    const { unmount } = render(<MonkeyPage monkey={boy} />);
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("button").map((b) => b.title)).toEqual(["Profile", "Arrival Info", "Medical Info"]);
    const row = screen.getByText("Vasectomised?").closest("div");
    expect(row).toHaveTextContent("Yes");
    expect(row.closest(".MonkeyPage-facts")).toBeNull();
    unmount();
    render(<MonkeyPage monkey={{ ...aroha, sex: "female", vasectomised: false }} />);
    expect(screen.queryByText("Vasectomised?")).toBeNull();
    expect(screen.queryByText("Medical Info")).toBeNull();
});

// A records list's data, without the database
function fakeRecords(entries = [], { canAdd = true } = {}) {
    return {
        available: true,
        entries,
        canAdd,
        canEdit: () => true,
        canDelete: () => true,
        add: vi.fn(async () => {}),
        update: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
    };
}

test("a section's records: Date | Category | Details, newest first, with the other records in", () => {
    const records = fakeRecords([
        { id: 1, section: "medical", date: "2026-10-02", category: "vet_visit", details: "Check-up", loggedByName: "Sam" },
        { id: 2, section: "rehabilitation", date: "2026-10-05", category: "escape", details: "Out", loggedByName: "Sam" },
    ]);
    const others = [{ key: "injury-9", date: "2026-10-10", category: "injury", details: "Cut on hand", by: "Injury by Jo" }];
    render(<RecordList section="medical" records={records} others={others} />);
    const rows = screen.getAllByRole("row");
    expect(within(rows[0]).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Date", "Category", "Details"]);
    expect(rows.slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent)).toEqual(["Injury", "Vet Visit"]);
    expect(screen.queryByText("Out")).not.toBeInTheDocument();
    // Edit / Delete only on its own records, not the injury
    expect(within(rows[1]).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(within(rows[2]).getByRole("button", { name: "Edit" })).toBeInTheDocument();
});

test("+ New Medical Record: date, category and details, then Confirm", async () => {
    const user = userEvent.setup();
    const records = fakeRecords();
    render(<RecordList section="medical" records={records} others={[]} />);
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Food Monitoring", "Deworming", "Microchip", "Observation"]);
    // (Cancel: the pink outline)
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("is-cancel");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose a category.");
    await user.selectOptions(screen.getByLabelText("Category"), "food_monitoring");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please write the details.");
    await user.type(screen.getByLabelText("Details"), "Ate half the plate");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(records.add).toHaveBeenCalledWith(
        expect.objectContaining({ section: "medical", category: "food_monitoring", details: "Ate half the plate" })
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
});

test("Deworming: Type, Dewormer, Dose, Unit and Given, worded as the deworming lists' records", async () => {
    const user = userEvent.setup();
    const records = fakeRecords();
    render(<RecordList section="medical" records={records} others={[]} />);
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    await user.selectOptions(screen.getByLabelText("Category"), "deworming");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the type.");
    await user.selectOptions(screen.getByLabelText("Type"), "Special");
    // (Milbeworm: its usual dose, one dose)
    await user.selectOptions(screen.getByLabelText("Dewormer"), "Milbeworm");
    expect(screen.getByLabelText("Dose")).toHaveDisplayValue("1/2");
    expect(screen.getByLabelText("Unit")).toHaveDisplayValue("tab");
    expect(screen.getByLabelText("Given")).toHaveDisplayValue("One Dose");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(records.add).toHaveBeenCalledWith(
        expect.objectContaining({ category: "deworming", details: "Special - 1/2 tab Milbeworm, one dose only" })
    );
});

test("Deworming, edited: one worded so back in its boxes; one worded otherwise: plain words", async () => {
    const user = userEvent.setup();
    const sheet = { id: 1, section: "medical", date: "2026-01-02", category: "deworming", details: "6-Month - 1/4 tab Albendazole, once a day for 3 days. Ate it in banana", loggedByName: "A" };
    const old = { id: 2, section: "medical", date: "2026-01-01", category: "deworming", details: "Albendazole 1/4 tab", loggedByName: "A" };
    const records = fakeRecords([sheet, old]);
    render(<RecordList section="medical" records={records} others={[]} />);
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.getByLabelText("Type")).toHaveDisplayValue("6-Month");
    expect(screen.getByLabelText("Dewormer")).toHaveDisplayValue("Albendazole");
    expect(screen.getByLabelText("Given")).toHaveDisplayValue("3 Days");
    expect(screen.getByLabelText("Details (optional)")).toHaveValue("Ate it in banana");
    await user.selectOptions(screen.getByLabelText("Given"), "One Dose");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
        expect(records.update).toHaveBeenCalledWith(1, expect.objectContaining({ details: "6-Month - 1/4 tab Albendazole, one dose only. Ate it in banana" }))
    );
    await user.click(screen.getAllByRole("button", { name: "Edit" })[1]);
    expect(screen.queryByLabelText("Type")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Details")).toHaveValue("Albendazole 1/4 tab");
});

test("Microchip: a chip number and optional details; saved as its words, and the monkey told", async () => {
    const user = userEvent.setup();
    const records = fakeRecords();
    const onChipAdded = vi.fn();
    render(<RecordList section="medical" records={records} others={[]} onChipAdded={onChipAdded} />);
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    await user.selectOptions(screen.getByLabelText("Category"), "microchip");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("enter the chip number");
    expect(records.add).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Chip Number"), "12345");
    await user.type(screen.getByLabelText("Details (optional)"), "Left shoulder");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(records.add).toHaveBeenCalledWith(expect.objectContaining({ category: "microchip", details: "Microchipped 12345: Left shoulder" }));
    await waitFor(() => expect(onChipAdded).toHaveBeenCalled());
});

test("Microchip, edited: stays one, its number and note split out; others can't become one", async () => {
    const user = userEvent.setup();
    const chip = { id: 1, section: "medical", date: "2026-01-01", category: "microchip", details: "Microchipped 12345: Left", loggedByName: "A" };
    const other = { id: 2, section: "medical", date: "2026-01-02", category: "observation", details: "Fine", loggedByName: "A" };
    const records = fakeRecords([chip, other]);
    render(<RecordList section="medical" records={records} others={[]} />);
    const edits = screen.getAllByRole("button", { name: "Edit" });
    await user.click(edits[1]);
    expect(screen.getByLabelText("Category")).toBeDisabled();
    expect(screen.getByLabelText("Chip Number")).toHaveValue("12345");
    expect(screen.getByLabelText("Details (optional)")).toHaveValue("Left");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    expect(screen.queryByRole("option", { name: "Microchip" })).not.toBeInTheDocument();
});

test("Trapped: a Rehabilitation category, saved like the others", async () => {
    vi.mocked(addRecord).mockImplementation(async (_id, values) => ({ id: 1, loggedByName: "A", ...values }));
    function Page() {
        const records = useRecords(7, { canSee: true, isAdmin: true, canAdd: true });
        return records.available ? <RecordList section="rehabilitation" records={records} others={[]} /> : null;
    }
    const user = userEvent.setup();
    render(<Page />);
    await user.click(await screen.findByRole("button", { name: "New Rehabilitation Record" }));
    await user.selectOptions(screen.getByLabelText("Category"), "trapped");
    await user.type(screen.getByLabelText("Details"), "Trapped to check the chip");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(addRecord).toHaveBeenCalledWith(7, expect.objectContaining({ category: "trapped", details: "Trapped to check the chip" })));
});

test("rehabilitation's categories; no button without permission to add", () => {
    render(<RecordList section="rehabilitation" records={fakeRecords([], { canAdd: false })} others={[]} />);
    expect(screen.queryByRole("button", { name: "New Rehabilitation Record" })).not.toBeInTheDocument();
    expect(screen.getByText("No rehabilitation records yet.")).toBeInTheDocument();
});

test("rehabilitation's drop-down", async () => {
    const user = userEvent.setup();
    render(<RecordList section="rehabilitation" records={fakeRecords()} others={[]} />);
    await user.click(screen.getByRole("button", { name: "New Rehabilitation Record" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Choose…",
        "Movement",
        "Escape",
        "Trapped",
        "Behaviour",
    ]);
});

test("Rehabilitation's arrival row: Born Here says born at the sanctuary", () => {
    const born = otherRows("rehabilitation", { monkey: { arrivalDate: "2026-01-05", arrivalReason: "born_here" } });
    expect(born[0].details).toBe("Born at the sanctuary");
    const orphan = otherRows("rehabilitation", { monkey: { arrivalDate: "2026-01-05", arrivalReason: "orphaned" } });
    expect(orphan[0].details).toBe("Arrived at the sanctuary: Orphaned");
});

test("Medical: Vet Visit and Vasectomy too, with the vet (and reason); saved in Meds & Sickbay's tables", async () => {
    const user = userEvent.setup();
    const records = fakeRecords();
    const vet_visit = { add: vi.fn(async () => {}) };
    const vasectomy = { add: vi.fn(async () => {}) };
    render(<RecordList section="medical" records={records} others={[]} elsewhere={{ vet_visit, vasectomy }} />);
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Choose…", "Food Monitoring", "Deworming", "Microchip", "Observation", "Vet Visit", "Vasectomy",
    ]);
    await user.selectOptions(screen.getByLabelText("Category"), "vet_visit");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the vet.");
    await user.selectOptions(screen.getByLabelText("Vet Practice"), "Serala Animal Clinic");
    await user.selectOptions(screen.getByLabelText("Reason"), "Check-Up");
    // (details optional)
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(vet_visit.add).toHaveBeenCalledWith(expect.objectContaining({ vet: "serala", vetReason: "check_up", description: "" }));
    expect(records.add).not.toHaveBeenCalled();
    // A vasectomy: On Site, and no reason
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    await user.selectOptions(screen.getByLabelText("Category"), "vasectomy");
    expect(screen.queryByLabelText("Reason")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Vet"), "On Site");
    await user.type(screen.getByLabelText("Details (optional)"), "Healing well");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(vasectomy.add).toHaveBeenCalledWith(expect.objectContaining({ vet: "on_site", description: "Healing well" }));
});

test("a Vasectomy record: changed and deleted where it's kept; one typed in by hand: just its words", async () => {
    const user = userEvent.setup();
    const records = fakeRecords([
        { id: 40, section: "medical", date: "2026-03-01", category: "vasectomy", details: "Vasectomised at Serala Animal Clinic", loggedByName: "Sam" },
        { id: 41, section: "medical", date: "2025-01-01", category: "vet_visit", details: "Check-up by hand", loggedByName: "Sam" },
    ]);
    const kept = { id: 7, date: "2026-03-01", vet: "serala", vetOther: "", details: "" };
    const vasectomy = { add: vi.fn(), update: vi.fn(async () => {}), remove: vi.fn(async () => {}), find: vi.fn(async (id) => (id === 40 ? kept : null)) };
    const vet_visit = { add: vi.fn(), update: vi.fn(), remove: vi.fn(), find: vi.fn(async () => null) };
    render(<RecordList section="medical" records={records} others={[]} elsewhere={{ vet_visit, vasectomy }} />);
    const [vasRow, handRow] = screen.getAllByRole("row").slice(1);
    await user.click(within(vasRow).getByRole("button", { name: "Edit" }));
    expect(vasectomy.find).toHaveBeenCalledWith(40);
    expect(await screen.findByLabelText("Vet")).toHaveValue("serala");
    expect(screen.getByLabelText("Category")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Vet"), "Tzaneen Animal Clinic");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(vasectomy.update).toHaveBeenCalledWith(7, expect.objectContaining({ vet: "tzaneen", date: "2026-03-01" })));
    expect(records.update).not.toHaveBeenCalled();
    // (typed in by hand, before Meds & Sickbay: just its words)
    await user.click(within(handRow).getByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Details")).toHaveValue("Check-up by hand");
    expect(screen.queryByLabelText("Vet Practice")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // Delete: the vasectomy itself (which takes its record)
    await user.click(within(screen.getAllByRole("row")[1]).getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(vasectomy.remove).toHaveBeenCalledWith(7));
    expect(records.remove).not.toHaveBeenCalled();
});

test("Medical: Injury and Condition too, saved in their own tables (Current Injuries, Latest Condition)", async () => {
    const user = userEvent.setup();
    const records = fakeRecords();
    const injury = { add: vi.fn(async () => {}) };
    const condition = { add: vi.fn(async () => {}) };
    render(<RecordList section="medical" records={records} others={[]} elsewhere={{ injury, condition }} />);
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Choose…", "Food Monitoring", "Injury", "Condition", "Deworming", "Microchip", "Observation"]);
    await user.selectOptions(screen.getByLabelText("Category"), "injury");
    expect(screen.getByLabelText("Details")).toHaveAttribute("maxLength", "500");
    await user.type(screen.getByLabelText("Details"), "Cut on left hand");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(injury.add).toHaveBeenCalledWith(expect.objectContaining({ description: "Cut on left hand" }));
    expect(records.add).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "New Medical Record" }));
    await user.selectOptions(screen.getByLabelText("Category"), "condition");
    await user.type(screen.getByLabelText("Details"), "Looking thin");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(condition.add).toHaveBeenCalledWith(expect.objectContaining({ description: "Looking thin" }));
    expect(records.add).not.toHaveBeenCalled();
});

test("admins change an Injury or a Condition here too, in its own table (its category stays)", async () => {
    const user = userEvent.setup();
    const injury = { add: vi.fn(), update: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    const condition = { add: vi.fn(), update: vi.fn(async () => {}), remove: vi.fn(async () => {}) };
    const others = [
        { key: "injury-9", date: "2026-10-10", category: "injury", details: "Cut on hand", by: "Injury by Jo", injury: { id: 9, updates: [] } },
        { key: "condition-4", date: "2026-10-08", category: "condition", details: "Thin", by: "Condition by Jo", condition: { id: 4 } },
    ];
    render(<RecordList section="medical" records={fakeRecords()} others={others} elsewhere={{ injury, condition }} />);
    const rowOf = (text) => screen.getByText(text).closest("[role='row']");
    await user.click(within(rowOf("Cut on hand")).getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Category")).toBeDisabled();
    await user.type(screen.getByLabelText("Details"), " (left)");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(injury.update).toHaveBeenCalledWith(9, expect.objectContaining({ description: "Cut on hand (left)" }));
    await user.click(within(rowOf("Thin")).getByRole("button", { name: "Delete" }));
    expect(screen.getByText("Delete this condition?")).toBeInTheDocument();
});

test("without elsewhere (not an admin), injuries and conditions have no Edit / Delete", () => {
    const others = [{ key: "injury-9", date: "2026-10-10", category: "injury", details: "Cut on hand", by: "Injury by Jo", injury: { id: 9, updates: [] } }];
    render(<RecordList section="medical" records={fakeRecords()} others={others} />);
    expect(within(screen.getByText("Cut on hand").closest("[role='row']")).queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
});

test("older Medical categories keep their names (and stay theirs when edited)", async () => {
    const user = userEvent.setup();
    const records = fakeRecords([{ id: 1, section: "medical", date: "2026-10-02", category: "vet_visit", details: "Check-up", loggedByName: "Sam" }]);
    render(<RecordList section="medical" records={records} others={[]} />);
    expect(screen.getByText("Vet Visit")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Category")).toHaveValue("vet_visit");
});

describe("a Movement typed in (historical moves): From, To, Reason (optional)", () => {
    const PLACES = [
        { label: "Goliath", options: ["Goliath Troop", "Goliath A"] },
        { label: "Sickbay", options: ["Sickbay"] },
    ];

    test("worded like the moves the database adds; Other… typed in", async () => {
        const user = userEvent.setup();
        const records = fakeRecords();
        render(<RecordList section="rehabilitation" records={records} others={[]} places={PLACES} />);
        await user.click(screen.getByRole("button", { name: "New Rehabilitation Record" }));
        await user.selectOptions(screen.getByLabelText("Category"), "movement");
        expect(screen.getByLabelText("Date Moved")).toBeInTheDocument();
        expect(screen.queryByLabelText("Details")).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please choose where it moved from.");
        await user.selectOptions(screen.getByLabelText("From"), "other");
        await user.type(screen.getByLabelText("From (Other)"), "The wild");
        await user.selectOptions(screen.getByLabelText("To"), "Goliath A");
        // (no reason: fine)
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(records.add).toHaveBeenLastCalledWith(
            expect.objectContaining({ section: "rehabilitation", category: "movement", details: "Moved from The wild to Goliath A" })
        );
    });

    test("editing one: From, To and Reason filled in again", async () => {
        const user = userEvent.setup();
        const records = fakeRecords([
            { id: 4, section: "rehabilitation", date: "2026-10-20", category: "movement", details: "Moved from Goliath A to Goliath Troop: integrated", loggedByName: "Sam" },
        ]);
        render(<RecordList section="rehabilitation" records={records} others={[]} places={PLACES} />);
        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText("From")).toHaveValue("Goliath A");
        expect(screen.getByLabelText("To")).toHaveValue("Goliath Troop");
        expect(screen.getByLabelText("Reason (optional)")).toHaveValue("integrated");
        await user.selectOptions(screen.getByLabelText("To"), "Sickbay");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(records.update).toHaveBeenCalledWith(4, expect.objectContaining({ details: "Moved from Goliath A to Sickbay: integrated" }));
    });

    test("one it can't split (Home changed…) is edited as plain details", async () => {
        const user = userEvent.setup();
        const records = fakeRecords([
            { id: 4, section: "rehabilitation", date: "2026-10-20", category: "movement", details: "Home changed from Gismo Troop to Gismo A", loggedByName: "Sam" },
        ]);
        render(<RecordList section="rehabilitation" records={records} others={[]} places={PLACES} />);
        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText("Details")).toHaveValue("Home changed from Gismo Troop to Gismo A");
        expect(screen.queryByLabelText("From")).not.toBeInTheDocument();
    });

    test("the words, both ways", () => {
        expect(movementText({ from: "Holt & Barrington C1", to: "Sickbay", reason: " leg: swollen " })).toBe(
            "Moved from Holt & Barrington C1 to Sickbay: leg: swollen"
        );
        expect(parseMovement("Moved from Holt & Barrington C1 to Sickbay: leg: swollen")).toEqual({
            from: "Holt & Barrington C1",
            to: "Sickbay",
            reason: "leg: swollen",
        });
        expect(parseMovement("Moved from A to B")).toEqual({ from: "A", to: "B", reason: "" });
    });

    test("the places: each troop, then its introcages, full names; Sickbay", () => {
        const enclosures = [
            { id: 1, name: "H&B", type: "troop", sortOrder: 1 },
            { id: 2, name: "H&B C1", type: "introcage", parentId: 1, sortOrder: 1 },
        ];
        const places = movementPlaces(["H&B"], enclosures, () => "H&B");
        expect(places[0]).toEqual({ label: "Holt & Barrington", options: ["Holt & Barrington Troop", "Holt & Barrington C1"] });
        expect(places.flatMap((g) => g.options)).toContain("Sickbay");
    });
});

test("a link to a monkey that isn't there says so", () => {
    render(<ShowPage route="monkeys/nobody-here" />);
    expect(screen.getByText(/couldn't be found/)).toBeInTheDocument();
});

test("the pop-up's Full Profile opens the monkey's page", async () => {
    const user = userEvent.setup();
    window.location.hash = "";
    const { container } = render(<ShowPage />);
    const card = [...container.querySelectorAll(".MonkeyCard")].find((c) => c.textContent.includes("Aroha"));
    await user.click(card);
    await user.click(await screen.findByRole("button", { name: "Full Profile" }));
    expect(window.location.hash).toBe("#monkeys/aroha-h-b");
    window.location.hash = "";
});

test("Birth Date (with approx.), then Birth Year", () => {
    render(<MonkeyPage monkey={{ ...aroha, year: 2023, birthDate: "2024-02-14", birthDateApprox: true }} staff={null} />);
    expect(screen.getByText("Birth Date").closest("div")).toHaveTextContent("(approx.) 14th Feb 2024");
    expect(screen.getByText("Birth Year").closest("div")).toHaveTextContent("2023");
});

test("Birth Date unknown: Not recorded, then Birth Year", () => {
    render(<MonkeyPage monkey={aroha} staff={null} />);
    expect(screen.getByText("Birth Date").closest("div")).toHaveTextContent("Not recorded");
    expect(screen.getByText("Birth Year").closest("div")).toHaveTextContent("2016");
});

test("Arrival Place: where they were first taken, beside Area of Origin", () => {
    const { unmount } = render(<MonkeyPage monkey={{ ...aroha, arrivalDate: "2026-10-20", arrivalReason: "orphaned", arrivalPlace: "Dreamland" }} staff={null} />);
    expect(screen.getByText("Arrival Place").closest("div")).toHaveTextContent("Dreamland");
    unmount();
    render(<MonkeyPage monkey={aroha} staff={null} />);
    expect(screen.getByText("Arrival Place").closest("div")).toHaveTextContent("Not recorded");
});

test("View Card opens the monkey's pop-up, and the address stays on its page", async () => {
    const user = userEvent.setup();
    window.location.hash = "#monkeys/aroha-h-b";
    render(<ShowPage route="monkeys/aroha-h-b" />);
    await user.click(screen.getByRole("button", { name: "View Card" }));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(window.location.hash).toBe("#monkeys/aroha-h-b");
    window.location.hash = "";
});

test("visitors following a full profile's link get the monkey's pop-up instead", async () => {
    visitor = true;
    window.location.hash = "#monkeys/aroha-h-b";
    render(<ShowPage route="monkeys/aroha-h-b" />);
    expect(screen.queryByRole("button", { name: "View Card" })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.hash).toBe("#monkey/aroha-h-b"));
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Full Profile" })).not.toBeInTheDocument();
    window.location.hash = "";
});

test("+ New Rehabilitation / Medical Record: admins only", async () => {
    function Records({ staff }) {
        return <RecordList section="rehabilitation" records={useRecords(1, staff)} others={[]} />;
    }
    const { unmount } = render(<Records staff={{ canSee: true, canAdd: true, userId: "admin-1", isAdmin: true }} />);
    expect(await screen.findByRole("button", { name: "New Rehabilitation Record" })).toBeInTheDocument();
    unmount();
    render(<Records staff={{ canSee: true, canAdd: true, userId: "staff-1", isAdmin: false }} />);
    await screen.findByText("No rehabilitation records yet.");
    expect(screen.queryByRole("button", { name: "New Rehabilitation Record" })).not.toBeInTheDocument();
});

describe("Movement records (added by the database for every move)", () => {
    const movement = {
        id: 5, section: "rehabilitation", date: "2026-10-20", category: "movement",
        details: "Moved from Gismo Troop to Sickbay: leg wound", loggedBy: "staff-1", loggedByName: "Sam",
    };
    const note = {
        id: 6, section: "rehabilitation", date: "2026-10-19", category: "observation",
        details: "Calm", loggedBy: "staff-1", loggedByName: "Sam",
    };
    // The real list, loaded the real way (the database: mocked)
    function Records({ staff }) {
        return <RecordList section="rehabilitation" records={useRecords(1, staff)} others={[]} />;
    }
    const rowOf = (text) => screen.getByText(text).closest("[role='row']");

    test("editors can't edit or delete any here, even their own (admins only)", async () => {
        loadRecords.mockResolvedValue([movement, note]);
        render(<Records staff={{ canSee: true, canAdd: true, userId: "staff-1", isAdmin: false }} />);
        await screen.findByText("Calm");
        expect(within(rowOf("Moved from Gismo Troop to Sickbay: leg wound")).queryByRole("button")).not.toBeInTheDocument();
        expect(within(rowOf("Calm")).queryByRole("button")).not.toBeInTheDocument();
    });

    test("admins can edit and delete them", async () => {
        loadRecords.mockResolvedValue([movement]);
        render(<Records staff={{ canSee: true, canAdd: true, userId: "admin-1", isAdmin: true }} />);
        const row = rowOf(await screen.findByText(/Moved from Gismo Troop/).then((el) => el.textContent));
        expect(within(row).getByRole("button", { name: "Edit" })).toBeInTheDocument();
        expect(within(row).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    });
});

test("Species: its name, or Not recorded before the database has it", () => {
    const { unmount } = render(<MonkeyPage monkey={{ ...aroha, species: "samango" }} staff={null} />);
    expect(screen.getByText("Species").closest("div")).toHaveTextContent("Samango Monkey");
    unmount();
    render(<MonkeyPage monkey={aroha} staff={null} />);
    expect(screen.getByText("Species").closest("div")).toHaveTextContent("Not recorded");
});

test("the Timeline: a labelled link beside View Card and Edit, for staff only", () => {
    const staff = { canSee: true, canAdd: false, userId: "staff-1", isAdmin: false };
    const { unmount } = render(<MonkeyPage monkey={aroha} staff={staff} timelineHref="#monkeys/aroha-h-b/timeline" />);
    const link = screen.getByRole("link", { name: "Timeline" });
    expect(link).toHaveAttribute("href", "#monkeys/aroha-h-b/timeline");
    expect(link.closest(".MonkeyPage-actions")).not.toBeNull();
    expect(link.closest("nav")).toBeNull();
    unmount();
    render(<MonkeyPage monkey={aroha} staff={null} timelineHref="#monkeys/aroha-h-b/timeline" />);
    expect(screen.queryByRole("link", { name: "Timeline" })).toBeNull();
});
