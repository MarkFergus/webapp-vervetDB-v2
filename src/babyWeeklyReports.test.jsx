// Records → Baby Care → Weekly Baby Reports: the week, who's in it, the
// WhatsApp text, Save All and View
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadBabyWeeklyReports, loadMoves, saveBabyWeeklyReports } from "./monkeyData";
import RecordsPage from "./RecordsPage";
import { babiesInWeek, parseRecordsRoute, reportWeek, weekCommencing, weeklyBabyText } from "./babyRecords";

vi.mock("./monkeyData", () => ({
    loadBabyRecords: vi.fn(async () => []),
    saveBabyRecords: vi.fn(),
    loadMoves: vi.fn(async () => []),
    loadBabyWeeklyReports: vi.fn(async () => []),
    saveBabyWeeklyReports: vi.fn(async (_week, entries) => entries.filter((e) => e.report).length),
}));

const BABY_CARE = { id: 9, name: "Baby Care", type: "care_unit", parentId: null, section: "Care Units" };
const DREAMLAND = { id: 10, name: "Dreamland", type: "area", parentId: 9, section: "Care Units" };
const ENCLOSURES = [BABY_CARE, DREAMLAND];
const baby = (id, name) => ({ id, name, troop: null, introcage: "Dreamland", introcageType: "area", enclosure: "Baby Care", img: [] });
const MASKO = baby(21, "Masko");
const ZURI = baby(22, "Zuri");
// (left Baby Care on Tue 3 Nov)
const LEFT = { id: 40, name: "Dobby", troop: "Goliath", introcage: "Goliath A", enclosure: "Goliath", img: [] };
const GROWN = { id: 30, name: "Bongo", troop: "Goliath", introcage: null, enclosure: "Goliath", img: [] };
const MONKEYS = [ZURI, MASKO, LEFT, GROWN];
const MOVES = [{ monkeyId: 40, date: "2026-11-03", kind: "home", fromId: 10, toId: 77 }];

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 12, 9, 0)); // Thu 12 Nov 2026
    loadMoves.mockResolvedValue(MOVES);
    loadBabyWeeklyReports.mockResolvedValue([]);
    saveBabyWeeklyReports.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("the workings", () => {
    test("a page of Baby Care's", () => {
        expect(parseRecordsRoute("records/baby-care/weekly-reports").kind.title).toBe("Weekly Baby Reports");
    });

    test("the week: this one, but on a Monday the one just ended", () => {
        expect(reportWeek(new Date(2026, 10, 12))).toBe("2026-11-09");
        expect(reportWeek(new Date(2026, 10, 15))).toBe("2026-11-09");
        expect(reportWeek(new Date(2026, 10, 9))).toBe("2026-11-02");
        expect(weekCommencing("2026-11-02")).toBe("W/C 02.11");
    });

    test("who's in a week: a baby who left during it still is; the week after, not", () => {
        const names = (monday) => babiesInWeek(MONKEYS, ENCLOSURES, MOVES, monday, "2026-11-12").map((m) => m.name);
        expect(names("2026-11-02")).toEqual(["Dobby", "Masko", "Zuri"]);
        expect(names("2026-11-09")).toEqual(["Masko", "Zuri"]);
    });

    test("the WhatsApp text: the title, then each baby by name, a blank line between", () => {
        const text = weeklyBabyText(
            "2026-11-02",
            [
                { monkeyId: 22, report: "Zuri is climbing everywhere." },
                { monkeyId: 21, report: "Little Masko had a great week." },
            ],
            MONKEYS
        );
        expect(text).toBe(
            "*Weekly Baby Report W/C 02.11*\n\n*Masko*\nLittle Masko had a great week.\n\n*Zuri*\nZuri is climbing everywhere."
        );
    });
});

describe("Enter", () => {
    const open = () =>
        render(<RecordsPage route="records/baby-care/weekly-reports" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter />);

    test("this week's babies; back a week, the one who left too; no weeks ahead", async () => {
        open();
        expect(await screen.findByText("W/C 09.11")).toBeInTheDocument();
        expect(screen.getByLabelText("Masko")).toBeInTheDocument();
        expect(screen.queryByLabelText("Dobby")).toBeNull();
        expect(screen.queryByLabelText("Bongo")).toBeNull();
        expect(screen.getByRole("button", { name: "The week after" })).toBeDisabled();
        fireEvent.click(screen.getByRole("button", { name: "The week before" }));
        expect(screen.getByText("W/C 02.11")).toBeInTheDocument();
        expect(screen.getByLabelText("Dobby")).toBeInTheDocument();
        expect(screen.getByText("Left Baby Care")).toBeInTheDocument();
    });

    test("reported weeks aren't offered: the arrows skip them", async () => {
        loadBabyWeeklyReports.mockResolvedValue([
            { id: 1, monkeyId: 21, week: "2026-11-09", report: "Done", loggedByName: "Sam" },
            { id: 2, monkeyId: 21, week: "2026-11-02", report: "Done", loggedByName: "Sam" },
        ]);
        open();
        expect(await screen.findByText("W/C 26.10")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "The week after" })).toBeDisabled();
    });

    test("Save All: every baby, the blank ones as Not recorded (null)", async () => {
        const user = userEvent.setup();
        open();
        await user.type(await screen.findByLabelText("Masko"), "  Great week  ");
        await user.click(screen.getByRole("button", { name: "Save All" }));
        await waitFor(() =>
            expect(saveBabyWeeklyReports).toHaveBeenCalledWith("2026-11-09", [
                { monkeyId: 21, report: "Great week" },
                { monkeyId: 22, report: null },
            ])
        );
        expect(await screen.findByText(/Saved W\/C 09.11: 1 report, 1 not recorded/)).toBeInTheDocument();
    });

    test("nothing written: says so, saves nothing", async () => {
        const user = userEvent.setup();
        open();
        await user.click(await screen.findByRole("button", { name: "Save All" }));
        expect(screen.getByRole("alert")).toHaveTextContent("at least one baby");
        expect(saveBabyWeeklyReports).not.toHaveBeenCalled();
    });
});

describe("View", () => {
    const REPORTS = [
        { id: 3, monkeyId: 22, week: "2026-11-09", report: null, loggedByName: "Sam" },
        { id: 2, monkeyId: 21, week: "2026-11-09", report: "Bottle all gone.", loggedByName: "Sam" },
        { id: 1, monkeyId: 21, week: "2026-11-02", report: "Little Masko had a great week.", loggedByName: "Jo" },
    ];

    test("each week, newest first, Not recorded shown; Copy leaves it out", async () => {
        const writeText = vi.fn(async () => {});
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        loadBabyWeeklyReports.mockResolvedValue(REPORTS);
        render(<RecordsPage route="records/baby-care/weekly-reports" monkeys={MONKEYS} enclosures={ENCLOSURES} />);
        const weeks = await screen.findAllByRole("list", { name: /Weekly Baby Report/ });
        expect(weeks.map((w) => w.getAttribute("aria-label"))).toEqual(["Weekly Baby Report W/C 09.11", "Weekly Baby Report W/C 02.11"]);
        expect(within(weeks[0]).getByText("Not recorded")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
        fireEvent.click(screen.getAllByRole("button", { name: "Copy" })[0]);
        await waitFor(() => expect(writeText).toHaveBeenCalledWith("*Weekly Baby Report W/C 09.11*\n\n*Masko*\nBottle all gone."));
    });

    test("Edit: the Not recorded one offered again; only changes are saved", async () => {
        const user = userEvent.setup();
        loadBabyWeeklyReports.mockResolvedValue(REPORTS);
        render(<RecordsPage route="records/baby-care/weekly-reports" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter />);
        await user.click(await screen.findByRole("tab", { name: "View" }));
        await user.click(screen.getByRole("button", { name: "Edit Weekly Baby Report W/C 09.11" }));
        expect(screen.getByLabelText("Masko")).toHaveValue("Bottle all gone.");
        expect(screen.getByLabelText("Zuri")).toHaveValue("");
        await user.type(screen.getByLabelText("Zuri"), "Climbing");
        await user.click(screen.getByRole("button", { name: "Save Changes" }));
        await waitFor(() => expect(saveBabyWeeklyReports).toHaveBeenCalledWith("2026-11-09", [{ monkeyId: 22, report: "Climbing" }], true));
    });
});
