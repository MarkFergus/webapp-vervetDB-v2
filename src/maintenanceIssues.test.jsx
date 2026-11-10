// Maintenance Issues: the rules, Records → Maintenance → Issues, the map's pins
// and Report Issue, and the Morning Brief's New and Outstanding
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IssuesTab } from "./MaintenanceIssues";
import WholeMap from "./WholeMap";
import { addIssue, addIssuePhotos, deleteIssue, fixIssue, loadMaintenanceIssues, saveJobOrder } from "./monkeyData";
import { checkIssue, daysAgo, issuePlace, issueReport, issuesAt, moveJob, openIssues, pastIssues, photosWithRoom, pinAt } from "./issueRules";
import { buildMorningBrief } from "./morningBriefRules";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadMaintenanceIssues: vi.fn(),
    addIssue: vi.fn(),
    addIssuePhotos: vi.fn(),
    issuePhotoUrl: vi.fn(async (path) => `signed:${path}`),
    fixIssue: vi.fn(),
    saveIssue: vi.fn(),
    deleteIssue: vi.fn(),
    saveJobOrder: vi.fn(),
    // (not known yet, as on the map before the reports have loaded)
    maintenanceKindsAvailable: () => false,
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

    test("the Job List's order: urgent first; within each, as admins put them, then the longest waiting", () => {
        const list = [
            issue(1, 1, "old", { reportedAt: "2026-11-01T09:00:00Z" }),
            issue(2, 1, "moved second", { jobOrder: 1 }),
            issue(3, 1, "moved first", { jobOrder: 0 }),
            issue(4, 1, "urgent", { urgent: true }),
        ];
        expect(openIssues(list).map((i) => i.details)).toEqual(["urgent", "moved first", "moved second", "old"]);
        // (moving "old" up: the part numbered again; urgent can't move out of its part)
        expect(moveJob(list, 1, -1)).toEqual([{ id: 1, jobOrder: 1 }, { id: 2, jobOrder: 2 }]);
        expect(moveJob(list, 4, 1)).toEqual([]);
        expect(moveJob(list, 3, -1)).toEqual([]);
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

    test("what a report needs, and what Job Done saves", () => {
        expect(checkIssue({ place: null, details: "x" }).error).toMatch(/enclosure/);
        expect(checkIssue({ place: ENCLOSURES[0], details: "  " }).error).toMatch(/what's wrong/);
        expect(checkIssue({ place: ENCLOSURES[0], details: " Fence ", urgent: true }).values).toEqual({ enclosureId: 1, details: "Fence", urgent: true });
        expect(issueReport({ details: "Fence down" }, " Replaced two posts ")).toBe("Job: Fence down\nDone: Replaced two posts");
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

    test("open ones, urgent first and marked; Closed shows why one was closed", async () => {
        const { user } = await setup();
        const items = screen.getAllByRole("listitem");
        expect(items.map((li) => within(li).getByRole("link").textContent)).toEqual(["Goliath A", "Goliath"]);
        expect(within(items[0]).getByText("Urgent")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Open (2)" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Closed" }));
        expect(screen.getByText(/Closed by Lee, 4 Nov 2026: Duplicate/)).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Job Done" })).not.toBeInTheDocument();
    });

    test("Report Issue: needs a place and what's wrong, then it's on the list", async () => {
        const { user } = await setup();
        addIssue.mockResolvedValue(issue(9, 3, "Tap dripping"));
        await user.click(screen.getByRole("button", { name: "Add Job" }));
        const dialog = screen.getByRole("dialog", { name: "Add Job" });
        await user.click(within(dialog).getByRole("button", { name: "Submit" }));
        expect(within(dialog).getByRole("alert")).toHaveTextContent("choose the enclosure");
        await user.type(within(dialog).getByRole("searchbox"), "H&B");
        await user.click(within(dialog).getByRole("button", { name: /Holt/ }));
        await user.type(within(dialog).getByLabelText("What's Wrong"), "Tap dripping");
        await user.click(within(dialog).getByRole("button", { name: "Urgent" }));
        await user.click(within(dialog).getByRole("button", { name: "Submit" }));
        await waitFor(() =>
            expect(addIssue).toHaveBeenCalledWith({ enclosureId: 3, details: "Tap dripping", urgent: true, mapX: null, mapY: null, photos: [] })
        );
        expect(await screen.findByText("Tap dripping")).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    test("Job Done: an empty box to say what was done; the report says the issue too, and the issue goes", async () => {
        const { user, onReportAdded } = await setup();
        const report = { id: 50, enclosureId: 1 };
        fixIssue.mockImplementation(async (i) => ({ issue: { ...i, status: "fixed" }, report }));
        const row = screen.getByText("Gate sticking").closest("li");
        await user.click(within(row).getByRole("button", { name: "Job Done" }));
        const dialog = screen.getByRole("dialog", { name: "Job Done" });
        const box = within(dialog).getByLabelText("Maintenance Details");
        expect(box).toHaveValue("");
        expect(box).toHaveAttribute("placeholder", "Details of the work done and the outcome. If no work was needed, say why.");
        expect(within(dialog).getByRole("button", { name: "Repair" })).toHaveAttribute("aria-pressed", "true");
        expect(within(dialog).queryByRole("button", { name: "Close Without Report" })).not.toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Save Report" }));
        expect(within(dialog).getByRole("alert")).toHaveTextContent("Please say what was done");
        expect(fixIssue).not.toHaveBeenCalled();
        await user.type(box, "Oiled the hinges");
        await user.click(within(dialog).getByRole("button", { name: "Save Report" }));
        await waitFor(() => expect(onReportAdded).toHaveBeenCalledWith(report));
        expect(fixIssue.mock.calls[0][0].id).toBe(1);
        expect(fixIssue.mock.calls[0][1]).toMatchObject({ kind: "repair", details: "Job: Gate sticking\nDone: Oiled the hinges" });
        expect(screen.queryByText("Gate sticking")).not.toBeInTheDocument();
    });

    test("Job Done: Add After Photos, sent with the report", async () => {
        const { user } = await setup();
        URL.createObjectURL = vi.fn(() => "blob:here");
        URL.revokeObjectURL = vi.fn();
        fixIssue.mockImplementation(async (i) => ({ issue: { ...i, status: "fixed" }, report: { id: 51, enclosureId: 1 } }));
        const row = screen.getByText("Gate sticking").closest("li");
        await user.click(within(row).getByRole("button", { name: "Job Done" }));
        const dialog = screen.getByRole("dialog", { name: "Job Done" });
        expect(within(dialog).getByRole("button", { name: "Add After Photos" })).toBeInTheDocument();
        fireEvent.change(within(dialog).getByLabelText("Photos"), { target: { files: [new File(["x"], "after.jpg", { type: "image/jpeg" })] } });
        expect(within(dialog).getByRole("button", { name: "Remove photo 1" })).toBeInTheDocument();
        await user.type(within(dialog).getByLabelText("Maintenance Details"), "Oiled the hinges");
        await user.click(within(dialog).getByRole("button", { name: "Save Report" }));
        await waitFor(() => expect(fixIssue).toHaveBeenCalled());
        expect(fixIssue.mock.calls[0][2].map((f) => f.name)).toEqual(["after.jpg"]);
    });

    test("a finished job with After photos: Before and After, labelled", async () => {
        loadMaintenanceIssues.mockResolvedValue([
            issue(7, 1, "Roof leaking", { status: "fixed", closedAt: "2026-11-05T09:00:00Z", photoPaths: ["b.jpg"], donePhotoPaths: ["a1.jpg", "a2.jpg"] }),
            issue(8, 1, "Tap dripping", { status: "fixed", closedAt: "2026-11-04T09:00:00Z", photoPaths: ["t.jpg"], donePhotoPaths: [] }),
        ]);
        render(<IssuesTab enclosures={ENCLOSURES} me={{}} />);
        const user = userEvent.setup();
        await user.click(await screen.findByRole("button", { name: "Closed" }));
        const roof = screen.getByText("Roof leaking").closest("li");
        expect(await within(roof).findByText("Before")).toBeInTheDocument();
        expect(within(roof).getByText("After")).toBeInTheDocument();
        expect(await within(roof).findAllByRole("button", { name: /See after photo/ })).toHaveLength(2);
        // (no After photos: no labels)
        const tap = screen.getByText("Tap dripping").closest("li");
        expect(await within(tap).findByRole("button", { name: "See photo 1 of 1" })).toBeInTheDocument();
        expect(within(tap).queryByText("Before")).toBeNull();
    });

    test("admins move jobs with arrows (saved for everyone); others have none", async () => {
        loadMaintenanceIssues.mockResolvedValue([
            issue(1, 1, "First job", { reportedAt: "2026-11-01T09:00:00Z" }),
            issue(2, 3, "Second job", { reportedAt: "2026-11-02T09:00:00Z" }),
        ]);
        saveJobOrder.mockResolvedValue();
        const { unmount } = render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: true }} />);
        const user = userEvent.setup();
        await screen.findByText("Second job");
        expect(screen.getByRole("button", { name: "Move up: First job" })).toBeDisabled();
        await user.click(screen.getByRole("button", { name: "Move up: Second job" }));
        await waitFor(() => expect(saveJobOrder).toHaveBeenCalledWith([{ id: 2, jobOrder: 0 }, { id: 1, jobOrder: 1 }]));
        const items = screen.getAllByRole("listitem").map((li) => within(li).getByText(/job$/).textContent);
        expect(items).toEqual(["Second job", "First job"]);
        unmount();
        render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: false }} />);
        await screen.findAllByText("First job");
        expect(screen.queryByRole("button", { name: /^Move up/ })).not.toBeInTheDocument();
    });

    test("Report Issue takes up to 4 photos, and one can be removed", async () => {
        const { user } = await setup();
        const file = (name) => new File(["x"], name, { type: "image/jpeg" });
        URL.createObjectURL = vi.fn(() => "blob:here");
        URL.revokeObjectURL = vi.fn();
        addIssue.mockResolvedValue(issue(9, 1, "Roof"));
        await user.click(screen.getByRole("button", { name: "Add Job" }));
        const dialog = screen.getByRole("dialog", { name: "Add Job" });
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
        await user.click(within(dialog).getByRole("button", { name: "Submit" }));
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

    test("a photo enlarges: the others by arrows, Save Photo, Escape only closes the photo", async () => {
        const user = userEvent.setup();
        const url = "blob:saved";
        URL.createObjectURL = vi.fn(() => url);
        URL.revokeObjectURL = vi.fn();
        const fetched = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(new Blob(["photo"])));
        const clicked = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
        const outer = vi.fn();
        document.addEventListener("keydown", outer);
        loadMaintenanceIssues.mockResolvedValue([issue(1, 1, "Fence", { photoPaths: ["a.jpg", "b.jpg"] })]);
        render(<IssuesTab enclosures={ENCLOSURES} me={{}} />);
        await user.click(await screen.findByRole("button", { name: "See photo 2 of 2" }));
        const viewer = screen.getByRole("dialog", { name: "Photo" });
        expect(within(viewer).getByRole("img")).toHaveAttribute("src", "signed:b.jpg");
        expect(viewer).toHaveTextContent("2 of 2");
        await user.click(within(viewer).getByRole("button", { name: "Next Photo" }));
        expect(within(viewer).getByRole("img")).toHaveAttribute("src", "signed:a.jpg");
        await user.keyboard("{ArrowLeft}");
        expect(within(viewer).getByRole("img")).toHaveAttribute("src", "signed:b.jpg");
        await user.click(within(viewer).getByRole("button", { name: "Save Photo" }));
        await waitFor(() => expect(clicked).toHaveBeenCalled());
        expect(fetched).toHaveBeenCalledWith("signed:b.jpg");
        outer.mockClear();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Photo" })).not.toBeInTheDocument();
        expect(outer).not.toHaveBeenCalled();
        document.removeEventListener("keydown", outer);
        vi.restoreAllMocks();
    });

    test("Save Photo that fails says so, and the photo stays", async () => {
        const user = userEvent.setup();
        vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("no signal"));
        loadMaintenanceIssues.mockResolvedValue([issue(1, 1, "Fence", { photoPaths: ["a.jpg"] })]);
        render(<IssuesTab enclosures={ENCLOSURES} me={{}} />);
        await user.click(await screen.findByRole("button", { name: "See photo 1 of 1" }));
        const viewer = screen.getByRole("dialog", { name: "Photo" });
        expect(within(viewer).queryByRole("button", { name: "Next Photo" })).not.toBeInTheDocument();
        await user.click(within(viewer).getByRole("button", { name: "Save Photo" }));
        expect(await within(viewer).findByRole("alert")).toHaveTextContent("Couldn't save the photo");
        expect(within(viewer).getByRole("img")).toBeInTheDocument();
        vi.restoreAllMocks();
    });

    test("only admins can delete, and with no signal nobody changes or deletes", async () => {
        const { user } = await setup();
        expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: /^Change/ })).toHaveLength(2);
        document.body.innerHTML = "";
        deleteIssue.mockResolvedValue();
        render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: true }} />);
        await screen.findByText("Fence down");
        await user.click(screen.getByRole("button", { name: "Delete the job: Fence down" }));
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(deleteIssue).toHaveBeenCalled());
        document.body.innerHTML = "";
        render(<IssuesTab enclosures={ENCLOSURES} me={{ isAdmin: true, offline: true }} />);
        await screen.findByText("Gate sticking");
        expect(screen.queryByRole("button", { name: /^Change/ })).not.toBeInTheDocument();
        expect(screen.queryByRole("button", { name: /^Delete/ })).not.toBeInTheDocument();
        expect(screen.getAllByRole("button", { name: "Job Done" }).length).toBeGreaterThan(0);
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
        expect(screen.queryByRole("button", { name: "Add Job" })).not.toBeInTheDocument();
    });

    test("staff: pins for the open issues, which can be hidden", async () => {
        const user = userEvent.setup();
        const { baseElement } = render(<WholeMap onClose={() => {}} enclosures={ENCLOSURES} canIssues />);
        await screen.findByRole("button", { name: "Hide Jobs (2)" });
        await waitFor(() => expect(baseElement.querySelectorAll("[data-issue]")).toHaveLength(1));
        await user.click(screen.getByRole("button", { name: "Hide Jobs (2)" }));
        expect(baseElement.querySelectorAll("[data-issue]")).toHaveLength(0);
        expect(screen.getByRole("button", { name: "Show Jobs (2)" })).toHaveAttribute("aria-pressed", "false");
    });

    test("Report Issue asks for the spot, and Cancel goes back", async () => {
        const user = userEvent.setup();
        render(<WholeMap onClose={() => {}} enclosures={ENCLOSURES} canIssues />);
        await user.click(await screen.findByRole("button", { name: "Add Job" }));
        expect(screen.getByText("Tap the map where the job is.")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("button", { name: "Add Job" })).toBeInTheDocument();
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
