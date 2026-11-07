// Maintenance Issues: the rules, Records → Maintenance → Issues, the map's pins
// and Report Issue, and the Morning Brief's New and Outstanding
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssuesTab } from "./MaintenanceIssues";
import WholeMap from "./WholeMap";
import { addIssue, addIssuePhotos, closeIssue, deleteIssue, fixIssue, loadMaintenanceIssues } from "./monkeyData";
import { checkClose, checkIssue, daysAgo, issuePlace, issuesAt, openIssues, pastIssues, photosWithRoom, pinAt } from "./issueRules";
import { buildMorningBrief } from "./morningBriefRules";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadMaintenanceIssues: vi.fn(),
    addIssue: vi.fn(),
    addIssuePhotos: vi.fn(),
    issuePhotoUrl: vi.fn(async (path) => `signed:${path}`),
    fixIssue: vi.fn(),
    closeIssue: vi.fn(),
    saveIssue: vi.fn(),
    deleteIssue: vi.fn(),
    maintenanceKindsAvailable: () => true,
}));

const place = (id, name, type, parentId = null) => ({ id, name, type, parentId, sortOrder: id });
const ENCLOSURES = [
    place(1, "Goliath", "troop"),
    place(2, "Goliath A", "introcage", 1),
    place(3, "H&B", "troop"),
    place(5, "Quarantine", "care_unit"),
    place(6, "Quarantine", "area", 5),
];
const issue = (id, enclosureId, details, extra = {}) => ({
    id,
    enclosureId,
    mapX: null,
    mapY: null,
    details,
    urgent: false,
    photoPaths: [],
    status: "open",
    closeReason: null,
    reportId: null,
    closedAt: null,
    closedByName: null,
    reportedBy: "Sam",
    reportedById: "sam",
    reportedAt: "2026-11-01T09:00:00Z",
    ...extra,
});

afterEach(() => vi.clearAllMocks());

describe("the rules", () => {
    test("open: urgent first, then the longest waiting; past: the latest first", () => {
        const list = [
            issue(1, 1, "newer", { reportedAt: "2026-11-05T09:00:00Z" }),
            issue(2, 1, "older", { reportedAt: "2026-11-01T09:00:00Z" }),
            issue(3, 1, "urgent", { urgent: true, reportedAt: "2026-11-06T09:00:00Z" }),
            issue(4, 1, "fixed early", { status: "fixed", closedAt: "2026-11-02T09:00:00Z" }),
            issue(5, 1, "fixed late", { status: "fixed", closedAt: "2026-11-04T09:00:00Z" }),
        ];
        expect(openIssues(list).map((i) => i.details)).toEqual(["urgent", "older", "newer"]);
        expect(pastIssues(list).map((i) => i.details)).toEqual(["fixed late", "fixed early"]);
    });

    test("an enclosure's: its own and its introcages'", () => {
        const list = [issue(1, 1, "a"), issue(2, 2, "b"), issue(3, 3, "c")];
        expect(issuesAt(list, ENCLOSURES[0], ENCLOSURES).map((i) => i.details)).toEqual(["a", "b"]);
    });

    test("a one-area unit's area goes under the unit", () => {
        expect(issuePlace(ENCLOSURES[4], ENCLOSURES).id).toBe(5);
        expect(issuePlace(ENCLOSURES[1], ENCLOSURES).id).toBe(2);
        expect(issuePlace(null, ENCLOSURES)).toBeNull();
    });

    test("how long ago", () => {
        const now = new Date(2026, 10, 7, 12);
        expect(daysAgo(new Date(2026, 10, 7, 6).toISOString(), now)).toBe("Today");
        expect(daysAgo(new Date(2026, 10, 6, 23).toISOString(), now)).toBe("Yesterday");
        expect(daysAgo(new Date(2026, 10, 2, 8).toISOString(), now)).toBe("5 days ago");
    });

    test("a tap finds the nearest pin's head, whatever the zoom; too far finds none", () => {
        const pins = [issue(1, 1, "a", { mapX: 50, mapY: 50 }), issue(2, 1, "b", { mapX: 60, mapY: 50 }), issue(3, 1, "no pin")];
        const view = { x: 0, y: 0, width: 100, height: 100 };
        const size = { width: 1000, height: 1000 };
        // (the head is 21 pixels above the spot)
        expect(pinAt(pins, 500, 479, view, size).id).toBe(1);
        expect(pinAt(pins, 600, 479, view, size).id).toBe(2);
        expect(pinAt(pins, 550, 479, view, size)).toBeNull();
        expect(pinAt(pins, 100, 100, view, size)).toBeNull();
    });

    test("photos: as many as there's room for", () => {
        expect(photosWithRoom(["a", "b"], 0)).toEqual({ files: ["a", "b"], tooMany: false });
        expect(photosWithRoom(["a", "b", "c"], 2)).toEqual({ files: ["a", "b"], tooMany: true });
        expect(photosWithRoom(["a"], 4)).toEqual({ files: [], tooMany: true });
    });

    test("what a report and a closing need", () => {
        expect(checkIssue({ place: null, details: "x" }).error).toMatch(/enclosure/);
        expect(checkIssue({ place: ENCLOSURES[0], details: "  " }).error).toMatch(/what's wrong/);
        expect(checkIssue({ place: ENCLOSURES[0], details: " Fence ", urgent: true }).values).toEqual({ enclosureId: 1, details: "Fence", urgent: true });
        expect(checkClose(" ").error).toMatch(/why/);
        expect(checkClose(" Duplicate ").reason).toBe("Duplicate");
    });
});

describe("the Issues tab", () => {
    const LIST = [
        issue(1, 1, "Gate sticking"),
        issue(2, 2, "Fence down", { urgent: true, reportedAt: "2026-11-05T09:00:00Z" }),
        issue(3, 3, "Was a bowl", { status: "closed", closeReason: "Duplicate", closedByName: "Lee", closedAt: "2026-11-04T09:00:00Z" }),
    ];

    async function setup(me = { isAdmin: false }) {
        loadMaintenanceIssues.mockResolvedValue(LIST);
        const onReportAdded = vi.fn();
        render(<IssuesTab enclosures={ENCLOSURES} me={me} onReportAdded={onReportAdded} />);
        await screen.findByText("Fence down");
        return { user: userEvent.setup(), onReportAdded };
    }

    test("open ones, urgent first and marked; Past shows why one was closed", async () => {
        const { user } = await setup();
        const items = screen.getAllByRole("listitem");
        expect(items.map((li) => within(li).getByRole("link").textContent)).toEqual(["Goliath A", "Goliath"]);
        expect(within(items[0]).getByText("Urgent")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open (2)" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Past" }));
        expect(screen.getByText(/Closed by Lee.*Duplicate/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Mark Fixed" })).not.toBeInTheDocument();
    });

    test("Report Issue: needs a place and what's wrong, then it's on the list", async () => {
        const { user } = await setup();
        addIssue.mockResolvedValue(issue(9, 3, "Tap dripping"));
        await user.click(screen.getByRole("button", { name: "Report Issue" }));
        const dialog = screen.getByRole("dialog", { name: "Report Issue" });
        await user.click(within(dialog).getByRole("button", { name: "Report Issue" }));
        expect(within(dialog).getByRole("alert")).toHaveTextContent("choose the enclosure");
        await user.type(within(dialog).getByRole("searchbox"), "H&B");
        await user.click(within(dialog).getByRole("button", { name: /Holt/ }));
        await user.type(within(dialog).getByLabelText("What's Wrong"), "Tap dripping");
        await user.click(within(dialog).getByRole("button", { name: "Urgent" }));
        await user.click(within(dialog).getByRole("button", { name: "Report Issue" }));
        await waitFor(() =>
            expect(addIssue).toHaveBeenCalledWith({ enclosureId: 3, details: "Tap dripping", urgent: true, mapX: null, mapY: null, photos: [] })
        );
        expect(await screen.findByText("Tap dripping")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("Mark Fixed: the report form, filled in; saving adds the report and the issue goes", async () => {
        const { user, onReportAdded } = await setup();
        const report = { id: 50, enclosureId: 1 };
        fixIssue.mockImplementation(async (i) => ({ issue: { ...i, status: "fixed" }, report }));
        const row = screen.getByText("Gate sticking").closest("li");
        await user.click(within(row).getByRole("button", { name: "Mark Fixed" }));
        const dialog = screen.getByRole("dialog", { name: "Mark Fixed" });
        expect(within(dialog).getByLabelText("Maintenance Details")).toHaveValue("Gate sticking");
        expect(within(dialog).getByRole("button", { name: "Repair" })).toHaveAttribute("aria-pressed", "true");
        await user.click(within(dialog).getByRole("button", { name: "Save Report" }));
        await waitFor(() => expect(onReportAdded).toHaveBeenCalledWith(report));
        expect(fixIssue.mock.calls[0][0].id).toBe(1);
        expect(fixIssue.mock.calls[0][1]).toMatchObject({ kind: "repair", details: "Gate sticking" });
        expect(screen.queryByText("Gate sticking")).not.toBeInTheDocument();
    });

    test("Report Issue takes up to 4 photos, and one can be removed", async () => {
        const { user } = await setup();
        const file = (name) => new File(["x"], name, { type: "image/jpeg" });
        URL.createObjectURL = vi.fn(() => "blob:here");
        URL.revokeObjectURL = vi.fn();
        addIssue.mockResolvedValue(issue(9, 1, "Roof"));
        await user.click(screen.getByRole("button", { name: "Report Issue" }));
        const dialog = screen.getByRole("dialog", { name: "Report Issue" });
        const input = within(dialog).getByLabelText("Photos");
        fireEvent.change(input, { target: { files: ["1", "2", "3", "4", "5"].map((n) => file(`${n}.jpg`)) } });
        expect(within(dialog).getByRole("alert")).toHaveTextContent("up to 4 photos");
        expect(within(dialog).getAllByRole("button", { name: /^Remove photo/ })).toHaveLength(4);
        expect(within(dialog).queryByRole("button", { name: "Add Photos" })).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Remove photo 2" }));
        expect(within(dialog).getByRole("button", { name: "Add Photos" })).toBeInTheDocument();
        await user.type(within(dialog).getByRole("searchbox"), "Goliath A");
        await user.click(within(dialog).getByRole("button", { name: /Goliath A/ }));
        await user.type(within(dialog).getByLabelText("What's Wrong"), "Roof");
        await user.click(within(dialog).getByRole("button", { name: "Report Issue" }));
        await waitFor(() => expect(addIssue).toHaveBeenCalled());
        expect(addIssue.mock.calls[0][0].photos.map((f) => f.name)).toEqual(["1.jpg", "3.jpg", "4.jpg"]);
    });

    test("Add Photos on an open issue, until it has 4; none on a past one", async () => {
        loadMaintenanceIssues.mockResolvedValue([
            issue(1, 1, "Room for one", { photoPaths: ["a.jpg", "b.jpg", "c.jpg"] }),
            issue(2, 1, "Full", { photoPaths: ["d.jpg", "e.jpg", "f.jpg", "g.jpg"] }),
        ]);
        addIssuePhotos.mockImplementation(async (i, files) => ({ ...i, photoPaths: [...i.photoPaths, ...files.map((f) => f.name)] }));
        render(<IssuesTab enclosures={ENCLOSURES} me={{}} />);
        await screen.findByText("Full");
        expect(screen.queryByLabelText("Photos for: Full")).not.toBeInTheDocument();
        const files = [new File(["x"], "new.jpg"), new File(["x"], "extra.jpg")];
        fireEvent.change(screen.getByLabelText("Photos for: Room for one"), { target: { files } });
        await waitFor(() => expect(addIssuePhotos).toHaveBeenCalled());
        expect(addIssuePhotos.mock.calls[0][1].map((f) => f.name)).toEqual(["new.jpg"]);
        await waitFor(() => expect(screen.queryByLabelText("Photos for: Room for one")).not.toBeInTheDocument());
        await waitFor(() => expect(document.querySelectorAll(".Issues-photo")).toHaveLength(8));
    });

    test("Close Without Report needs a reason", async () => {
        const { user, onReportAdded } = await setup();
        closeIssue.mockImplementation(async (i, closeReason) => ({ ...i, status: "closed", closeReason }));
        const row = screen.getByText("Gate sticking").closest("li");
        await user.click(within(row).getByRole("button", { name: "Mark Fixed" }));
        await user.click(screen.getByRole("button", { name: "Close Without Report" }));
        const dialog = screen.getByRole("dialog", { name: "Close Without Report" });
        await user.click(within(dialog).getByRole("button", { name: "Close Issue" }));
        expect(within(dialog).getByRole("alert")).toHaveTextContent("why");
        await user.type(within(dialog).getByLabelText("Reason"), "False alarm");
        await user.click(within(dialog).getByRole("button", { name: "Close Issue" }));
        await waitFor(() => expect(closeIssue).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), "False alarm"));
        expect(onReportAdded).not.toHaveBeenCalled();
    });

    test("only admins can delete, and with no signal nobody changes or deletes", async () => {
        const { user } = await setup();
        expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /^Change/ })).toHaveLength(2);
        document.body.innerHTML = "";
        deleteIssue.mockResolvedValue();
        render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: true }} />);
        await screen.findByText("Fence down");
        await user.click(screen.getByRole("button", { name: "Delete the issue: Fence down" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(deleteIssue).toHaveBeenCalled());
        document.body.innerHTML = "";
        render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: true, offline: true }} />);
        await screen.findByText("Gate sticking");
        expect(screen.queryByRole("button", { name: /^Change/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "Mark Fixed" }).length).toBeGreaterThan(0);
    });
});

describe("the map", () => {
    const MAP_FILE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.3 841.9"><rect width="10" height="10"/></svg>';
    beforeEach(() => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(MAP_FILE));
        loadMaintenanceIssues.mockResolvedValue([
            issue(1, 1, "Fence down", { urgent: true, mapX: 100, mapY: 100 }),
            issue(2, 1, "No pin"),
        ]);
    });
    afterEach(() => vi.restoreAllMocks());

    test("visitors see no issues, and nothing's asked for", async () => {
        render(<WholeMap onClose={() => {}} enclosures={ENCLOSURES} />);
        await screen.findByRole("img", { name: "The whole sanctuary map" });
        expect(loadMaintenanceIssues).not.toHaveBeenCalled();
        expect(screen.queryByRole("button", { name: "Report Issue" })).not.toBeInTheDocument();
    });

    test("staff: pins for the open issues, which can be hidden", async () => {
        const user = userEvent.setup();
        const { baseElement } = render(<WholeMap onClose={() => {}} enclosures={ENCLOSURES} canIssues />);
        await screen.findByRole("button", { name: "Hide Issues (2)" });
        await waitFor(() => expect(baseElement.querySelectorAll("[data-issue]")).toHaveLength(1));
        await user.click(screen.getByRole("button", { name: "Hide Issues (2)" }));
        expect(baseElement.querySelectorAll("[data-issue]")).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Show Issues (2)" })).toHaveAttribute("aria-pressed", "false");
    });

    test("Report Issue asks for the spot, and Cancel goes back", async () => {
        const user = userEvent.setup();
        render(<WholeMap onClose={() => {}} enclosures={ENCLOSURES} canIssues />);
        await user.click(await screen.findByRole("button", { name: "Report Issue" }));
        expect(screen.getByText("Tap the map where the issue is.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: "Report Issue" })).toBeInTheDocument();
    });
});

describe("the Morning Brief", () => {
    const brief = (maintenanceIssues) =>
        buildMorningBrief({
            monkeys: [],
            enclosures: ENCLOSURES,
            sessions: [],
            spots: [],
            lastMoves: {},
            monitoring: {},
            injuries: [],
            calendarEvents: [],
            sheets: [],
            milk: [],
            weights: [],
            news: [],
            maintenanceIssues,
            today: "2026-11-07",
        }).sections.find((s) => s.id === "maintenance");

    test("New and Outstanding, urgent in red and first; closed ones left out", () => {
        const section = brief([
            issue(1, 1, "Gate sticking", { reportedAt: "2026-11-06T08:00:00Z" }),
            issue(2, 2, "Fence down", { urgent: true, reportedAt: "2026-11-06T09:00:00Z" }),
            issue(3, 3, "Old shade cloth", { reportedAt: "2026-11-02T09:00:00Z" }),
            issue(4, 3, "Done", { status: "fixed", reportedAt: "2026-11-06T09:00:00Z" }),
        ]);
        expect(section.groups).toEqual([
            {
                title: "New",
                lines: [{ text: "Urgent: Goliath A: Fence down", alert: true }, { text: "Goliath: Gate sticking" }],
            },
            { title: "Outstanding", lines: [{ text: "Holt & Barrington: Old shade cloth (5 days)" }] },
        ]);
    });

    test("no open issues: no section", () => {
        expect(brief([])).toBeUndefined();
    });
});
