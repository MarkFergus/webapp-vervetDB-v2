import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MedsRecordsPage from "./MedsRecordsPage";
import { addMicrochip, deleteRecord, loadMicrochips, saveMicrochipRecord } from "./monkeyData";
import { RECORD_KINDS } from "./babyRecords";
import { chipQuestion, chipsByTroop, microchipLogStart } from "./medsRules";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadMicrochips: vi.fn(),
    addMicrochip: vi.fn(),
    saveMicrochipRecord: vi.fn(),
    deleteRecord: vi.fn(),
}));

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MONKEYS = [
    { id: 1, name: "Bruce", troop: "Goliath", enclosure: "Goliath", introcage: null, img: [], chip: "1011" },
    { id: 2, name: "Daisy", troop: "Goliath", enclosure: "Goliath", introcage: null, img: [], chip: "" },
    { id: 3, name: "Coco", troop: "D&D", enclosure: "D&D", introcage: null, img: [], chip: "2001 & 2002" },
];
const RECORD = { id: 7, monkeyId: 1, date: "2026-10-01", number: "1011", note: "Left shoulder", loggedBy: "u-1", loggedByName: "Sam Smith", monkey: null };

const show = ({ isAdmin = false, onChipChanged = vi.fn() } = {}) => {
    const user = userEvent.setup();
    render(<MedsRecordsPage kind={RECORD_KINDS.microchips} monkeys={MONKEYS} canEnter staff={{ userId: "u-1", isAdmin }} onChipChanged={onChipChanged} />);
    return { user, onChipChanged };
};

beforeEach(() => {
    vi.clearAllMocks();
    loadMicrochips.mockResolvedValue([RECORD]);
});

describe("the workings", () => {
    test("the Log starts 6 months back (end of month: its last day)", () => {
        expect(microchipLogStart("2026-11-14")).toBe("2026-05-14");
        expect(microchipLogStart("2026-08-31")).toBe("2026-02-28");
        expect(microchipLogStart("2026-03-10")).toBe("2025-09-10");
    });

    test("what to ask first: a 2nd chip, the same chip again, another monkey's chip; nothing for a first chip", () => {
        expect(chipQuestion(MONKEYS[0], "1604", MONKEYS)).toBe("Bruce already has a chip on record (1011). Add another?");
        expect(chipQuestion(MONKEYS[0], "1011", MONKEYS)).toBe("1011 is already Bruce's chip. Add a record for it?");
        expect(chipQuestion(MONKEYS[1], "2002", MONKEYS)).toBe("2002 is already Coco's chip. Add it to Daisy too?");
        expect(chipQuestion(MONKEYS[1], "5555", MONKEYS)).toBeNull();
    });

    test("By Troop: troops in section order (D&D first), by name, chipped counted", () => {
        const groups = chipsByTroop(MONKEYS);
        expect(groups.map((g) => g.home)).toEqual(["D&D", "Goliath"]);
        expect(groups[1].monkeys.map((m) => m.monkey.name)).toEqual(["Bruce", "Daisy"]);
        expect(groups[1].chipped).toBe(1);
        expect(groups[0].monkeys[0].chips).toEqual(["2001", "2002"]);
    });
});

describe("Microchips", () => {
    test("the Log: the last 6 months, chip number, details and who", async () => {
        show();
        expect(loadMicrochips).toHaveBeenCalledWith(microchipLogStart(today()));
        const list = await screen.findByRole("list", { name: "Microchips" });
        const row = within(list).getAllByRole("listitem")[0];
        expect(row).toHaveTextContent("Bruce");
        expect(row).toHaveTextContent("Chip 1011");
        expect(row).toHaveTextContent("Left shoulder");
        expect(row).toHaveTextContent("Added by Sam Smith");
        expect(screen.getByText("1 microchip in the last 6 months")).toBeInTheDocument();
        // (editors: no Edit or Delete, as for all Medical records)
        expect(within(row).queryByRole("button", { name: /Delete/ })).toBeNull();
    });

    test("+ New Microchip: a first chip saves straight away, and the monkey's Chip catches up", async () => {
        const { user, onChipChanged } = show();
        await screen.findByRole("list", { name: "Microchips" });
        await user.click(screen.getByRole("button", { name: "New Microchip" }));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Please choose the monkey.")).toBeInTheDocument();
        expect(screen.getByText("Please enter the chip number.")).toBeInTheDocument();

        await user.type(screen.getByRole("searchbox", { name: "Search monkeys" }), "dai");
        await user.click(screen.getByRole("button", { name: /Daisy/ }));
        await user.type(screen.getByLabelText("Microchip Number"), "5555");
        await user.type(screen.getByLabelText("Details (optional)"), "Right side");
        addMicrochip.mockResolvedValue("5555");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(addMicrochip).toHaveBeenCalledWith(2, { number: "5555", date: today(), note: "Right side" }));
        expect(onChipChanged).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }), "5555");
        await waitFor(() => expect(screen.queryByRole("heading", { name: "New Microchip" })).toBeNull());
    });

    test("a monkey with a chip already: asks Add another? first", async () => {
        const { user } = show();
        await screen.findByRole("list", { name: "Microchips" });
        await user.click(screen.getByRole("button", { name: "New Microchip" }));
        await user.type(screen.getByRole("searchbox", { name: "Search monkeys" }), "bru");
        await user.click(screen.getByRole("button", { name: /Bruce/ }));
        await user.type(screen.getByLabelText("Microchip Number"), "1604");
        await user.click(screen.getByRole("button", { name: "Save" }));
        const ask = screen.getByRole("dialog", { name: "Bruce already has a chip on record (1011). Add another?" });
        expect(addMicrochip).not.toHaveBeenCalled();
        addMicrochip.mockResolvedValue("1011 & 1604");
        await user.click(within(ask).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(addMicrochip).toHaveBeenCalledWith(1, { number: "1604", date: today(), note: "" }));
    });

    test("admins: Edit changes the date and details (the number stays); Delete asks first", async () => {
        const { user } = show({ isAdmin: true });
        const list = await screen.findByRole("list", { name: "Microchips" });
        await user.click(within(list).getByRole("button", { name: "Edit Bruce's microchip record" }));
        expect(screen.getByLabelText("Microchip Number")).toHaveAttribute("readonly");
        const details = screen.getByLabelText("Details (optional)");
        await user.clear(details);
        await user.type(details, "Re-scanned");
        saveMicrochipRecord.mockResolvedValue({});
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saveMicrochipRecord).toHaveBeenCalledWith(7, { number: "1011", date: "2026-10-01", note: "Re-scanned" }));

        const again = await screen.findByRole("list", { name: "Microchips" });
        await user.click(within(again).getByRole("button", { name: "Delete Bruce's microchip record" }));
        deleteRecord.mockResolvedValue();
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(deleteRecord).toHaveBeenCalledWith(7));
    });

    test("By Troop: each troop's monkeys and their chips, No Chip for those without", async () => {
        const { user } = show();
        await user.click(screen.getByRole("tab", { name: "By Troop" }));
        const goliath = screen.getByRole("region", { name: "Goliath" });
        expect(goliath).toHaveTextContent("1 of 2 chipped");
        expect(goliath).toHaveTextContent("Bruce1011");
        expect(goliath).toHaveTextContent("DaisyNo Chip");
        expect(screen.getByRole("region", { name: "D&D" })).toHaveTextContent("2001 & 2002");
    });
});
