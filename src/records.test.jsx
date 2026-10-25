// The Records page (#records): the teams, what they record, entering a
// batch (and what to do about ones already saved), and each baby's history
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadBabyRecords, saveBabyRecords } from "./monkeyData";
import RecordsPage from "./RecordsPage";
import {
    RECORD_KINDS,
    alreadySaved,
    batchFrom,
    checkValue,
    dayLabel,
    dayText,
    historyFor,
    isRecordsRoute,
    parseRecordsRoute,
    mondayOf,
    startDay,
    weightReport,
} from "./babyRecords";

vi.mock("./monkeyData", () => ({ loadBabyRecords: vi.fn(), saveBabyRecords: vi.fn() }));

const MILK = RECORD_KINDS.milk;
const WEIGHTS = RECORD_KINDS.weights;

const BABY_CARE = { id: 9, name: "Baby Care", type: "care_unit", parentId: null, section: "Care Units" };
const DREAMLAND = { id: 10, name: "Dreamland", type: "area", parentId: 9, section: "Care Units" };
const baby = (id, name) => ({ id, name, troop: null, introcage: "Dreamland", introcageType: "area", enclosure: "Baby Care", img: [] });
const MUSE = baby(21, "Muse");
const PIP = baby(22, "Pip");
const GROWN = { id: 30, name: "Bongo", troop: "Goliath", introcage: null, enclosure: "Goliath", img: [] };
const MONKEYS = [PIP, MUSE, GROWN];

const record = (monkeyId, date, value, extra = {}) => ({ monkeyId, date, value, notes: null, loggedByName: "Sam", ...extra });

describe("the workings", () => {
    test("the address: the team, then what to record", () => {
        expect(isRecordsRoute("records")).toBe(true);
        expect(isRecordsRoute("records/baby-care/milk")).toBe(true);
        expect(isRecordsRoute("recordsx")).toBe(false);
        expect(parseRecordsRoute("records")).toEqual({ team: null, kind: null });
        expect(parseRecordsRoute("records/baby-care").team.name).toBe("Baby Care");
        expect(parseRecordsRoute("records/baby-care/weights").kind).toBe(WEIGHTS);
        expect(parseRecordsRoute("records/baby-care/nonsense").kind).toBeNull();
        expect(parseRecordsRoute("records/nobody/milk")).toEqual({ team: null, kind: null });
    });

    test("milk starts on yesterday, weights on today", () => {
        const now = new Date(2026, 9, 1, 8, 0);
        expect(startDay(MILK, now)).toBe("2026-09-30");
        expect(startDay(WEIGHTS, now)).toBe("2026-10-01");
        expect(dayLabel("2026-10-24")).toBe("Sat 24 Oct");
    });

    test("whole numbers only, in range; empty is skipped", () => {
        expect(checkValue("", MILK)).toBeNull();
        expect(checkValue("  ", MILK)).toBeNull();
        expect(checkValue(" 180 ", MILK)).toEqual({ value: 180 });
        expect(checkValue("0", MILK)).toEqual({ value: 0 });
        expect(checkValue("500", MILK)).toEqual({ value: 500 });
        expect(checkValue("501", MILK)).toEqual({ error: "0–500 ml" });
        expect(checkValue("12.5", WEIGHTS)).toEqual({ error: "Whole g only" });
        expect(checkValue("-3", WEIGHTS)).toEqual({ error: "Whole g only" });
        expect(checkValue("0", WEIGHTS)).toEqual({ error: "1–20,000 g" });
    });

    test("a batch: the typed ones, with their notes; the problems by baby", () => {
        const rows = [
            { monkey: MUSE, text: "180", notes: "  Skipped the 2am feed " },
            { monkey: PIP, text: "" },
            { monkey: GROWN, text: "900" },
        ];
        expect(batchFrom(rows, "2026-10-24", MILK)).toEqual({
            entries: [{ monkeyId: 21, date: "2026-10-24", value: 180, notes: "Skipped the 2am feed" }],
            errors: { 30: "0–500 ml" },
        });
    });

    test("already saved: the same baby on the same day", () => {
        const entries = [
            { monkeyId: 21, date: "2026-10-24", value: 180 },
            { monkeyId: 22, date: "2026-10-24", value: 150 },
        ];
        const saved = [record(21, "2026-10-24", 178), record(22, "2026-10-23", 140)];
        expect(alreadySaved(entries, saved)).toEqual([{ entry: entries[0], saved: saved[0] }]);
    });

    test("history: newest first, each with the change since the one before (and when that was)", () => {
        const weights = [record(21, "2026-10-18", 474), record(22, "2026-10-20", 900), record(21, "2026-10-25", 512), record(21, "2026-10-20", 480)];
        const history = historyFor(weights, 21);
        expect(history.map((r) => [r.date, r.value, r.change, r.previous?.date ?? null])).toEqual([
            ["2026-10-25", 512, 32, "2026-10-20"],
            ["2026-10-20", 480, 6, "2026-10-18"],
            ["2026-10-18", 474, null, null],
        ]);
    });
});

describe("the weekly weights report", () => {
    const weights = [
        record(21, "2026-10-18", 474),
        record(21, "2026-10-21", 480),
        record(21, "2026-10-25", 512), // (the same week: the latest counts)
        record(22, "2026-10-12", 920),
        record(22, "2026-10-20", 900),
        record(30, "2026-10-22", 2400), // (first weighing)
        record(31, "2026-10-26", 700), // (next week)
    ];
    const monkeys = [MUSE, PIP, GROWN];

    test("a week runs Monday to Sunday", () => {
        expect(mondayOf("2026-10-25")).toBe("2026-10-19");
        expect(mondayOf("2026-10-19")).toBe("2026-10-19");
        expect(mondayOf("2026-10-26")).toBe("2026-10-26");
    });

    test("each baby weighed that week, by name: its latest, and the change since the one before", () => {
        const report = weightReport(weights, monkeys, "2026-10-22");
        expect(report.text).toBe(
            ["⚖️ *Baby Weights 25.10.26* ⚖️", "", "*Bongo* 2400g (first weight)", "*Muse* 512g (+32g)", "*Pip* 900g (-20g)"].join("\n")
        );
        expect([report.monday, report.sunday]).toEqual(["2026-10-19", "2026-10-25"]);
    });

    test("no weighings that week: nothing to list", () => {
        expect(weightReport(weights, monkeys, "2026-11-04").lines).toEqual([]);
    });
});

const open = (route, { canEnter = true } = {}) => {
    const user = userEvent.setup();
    render(<RecordsPage route={route} monkeys={MONKEYS} enclosures={[BABY_CARE, DREAMLAND]} canEnter={canEnter} />);
    return { user };
};

beforeEach(() => {
    vi.clearAllMocks();
    loadBabyRecords.mockResolvedValue([]);
    saveBabyRecords.mockImplementation(async (_kind, entries) => entries.length);
});

describe("picking", () => {
    test("first the team, then what to record", () => {
        open("records");
        expect(screen.getByRole("heading", { level: 1, name: "Records" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Baby Care/ })).toHaveAttribute("href", "#records/baby-care");
    });

    test("Baby Care: Milk Totals and Weights, with the way back", () => {
        open("records/baby-care");
        expect(screen.getByRole("heading", { level: 1, name: "Baby Care" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: /Milk Totals/ })).toHaveAttribute("href", "#records/baby-care/milk");
        expect(screen.getByRole("link", { name: /Weights/ })).toHaveAttribute("href", "#records/baby-care/weights");
        expect(within(screen.getByRole("navigation", { name: "Breadcrumb" })).getByRole("link", { name: "Records" })).toHaveAttribute("href", "#records");
    });
});

describe("entering a batch", () => {
    test("yesterday to start with, a row for each Baby Care baby (by name), not the grown-ups", async () => {
        open("records/baby-care/milk");
        expect(await screen.findByRole("textbox", { name: "Muse" })).toBeInTheDocument();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        expect(screen.getByLabelText("Date")).toHaveValue(
            `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`
        );
        expect(screen.getAllByRole("textbox", { name: /^(Muse|Pip|Bongo)$/ }).map((i) => i.id)).toEqual([
            "RecordsPage-milk-21",
            "RecordsPage-milk-22",
        ]);
    });

    test("Save All saves the typed ones (empty: skipped), then says so and empties the boxes", async () => {
        const { user } = open("records/baby-care/milk");
        await user.clear(await screen.findByLabelText("Date"));
        await user.type(screen.getByLabelText("Date"), "2026-10-24");
        await user.type(screen.getByRole("textbox", { name: "Muse" }), "180");
        await user.type(screen.getByRole("textbox", { name: "Note for Muse" }), "Skipped the 2am feed");
        await user.click(screen.getByRole("button", { name: "Save All" }));
        expect(saveBabyRecords).toHaveBeenCalledWith(
            "milk",
            [{ monkeyId: 21, date: "2026-10-24", value: 180, notes: "Skipped the 2am feed" }],
            false
        );
        expect(await screen.findByRole("status")).toHaveTextContent("Saved 1 milk total for Sat 24 Oct.");
        expect(screen.getByRole("textbox", { name: "Muse" })).toHaveValue("");
    });

    test("nothing typed, or a value out of range: says so, saves nothing", async () => {
        const { user } = open("records/baby-care/milk");
        await user.click(await screen.findByRole("button", { name: "Save All" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Type at least one milk total.");
        await user.type(screen.getByRole("textbox", { name: "Pip" }), "650");
        await user.click(screen.getByRole("button", { name: "Save All" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please check the highlighted values.");
        expect(screen.getByRole("textbox", { name: "Pip" })).toHaveAccessibleDescription("0–500 ml");
        expect(saveBabyRecords).not.toHaveBeenCalled();
    });

    describe("some already saved that day", () => {
        const setup = async () => {
            loadBabyRecords.mockResolvedValue([record(21, "2026-10-24", 178, { loggedByName: "Sam" })]);
            const { user } = open("records/baby-care/milk");
            await user.clear(await screen.findByLabelText("Date"));
            await user.type(screen.getByLabelText("Date"), "2026-10-24");
            // (what's saved shows on its row)
            expect(screen.getByText("Saved: 178 ml")).toBeInTheDocument();
            await user.type(screen.getByRole("textbox", { name: "Muse" }), "180");
            await user.type(screen.getByRole("textbox", { name: "Pip" }), "150");
            await user.click(screen.getByRole("button", { name: "Save All" }));
            const dialog = await screen.findByRole("dialog", { name: "Already Saved" });
            return { user, dialog };
        };

        test("asks first: what's saved, by whom, and the new value", async () => {
            const { dialog } = await setup();
            expect(dialog).toHaveTextContent("This baby already has a milk total for Sat 24 Oct:");
            expect(dialog).toHaveTextContent("Muse: 178 ml (Sam) → 180 ml");
            expect(saveBabyRecords).not.toHaveBeenCalled();
            expect(within(dialog).getByRole("button", { name: "Replace Them" })).toHaveClass("is-danger");
            expect(within(dialog).getByRole("button", { name: "Cancel" })).toHaveFocus();
        });

        test("Replace Them saves them all, replacing", async () => {
            const { user, dialog } = await setup();
            await user.click(within(dialog).getByRole("button", { name: "Replace Them" }));
            expect(saveBabyRecords).toHaveBeenCalledWith("milk", expect.arrayContaining([expect.objectContaining({ monkeyId: 21, value: 180 })]), true);
            expect(await screen.findByRole("status")).toHaveTextContent("Saved 2 milk totals for Sat 24 Oct.");
            expect(screen.queryByRole("dialog")).toBeNull();
        });

        test("Keep Old Values saves only the new ones", async () => {
            saveBabyRecords.mockResolvedValue(1);
            const { user, dialog } = await setup();
            await user.click(within(dialog).getByRole("button", { name: "Keep Old Values" }));
            expect(saveBabyRecords).toHaveBeenCalledWith("milk", expect.any(Array), false);
            expect(await screen.findByRole("status")).toHaveTextContent("Saved 1 milk total for Sat 24 Oct. Kept the old value.");
        });

        test("Cancel saves nothing, and keeps what was typed", async () => {
            const { user, dialog } = await setup();
            await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
            expect(screen.queryByRole("dialog")).toBeNull();
            expect(saveBabyRecords).not.toHaveBeenCalled();
            expect(screen.getByRole("textbox", { name: "Muse" })).toHaveValue("180");
        });
    });

    test("a save that fails says why, and keeps what was typed", async () => {
        saveBabyRecords.mockRejectedValue(new Error("The database didn't allow this. Are you still signed in as an editor?"));
        const { user } = open("records/baby-care/weights");
        await user.type(await screen.findByRole("textbox", { name: "Muse" }), "512");
        await user.click(screen.getByRole("button", { name: "Save All" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Are you still signed in as an editor?");
        expect(screen.getByRole("textbox", { name: "Muse" })).toHaveValue("512");
    });
});

test("each baby's first photo beside its name (none: an empty circle)", async () => {
    const withPhoto = { ...MUSE, img: ["https://example.com/muse.jpg", "https://example.com/muse-2.jpg"] };
    render(<RecordsPage route="records/baby-care/milk" monkeys={[withPhoto, PIP]} enclosures={[BABY_CARE, DREAMLAND]} canEnter />);
    const row = (await screen.findByRole("textbox", { name: "Muse" })).closest("li");
    expect(row.querySelector("img").getAttribute("src")).toMatch(/muse/);
    expect(row.querySelector("img").getAttribute("src")).not.toMatch(/muse-2/);
    expect(screen.getByRole("textbox", { name: "Pip" }).closest("li").querySelector("img")).toBeNull();
});

test("each note opens with its + (phones), and a typed note's + stays blue", async () => {
    const user = userEvent.setup();
    render(<RecordsPage route="records/baby-care/milk" monkeys={MONKEYS} enclosures={[BABY_CARE, DREAMLAND]} canEnter />);
    const plus = await screen.findByRole("button", { name: "Note for Muse" });
    expect(plus).toHaveAttribute("aria-expanded", "false");
    await user.click(plus);
    expect(plus).toHaveAttribute("aria-expanded", "true");
    expect(plus.closest("li")).toHaveClass("is-noteOpen");
    const note = screen.getByRole("textbox", { name: "Note for Muse" });
    await waitFor(() => expect(note).toHaveFocus());
    await user.type(note, "Skipped the 2am feed");
    await user.click(plus);
    expect(plus.closest("li")).not.toHaveClass("is-noteOpen");
    expect(plus).toHaveClass("has-note");
    expect(note).toHaveValue("Skipped the 2am feed");
});

describe("viewing", () => {
    const WEIGHED = [record(21, "2026-10-18", 474), record(21, "2026-10-25", 512, { notes: "A day late" }), record(30, "2026-09-01", 2400)];

    test("staff who can't enter get View only", async () => {
        loadBabyRecords.mockResolvedValue(WEIGHED);
        open("records/baby-care/weights", { canEnter: false });
        expect(await screen.findByText("512 g")).toBeInTheDocument();
        expect(screen.queryByRole("tab")).toBeNull();
        expect(screen.queryByRole("button", { name: "Save All" })).toBeNull();
    });

    test("each baby: the latest and its date, the change since the one before (and when), its history", async () => {
        loadBabyRecords.mockResolvedValue(WEIGHED);
        const { user } = open("records/baby-care/weights");
        await user.click(await screen.findByRole("tab", { name: "View" }));
        const muse = screen.getByText("Muse").closest("li");
        expect(muse).toHaveTextContent("512 g");
        expect(muse).toHaveTextContent("Sun 25 Oct");
        expect(muse).toHaveTextContent("+38 g since Sun 18 Oct (474 g)");
        expect(muse).toHaveTextContent("A day late");
        await user.click(within(muse).getByRole("button", { name: "History (2)" }));
        const rows = within(within(muse).getByRole("table")).getAllByRole("row").slice(1);
        expect(rows.map((r) => r.textContent)).toEqual(["Sun 25 OctA day late · Sam512 g+38 g", "Sun 18 OctSam474 g–"]);
        // (no weights yet)
        expect(screen.getByText("Pip").closest("li")).toHaveTextContent("No weights yet.");
        // (moved on from Baby Care: still there, under its own heading)
        expect(screen.getByRole("heading", { name: "No Longer in Baby Care" })).toBeInTheDocument();
        expect(screen.getByText("Bongo").closest("li")).toHaveTextContent("The first weight.");
    });

    test("Weekly Report: this week's weights, ready to copy into WhatsApp", async () => {
        const monday = mondayOf(dayText(new Date()));
        loadBabyRecords.mockResolvedValue([record(21, "2026-01-05", 400), record(21, monday, 450)]);
        const { user } = open("records/baby-care/weights", { canEnter: false });
        // (after userEvent's own clipboard)
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        await user.click(await screen.findByRole("button", { name: "Create Report" }));
        const text = screen.getByLabelText("The report");
        expect(text.textContent).toMatch(/^⚖️ \*Baby Weights \d\d\.\d\d\.\d\d\* ⚖️\n\n\*Muse\* 450g \(\+50g\)$/);
        await user.click(screen.getByRole("button", { name: "Copy Report" }));
        expect(writeText).toHaveBeenCalledWith(text.textContent);
        expect(screen.getByRole("button", { name: "Copied!" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Close" }));
        expect(screen.queryByLabelText("The report")).toBeNull();
    });

    test("the records not loading says so", async () => {
        loadBabyRecords.mockRejectedValue(new Error("gone"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        open("records/baby-care/milk");
        expect(await screen.findByText(/Couldn't load the milk totals/)).toBeInTheDocument();
    });
});
