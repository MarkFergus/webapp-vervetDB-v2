// Records → Sections → Deworming: the deworming groups, who's on a new
// sheet to start with, Prepare Sheet (admins), and a sheet's page with
// Print Sheet (deworming.sql)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import { deleteDewormingSheet, loadDewormingSheets, saveDewormingSheet } from "./monkeyData";
import { dewormingGroups, lastDose, nextSession, printOrder, sheetTitle, startingLines } from "./dewormingRules";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadDewormingSheets: vi.fn(),
    saveDewormingSheet: vi.fn(),
    deleteDewormingSheet: vi.fn(),
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
        expect(names("ics:Top")).toEqual(["Leeloo", "Sybil"]);
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

    test("printed by dewormer (Albendazole, Panacur, Milbeworm, Pyrantel, then others), then name", () => {
        const lines = [
            { ...line(1, "Milbeworm", "1/2 tab", 1), name: "Zed" },
            { ...line(2, "Milbemax", "1/2 tab", 1), name: "Abe" },
            { ...line(3, "Albendazole", "1/4 tab"), name: "Mo" },
            { ...line(4, "Albendazole", "1/4 tab"), name: "Al" },
        ];
        expect(printOrder(lines).map((l) => l.name)).toEqual(["Al", "Mo", "Zed", "Abe"]);
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

    test("editors see the sheets and print them, but can't prepare, edit or delete", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [line(2, "Milbeworm", "1/2 tab", 1), line(1, "Albendazole", "1/4 tab")]),
        ]);
        const user = userEvent.setup();
        open(EDITOR);
        await user.click(await screen.findByRole("button", { name: /D&D Troop 6-Month Deworming/ }));
        expect(screen.queryByRole("button", { name: "Prepare Sheet" })).toBeNull();
        const page = within(screen.getByRole("region", { name: "D&D Troop 6-Month Deworming" }));
        expect(page.getByText(/Starts Mon 2 Nov · 2 monkeys · Ready · prepared by Mark Fergus/)).toBeInTheDocument();
        // (by dewormer: Albendazole first)
        expect(
            page
                .getAllByRole("row")
                .slice(1)
                .map((r) => r.textContent)
        ).toEqual(["Ash1/4 tab Albendazole3 days", "Meggy1/2 tab Milbeworm1 day"]);
        expect(page.queryByRole("button", { name: "Edit" })).toBeNull();
        expect(page.queryByRole("button", { name: "Delete" })).toBeNull();
        expect(page.getByRole("button", { name: "Print Sheet" })).toBeInTheDocument();
    });

    test("Print Sheet: the paper sheet as a PDF", async () => {
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
        await user.click(await screen.findByRole("button", { name: /6-Month F\/U Deworming/ }));
        await user.click(screen.getByRole("button", { name: "Print Sheet" }));
        await waitFor(() => expect(names).toEqual(["deworming_D_D_Troop_6_Month_F_U_2026-11-20.pdf"]));
    });

    test("Prepare Sheet: the group's next session, its adults ticked, a dewormer and dose each, then saved", async () => {
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "Prepare Sheet" }));
        const form = within(screen.getByRole("region", { name: "Prepare Sheet" }));
        expect(form.getByLabelText("Group")).toHaveDisplayValue("D&D Troop");
        expect(form.getByLabelText("Session")).toHaveDisplayValue("6-Month");
        expect(form.getByLabelText("Instructions (printed under the title)")).toHaveValue(
            "Add 2 drops milk thistle & protexin to each dose (Albendazole also needs 2 drops flax oil)."
        );
        // (Tiny is 1: not ticked)
        expect(form.getByRole("checkbox", { name: "Tiny" })).not.toBeChecked();
        expect(form.getByText("3 of 4 ticked")).toBeInTheDocument();

        // nothing chosen yet: asked for
        await user.click(form.getByRole("button", { name: "Save Sheet" }));
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
        await user.click(form.getByRole("button", { name: "Save Sheet" }));

        await waitFor(() => expect(saveDewormingSheet).toHaveBeenCalled());
        expect(saveDewormingSheet.mock.calls[0][0]).toMatchObject({
            id: undefined,
            groupKey: "troop:1",
            groupName: "D&D Troop",
            session: "6_month",
            lines: [
                { monkeyId: 1, medication: "Albendazole", dose: "1/4 tab", days: 3 },
                { monkeyId: 2, medication: "Milbeworm", dose: "1/2 tab", days: 1 },
                { monkeyId: 4, medication: "Milbemax", dose: "1/4 tab", days: 1 },
            ],
        });
        // (back to the list, reloaded)
        await waitFor(() => expect(loadDewormingSheets).toHaveBeenCalledTimes(2));
        expect(await screen.findByRole("button", { name: "Prepare Sheet" })).toBeInTheDocument();
    });

    test("a 6-Month F/U: the few are ticked, each ready with its 6-Month dewormer", async () => {
        loadDewormingSheets.mockResolvedValue([
            sheet(1, "6_month", "2026-11-02", [line(1, "Albendazole", "1/4 tab"), line(2, "Milbeworm", "1/2 tab", 1)]),
        ]);
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(await screen.findByRole("button", { name: "Prepare Sheet" }));
        const form = within(screen.getByRole("region", { name: "Prepare Sheet" }));
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
        const form = within(screen.getByRole("region", { name: "Edit Sheet" }));
        expect(form.getByRole("checkbox", { name: "Sybil" })).toBeChecked();
        expect(form.getByRole("checkbox", { name: "Leeloo" })).not.toBeChecked();
        await user.selectOptions(form.getByLabelText("Dose for Sybil"), "3/4");
        await user.click(form.getByRole("button", { name: "Save Sheet" }));
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

        // (back on the sheet) Delete
        await user.click(await screen.findByRole("button", { name: "Delete" }));
        const ask = screen.getByRole("dialog", { name: "Delete this sheet?" });
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
