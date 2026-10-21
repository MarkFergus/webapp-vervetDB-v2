import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import MonkeyPage from "./MonkeyPage";
import { NEW_RECORDS_OPEN, RecordList } from "./MonkeyRecords";
import monkeysArr from "./monkeysArr";
import { STAFF } from "./testStaff";
import { isMonkeyPageRoute, monkeyFromPageRoute, monkeyHash, monkeyPageHash } from "./monkeyLink";

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
    expect(screen.getByText("Location").closest("div")).toHaveTextContent("Holt & Barrington Troop");
    // Visitors: no records
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    // (no troop link under the name)
    expect(screen.queryByRole("link", { name: /Troop/ })).not.toBeInTheDocument();
});

test("staff see Records: Rehabilitation and Medical tabs; the chip is in the Profile", async () => {
    const user = userEvent.setup();
    const staff = { canSee: true, canAdd: false, userId: "staff-1", isAdmin: false };
    render(<MonkeyPage monkey={{ ...aroha, inSickbay: true, sickbaySince: "2026-10-01", sickbayNote: "Limping" }} staff={staff} />);
    expect(screen.getByText("Microchip")).toBeInTheDocument();
    expect(screen.getByText("19806")).toBeInTheDocument();
    const bar = screen.getByRole("navigation", { name: "On this page" });
    expect(within(bar).getAllByRole("button").map((b) => b.title)).toEqual([
        "Profile",
        "Arrival Info",
        "Rehabilitation",
        "Medical",
        "Integration",
    ]);
    expect(screen.getByRole("tab", { name: "Rehabilitation" })).toHaveAttribute("aria-selected", "true");
    // Where it is now: a Movement row
    const table = screen.getByRole("table", { name: "Rehabilitation records" });
    expect(within(table).getByText("Movement")).toBeInTheDocument();
    expect(within(table).getByText("Moved to Sickbay: Limping")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Medical" }));
    expect(screen.getByText("No medical records yet.")).toBeInTheDocument();
    // Records folds away
    await user.click(screen.getByRole("button", { name: "Records" }));
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
});

// A records list's data, without the database
function fakeRecords(entries = [], { canAdd = true } = {}) {
    return {
        available: true,
        entries,
        canAdd,
        canChange: () => true,
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
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Choose…",
        "Injury",
        "Medicine",
        "Treatment",
        "Vet Visit",
        "Observation",
    ]);
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose a category.");
    await user.selectOptions(screen.getByLabelText("Category"), "treatment");
    await user.type(screen.getByLabelText("Details"), "Wound cleaned");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(records.add).toHaveBeenCalledWith(
        expect.objectContaining({ section: "medical", category: "treatment", details: "Wound cleaned" })
    );
    expect(screen.queryByRole("button", { name: "Confirm" })).not.toBeInTheDocument();
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
        "Observation",
        "Escape",
    ]);
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

test("Birth Date (not recorded yet), then Birth Year", () => {
    render(<MonkeyPage monkey={aroha} staff={null} />);
    expect(screen.getByText("Birth Date").closest("div")).toHaveTextContent("Not recorded");
    expect(screen.getByText("Birth Year").closest("div")).toHaveTextContent("2016");
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

test("the new Rehabilitation / Medical Record buttons are off for now (Integration's stays on)", () => {
    expect(NEW_RECORDS_OPEN).toBe(false);
});

