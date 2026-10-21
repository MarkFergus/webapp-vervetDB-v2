// Documents → Troop Monitoring (staff): the Monitoring Sheet and / or the
// Monitoring Notes, in one PDF
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { pdf } from "@react-pdf/renderer";
import { loadCurrentInjuries, loadMonitoringFor } from "./monkeyData";

vi.mock("./auth", async (importOriginal) => (await import("./testStaff")).staffAuth(await importOriginal()));
vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadMonitoringFor: vi.fn(),
    loadCurrentInjuries: vi.fn(),
}));
vi.mock("@react-pdf/renderer", () => ({
    pdf: vi.fn(() => ({ toBlob: async () => new Blob(["%PDF-"]) })),
    Font: { register: () => {}, registerHyphenationCallback: () => {} },
    StyleSheet: { create: (s) => s },
    Document: () => null,
    Page: () => null,
    View: () => null,
    Text: () => null,
    Image: () => null,
    Svg: () => null,
    Path: () => null,
}));

// Saved monkeys (with ids), as from the database
const MONKEYS = monkeysArr.map((m, i) => ({ ...m, id: i + 1 }));
const goliath = MONKEYS.filter((m) => m.troop === "Goliath");

let downloads;
beforeEach(() => {
    vi.clearAllMocks();
    downloads = [];
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
        downloads.push(this.download);
    });
    loadMonitoringFor.mockResolvedValue({ [goliath[0].id]: { conditionCheck: true, notes: "Check she's eating ok" } });
    loadCurrentInjuries.mockResolvedValue([
        { id: 1, monkeyId: goliath[1].id, date: "2026-10-13", description: "minor wound on left thigh", updates: [] },
    ]);
});
afterEach(() => vi.restoreAllMocks());

async function openTroopMonitoring(props = {}) {
    const user = userEvent.setup();
    render(<ShowPage monkeys={MONKEYS} editable {...props} />);
    await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Documents" }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Monitoring");
    await user.selectOptions(screen.getByRole("combobox", { name: "Troop" }), "Goliath");
    return user;
}
const part = (name) => within(screen.getByRole("group", { name: "Include" })).getByRole("checkbox", { name });
const create = (user) => user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));

test("both to start with: the Sheet then the Notes, in one PDF", async () => {
    const user = await openTroopMonitoring();
    expect(part("Monitoring Sheet")).toBeChecked();
    expect(part("Monitoring Notes")).toBeChecked();
    expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent("Creates a Monitoring Sheet and Monitoring Notes for Goliath.");
    await create(user);
    const save = await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });
    // The troop's monkeys only
    const ids = loadMonitoringFor.mock.lastCall[0];
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => goliath.some((m) => m.id === id) || MONKEYS.find((m) => m.id === id).enclosure === "Goliath")).toBe(true);
    const { sheet, notes } = pdf.mock.lastCall[0].props;
    expect(sheet.title).toBe("Goliath Monitoring Sheet");
    expect(notes.title).toBe("Goliath Monitoring Notes");
    expect(notes.date).toMatch(/^\d{1,2}(st|nd|rd|th) [A-Z][a-z]{2} \d{4}$/);
    expect(notes.notes.condition.troop).toEqual([goliath[0].name]);
    expect(notes.notes.other).toEqual([{ name: goliath[0].name, notes: "Check she's eating ok" }]);
    expect(notes.notes.injuries).toEqual([{ name: goliath[1].name, text: "13/10 minor wound on left thigh" }]);
    await user.click(save);
    expect(downloads[0]).toMatch(/^monitoring_Goliath_\d{4}-\d{2}-\d{2}\.pdf$/);
});

test("just the Notes", async () => {
    const user = await openTroopMonitoring();
    await user.click(part("Monitoring Sheet"));
    await create(user);
    await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });
    expect(screen.getByText(/Your Troop Monitoring Notes is ready/)).toBeInTheDocument();
    expect(pdf.mock.lastCall[0].props.sheet).toBeNull();
});

test("neither ticked: nothing to create", async () => {
    const user = await openTroopMonitoring();
    await user.click(part("Monitoring Sheet"));
    await user.click(part("Monitoring Notes"));
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" })).toBeDisabled();
    expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent("Choose the Monitoring Sheet, the Monitoring Notes, or both.");
});

test("the Notes couldn't be loaded: says so, and makes nothing", async () => {
    loadCurrentInjuries.mockRejectedValue(new Error("offline"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const user = await openTroopMonitoring();
    await create(user);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the Monitoring Notes"));
    expect(pdf).not.toHaveBeenCalled();
});

test("not the live database (the built-in copy): just the Sheet, no ticks", async () => {
    await openTroopMonitoring({ editable: false });
    expect(screen.queryByRole("group", { name: "Include" })).toBeNull();
});
