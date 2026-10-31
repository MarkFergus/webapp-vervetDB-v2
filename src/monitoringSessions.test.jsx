// Records → Sections → Monitoring: Start Session (the briefing), then after
// the walk the checks and the checklist, Finish Session, the alerts and the
// WhatsApp summary; the History; who can do what
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import {
    addInjuryUpdate,
    deleteMonitoringSession,
    finishMonitoringSession,
    loadConditions,
    loadCurrentInjuries,
    loadMonitoringFor,
    loadMonitoringSessions,
    loadSessionNotes,
    startMonitoringSession,
} from "./monkeyData";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadMonitoringSessions: vi.fn(),
    startMonitoringSession: vi.fn(),
    finishMonitoringSession: vi.fn(),
    deleteMonitoringSession: vi.fn(),
    loadConditions: vi.fn(),
    addCondition: vi.fn(),
    loadMonitoringFor: vi.fn(),
    loadSessionNotes: vi.fn(),
    loadCurrentInjuries: vi.fn(),
    injuryUpdatesAvailable: () => true,
    addInjuryUpdate: vi.fn(),
}));

const place = (id, name, type, parentId = null) => ({ id, name, type, parentId, sortOrder: id });
const ENCLOSURES = [place(1, "Skunkey", "troop"), place(2, "Skunkey B2", "introcage", 1), place(3, "Goliath", "troop")];
const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "", introcage: null, introcageType: null };
const MONKEYS = [
    { ...base, id: 1, name: "Malawi", troop: "Skunkey", enclosure: "Skunkey" },
    { ...base, id: 2, name: "Daisy Mae", troop: "Skunkey", enclosure: "Skunkey" },
    { ...base, id: 3, name: "Paradise", troop: "Skunkey", enclosure: "Skunkey" },
    { ...base, id: 4, name: "Pip", troop: "Skunkey", enclosure: "Skunkey", introcage: "Skunkey B2", introcageType: "introcage" },
];
const EDITOR = { canSee: true, canAdd: true, userId: "u-1", isAdmin: false };

const finished = (id, date, seen, extra = {}) => ({
    id, enclosureId: 1, date, status: "finished", foodUsed: null, fence: "good", waters: "ok", food: "good", notes: "",
    startedBy: "u-9", startedByName: "Jo", startedAt: `${date}T08:00:00Z`, finishedAt: `${date}T10:00:00Z`,
    sightings: Object.entries(seen).map(([monkeyId, s]) => ({ monkeyId: Number(monkeyId), seen: s })), ...extra,
});
const PAST = [
    finished(12, "2026-10-26", { 1: false, 2: true, 3: true, 4: true }, { fence: "low" }),
    finished(11, "2026-10-19", { 1: false, 2: true, 3: true, 4: true }),
    finished(10, "2026-10-12", { 1: true, 2: true, 3: true, 4: true }),
];
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const open = (staff = EDITOR) =>
    render(<RecordsPage route="records/sections/monitoring" monkeys={MONKEYS} enclosures={ENCLOSURES} staff={staff} />);

beforeEach(() => {
    vi.clearAllMocks();
    localStorage.setItem("vervetdb-sections-troop", "Skunkey");
    localStorage.removeItem("vervetdb-monitoring-draft-30");
    loadMonitoringSessions.mockResolvedValue(PAST);
    loadConditions.mockImplementation(async (ids) =>
        ids.includes(2) ? [{ id: 1, monkeyId: 2, date: "2026-10-26", description: "Looking thin", sessionId: 12 }] : []
    );
    loadMonitoringFor.mockImplementation(async (ids) => (ids.includes(4) ? { 4: { conditionCheck: true, notes: "Check her weight" } } : {}));
    loadSessionNotes.mockResolvedValue([]);
    loadCurrentInjuries.mockImplementation(async (ids) =>
        ids.includes(3)
            ? [{ id: 5, monkeyId: 3, date: "2026-09-01", description: "Eye infection", loggedBy: "u-9", healedOn: null, updates: [] }]
            : []
    );
});

afterAll(() => localStorage.removeItem("vervetdb-sections-troop"));

test("Sections: Monitoring, then Injuries", () => {
    render(<RecordsPage route="records/sections" monkeys={MONKEYS} enclosures={ENCLOSURES} staff={EDITOR} />);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toEqual(["#records", "#records/sections/monitoring", "#records/sections/injuries"]);
});

test("a whole session: Start (the briefing), the checks and checklist, Finish, then the alerts and the WhatsApp summary", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    startMonitoringSession.mockResolvedValue({
        id: 20, enclosureId: 1, date: today(), status: "in_progress", foodUsed: null, fence: null, waters: null, food: null,
        notes: "", startedBy: "u-1", startedByName: "Sam", startedAt: new Date().toISOString(), finishedAt: null, sightings: [],
    });
    open();
    // The History: newest first, compact, with ⚠ for a problem
    const history = await screen.findByRole("list", { name: "History" });
    expect(within(history).getAllByRole("listitem")).toHaveLength(3);
    expect(within(history).getAllByRole("button")[0]).toHaveTextContent("26th Oct 2026");
    expect(within(history).getByLabelText("Fence: Low")).toHaveTextContent("⚡️ !");
    expect(within(history).getAllByRole("button")[0]).toHaveTextContent("3 / 4 seen");

    await user.click(screen.getByRole("button", { name: "Start Session" }));
    expect(startMonitoringSession).toHaveBeenCalledWith(1, today());

    // The page's title: the troop's
    expect(await screen.findByRole("heading", { level: 1, name: "Skunkey Monitoring" })).toBeInTheDocument();
    // The briefing: Must See, priority checks, injuries (Update Needed), conditions
    const briefing = await screen.findByRole("region", { name: "Briefing" });
    expect(within(briefing).getByText("Must See")).toBeInTheDocument();
    expect(within(briefing).getByText(/missing on the last 2 sessions, last seen 12th Oct 2026/)).toBeInTheDocument();
    expect(within(briefing).getByText(/Check her weight/)).toBeInTheDocument();
    expect(await within(briefing).findByText(/Eye infection/)).toBeInTheDocument();
    expect(within(briefing).getByText("Update Needed")).toBeInTheDocument();
    expect(await within(briefing).findByText(/Looking thin/)).toBeInTheDocument();

    // After the walk: the checks…
    await user.click(screen.getByRole("button", { name: "Finish Session" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Please choose the Fence, Waters and Food checks.");
    await user.click(within(screen.getByRole("group", { name: "Fence" })).getByRole("button", { name: "Good" }));
    await user.click(within(screen.getByRole("group", { name: "Waters" })).getByRole("button", { name: "OK" }));
    await user.click(within(screen.getByRole("group", { name: "Food" })).getByRole("button", { name: "Good" }));
    // (food used: optional, one only, tap again to take it off)
    const used = screen.getByRole("group", { name: "Food (optional)" });
    await user.click(within(used).getByRole("button", { name: "Corn" }));
    await user.click(within(used).getByRole("button", { name: "Seeds" }));
    expect(within(used).getByRole("button", { name: "Seeds" })).toHaveAttribute("aria-pressed", "true");
    expect(within(used).getByRole("button", { name: "Corn" })).toHaveAttribute("aria-pressed", "false");

    // …the checklist (introcage monkeys under their introcage), Tick All, untick the missing
    expect(screen.getByRole("heading", { name: "Skunkey B2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tick All Seen" }));
    expect(screen.getByText("4 / 4 seen")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Malawi seen"));
    await user.click(screen.getByLabelText("Daisy Mae seen"));
    expect(screen.getByText("2 / 4 seen")).toBeInTheDocument();

    // …and an update on Paradise's injury, linked to the session
    addInjuryUpdate.mockImplementation(async (_id, { date, details }) => ({ id: 8, date, details, loggedBy: "u-1" }));
    loadSessionNotes.mockResolvedValue([{ monkeyId: 3, text: "eye almost back to normal", kind: "update", at: "x" }]);
    const paradise = screen.getByLabelText("Paradise seen").closest("li");
    await user.click(within(paradise).getByRole("button", { name: "Add for Paradise" }));
    expect(within(paradise).getByRole("heading", { name: "Add · Paradise" })).toBeInTheDocument();
    // Update · Injury · Condition (Update first, and chosen: she has an injury); it says which injury
    const what = within(paradise).getByRole("group", { name: "What to add" });
    expect(within(what).getAllByRole("button").map((b) => b.textContent)).toEqual(["Update", "Injury", "Condition"]);
    expect(within(what).getByRole("button", { name: "Update" })).toHaveAttribute("aria-pressed", "true");
    expect(within(paradise).getByText(/Eye infection · 1st Sep 2026/)).toBeInTheDocument();
    await user.type(within(paradise).getByLabelText("Details"), "eye almost back to normal");
    await user.click(within(paradise).getByRole("button", { name: "Confirm" }));
    expect(addInjuryUpdate).toHaveBeenCalledWith(5, { date: today(), details: "eye almost back to normal", sessionId: 20 });
    expect(await within(paradise).findByText("eye almost back to normal")).toBeInTheDocument();

    await user.type(screen.getByLabelText("General Notes"), "Raining");
    finishMonitoringSession.mockImplementation(async (id, values) => ({
        ...finished(id, values.date, Object.fromEntries([...values.seen.map((m) => [m, true]), ...values.notSeen.map((m) => [m, false])])),
        fence: values.fence, waters: values.waters, food: values.food, notes: values.notes, foodUsed: values.foodUsed,
    }));
    await user.click(screen.getByRole("button", { name: "Finish Session" }));
    expect(finishMonitoringSession).toHaveBeenCalledWith(20, {
        date: today(), foodUsed: "seeds", fence: "good", waters: "ok", food: "good", notes: "Raining", seen: [3, 4], notSeen: [2, 1],
    });

    // The alerts, then the summary to copy
    expect(await screen.findByRole("heading", { name: "Monitoring Summary" })).toBeInTheDocument();
    const alerts = screen.getByRole("list", { name: "Alerts" });
    expect(within(alerts).getByText("Malawi has not been seen since 12/10, missing on the last 3 sessions")).toBeInTheDocument();
    // (Paradise's injury had an update just now: no alert for it)
    expect(within(alerts).queryByText(/Paradise's injury/)).toBeNull();
    const text = screen.getByLabelText("WhatsApp summary").textContent;
    expect(text).toContain("📋 Skunkey Monitoring");
    expect(text).toContain("All seen except Daisy Mae (seen 26.10) and Malawi (seen 12.10)");
    expect(text).toContain("⚠️ Malawi not seen for 3 sessions (since 12.10)");
    expect(text).toContain("🐒 Paradise eye almost back to normal");
    expect(text).toMatch(/^📋 Skunkey Monitoring \d\d\.\d\d\n_Raining_\n/);
    expect(text).toMatch(/🥗 good\n💧 good\n⚡️ good$/);
    await user.click(screen.getByRole("button", { name: "Copy for WhatsApp" }));
    expect(writeText).toHaveBeenCalledWith(text);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    // Done: back to the list, and its title
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.getByRole("heading", { level: 1, name: "Monitoring" })).toBeInTheDocument();
});

test("the same troop twice in a day: asks first", async () => {
    const user = userEvent.setup();
    loadMonitoringSessions.mockResolvedValue([
        { ...finished(30, today(), {}, { startedBy: "u-1" }), status: "in_progress", finishedAt: null, startedByName: "Sam" },
        finished(31, today(), { 1: true, 2: true, 3: true, 4: true }),
        ...PAST,
    ]);
    finishMonitoringSession.mockResolvedValue(finished(30, today(), { 1: true, 2: true, 3: true, 4: true }));
    open();
    await user.click(await screen.findByRole("button", { name: "Continue Session" }));
    for (const [group, word] of [["Fence", "Good"], ["Waters", "OK"], ["Food", "Good"]]) {
        await user.click(within(screen.getByRole("group", { name: group })).getByRole("button", { name: word }));
    }
    await user.click(screen.getByRole("button", { name: "Tick All Seen" }));
    await user.click(screen.getByRole("button", { name: "Finish Session" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Skunkey already has a session on");
    expect(finishMonitoringSession).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save Anyway" }));
    expect(finishMonitoringSession).toHaveBeenCalled();
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "Skunkey Monitoring" })).toBeInTheDocument();
    // (no update on Paradise's injury since 1 September)
    expect(screen.getByText("Paradise's injury has not been updated since 01/09")).toBeInTheDocument();
});

test("no connection at Finish: nothing lost, kept on the phone until it's saved", async () => {
    const user = userEvent.setup();
    const inProgress = { ...finished(30, "2026-10-30", {}, { startedBy: "u-1" }), status: "in_progress", finishedAt: null };
    loadMonitoringSessions.mockResolvedValue([inProgress, ...PAST]);
    finishMonitoringSession.mockRejectedValueOnce(Object.assign(new Error("Couldn't save right now."), { offline: true }));
    const { unmount } = open();
    await user.click(await screen.findByRole("button", { name: "Continue Session" }));
    for (const [group, word] of [["Fence", "Low"], ["Waters", "OK"], ["Food", "Good"]]) {
        await user.click(within(screen.getByRole("group", { name: group })).getByRole("button", { name: word }));
    }
    await user.click(screen.getByRole("checkbox", { name: /Malawi/ }));
    await user.click(screen.getByRole("button", { name: "Finish Session" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No connection right now. Everything entered is kept on this phone");
    // (the tab closed, then opened again: all still there)
    unmount();
    open();
    await user.click(await screen.findByRole("button", { name: "Continue Session" }));
    expect(within(screen.getByRole("group", { name: "Fence" })).getByRole("button", { name: "Low" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("checkbox", { name: /Malawi/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Paradise/ })).not.toBeChecked();
    // (saved: the draft's gone)
    finishMonitoringSession.mockResolvedValue(finished(30, "2026-10-30", { 1: true, 2: false, 3: false, 4: false }));
    await user.click(screen.getByRole("button", { name: "Finish Session" }));
    expect(await screen.findByText("Session saved")).toBeInTheDocument();
    expect(localStorage.getItem("vervetdb-monitoring-draft-30")).toBeNull();
});

test("the top: In Progress and Recently Monitored (24 hours), every troop, just a list; maintenance staff can't start one", async () => {
    loadMonitoringSessions.mockResolvedValue([
        { ...finished(30, today(), {}), status: "in_progress", finishedAt: null, startedByName: "Jo", enclosureId: 3 },
        finished(31, today(), { 1: true, 2: false }, { finishedAt: new Date().toISOString(), startedByName: "Sam" }),
        ...PAST,
    ]);
    const { unmount } = open();
    const top = await screen.findByRole("region", { name: "In Progress" });
    expect(top).toHaveTextContent(/Goliath · started .* by Jo/);
    expect(within(top).getByRole("list", { name: "Recently Monitored" })).toHaveTextContent(/Skunkey · finished .* by Sam · 1 \/ 2 seen/);
    // (older sessions aren't recent)
    expect(within(top).queryByText(/26th Oct/)).toBeNull();
    expect(within(top).queryByRole("button")).toBeNull();
    unmount();
    open({ canSee: true, canAdd: false, userId: "u-2", isAdmin: false });
    await screen.findByRole("list", { name: "History" });
    expect(screen.queryByRole("button", { name: "Start Session" })).toBeNull();
});

test("the History: tap a session for its summary again", async () => {
    const user = userEvent.setup();
    loadSessionNotes.mockResolvedValue([{ monkeyId: 3, text: "eye looks sore", kind: "update", at: "x" }]);
    open();
    const history = await screen.findByRole("list", { name: "History" });
    await user.click(within(history).getAllByRole("button")[0]);
    await waitFor(() => expect(screen.getByLabelText("WhatsApp summary").textContent).toContain("🐒 Paradise eye looks sore"));
    const text = screen.getByLabelText("WhatsApp summary").textContent;
    expect(text).toContain("📋 Skunkey Monitoring 26.10");
    // (as it was then: Malawi last seen before that session)
    expect(text).toContain("All seen except Malawi (seen 12.10)");
    expect(text).toContain("⚡️ low");
    expect(loadSessionNotes).toHaveBeenCalledWith(12);
});

test("by the troop picker: Continue Session and Cancel Session for your own", async () => {
    const user = userEvent.setup();
    deleteMonitoringSession.mockResolvedValue();
    loadMonitoringSessions.mockResolvedValue([
        { ...finished(30, today(), {}, { startedBy: "u-1" }), status: "in_progress", finishedAt: null, startedByName: "Sam" },
        ...PAST,
    ]);
    open();
    const bar = (await screen.findByRole("button", { name: "Continue Session" })).closest(".SectionsPage-bar");
    expect(within(bar).queryByRole("button", { name: "Start Session" })).toBeNull();
    await user.click(within(bar).getByRole("button", { name: "Cancel Session" }));
    expect(screen.getByText("Cancel this session? It will be deleted.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(deleteMonitoringSession).toHaveBeenCalledWith(30);
    expect(await screen.findByRole("button", { name: "Start Session" })).toBeInTheDocument();
});

test("phones: D&D in the troop picker, and Continue / Cancel without \"Session\", so they fit on one row", async () => {
    const original = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === "(max-width: 624px)", addEventListener: () => {}, removeEventListener: () => {} });
    try {
        loadMonitoringSessions.mockResolvedValue([
            { ...finished(30, today(), {}, { startedBy: "u-1" }), status: "in_progress", finishedAt: null, startedByName: "Sam" },
            ...PAST,
        ]);
        render(
            <RecordsPage
                route="records/sections/monitoring"
                monkeys={MONKEYS}
                enclosures={[...ENCLOSURES, place(5, "D&D", "troop")]}
                staff={EDITOR}
            />
        );
        expect(await screen.findByRole("button", { name: "Continue" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
        expect(within(screen.getByLabelText("Troop")).getByRole("option", { name: /^D&D/ })).toBeInTheDocument();
    } finally {
        window.matchMedia = original;
    }
});

test("the +: no Update for a monkey without an injury; a condition saved for the session", async () => {
    const user = userEvent.setup();
    const { addCondition } = await import("./monkeyData");
    addCondition.mockResolvedValue({ id: 9 });
    loadMonitoringSessions.mockResolvedValue([
        { ...finished(30, today(), {}, { startedBy: "u-1" }), status: "in_progress", finishedAt: null, startedByName: "Sam" },
        ...PAST,
    ]);
    open();
    await user.click(await screen.findByRole("button", { name: "Continue Session" }));
    const rox = screen.getByLabelText("Daisy Mae seen").closest("li");
    await user.click(within(rox).getByRole("button", { name: "Add for Daisy Mae" }));
    const what = within(rox).getByRole("group", { name: "What to add" });
    expect(within(what).getAllByRole("button").map((b) => b.textContent)).toEqual(["Injury", "Condition"]);
    expect(within(what).getByRole("button", { name: "Injury" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(what).getByRole("button", { name: "Condition" }));
    await user.type(within(rox).getByLabelText("Condition"), "Scruffy coat");
    await user.click(within(rox).getByRole("button", { name: "Confirm" }));
    expect(addCondition).toHaveBeenCalledWith(2, { date: today(), description: "Scruffy coat", sessionId: 30 });
});
