// Records → Sections → Deworming: the deworming groups, who's on a new
// sheet to start with, Prepare Sheet (admins), and a sheet's page with
// Print Sheet (deworming.sql); then completing it: the advice, the
// records' words, the WhatsApp summary, Record Results, Submit, and
// Approve / Send Back (deworming-results.sql)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import {
    addDewormingMonkey,
    approveDewormingSheet,
    deleteDewormingSheet,
    emailDewormingSheet,
    loadDewormingCalendar,
    loadDewormingSheets,
    refreshDewormingCalendar,
    removeDewormingMonkey,
    returnDewormingSheet,
    saveDewormingResults,
    saveDewormingSheet,
    sheetPhotoData,
    sheetPhotoUrls,
    uploadSheetPhoto,
} from "./monkeyData";
import {
    dayAdvice,
    daySummary,
    dewormingGroups,
    doseNumber,
    lastDose,
    needsDay4,
    nextSession,
    onDay,
    introcageRanks,
    printOrder,
    shortIntrocage,
    differentScheduleText,
    recordText,
    sheetTitle,
    startingLines,
} from "./dewormingRules";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadDewormingSheets: vi.fn(),
    saveDewormingSheet: vi.fn(),
    deleteDewormingSheet: vi.fn(),
    saveDewormingResults: vi.fn(),
    approveDewormingSheet: vi.fn(),
    returnDewormingSheet: vi.fn(),
    uploadSheetPhoto: vi.fn(),
    sheetPhotoUrls: vi.fn(),
    addDewormingMonkey: vi.fn(),
    loadDewormingCalendar: vi.fn(),
    refreshDewormingCalendar: vi.fn(),
    emailDewormingSheet: vi.fn(),
    sheetPhotoData: vi.fn(),
    removeDewormingMonkey: vi.fn(),
}));
vi.mock("@react-pdf/renderer", () => ({
    pdf: vi.fn(() => ({ toBlob: async () => new Blob(["%PDF-"]) })),
    Font: { register: () => {}, registerHyphenationCallback: () => {} },
    StyleSheet: { create: (s) => s },
    Document: () => null,
    Page: () => null,
    View: () => null,
    Text: () => null,
}));

const place = (id, name, type, section, parentId = null) => ({ id, name, type, section, parentId, sortOrder: id });
const ENCLOSURES = [
    place(1, "D&D", "troop", "Top"),
    place(2, "D&D A", "introcage", null, 1),
    place(3, "Bachelor Block", "block", "Top"),
    place(4, "Bachelor Block A", "introcage", null, 3),
    place(5, "Skrow", "troop", "Bottom"),
    place(6, "Global", "troop", "Sickbay"),
    place(7, "Global A", "introcage", null, 6),
    place(8, "Baby Care", "care_unit", "Care Units"),
];

const base = { sex: "female", chip: "1", img: ["x.jpg"], bio: "", desc: "", introcageType: null };
const monkey = (id, name, troop, year, introcage = null, enclosure = troop) => ({
    ...base,
    id,
    name,
    troop,
    enclosure,
    year,
    introcage,
    introcageType: introcage ? "introcage" : null,
});
const MONKEYS = [
    monkey(1, "Ash", "D&D", 2015),
    monkey(2, "Meggy", "D&D", 2012),
    monkey(3, "Tiny", "D&D", 2025),
    monkey(4, "Oldie", "D&D", ""),
    monkey(5, "Sybil", "D&D", 2016, "D&D A"),
    monkey(6, "Leeloo", null, 2014, "Bachelor Block A", "Bachelor Block"),
    monkey(7, "Rex", "Skrow", 2010),
    monkey(8, "Gus", "Global", 2011),
    monkey(9, "Gia", "Global", 2013, "Global A"),
];

const sheet = (id, session, startDate, lines, extra = {}) => ({
    id,
    groupKey: "troop:1",
    groupName: "D&D Troop",
    session,
    startDate,
    instructions: "Add milk thistle.",
    status: "ready",
    preparedByName: "Mark Fergus",
    lines,
    ...extra,
});
const line = (monkeyId, medication, dose, days = 3) => ({ monkeyId, medication, dose, days });

const ADMIN = { canSee: true, canAdd: true, userId: "a-1", isAdmin: true };
const EDITOR = { canSee: true, canAdd: true, userId: "e-1", isAdmin: false };

const open = (staff) =>
    render(
        <RecordsPage
            route="records/sections/deworming"
            monkeys={MONKEYS}
            enclosures={ENCLOSURES}
            canEnter
            staff={staff}
        />
    );

beforeEach(() => {
    vi.clearAllMocks();
    loadDewormingSheets.mockResolvedValue([]);
    saveDewormingSheet.mockResolvedValue(1);
    saveDewormingResults.mockResolvedValue("ready");
    approveDewormingSheet.mockResolvedValue(2);
    returnDewormingSheet.mockResolvedValue();
    uploadSheetPhoto.mockResolvedValue("1/sheet.jpg");
    addDewormingMonkey.mockResolvedValue(30);
    loadDewormingCalendar.mockResolvedValue({ events: [], sync: null });
    refreshDewormingCalendar.mockResolvedValue("0 deworming events");
    removeDewormingMonkey.mockResolvedValue();
    emailDewormingSheet.mockResolvedValue(["mark@vervet.za.org"]);
    sheetPhotoData.mockImplementation(async (paths) => paths.map(() => "data:image/jpeg;base64,QUJD"));
    sheetPhotoUrls.mockImplementation(async (paths) => Object.fromEntries(paths.map((p) => [p, `https://x/${p}`])));
});

describe("the groups", () => {
    test("each troop alone, each section's introcages (its block's too), and Global with its introcages", () => {
        const groups = dewormingGroups(ENCLOSURES, MONKEYS);
        expect(groups.map((g) => g.name)).toEqual([
            "D&D Troop",
            "Skrow Troop",
            "Top Section ICs",
            "Middle Section ICs",
            "Bottom Section ICs",
            "Global Troop",
        ]);
        const names = (key) => groups.find((g) => g.key === key).monkeys.map((m) => m.monkey.name);
        expect(names("troop:1")).toEqual(["Ash", "Meggy", "Oldie", "Tiny"]);
        // (by introcage, in the enclosures' order: D&D before the Bachelor Block)
        expect(names("ics:Top")).toEqual(["Sybil", "Leeloo"]);
        expect(names("enclosure:6")).toEqual(["Gia", "Gus"]);
    });
});

describe("a new sheet's starting point", () => {
    const groups = dewormingGroups(ENCLOSURES, MONKEYS);
    const dd = groups.find((g) => g.key === "troop:1");
    const top = groups.find((g) => g.key === "ics:Top");
    const today = new Date(2026, 10, 2);

    test("the next session in the cycle: 6-Month first, then its F/U, 3-Month, its F/U, and round again", () => {
        expect(nextSession([], "troop:1")).toBe("6_month");
        expect(nextSession([sheet(1, "6_month", "2026-05-01", [])], "troop:1")).toBe("6_month_fu");
        expect(nextSession([sheet(1, "6_month_fu", "2026-05-20", [])], "troop:1")).toBe("3_month");
        expect(
            nextSession([sheet(1, "3_month_fu", "2026-08-20", []), sheet(2, "3_month", "2026-08-01", [])], "troop:1")
        ).toBe("6_month");
    });

    // (who's ticked: { id: on })
    const ticks = (lines) => Object.fromEntries(Object.entries(lines).map(([id, l]) => [id, l.on]));

    test("6-Month: every monkey aged 3 or over (age unknown too); each with its last dewormer and dose", () => {
        const sheets = [
            sheet(1, "6_month", "2026-05-01", [line(1, "Albendazole", "1/4 tab"), line(2, "Milbeworm", "1/2 tab", 1)]),
        ];
        const lines = startingLines(dd, "6_month", sheets, today);
        expect(ticks(lines)).toEqual({ 1: true, 2: true, 3: false, 4: true });
        expect(lines[1]).toEqual({ on: true, medication: "Albendazole", dose: "1/4 tab", days: 3 });
        expect(lines[2]).toEqual({ on: true, medication: "Milbeworm", dose: "1/2 tab", days: 1 });
        expect(lines[4]).toEqual({ on: true, medication: "", dose: "", days: 3 });
    });

    test("3-Month and 6-Month F/U: only introcage monkeys aged 3 or over (they're dewormed every session)", () => {
        const sixMonth = [
            sheet(1, "6_month", "2026-05-01", [line(1, "Albendazole", "1/4 tab"), line(2, "Milbeworm", "1/2 tab", 1)]),
        ];
        expect(Object.values(startingLines(dd, "3_month", [], today)).some((l) => l.on)).toBe(false);
        expect(ticks(startingLines(top, "3_month", [], today))).toEqual({ 5: true, 6: true });
        // (a 6-Month F/U's few are chosen: each ready with the 6-Month's dewormer)
        const fu = startingLines(dd, "6_month_fu", sixMonth, today);
        expect(Object.values(fu).some((l) => l.on)).toBe(false);
        expect(fu[2]).toEqual({ on: false, medication: "Milbeworm", dose: "1/2 tab", days: 1 });
    });

    test("3-Month F/U: the 3-Month's monkeys, with the same dewormers", () => {
        const sheets = [
            sheet(1, "6_month", "2026-05-01", [line(1, "Albendazole", "1/4 tab"), line(2, "Milbeworm", "1/2 tab", 1)]),
            sheet(2, "3_month", "2026-08-01", [line(1, "Panacur", "1/2 tsp")]),
        ];
        const lines = startingLines(dd, "3_month_fu", sheets, today);
        expect(ticks(lines)).toEqual({ 1: true, 2: false, 3: false, 4: false });
        expect(lines[1]).toEqual({ on: true, medication: "Panacur", dose: "1/2 tsp", days: 3 });
        expect(lastDose(sheets, 1)).toEqual({ medication: "Panacur", dose: "1/2 tsp", days: 3 });
    });

    test("the paper sheet's short introcage names: Gol A, Bach B, Rob B1, Cal A; others as they are", () => {
        const place = (id, name, parentId = null) => ({ id, name, parentId, type: parentId ? "introcage" : "troop" });
        const enclosures = [
            place(1, "Goliath"), place(11, "Goliath A", 1), place(2, "Bachelor Block"), place(21, "Bachelor Block B", 2),
            place(3, "Robert"), place(31, "Robert B1", 3), place(4, "Engeltjie"), place(41, "Calypso's Corner A", 4),
            place(5, "Global"), place(51, "Global A", 5), place(6, "Jalamango"), place(61, "Jalamango A", 6),
        ];
        expect(shortIntrocage("Goliath A", enclosures)).toBe("Gol A");
        expect(shortIntrocage("Bachelor Block B", enclosures)).toBe("Bach B");
        expect(shortIntrocage("Robert B1", enclosures)).toBe("Rob B1");
        expect(shortIntrocage("Jalamango A", enclosures)).toBe("Jala A");
        // (Calypso's Corner: Cal, so the row fits on one line)
        expect(shortIntrocage("Calypso's Corner A", enclosures)).toBe("Cal A");
        expect(shortIntrocage("Global A", enclosures)).toBe("Global A");
        expect(shortIntrocage("Nowhere", enclosures)).toBe("Nowhere");
    });

    test("introcage sheets: by introcage in the sanctuary's order (Skrow, Robert, Skunkey, H&B, Jalamango), then by name", () => {
        const place = (id, name, sortOrder, parentId = null) => ({ id, name, sortOrder, parentId, type: parentId ? "introcage" : "troop" });
        const enclosures = [
            place(5, "Jalamango", 13), place(1, "Skrow", 9), place(4, "H&B", 12), place(2, "Robert", 10), place(3, "Skunkey", 11),
            place(51, "Jalamango A", 1, 5), place(11, "Skrow B", 2, 1), place(12, "Skrow A", 1, 1), place(21, "Robert B1", 1, 2),
            place(31, "Skunkey A", 1, 3), place(41, "H&B C1", 1, 4),
        ];
        const rank = introcageRanks(enclosures);
        const lines = [
            ["Zara", "Jalamango A"], ["Moss", "H&B C1"], ["Abe", "Skunkey A"], ["Kip", "Robert B1"], ["Bo", "Skrow B"], ["Al", "Skrow A"], ["Cal", "Skrow A"],
        ].map(([name, ic], i) => ({ ...line(i + 1, "Panacur", "1/2 tsp"), name, introcage: true, placeRank: rank(ic) }));
        expect(printOrder(lines).map((l) => l.name)).toEqual(["Al", "Cal", "Bo", "Kip", "Abe", "Moss", "Zara"]);
        expect(rank("Nowhere")).toBe(6);
    });

    test("the sheet's order: the troop by name, then introcages by name; added monkeys last in their part", () => {
        const lines = [
            { ...line(1, "Milbeworm", "1/2 tab", 1), name: "Zed", introcage: true },
            { ...line(2, "Milbemax", "1/2 tab", 1), name: "Abe" },
            { ...line(3, "Albendazole", "1/4 tab"), name: "Mo" },
            { ...line(4, "Albendazole", "1/4 tab"), name: "Bo", introcage: true },
            { ...line(5, "Panacur", "1/2 tsp"), name: "Al", kind: "added" },
            { ...line(6, "Panacur", "1/2 tsp"), name: "Cy", introcage: true, kind: "accidental" },
        ];
        expect(printOrder(lines).map((l) => l.name)).toEqual(["Abe", "Mo", "Al", "Bo", "Zed", "Cy"]);
        expect(sheetTitle(sheet(1, "6_month_fu", "2026-05-20", []))).toBe("D&D Troop 6-Month F/U Deworming");
    });
});

describe("the page", () => {
    test("Deworming is in Sections; no sheets yet", async () => {
        render(
            <RecordsPage route="records/sections" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter staff={EDITOR} />
        );
        expect(screen.getByRole("link", { name: /Deworming/ })).toHaveAttribute("href", "#records/sections/deworming");
    });

    test("Lists or Schedule: Outlook's dewormings, overdue first; lists open from it", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: new Date(2026, 10, 3, 9) });
        loadDewormingSheets.mockResolvedValue([sheet(1, "6_month", "2026-11-09", [line(1, "Albendazole", "1/4 tab")])]);
        loadDewormingCalendar.mockResolvedValue({
            events: [
                { uid: "a", title: "D&D 6m deworming", startsOn: "2026-11-10" },
                { uid: "b", title: "Skrow 3m F/U deworming", startsOn: "2026-11-20" },
                { uid: "c", title: "Global 3m deworming", startsOn: "2026-11-02" },
                // (before lists started in vervetDB: done on paper, not overdue)
                { uid: "e", title: "Skrow 6m deworming", startsOn: "2026-10-20" },
                { uid: "d", title: "Skrw 6m deworming", startsOn: "2026-12-01" },
            ],
            sync: { syncedAt: new Date(2026, 10, 3, 8, 50).toISOString(), ok: true, message: null, events: 4 },
        });
        const user = userEvent.setup();
        open(ADMIN);
        expect(await screen.findByRole("tab", { name: "Lists" })).toHaveAttribute("aria-selected", "true");
        await user.click(screen.getByRole("tab", { name: "Schedule" }));
        expect(screen.queryByRole("button", { name: "New Deworming List" })).toBeNull();
        // (at a glance: Overdue, This Week, each month; the groups with
        // nothing in Outlook or in progress and no date: No Date Yet. Middle
        // and Bottom have no introcage monkeys here, so nothing to deworm)
        const bucket = async (name) =>
            within(await screen.findByRole("region", { name }))
                .getAllByRole("listitem")
                .map((r) => r.textContent);
        expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual([
            "Overdue",
            "November 2026",
            "No Date Yet",
            "Other Scheduled Dewormings (Admin only)",
        ]);
        expect(await bucket("Overdue")).toEqual(["MON2NOVGlobal Troop 3-Month DewormingYesterdayPrevious: none foundOverdue, date TBC"]);
        expect(await bucket("November 2026")).toEqual([
            "TUE10NOVD&D Troop 6-Month DewormingIn 7 daysPrevious: none foundReady",
            "FRI20NOVSkrow Troop 3-Month F/U DewormingIn 2 weeks · No list yetPrevious: 6-Month Deworming 20th Oct 2026",
        ]);
        expect(screen.getByText("Not in calendar")).toHaveClass("Deworming-tag", "is-todo");
        expect(await bucket("No Date Yet")).toEqual([
            "?Top Section ICs 6-Month DewormingNo past deworming foundNot in calendar",
        ]);
        expect(screen.getByText("From Outlook, checked 10 minutes ago")).toBeInTheDocument();
        expect(screen.getByRole("region", { name: "Other Scheduled Dewormings" })).toHaveTextContent("Tue 1 Dec Skrw 6m deworming");
        // (the naming tips: hidden until asked for)
        const unreadList = within(screen.getByRole("region", { name: "Other Scheduled Dewormings" }));
        expect(unreadList.queryByText(/Write each title/)).toBeNull();
        await user.click(unreadList.getByRole("button", { name: "Show Naming Tips" }));
        expect(unreadList.getByText(/^Write each title in Outlook/)).toBeInTheDocument();
        await user.click(unreadList.getByRole("button", { name: "Hide Naming Tips" }));
        expect(unreadList.queryByText(/Write each title/)).toBeNull();
        await user.click(screen.getByRole("button", { name: "Refresh Now" }));
        await waitFor(() => expect(refreshDewormingCalendar).toHaveBeenCalled());
        // (a list's row opens it)
        await user.click(screen.getByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        expect(screen.getByRole("heading", { level: 1, name: "D&D Troop 6-Month Deworming" })).toBeInTheDocument();
        vi.useRealTimers();
    });

    test("Schedule for editors: no Refresh Now or Couldn't Read; before the SQL's run, says so", async () => {
        loadDewormingCalendar.mockResolvedValue({
            events: [{ uid: "d", title: "Skrw 6m deworming", startsOn: "2099-12-01" }],
            sync: {
                syncedAt: new Date().toISOString(),
                ok: false,
                message: "The calendar link didn't give a calendar (status 404)",
                events: null,
            },
        });
        const user = userEvent.setup();
        const { unmount } = open(EDITOR);
        await user.click(await screen.findByRole("tab", { name: "Schedule" }));
        // (nothing in Outlook to read; every group's next has no date found)
        expect(await screen.findByRole("region", { name: "No Date Yet" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Refresh Now" })).toBeNull();
        expect(screen.queryByRole("region", { name: "Other Scheduled Dewormings" })).toBeNull();
        expect(screen.queryByText(/status 404/)).toBeNull();
        unmount();

        loadDewormingCalendar.mockResolvedValue(null);
        open(ADMIN);
        await user.click(await screen.findByRole("tab", { name: "Schedule" }));
        expect(
            await screen.findByText("The schedule isn't ready yet: supabase/deworming-calendar.sql needs to be run.")
        ).toBeInTheDocument();
    });

    test("editors see the sheets and print them, but can't prepare, edit or delete", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [line(2, "Milbeworm", "1/2 tab", 1), line(1, "Albendazole", "1/4 tab")]),
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        expect(screen.queryByRole("button", { name: "New Deworming List" })).toBeNull();
        // (the sheet's name is the page's title, as Monitoring's; the way back: Deworming Lists)
        expect(screen.getByRole("heading", { level: 1, name: "D&D Troop 6-Month Deworming" })).toBeInTheDocument();
        const page = within(screen.getByRole("region", { name: "D&D Troop 6-Month Deworming" }));
        // (above the title, in the breadcrumbs' place)
        expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
        expect(screen.getByRole("button", { name: "Deworming Lists" })).toHaveClass("RecordsPage-back");
        expect(page.getByText(/prepared by Mark Fergus/)).toHaveTextContent(
            "Started on Mon 2 Nov · 2 monkeys · Ready · prepared by Mark Fergus"
        );
        // (by dewormer: Albendazole first)
        expect(
            page
                .getAllByRole("row")
                .slice(1)
                .map((r) => r.textContent)
        ).toEqual(["Ash1/4 tab Albendazole3 days", "Meggy1/2 tab Milbeworm1 day"]);
        expect(page.queryByRole("button", { name: "Edit" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Deworming Lists" }));
        expect(screen.getByRole("heading", { level: 1, name: "Deworming" })).toBeInTheDocument();
        expect(screen.getByRole("navigation", { name: "Breadcrumb" })).toBeInTheDocument();
        // (on the list: Download PDF for everyone, Delete for admins only)
        const row = within(screen.getByRole("listitem"));
        expect(row.getByRole("button", { name: "Download PDF" })).toBeInTheDocument();
        expect(row.queryByRole("button", { name: "Delete" })).toBeNull();
    });

    test("a list's start: Starts while it's ahead, Started on once it's passed", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2099-01-05", [line(1, "Albendazole", "1/4 tab")]),
            sheet(2, "3_month", "2026-11-02", [line(1, "Albendazole", "1/4 tab")]),
        ]);
        open(ADMIN);
        expect(await screen.findByRole("button", { name: /6-Month Deworming/ })).toHaveTextContent(/Starts Mon 5 Jan/);
        expect(screen.getByRole("button", { name: /3-Month Deworming/ })).toHaveTextContent(/Started on Mon 2 Nov/);
    });

    test("On different schedule: under the sheet, by name; ticked again, it's off", async () => {
        expect(differentScheduleText({ differentSchedule: [4, 2, 99] }, [{ id: 2, name: "Pantshula" }, { id: 4, name: "Barry" }])).toBe(
            "On different schedule: Barry, Pantshula."
        );
        expect(differentScheduleText({ differentSchedule: [] }, [])).toBeNull();
        expect(differentScheduleText({}, [])).toBeNull();
    });

    test("Download PDF: the paper sheet", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month_fu", "2026-11-20", [line(1, "Albendazole", "1/4 tab")]),
        ]);
        URL.createObjectURL = vi.fn(() => "blob:test");
        URL.revokeObjectURL = vi.fn();
        const names = [];
        vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
            names.push(this.download);
        });
        const user = userEvent.setup();
        open(EDITOR);
        // (from the list, without opening it)
        await user.click(await screen.findByRole("button", { name: "Download PDF" }));
        await waitFor(() => expect(names).toEqual(["deworming_D_D_Troop_6_Month_F_U_2026-11-20.pdf"]));
    });

    test("New Custom List: a title of its own, monkeys searched for and added, then saved as custom", async () => {
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "New Custom List" }));
        const form = within(screen.getByRole("region", { name: "New Custom List" }));
        // (no group or session: a title instead, and no one on it yet)
        expect(form.queryByLabelText("Group")).not.toBeInTheDocument();
        expect(form.queryByLabelText("Session")).not.toBeInTheDocument();
        expect(form.getByText("0 of 0 ticked")).toBeInTheDocument();
        await user.click(form.getByRole("button", { name: "Save List" }));
        expect(form.getByRole("alert")).toHaveTextContent("Please give the list a title.");
        await user.type(form.getByLabelText("Title"), "Full Moon Deworming");
        await user.type(form.getByLabelText("Add Monkey"), "meg");
        await user.click(form.getByRole("button", { name: /^Meggy/ }));
        expect(form.getByLabelText("Add Monkey")).toHaveValue("");
        expect(form.getByRole("checkbox", { name: "Meggy" })).toBeChecked();
        await user.selectOptions(form.getByLabelText("Dewormer for Meggy"), "Milbeworm");
        await user.click(form.getByRole("button", { name: "Save List" }));
        await waitFor(() => expect(saveDewormingSheet).toHaveBeenCalled());
        const saved = saveDewormingSheet.mock.calls[0][0];
        expect(saved).toMatchObject({
            groupName: "Full Moon Deworming",
            session: "custom",
            lines: [{ monkeyId: 2, medication: "Milbeworm", dose: "1/2 tab", days: 1 }],
        });
        expect(saved.groupKey).toMatch(/^custom:\d+$/);
    });

    test("a custom list's title and records: its own words", () => {
        const custom = { ...sheet(9, "custom", "2026-11-10", []), groupName: "Full Moon Deworming" };
        expect(sheetTitle(custom)).toBe("Full Moon Deworming");
        expect(recordText("custom", withDoses(line(1, "Milbeworm", "1/2 tab", 1), { 1: "full" }), "Full Moon Deworming")).toBe(
            "Full Moon Deworming - 1/2 tab Milbeworm, one dose only"
        );
    });

    test("Prepare Sheet: the group's next session, its adults ticked, a dewormer and dose each, then saved", async () => {
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "New Deworming List" }));
        const form = within(screen.getByRole("region", { name: "New Deworming List" }));
        expect(form.getByLabelText("Group")).toHaveDisplayValue("D&D Troop");
        expect(form.getByLabelText("Session")).toHaveDisplayValue("6-Month");
        expect(form.getByLabelText("Instructions (printed under the title)")).toHaveValue(
            "Add 2 drops milk thistle & protexin to each dose (Albendazole also needs 2 drops flax oil)."
        );
        // (Tiny is 1: not ticked)
        expect(form.getByRole("checkbox", { name: "Tiny" })).not.toBeChecked();
        expect(form.getByText("3 of 4 ticked")).toBeInTheDocument();
        // (Tiny, not ticked: On different schedule; only the unticked have it)
        expect(form.queryByRole("checkbox", { name: "Ash: On different schedule" })).not.toBeInTheDocument();
        await user.click(form.getByRole("checkbox", { name: "Tiny: On different schedule" }));

        // nothing chosen yet: asked for
        await user.click(form.getByRole("button", { name: "Save List" }));
        expect(form.getByRole("alert")).toHaveTextContent("Please choose a dewormer and dose for Ash, Meggy, Oldie.");

        // Set All To, then Meggy on Milbeworm (1 day) and Oldie on another typed in
        // (each dewormer's usual dose fills in: Albendazole 1/4 tab, Milbeworm 1/2 tab)
        await user.selectOptions(form.getByLabelText("Dewormer for all"), "Albendazole");
        expect(form.getByLabelText("Amount for all")).toHaveDisplayValue("1/4");
        await user.click(form.getByRole("button", { name: "Apply To Ticked" }));
        await user.selectOptions(form.getByLabelText("Dewormer for Meggy"), "Milbeworm");
        expect(form.getByLabelText("Dose for Meggy")).toHaveDisplayValue("1/2");
        expect(form.getByLabelText("Unit for Meggy")).toHaveDisplayValue("tab");
        await user.selectOptions(form.getByLabelText("Dewormer for Ash"), "Pyrantel");
        expect(form.getByLabelText("Dose for Ash")).toHaveDisplayValue("1/16");
        expect(form.getByLabelText("Unit for Ash")).toHaveDisplayValue("tsp");
        await user.selectOptions(form.getByLabelText("Dewormer for Ash"), "Albendazole");
        await user.selectOptions(form.getByLabelText("Dewormer for Oldie"), "Other…");
        await user.type(form.getByLabelText("Other dewormer for Oldie"), "Milbemax");
        await user.selectOptions(form.getByLabelText("Days for Oldie"), "1 day");
        await user.click(form.getByRole("button", { name: "Save List" }));

        await waitFor(() => expect(saveDewormingSheet).toHaveBeenCalled());
        expect(saveDewormingSheet.mock.calls[0][0]).toMatchObject({
            id: undefined,
            groupKey: "troop:1",
            groupName: "D&D Troop",
            session: "6_month",
            differentSchedule: [3],
            lines: [
                { monkeyId: 1, medication: "Albendazole", dose: "1/4 tab", days: 3 },
                { monkeyId: 2, medication: "Milbeworm", dose: "1/2 tab", days: 1 },
                { monkeyId: 4, medication: "Milbemax", dose: "1/4 tab", days: 1 },
            ],
        });
        // (back to the list, reloaded)
        await waitFor(() => expect(loadDewormingSheets).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole("button", { name: "New Deworming List" })).toBeInTheDocument();
    });

    test("a 6-Month F/U: the few are ticked, each ready with its 6-Month dewormer", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [line(1, "Albendazole", "1/4 tab"), line(2, "Milbeworm", "1/2 tab", 1)]),
        ]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "New Deworming List" }));
        const form = within(screen.getByRole("region", { name: "New Deworming List" }));
        expect(form.getByLabelText("Session")).toHaveDisplayValue("6-Month F/U");
        expect(form.getByText("0 of 4 ticked")).toBeInTheDocument();
        await user.click(form.getByRole("checkbox", { name: "Ash" }));
        expect(form.getByLabelText("Dewormer for Ash")).toHaveDisplayValue("Albendazole");
        expect(form.getByLabelText("Dose for Ash")).toHaveDisplayValue("1/4");
        // another group: its own monkeys and next session
        await user.selectOptions(form.getByLabelText("Group"), "Top Section ICs");
        expect(form.getByLabelText("Session")).toHaveDisplayValue("6-Month");
        expect(form.getByText("2 of 2 ticked")).toBeInTheDocument();
    });

    test("a new list starts as Outlook's deworming for it; another session's flagged, and saving it confirms", async () => {
        const d = new Date();
        const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        loadDewormingCalendar.mockResolvedValue({
            events: [{ uid: "a", title: "D&D 3m deworming", startsOn: today }],
            sync: null,
        });
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "New Deworming List" }));
        const form = within(screen.getByRole("region", { name: "New Deworming List" }));
        await waitFor(() => expect(form.getByLabelText("Session")).toHaveDisplayValue("3-Month"));
        expect(form.queryByRole("status")).toBeNull();
        expect(form.getByRole("button", { name: "Save List" })).toBeInTheDocument();
        // (a 6-Month instead: flagged once, and the button says so)
        await user.selectOptions(form.getByLabelText("Session"), "6-Month");
        expect(form.getByRole("status")).toHaveTextContent(
            /^Outlook has D&D Troop 3-Month Deworming on .+\. This list is a 6-Month\. Please check before saving\.$/
        );
        await user.selectOptions(form.getByLabelText("Dewormer for all"), "Albendazole");
        await user.click(form.getByRole("button", { name: "Apply To Ticked" }));
        await user.click(form.getByRole("button", { name: "Save 6-Month Anyway" }));
        await waitFor(() => expect(saveDewormingSheet).toHaveBeenCalled());
        expect(saveDewormingSheet.mock.calls[0][0]).toMatchObject({ groupKey: "troop:1", session: "6_month" });
    });

    test("admins edit and delete a sheet (Delete asked first, in red)", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(7, "3_month", "2026-11-02", [line(5, "Panacur", "1/2 tsp")], {
                groupKey: "ics:Top",
                groupName: "Top Section ICs",
            }),
        ]);
        deleteDewormingSheet.mockResolvedValue();
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /Top Section ICs 3-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Edit" }));
        const form = within(screen.getByRole("region", { name: "Edit List" }));
        expect(form.getByRole("checkbox", { name: "Sybil" })).toBeChecked();
        expect(form.getByRole("checkbox", { name: "Leeloo" })).not.toBeChecked();
        await user.selectOptions(form.getByLabelText("Dose for Sybil"), "3/4");
        await user.click(form.getByRole("button", { name: "Save List" }));
        // (not Panacur's usual 1/2 tsp: checked first)
        const check = within(form.getByRole("alertdialog", { name: "Check these doses" }));
        expect(check.getByRole("listitem")).toHaveTextContent("Sybil: 3/4 tsp Panacur (usually 1/2 tsp)");
        expect(saveDewormingSheet).not.toHaveBeenCalled();
        await user.click(check.getByRole("button", { name: "Save Anyway" }));
        await waitFor(() => expect(saveDewormingSheet).toHaveBeenCalled());
        expect(saveDewormingSheet.mock.calls[0][0]).toMatchObject({
            id: 7,
            groupKey: "ics:Top",
            session: "3_month",
            lines: [{ monkeyId: 5, medication: "Panacur", dose: "3/4 tsp", days: 3 }],
        });

        // (back on the sheet; then on the list) Delete
        await user.click(await screen.findByRole("button", { name: "Deworming Lists" }));
        await user.click(await screen.findByRole("button", { name: "Delete" }));
        const ask = screen.getByRole("dialog", { name: "Delete this list?" });
        expect(within(ask).getByRole("button", { name: "Confirm" })).toHaveClass("is-danger");
        await user.click(within(ask).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(deleteDewormingSheet).toHaveBeenCalledWith(7));
    });

    test("before deworming.sql is run: says so", async () => {
        loadDewormingSheets.mockRejectedValue(
            new Error("Deworming isn't ready yet: supabase/deworming.sql needs to be run.")
        );
        open(ADMIN);
        expect(await screen.findByRole("alert")).toHaveTextContent("supabase/deworming.sql needs to be run");
    });
});

// A monkey's line with its doses: { day: result } or { day: { result, … } }
const withDoses = (base, doses) => ({
    ...base,
    doses: Object.fromEntries(Object.entries(doses).map(([d, x]) => [d, typeof x === "string" ? { result: x } : x])),
});

describe("the dose rules", () => {
    const alb = line(1, "Albendazole", "1/4 tab");
    const pan = line(2, "Panacur", "1/2 tsp");
    const mil = line(3, "Milbeworm", "1/2 tab", 1);

    test("Milbeworm: done after one dose", () => {
        expect(dayAdvice(withDoses(mil, { 1: "full" }), 2)).toEqual({
            text: "Finished course: one dose on Day 1",
            done: true,
        });
        expect(dayAdvice(withDoses(mil, { 1: "none" }), 2)).toBeNull();
    });

    test("3 days in a row: done", () => {
        expect(dayAdvice(withDoses(alb, { 1: "full", 2: "full", 3: "full" }), 4)).toEqual({
            text: "Finished course: 3 days in a row",
            done: true,
        });
    });

    test("Albendazole: a missed Day 2 after one dose finishes as one dose; after two, a choice", () => {
        expect(dayAdvice(withDoses(alb, { 1: "full", 2: "none" }), 3)).toMatchObject({
            done: true,
            text: "Finished course as missed dose on Day 2",
        });
        expect(dayAdvice(withDoses(alb, { 1: "full", 2: "full", 3: "1/2" }), 4)).toMatchObject({
            warn: true,
            text: "Missed Day 3 after 2 doses: switch to Milbeworm, or finish here?",
        });
    });

    test("Panacur: needs all 3 days", () => {
        expect(dayAdvice(withDoses(pan, { 1: "full", 2: "none" }), 3)).toMatchObject({
            warn: true,
            text: "Missed Day 2: Panacur needs 3 days in a row. Restart, or switch to Milbeworm?",
        });
    });

    test("a switch to Milbeworm on Day 3 finishes on time", () => {
        const switched = withDoses(pan, {
            1: "full",
            2: "none",
            3: { result: "full", medication: "Milbeworm", dose: "1/2 tab" },
        });
        expect(dayAdvice(switched, 4)).toEqual({ text: "Finished course: one dose on Day 3", done: true });
    });
});

describe("the records' words", () => {
    test("as the old records were written", () => {
        expect(recordText("6_month", withDoses(line(3, "Milbeworm", "1/2 tab", 1), { 1: "full" }))).toBe(
            "6-Month - 1/2 tab Milbeworm, one dose only"
        );
        expect(
            recordText("3_month_fu", withDoses(line(2, "Panacur", "1/2 tsp"), { 1: "full", 2: "full", 3: "full" }))
        ).toBe("3-Month F/U - 1/2 tsp Panacur, once a day for 3 days");
        expect(
            recordText(
                "6_month_fu",
                withDoses(line(1, "Albendazole", "1/4 tab"), { 1: "none", 2: "full", 3: "skipped" })
            )
        ).toBe("6-Month F/U - 1/4 tab Albendazole, took one dose on Day 2 only");
    });

    test("a late Day 1 (Days 2–4), partial doses, a switch, and nothing taken", () => {
        expect(
            recordText(
                "6_month",
                withDoses(line(1, "Albendazole", "1/4 tab"), { 1: "none", 2: "full", 3: "full", 4: "full" })
            )
        ).toBe("6-Month - 1/4 tab Albendazole, once a day for 3 days (Day 2–4, missed dose on Day 1)");
        expect(recordText("6_month", withDoses(line(1, "Albendazole", "1/4 tab"), { 1: "full", 2: "3/4" }))).toBe(
            "6-Month - 1/4 tab Albendazole, took one dose on Day 1 only; 3/4 dose on Day 2"
        );
        expect(
            recordText(
                "6_month",
                withDoses(line(2, "Panacur", "1/2 tsp"), {
                    1: "full",
                    2: "none",
                    3: { result: "full", medication: "Milbeworm", dose: "1/2 tab" },
                })
            )
        ).toBe("6-Month - 1/2 tsp Panacur on Day 1, missed Day 2, then 1/2 tab Milbeworm on Day 3");
        // (no day missed between: straight on)
        expect(
            recordText(
                "6_month",
                withDoses(line(2, "Panacur", "1/2 tsp"), {
                    1: "full",
                    2: { result: "full", medication: "Milbeworm", dose: "1/2 tab" },
                })
            )
        ).toBe("6-Month - 1/2 tsp Panacur on Day 1, then 1/2 tab Milbeworm on Day 2");
        expect(recordText("3_month", withDoses(line(1, "Albendazole", "1/4 tab"), { 1: "none" }))).toBe(
            "3-Month - 1/4 tab Albendazole, not taken"
        );
    });
});

describe("the WhatsApp summary", () => {
    const h_b = { ...sheet(1, "3_month", "2026-11-02", []), groupName: "H&B Troop" };
    test("everyone took it", () => {
        const lines = [withDoses({ ...line(1, "Albendazole", "1/4 tab"), name: "Ash" }, { 2: "full" })];
        expect(daySummary(h_b, lines, 2)).toBe("*H&B Troop 3-Month Deworming*\n_Day 2_\n✅ All took");
        expect(daySummary(h_b, lines, 3)).toBeNull();
    });

    test("who didn't, then partials, skips (with why), switches and the day's note", () => {
        const named = (id, name, medication, doses) => withDoses({ ...line(id, medication, "1/4 tab"), name }, doses);
        const lines = [
            named(1, "Sybil", "Albendazole", { 3: "none" }),
            named(2, "Leeloo", "Albendazole", { 3: "none" }),
            named(3, "Minkey", "Albendazole", { 3: "3/4" }),
            named(4, "Shanti-Ray", "Albendazole", { 3: { result: "skipped", note: "missed day 2 doses" } }),
            named(5, "Toru", "Albendazole", { 3: { result: "skipped", note: "missed day 2 doses" } }),
            named(6, "Laser", "Panacur", {
                3: { result: "full", food: "BS", medication: "Milbeworm", dose: "1/2 tab" },
            }),
            named(7, "Ash", "Albendazole", { 3: "full" }),
            // (missed Day 2 after one dose: course finished, nothing given on Day 3)
            named(8, "Bowie", "Albendazole", { 1: "full", 2: "none" }),
        ];
        expect(
            daySummary({ ...h_b, groupName: "Middle Section ICs", session: "6_month" }, lines, 3, " Rainy morning ")
        ).toBe(
            [
                "*Middle Section ICs 6-Month Deworming*",
                "_Day 3_",
                "All took except Sybil and Leeloo",
                "",
                "🐒 Minkey only got 3/4 dose today",
                "🐒 Shanti-Ray and Toru skipped today (missed day 2 doses)",
                "🐒 Bowie didn't get a dose as they missed Day 2",
                "🐒 Laser changed to Milbeworm",
                "Rainy morning",
            ].join("\n")
        );
    });
});

describe("completing a sheet", () => {
    const ready = () =>
        sheet(1, "6_month", "2026-11-02", [
            { id: 11, ...line(1, "Albendazole", "1/4 tab"), doses: {} },
            { id: 12, ...line(2, "Milbeworm", "1/2 tab", 1), doses: {} },
        ]);

    test("editors record a day (result, food, note), copy its summary and save", async () => {
        loadDewormingSheets.mockResolvedValue([ready()]);
        // (after userEvent.setup: it brings its own clipboard)
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        expect(screen.getByText("Ready")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        expect(form.getByText("Save results and copy a summary to share in Team Chat.")).toBeInTheDocument();
        // (Day 1–3: no Day 4 for now)
        expect(form.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Day 1", "Day 2", "Day 3"]);
        expect(form.getByRole("tab", { name: "Day 1" })).toHaveAttribute("aria-selected", "true");
        await user.click(within(form.getByRole("group", { name: "Ash: Day 1" })).getByRole("button", { name: "Full" }));
        await user.selectOptions(form.getByLabelText("Food for Ash"), "Banana");
        // (a partial dose: one drop-down; None is "Miss")
        expect(
            within(form.getByRole("group", { name: "Meggy: Day 1" }))
                .getAllByRole("button")
                .map((b) => b.textContent)
        ).toEqual(["Full", "Miss", "Skipped"]);
        await user.selectOptions(form.getByLabelText("Partial dose for Meggy"), "3/4");
        expect(form.getByLabelText("Partial dose for Meggy")).toHaveClass("is-on");
        await user.selectOptions(form.getByLabelText("Food for Meggy"), "Other…");
        await user.type(form.getByLabelText("Other food for Meggy"), "Grape");
        await user.click(form.getByRole("button", { name: "Copy Day 1 Summary" }));
        expect(writeText).toHaveBeenCalledWith(
            "*D&D Troop 6-Month Deworming*\n_Day 1_\n✅ All took\n\n🐒 Meggy only got 3/4 dose today"
        );
        expect(await form.findByRole("button", { name: "Copied!" })).toBeInTheDocument();

        // Day 2 opens once Day 1 is saved complete
        expect(form.getByRole("tab", { name: "Day 2" })).toBeDisabled();
        await user.type(form.getByLabelText("Staff Member(s)"), "Sam");
        await user.click(form.getByRole("button", { name: "Save Day 1" }));
        // (the button says so: no line)
        expect(await form.findByRole("button", { name: "Saved!" })).toBeInTheDocument();
        expect(form.queryByRole("status")).toBeNull();
        // (copying after: still Saved!, nothing's changed)
        await user.click(form.getByRole("button", { name: "Copy Day 1 Summary" }));
        expect(await form.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
        expect(form.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
        // (copied again: a moment's "Copying…", then Copied! again)
        await user.click(form.getByRole("button", { name: "Copied!" }));
        expect(form.getByRole("button", { name: "Copying…" })).toBeDisabled();
        expect(await form.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
        expect(writeText).toHaveBeenCalledTimes(3);
        const [id, saved] = saveDewormingResults.mock.calls[0];
        expect(id).toBe(1);
        expect(saved).toMatchObject({
            startedOn: "2026-11-02",
            staffNames: "Sam",
            submit: false,
            photos: [],
            daysDone: [1],
        });
        expect(saved.lines.map((l) => l.doses)).toEqual([
            { 1: { result: "full", food: "Banana", note: null } },
            { 1: { result: "3/4", food: "Grape", note: null } },
        ]);
        expect(form.getByRole("tab", { name: "Day 1 (complete)" })).toBeInTheDocument();
        await user.click(form.getByRole("tab", { name: "Day 2" }));
        // (Meggy's Milbeworm: 3/4 isn't a dose, so not done yet; Day 3 still shut)
        expect(form.getByRole("group", { name: "Meggy: Day 2" })).toBeInTheDocument();
        expect(form.getByRole("tab", { name: "Day 3" })).toBeDisabled();
        // (no photo or Submit until all 3 days are complete)
        expect(form.queryByRole("region", { name: "Finish" })).toBeNull();

        // saved with someone still to do: saved, not complete
        await user.click(within(form.getByRole("group", { name: "Ash: Day 2" })).getByRole("button", { name: "Full" }));
        await user.click(form.getByRole("button", { name: "Save Day 2" }));
        expect(await form.findByRole("status")).toHaveTextContent(
            "Day 2 isn't complete yet: Meggy still needs a result."
        );
        expect(form.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
        expect(saveDewormingResults.mock.calls[1][1].daysDone).toEqual([1]);
        // (anything changed: Save again)
        await user.click(
            within(form.getByRole("group", { name: "Meggy: Day 2" })).getByRole("button", { name: "Full" })
        );
        expect(form.getByRole("button", { name: "Save Day 2" })).toBeInTheDocument();
        expect(form.queryByRole("status")).toBeNull();
        expect(form.getByRole("tab", { name: "Day 3" })).toBeDisabled();
    });

    test("coming back: a saved day says Saved!; a new day, Save", async () => {
        const full = { result: "full", food: "JS" };
        loadDewormingSheets.mockResolvedValue([
            {
                ...ready(),
                daysDone: [1],
                lines: [
                    { id: 11, ...line(1, "Albendazole", "1/4 tab"), doses: { 1: full, 2: full } },
                    { id: 12, ...line(2, "Milbeworm", "1/2 tab", 1), doses: { 1: full } },
                ],
            },
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        // (Day 2: Ash saved, Meggy's done with her Milbeworm: but not saved complete)
        expect(form.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
        expect(form.getByRole("button", { name: "Save Day 2" })).toBeInTheDocument();
        await user.click(form.getByRole("tab", { name: "Day 1 (complete)" }));
        expect(form.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
        await user.selectOptions(form.getByLabelText("Food for Ash"), "Banana");
        expect(form.getByRole("button", { name: "Save Day 1" })).toBeInTheDocument();
    });

    test("Enter Anyway on a monkey that's done; Reset puts it back to just the advice", async () => {
        loadDewormingSheets.mockResolvedValue([
            {
                ...ready(),
                daysDone: [1, 2],
                lines: [
                    {
                        id: 11,
                        ...line(1, "Albendazole", "1/4 tab"),
                        doses: { 1: { result: "full" }, 2: { result: "none" } },
                    },
                ],
            },
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        expect(form.getByText("Finished course as missed dose on Day 2")).toBeInTheDocument();
        await user.click(form.getByRole("button", { name: "Enter Anyway" }));
        expect(form.getByRole("group", { name: "Ash: Day 3" })).toBeInTheDocument();
        await user.click(within(form.getByRole("group", { name: "Ash: Day 3" })).getByRole("button", { name: "Full" }));
        await user.click(form.getByRole("button", { name: "Reset Ash" }));
        expect(form.queryByRole("group", { name: "Ash: Day 3" })).toBeNull();
        expect(form.getByRole("button", { name: "Enter Anyway" })).toBeInTheDocument();
    });

    test("Change Dewormer: a pop-up from the row's edit icon; Reset clears the row's day", async () => {
        loadDewormingSheets.mockResolvedValue([ready()]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        // (nothing entered yet: no Reset)
        expect(form.getByRole("button", { name: "Reset Ash" })).toBeDisabled();

        await user.click(form.getByRole("button", { name: "Change dewormer for Ash" }));
        const pop = within(screen.getByRole("dialog", { name: "Change Dewormer: Ash" }));
        expect(pop.getByText("From Day 1 on, instead of 1/4 tab Albendazole.")).toBeInTheDocument();
        await user.selectOptions(pop.getByLabelText("New dewormer"), "Milbeworm");
        // (its usual dose)
        expect(pop.getByLabelText("New dose")).toHaveDisplayValue("1/2");
        await user.click(pop.getByRole("button", { name: "Save" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(form.getByText("1/2 tab Milbeworm (changed)")).toBeInTheDocument();
        await user.click(within(form.getByRole("group", { name: "Ash: Day 1" })).getByRole("button", { name: "Full" }));

        await user.click(form.getByRole("button", { name: "Save Day 1" }));
        await waitFor(() => expect(saveDewormingResults).toHaveBeenCalled());
        expect(saveDewormingResults.mock.calls[0][1].lines[0].doses).toEqual({
            1: { result: "full", medication: "Milbeworm", dose: "1/2 tab", food: null, note: null },
        });

        // Reset: the day's entry gone (the change too)
        await user.click(form.getByRole("button", { name: "Reset Ash" }));
        expect(form.getByText("1/4 tab Albendazole · 1st dose")).toBeInTheDocument();
        expect(
            within(form.getByRole("group", { name: "Ash: Day 1" })).getByRole("button", { name: "Full" })
        ).toHaveAttribute("aria-pressed", "false");
    });

    test("the sheet's page: Enter Results, then Add Photo once every day's complete, then Submit", async () => {
        const full = { result: "full", food: "JS" };
        let current = {
            ...ready(),
            daysDone: [1, 2],
            lines: [
                { id: 11, ...line(1, "Albendazole", "1/4 tab"), doses: { 1: full, 2: full } },
                { id: 12, ...line(2, "Milbeworm", "1/2 tab", 1), doses: { 1: full } },
            ],
        };
        loadDewormingSheets.mockImplementation(async () => [current]);
        saveDewormingResults.mockImplementation(async (id, results) => {
            current = { ...current, photos: results.photos, status: results.submit ? "submitted" : "ready" };
            return current.status;
        });
        const user = userEvent.setup();
        const { unmount } = open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        expect(
            screen.getByText(
                "Enter Results at the end of each day. When all days are complete, upload a photo of the completed sheet and press Submit to finalise deworming."
            )
        ).toBeInTheDocument();
        // (Day 3 not complete: Add Photo and Submit wait)
        expect(screen.getByLabelText("Add Photo")).toBeDisabled();
        expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
        unmount();

        current = {
            ...current,
            daysDone: [1, 2, 3],
            lines: [{ ...current.lines[0], doses: { 1: full, 2: full, 3: full } }, current.lines[1]],
        };
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        // (no Finish inside Enter Results any more)
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Close" }));
        // (no photo yet: Submit can't be pressed, and no tick)
        expect(screen.getByLabelText("Add Photo")).toBeEnabled();
        expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
        expect(screen.queryByRole("img", { name: "Photo added" })).toBeNull();

        await user.upload(screen.getByLabelText("Add Photo"), new File(["x"], "sheet.jpg", { type: "image/jpeg" }));
        await waitFor(() => expect(saveDewormingResults).toHaveBeenCalled());
        expect(saveDewormingResults.mock.calls[0][1]).toMatchObject({ submit: false, photos: ["1/sheet.jpg"] });
        expect(await screen.findByRole("img", { name: "Paper copy, photo 1" })).toHaveAttribute(
            "src",
            "https://x/1/sheet.jpg"
        );
        expect(screen.getByRole("img", { name: "Photo added" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Submit" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleName(
            "Submit for approval? Only an admin can change it after."
        );
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saveDewormingResults).toHaveBeenCalledTimes(2));
        expect(saveDewormingResults.mock.calls[1][1]).toMatchObject({
            submit: true,
            photos: ["1/sheet.jpg"],
            daysDone: [1, 2, 3],
        });
        // (submitted: waiting for approval, no more Submit; the photo's emailed on Approve, not now)
        expect(await screen.findByText("Waiting for Approval")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
        expect(emailDewormingSheet).not.toHaveBeenCalled();
    });

    test("Approve still goes through if the photo email fails", async () => {
        emailDewormingSheet.mockRejectedValue(new Error("offline"));
        vi.spyOn(console, "error").mockImplementation(() => {});
        loadDewormingSheets.mockResolvedValue([{ ...ready(), status: "submitted", photos: ["1/a.jpg"] }]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Approve" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(emailDewormingSheet).toHaveBeenCalled());
        await waitFor(() => expect(loadDewormingSheets).toHaveBeenCalledTimes(2));
        expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/Emailing the photo/), expect.any(Error));
        console.error.mockRestore();
    });

    test("an approved sheet not emailed: admins see so, and Email Sheet sends it; a failure's shown", async () => {
        const sheet = { ...ready(), status: "approved", photos: ["1/a.jpg"], photoEmailedAt: null };
        loadDewormingSheets.mockResolvedValue([sheet]);
        emailDewormingSheet.mockRejectedValueOnce(new Error("The email couldn't be sent."));
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        expect(screen.getByText("Sheet not emailed yet.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Email Sheet" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("The email couldn't be sent.");

        // Sent: it says when, and offers it again
        loadDewormingSheets.mockResolvedValue([{ ...sheet, photoEmailedAt: "2026-11-07T10:00:00Z" }]);
        await user.click(screen.getByRole("button", { name: "Email Sheet" }));
        expect(await screen.findByText(/^Sheet emailed .* 7 Nov\.$/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Email Again" })).toBeInTheDocument();
        expect(emailDewormingSheet).toHaveBeenCalledTimes(2);
    });

    test("staff don't get Email Sheet", async () => {
        loadDewormingSheets.mockResolvedValue([{ ...ready(), status: "approved", photos: ["1/a.jpg"], photoEmailedAt: null }]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        expect(screen.queryByRole("button", { name: "Email Sheet" })).not.toBeInTheDocument();
    });

    test("an admin changing a submitted sheet: Save, no Submit (it's waiting for Approve)", async () => {
        const full = { result: "full", food: "JS" };
        loadDewormingSheets.mockResolvedValue([
            {
                ...ready(),
                status: "submitted",
                daysDone: [1, 2, 3],
                photos: ["1/sheet.jpg"],
                lines: [
                    { id: 11, ...line(1, "Albendazole", "1/4 tab"), doses: { 1: full, 2: full, 3: full } },
                    { id: 12, ...line(2, "Milbeworm", "1/2 tab", 1), doses: { 1: full } },
                ],
            },
        ]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Edit Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        expect(form.queryByRole("region", { name: "Finish" })).toBeNull();
        expect(form.queryByRole("button", { name: "Submit" })).toBeNull();
        // (opened: Day 3 as saved; a change, then Save)
        expect(form.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
        await user.type(form.getByLabelText("Note for Day 3 (added to the summary)"), "Checked by admin");
        await user.click(form.getByRole("button", { name: "Save Day 3" }));
        await waitFor(() => expect(saveDewormingResults).toHaveBeenCalled());
        expect(saveDewormingResults.mock.calls[0][1].submit).toBe(false);
    });

    test("a submitted sheet: editors wait; admins check each record, then Approve", async () => {
        const submitted = {
            ...ready(),
            status: "submitted",
            submittedByName: "Sam Smith",
            startedOn: "2026-11-03",
            photos: ["1/sheet.jpg"],
            lines: [
                {
                    id: 11,
                    ...line(1, "Albendazole", "1/4 tab"),
                    doses: { 1: { result: "full", food: "Banana" }, 2: { result: "none" } },
                },
                { id: 12, ...line(2, "Milbeworm", "1/2 tab", 1), doses: { 1: { result: "full", food: "JS" } } },
            ],
        };
        loadDewormingSheets.mockResolvedValue([submitted]);
        const user = userEvent.setup();
        const { unmount } = open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        expect(screen.getByText("Waiting for Approval")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /Results/ })).toBeNull();
        expect(screen.queryByRole("region", { name: "Review" })).toBeNull();
        // (the results, day by day, and the photo)
        expect(screen.getAllByRole("row")[1]).toHaveTextContent("Ash✓ Banana✗1/4 tab Albendazole");
        expect(await screen.findByRole("img", { name: "Paper copy, photo 1" })).toBeInTheDocument();
        unmount();

        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        const review = within(screen.getByRole("region", { name: "Review" }));
        expect(review.getByLabelText("Ash")).toHaveValue("6-Month - 1/4 tab Albendazole, took one dose on Day 1 only");
        expect(review.getByLabelText("Meggy")).toHaveValue("6-Month - 1/2 tab Milbeworm, one dose only");
        await user.clear(review.getByLabelText("Ash"));
        await user.type(review.getByLabelText("Ash"), "6-Month - 1/4 tab Albendazole, one dose only (refused Day 2)");
        await user.click(review.getByRole("button", { name: "Approve" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleName("Approve, and add 2 records to Medical?");
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(approveDewormingSheet).toHaveBeenCalled());
        expect(approveDewormingSheet).toHaveBeenCalledWith(1, [
            { lineId: 11, text: "6-Month - 1/4 tab Albendazole, one dose only (refused Day 2)" },
            { lineId: 12, text: "6-Month - 1/2 tab Milbeworm, one dose only" },
        ]);
        // (then the paper sheet's photo, as a PDF, emailed)
        await waitFor(() => expect(emailDewormingSheet).toHaveBeenCalled());
        expect(sheetPhotoData).toHaveBeenCalledWith(["1/sheet.jpg"]);
        expect(emailDewormingSheet.mock.calls[0][0]).toBe(1);
        expect(emailDewormingSheet.mock.calls[0][1]).toBeInstanceOf(Blob);
        expect(emailDewormingSheet.mock.calls[0][2]).toBe("deworming_sheet_D_D_Troop_6_Month_2026-11-03.pdf");
    });

    test("Send Back, with a note for staff", async () => {
        loadDewormingSheets.mockResolvedValue([{ ...ready(), status: "submitted", photos: ["1/a.jpg"] }]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        const review = within(screen.getByRole("region", { name: "Review" }));
        await user.click(review.getByRole("button", { name: "Send Back" }));
        await user.type(review.getByLabelText("Note for staff (what to fix)"), "Day 3 is missing");
        await user.click(review.getByRole("button", { name: "Send Back" }));
        await waitFor(() => expect(returnDewormingSheet).toHaveBeenCalledWith(1, "Day 3 is missing"));
    });

    test("the list: where each sheet is up to, with its tag on the right", async () => {
        const started = (id, extra) => ({
            ...ready(),
            id,
            ...extra,
            lines: [{ id: id * 10, ...line(1, "Albendazole", "1/4 tab"), doses: { 1: { result: "full" } } }],
        });
        loadDewormingSheets.mockResolvedValue([
            ready(),
            started(2, { session: "3_month", daysDone: [1] }),
            started(3, { session: "3_month_fu", daysDone: [1, 2, 3] }),
            started(4, { session: "6_month_fu", status: "submitted", daysDone: [1, 2, 3] }),
            started(5, { session: "6_month", groupName: "H&B Troop", status: "approved", daysDone: [1, 2, 3] }),
        ]);
        open(EDITOR);
        const items = (await screen.findAllByRole("listitem")).map((li) => li.textContent);
        expect(
            screen.getByText(
                "Upcoming, current, and completed deworming lists. Click to view summary and enter results."
            )
        ).toBeInTheDocument();
        expect(items[0]).toMatch(/· Not StartedReady$/);
        expect(items[1]).toMatch(/· Day 2In Progress$/);
        expect(items[2]).toMatch(/· Ready to SubmitIn Progress$/);
        expect(items[3]).toMatch(/Awaiting Approval$/);
        expect(items[4]).toMatch(/Completed$/);
        expect(screen.getAllByText("In Progress")[0]).toHaveClass("Deworming-tag", "is-progress");
        expect(screen.getByText("Completed")).toHaveClass("is-approved");
        expect(screen.getByText("Ready")).toHaveClass("Deworming-tag", "is-ready");
        // ("F/U" kept whole on narrow screens)
        expect(screen.getAllByText("F/U")[0]).toHaveClass("Deworming-nowrap");
    });

    test("sent back: the note shows; once results are in, Edit is gone (they'd be lost)", async () => {
        loadDewormingSheets.mockResolvedValue([
            {
                ...ready(),
                returnNote: "Day 3 is missing",
                lines: [{ id: 11, ...line(1, "Albendazole", "1/4 tab"), doses: { 1: { result: "full" } } }],
            },
        ]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /6-Month Deworming/ }));
        expect(screen.getByRole("note")).toHaveTextContent("Sent back: Day 3 is missing");
        expect(screen.getByText("In Progress")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Enter Results" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });
});

describe("monkeys added while completing a list, and Day 4", () => {
    const alb = line(1, "Albendazole", "1/4 tab");
    const pan = line(2, "Panacur", "1/2 tsp");
    const added = (from, extra = {}) => ({ ...alb, kind: "added", fromDay: from, ...extra });
    const accidental = { ...line(7, "Albendazole", "1/4 tab", 1), kind: "accidental", fromDay: 2 };

    test("which days a monkey's row is on", () => {
        expect([1, 2, 3, 4].filter((d) => onDay(alb, d))).toEqual([1, 2, 3]);
        expect([1, 2, 3, 4].filter((d) => onDay({ ...alb, day4: true }, d))).toEqual([1, 2, 3, 4]);
        expect([1, 2, 3, 4].filter((d) => onDay(added(2), d))).toEqual([2, 3]);
        expect([1, 2, 3, 4].filter((d) => onDay(accidental, d))).toEqual([2]);
    });

    test("Day 4: a 3-day course that started a day late (Panacur must; the others are asked)", () => {
        expect(needsDay4(withDoses(alb, { 1: "none", 2: "full", 3: "full" }))).toBe("ask");
        expect(needsDay4(withDoses(alb, { 1: "1/2", 2: "full", 3: "full" }))).toBe("ask");
        expect(needsDay4(withDoses(pan, { 1: "skipped", 2: "full", 3: "full" }))).toBe("must");
        expect(needsDay4(withDoses(added(2), { 2: "full", 3: "full" }))).toBe("ask");
        // (not needed: 3 days done, Day 2 or 3 missed, a one-dose dewormer, an accidental dose)
        expect(needsDay4(withDoses(alb, { 1: "full", 2: "full", 3: "full" }))).toBeNull();
        expect(needsDay4(withDoses(alb, { 1: "none", 2: "full", 3: "none" }))).toBeNull();
        expect(needsDay4(withDoses(line(3, "Milbeworm", "1/2 tab", 1), { 2: "full", 3: "full" }))).toBeNull();
        expect(needsDay4(withDoses(accidental, { 2: "full" }))).toBeNull();
    });

    test("dose numbers: 1st, 2nd, 3rd of a 3-day course", () => {
        const late = withDoses(alb, { 1: "none", 2: "full", 3: "full" });
        expect([1, 2, 3, 4].map((d) => doseNumber(late, d))).toEqual(["1st", "1st", "2nd", "3rd"]);
        expect(doseNumber(line(3, "Milbeworm", "1/2 tab", 1), 1)).toBeNull();
        expect(doseNumber(accidental, 2)).toBeNull();
    });

    test("the records' words: an accidental dose; added on Day 2", () => {
        expect(recordText("6_month", withDoses(accidental, { 2: "full" }))).toBe(
            "6-Month - Accidental dose: 1/4 tab Albendazole on Day 2"
        );
        expect(recordText("6_month", withDoses(accidental, { 2: "1/2" }))).toBe(
            "6-Month - Accidental dose: 1/2 dose of 1/4 tab Albendazole on Day 2"
        );
        expect(recordText("3_month", withDoses(added(2), { 2: "full", 3: "full", 4: "full" }))).toBe(
            "3-Month - 1/4 tab Albendazole, once a day for 3 days (Day 2–4)"
        );
    });

    test("the summary: who was added, and accidental doses", () => {
        const lines = [
            { ...withDoses(alb, { 2: "full" }), name: "Ash" },
            { ...withDoses(added(2, { monkeyId: 8 }), { 2: "full" }), name: "Gus" },
            { ...withDoses(accidental, { 2: { result: "full", food: "Banana" } }), name: "Rex" },
        ];
        expect(daySummary(sheet(1, "6_month", "2026-11-02", []), lines, 2)).toBe(
            [
                "*D&D Troop 6-Month Deworming*",
                "_Day 2_",
                "✅ All took",
                "",
                "🐒 Gus added to the list: 1/4 tab Albendazole for 3 days",
                "🐒 Rex got an accidental 1/4 tab Albendazole in Banana",
            ].join("\n")
        );
        // (an accidental dose's on its day only)
        expect(daySummary(sheet(1, "6_month", "2026-11-02", []), lines, 3)).toBeNull();
    });

    test("Add Monkey: an accidental dose, on that day only; it can be removed", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [{ id: 11, ...alb, doses: {} }], { daysDone: [1] }),
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        expect(form.getByRole("tab", { name: "Day 2" })).toHaveAttribute("aria-selected", "true");
        await user.click(form.getByRole("button", { name: "Add Monkey" }));
        const add = within(screen.getByRole("dialog", { name: "Add Monkey: Day 2" }));
        // (not those already on the list)
        await user.type(add.getByLabelText("Find a monkey"), "as");
        expect(add.getByText("No monkey found (or already on the list).")).toBeInTheDocument();
        await user.clear(add.getByLabelText("Find a monkey"));
        await user.type(add.getByLabelText("Find a monkey"), "re");
        await user.click(add.getByRole("button", { name: "Rex" }));
        expect(add.getByRole("radio", { name: "Accidental Dose" })).toHaveAttribute("aria-checked", "true");
        await user.selectOptions(add.getByLabelText("Dewormer"), "Albendazole");
        expect(add.getByLabelText("Dose")).toHaveValue("1/4");
        await user.click(add.getByRole("button", { name: "Add" }));
        await waitFor(() =>
            expect(addDewormingMonkey).toHaveBeenCalledWith(1, {
                monkeyId: 7,
                kind: "accidental",
                fromDay: 2,
                medication: "Albendazole",
                dose: "1/4 tab",
                days: 1,
            })
        );
        const rex = form.getByRole("group", { name: "Rex: Day 2" });
        expect(rex.closest("li")).toHaveTextContent("Rex Accidental");
        // (they got it: Full or a partial, no Miss or Skipped)
        expect(within(rex).queryByRole("button", { name: "Miss" })).toBeNull();
        expect(form.queryByRole("button", { name: "Change dewormer for Rex" })).toBeNull();
        await user.click(form.getByRole("tab", { name: "Day 1 (complete)" }));
        expect(form.queryByRole("group", { name: "Rex: Day 1" })).toBeNull();
        await user.click(form.getByRole("tab", { name: "Day 2" }));

        await user.click(form.getByRole("button", { name: "Remove Rex" }));
        await user.click(
            within(screen.getByRole("dialog", { name: "Remove Rex from the list?" })).getByRole("button", {
                name: "Confirm",
            })
        );
        await waitFor(() => expect(removeDewormingMonkey).toHaveBeenCalledWith(30));
        expect(form.queryByRole("group", { name: "Rex: Day 2" })).toBeNull();
    });

    test("Add Monkey: Add to Course on Day 3 is one dose; Panacur can't start then; an unusual dose is checked", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [{ id: 11, ...alb, doses: {} }], { daysDone: [1, 2] }),
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        await user.click(screen.getByRole("button", { name: "Add Monkey" }));
        const add = within(screen.getByRole("dialog", { name: "Add Monkey: Day 3" }));
        await user.type(add.getByLabelText("Find a monkey"), "gus");
        await user.click(add.getByRole("button", { name: "Gus" }));
        await user.click(add.getByRole("radio", { name: "Add to Course" }));
        await user.selectOptions(add.getByLabelText("Dewormer"), "Panacur");
        expect(add.getByRole("alert")).toHaveTextContent("Panacur needs 3 days in a row, so it can't start on Day 3.");
        expect(add.getByRole("button", { name: "Add" })).toBeDisabled();
        await user.selectOptions(add.getByLabelText("Dewormer"), "Albendazole");
        expect(add.getByText("Added on Day 3: one dose only.")).toBeInTheDocument();
        await user.selectOptions(add.getByLabelText("Dose"), "1/2");
        await user.click(add.getByRole("button", { name: "Add" }));
        expect(add.getByRole("alert")).toHaveTextContent(
            "1/2 tab isn't the usual dose of Albendazole (1/4 tab). Add anyway?"
        );
        expect(addDewormingMonkey).not.toHaveBeenCalled();
        await user.click(add.getByRole("button", { name: "Add Anyway" }));
        await waitFor(() =>
            expect(addDewormingMonkey).toHaveBeenCalledWith(
                1,
                expect.objectContaining({ kind: "added", fromDay: 3, days: 1 })
            )
        );
        expect(screen.getByRole("group", { name: "Gus: Day 3" }).closest("li")).toHaveTextContent("Gus Added Day 3");
    });

    test("saving Day 3: asked about Day 4 for a late start; Day 4 then shows just them", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(
                1,
                "6_month",
                "2026-11-02",
                [
                    { id: 11, ...withDoses(alb, { 1: "none", 2: "full", 3: "full" }) },
                    { id: 12, ...withDoses(line(2, "Milbeworm", "1/2 tab", 1), { 1: "full" }) },
                    { id: 13, ...withDoses(line(5, "Panacur", "1/2 tsp"), { 1: "skipped", 2: "full", 3: "full" }) },
                ],
                { daysDone: [1, 2] }
            ),
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Enter Results" }));
        const form = within(screen.getByRole("region", { name: "Record Results" }));
        expect(form.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Day 1", "Day 2", "Day 3"]);
        await user.click(form.getByRole("button", { name: "Save Day 3" }));
        const ask = within(screen.getByRole("dialog", { name: "Day 4" }));
        expect(
            ask.getByText(
                "Ash missed Day 1 but received doses on Day 2 & 3. Do they still need another dose to complete their course?"
            )
        ).toBeInTheDocument();
        expect(
            ask.getByText("Sybil missed Day 1: Panacur needs all 3 days, so their 3rd dose is on Day 4.")
        ).toBeInTheDocument();
        expect(saveDewormingResults).not.toHaveBeenCalled();
        await user.click(ask.getByRole("radio", { name: "No, Finish Here" }));
        await user.click(ask.getByRole("button", { name: "Save Day 3" }));
        await waitFor(() => expect(saveDewormingResults).toHaveBeenCalled());
        const saved = saveDewormingResults.mock.calls[0][1];
        expect(saved.daysDone).toEqual([1, 2, 3]);
        // (in the sheet's order: by name)
        expect(saved.lines.map((l) => [l.name, l.day4])).toEqual([
            ["Ash", false],
            ["Meggy", null],
            ["Sybil", true],
        ]);
        // (Day 4: only Sybil, on her 3rd dose)
        await user.click(await form.findByRole("tab", { name: "Day 4" }));
        expect(form.getAllByRole("group").map((g) => g.getAttribute("aria-label"))).toEqual(["Sybil: Day 4"]);
        expect(form.getByText("1/2 tsp Panacur · 3rd dose")).toBeInTheDocument();
        expect(form.queryByRole("region", { name: "Finish" })).toBeNull();
    });

    test("the review: the monkeys staff added apart; a note can go on the record", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(
                1,
                "6_month",
                "2026-11-02",
                [
                    {
                        id: 11,
                        ...withDoses(alb, {
                            1: "full",
                            2: { result: "full", note: "got a second helping" },
                            3: "full",
                        }),
                    },
                    { id: 12, ...withDoses(accidental, { 2: "full" }), addedByName: "Sam Smith" },
                ],
                { status: "submitted", daysDone: [1, 2, 3], photos: ["1/a.jpg"] }
            ),
        ]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        const review = within(screen.getByRole("region", { name: "Review" }));
        expect(review.getByText("1 Monkey Added by Staff")).toBeInTheDocument();
        expect(review.getByLabelText("Rex Accidental by Sam Smith")).toHaveValue(
            "6-Month - Accidental dose: 1/4 tab Albendazole on Day 2"
        );
        expect(review.getByText("Day 2: got a second helping")).toBeInTheDocument();
        await user.click(review.getByRole("button", { name: "Add to Record" }));
        expect(review.getByLabelText("Ash")).toHaveValue(
            "6-Month - 1/4 tab Albendazole, once a day for 3 days; Day 2: got a second helping"
        );
        expect(review.queryByRole("button", { name: "Add to Record" })).toBeNull();
    });
});
