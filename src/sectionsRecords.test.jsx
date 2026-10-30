// Records → Sections → Injuries: a troop's injuries (its introcages too), by
// monkey. Current: New Injury, Add Update and Healed? as in the pop-up;
// Past: healed in the last 6 months, with Restore
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import { addInjury, addInjuryUpdate, loadCurrentInjuries, loadPastInjuries, setInjuryHealed } from "./monkeyData";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadCurrentInjuries: vi.fn(),
    loadPastInjuries: vi.fn(),
    addInjury: vi.fn(),
    setInjuryHealed: vi.fn(),
    // (monitoring.sql has run)
    injuryUpdatesAvailable: () => true,
    addInjuryUpdate: vi.fn(),
}));

const place = (id, name, type, parentId = null) => ({ id, name, type, parentId, sortOrder: id });
const ENCLOSURES = [place(1, "Goliath", "troop"), place(2, "Goliath A", "introcage", 1), place(3, "Skrow", "troop"), place(4, "Sickbay", "care_unit")];

const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "", introcageType: null };
const MONKEYS = [
    { ...base, id: 1, name: "Pip", troop: "Goliath", enclosure: "Goliath", introcage: null },
    { ...base, id: 2, name: "Abby", troop: "Goliath", enclosure: "Goliath", introcage: "Goliath A", introcageType: "introcage" },
    { ...base, id: 3, name: "Rex", troop: "Skrow", enclosure: "Skrow", introcage: null },
];

const EDITOR = { canSee: true, canAdd: true, userId: "u-1", isAdmin: false };
const MAINTENANCE = { canSee: true, canAdd: false, userId: "u-2", isAdmin: false };

const injury = (id, monkeyId, extra = {}) => ({
    id, monkeyId, date: "2026-10-20", description: `Cut ${id}`, loggedBy: "u-9", loggedByName: "Sam",
    loggedAt: "2026-10-20T09:00:00Z", healedOn: null, healedByName: null, updates: [], ...extra,
});

const open = (staff) =>
    render(<RecordsPage route="records/sections/injuries" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter={staff.canAdd} staff={staff} />);

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.removeItem("vervetdb-sections-troop");
    loadCurrentInjuries.mockImplementation(async (ids) =>
        [injury(1, 1), injury(2, 2, { updates: [{ id: 5, date: "2026-10-22", details: "Healing well", loggedBy: "u-9" }] }), injury(3, 3)].filter(
            (e) => ids.includes(e.monkeyId)
        )
    );
});

test("a troop's current injuries, by monkey (its introcages too), with their updates; the troop is remembered", async () => {
    open(EDITOR);
    expect(screen.getByRole("heading", { level: 1, name: "Injuries" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Current" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Cut 1")).toBeInTheDocument();
    expect(loadCurrentInjuries).toHaveBeenCalledWith([2, 1]);
    const abby = screen.getByRole("list", { name: "Abby's injuries" });
    expect(within(abby).getByText("Cut 2")).toBeInTheDocument();
    expect(within(abby).getByText("Healing well")).toBeInTheDocument();
    expect(screen.getByText("Goliath A")).toBeInTheDocument();
    expect(screen.getByText("2 current injuries · 2 monkeys")).toBeInTheDocument();
    expect(screen.queryByText("Cut 3")).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Troop"), "Skrow");
    expect(await screen.findByText("Cut 3")).toBeInTheDocument();
    expect(screen.queryByText("Cut 1")).not.toBeInTheDocument();
    expect(localStorage.getItem("vervetdb-sections-troop")).toBe("Skrow");
    // (troops only: no care units)
    expect(within(screen.getByLabelText("Troop")).queryByRole("option", { name: "Sickbay" })).toBeNull();
});

test("New Injury: the monkey, then the date and description; it joins the list", async () => {
    addInjury.mockImplementation(async (monkeyId, values) => injury(9, monkeyId, values));
    open(EDITOR);
    await screen.findByText("Cut 1");
    await userEvent.click(screen.getByRole("button", { name: "New Injury" }));
    await userEvent.type(screen.getByLabelText("Description"), "Bite on tail");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the monkey.");
    await userEvent.selectOptions(screen.getByLabelText("Monkey"), "1");
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(addInjury).toHaveBeenCalledWith(1, { date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), description: "Bite on tail" });
    const pip = await screen.findByRole("list", { name: "Pip's injuries" });
    expect(within(pip).getByText("Bite on tail")).toBeInTheDocument();
    expect(screen.queryByLabelText("Monkey")).not.toBeInTheDocument();
});

test("Add Update, then Healed? takes it off the list", async () => {
    addInjuryUpdate.mockImplementation(async (_id, { date, details }) => ({ id: 8, date, details, loggedBy: "u-1" }));
    setInjuryHealed.mockResolvedValue(injury(1, 1, { healedOn: "2026-10-30" }));
    open(EDITOR);
    const pip = await screen.findByRole("list", { name: "Pip's injuries" });
    await userEvent.click(within(pip).getByRole("button", { name: "Add Update" }));
    await userEvent.type(within(pip).getByLabelText("Details"), "Scabbed over");
    await userEvent.click(within(pip).getByRole("button", { name: "Confirm" }));
    expect(await within(pip).findByText("Scabbed over")).toBeInTheDocument();

    await userEvent.click(within(pip).getByRole("button", { name: "Healed?" }));
    await userEvent.click(within(pip).getByRole("button", { name: "Confirm" }));
    expect(setInjuryHealed).toHaveBeenCalledWith(1, true);
    await waitFor(() => expect(screen.queryByText("Cut 1")).not.toBeInTheDocument());
    expect(screen.getByText("1 current injury · 1 monkey")).toBeInTheDocument();
});

test("maintenance staff: see them, but no New Injury, Add Update or Healed?", async () => {
    open(MAINTENANCE);
    await screen.findByText("Cut 1");
    expect(screen.queryByRole("button", { name: "New Injury" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Update" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Healed?" })).toBeNull();
});

test("no current injuries: says so", async () => {
    loadCurrentInjuries.mockResolvedValue([]);
    open(EDITOR);
    expect(await screen.findByText("No current injuries in Goliath Troop.")).toBeInTheDocument();
});

test("Sections: Injuries to choose, like Baby Care's Milk Totals and Weights", () => {
    render(<RecordsPage route="records/sections" monkeys={MONKEYS} enclosures={ENCLOSURES} staff={EDITOR} />);
    expect(screen.getByRole("link", { name: /Injuries/ })).toHaveAttribute("href", "#records/sections/injuries");
});

test("Past: healed in the last 6 months, by monkey; Restore asks first, then it's back in Current", async () => {
    loadPastInjuries.mockResolvedValue([injury(4, 1, { healedOn: "2026-10-01", healedByName: "Jo" })]);
    setInjuryHealed.mockResolvedValue(injury(4, 1));
    open(EDITOR);
    await screen.findByText("Cut 1");
    await userEvent.click(screen.getByRole("tab", { name: "Past" }));
    const pip = await screen.findByRole("list", { name: "Pip's injuries" });
    expect(within(pip).getByText("Cut 4")).toBeInTheDocument();
    expect(within(pip).getByText(/Healed on 1st Oct 2026 by Jo/)).toBeInTheDocument();
    const [ids, since] = loadPastInjuries.mock.calls[0];
    expect(ids).toEqual([2, 1]);
    const d = new Date();
    const sixMonths = new Date(d.getFullYear(), d.getMonth() - 6, d.getDate());
    expect(since).toBe(
        `${sixMonths.getFullYear()}-${String(sixMonths.getMonth() + 1).padStart(2, "0")}-${String(sixMonths.getDate()).padStart(2, "0")}`
    );
    expect(screen.getByText("1 healed injury · 1 monkey · last 6 months")).toBeInTheDocument();
    // (no New Injury or Add Update here)
    expect(screen.queryByRole("button", { name: "New Injury" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Update" })).toBeNull();

    await userEvent.click(within(pip).getByRole("button", { name: "Restore" }));
    expect(screen.getByText("Return this record to an active injury?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(setInjuryHealed).toHaveBeenCalledWith(4, false);
    expect(await screen.findByText("No injuries healed in the last 6 months in Goliath Troop.")).toBeInTheDocument();
});

test("Update Needed beside Add Update: no update (or, with none, added) for 14 days", async () => {
    const ago = (n) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    loadCurrentInjuries.mockResolvedValue([
        injury(1, 1, { date: ago(20), description: "Old cut, no updates" }),
        injury(2, 1, { date: ago(30), description: "Updated lately", updates: [{ id: 5, date: ago(3), details: "Fine", loggedBy: "u-9" }] }),
        injury(3, 2, { date: ago(13), description: "Fresh bite" }),
    ]);
    open(MAINTENANCE);
    const item = (text) => screen.getByText(text).closest("li");
    await screen.findByText("Old cut, no updates");
    expect(within(item("Old cut, no updates")).getByText("Update Needed")).toBeInTheDocument();
    expect(within(item("Updated lately")).queryByText("Update Needed")).toBeNull();
    expect(within(item("Fresh bite")).queryByText("Update Needed")).toBeNull();
});
