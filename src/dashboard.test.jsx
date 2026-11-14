// My Dashboard: the alerts for someone's sections, their to-do list's order,
// this week's and month's checklists, and the page itself
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { dueState, myAlerts, periodOf, sectionMonkeys, sortTodos } from "./dashboardRules";
import StaffDashboard from "./StaffDashboard";
import * as data from "./dashboardData";
import * as monkeyData from "./monkeyData";

const GOLIATH = { id: 1, name: "Goliath", type: "troop", section: "Top" };
const KOKO = { id: 2, name: "Koko", type: "troop", section: "Bottom" };
const ENCLOSURES = [GOLIATH, KOKO];
const monkey = (id, name, enclosure, extra = {}) => ({ id, name, troop: enclosure, enclosure, introcage: null, status: "sanctuary", img: [], ...extra });
const PIP = monkey(11, "Pip", "Goliath");
const ABBY = monkey(12, "Abby", "Goliath");
const RUBY = monkey(13, "Ruby", "Goliath", { introcage: "Goliath A" });
const KOKO_ONE = monkey(21, "Kiki", "Koko");
const MONKEYS = [PIP, ABBY, RUBY, KOKO_ONE];
const session = (id, enclosureId, date, seen) => ({
    id,
    enclosureId,
    date,
    status: "finished",
    finishedAt: `${date}T10:00:00Z`,
    sightings: seen.map(([monkeyId, wasSeen]) => ({ monkeyId, seen: wasSeen })),
});

describe("the workings", () => {
    test("this week's Monday and this month", () => {
        expect(periodOf("week", "2026-11-14")).toBe("2026-11-09");
        expect(periodOf("month", "2026-11-14")).toBe("2026-11");
    });

    test("to-dos: dated ones first, soonest first, then the rest; overdue and today", () => {
        const todos = [
            { id: 1, text: "no date", dueOn: null, createdAt: "2026-11-01" },
            { id: 2, text: "later", dueOn: "2026-11-20", createdAt: "2026-11-02" },
            { id: 3, text: "sooner", dueOn: "2026-11-10", createdAt: "2026-11-03" },
            { id: 4, text: "done", dueOn: null, doneAt: "2026-11-12T08:00:00Z", createdAt: "2026-11-01" },
        ];
        const { open, done } = sortTodos(todos);
        expect(open.map((t) => t.text)).toEqual(["sooner", "later", "no date"]);
        expect(done.map((t) => t.text)).toEqual(["done"]);
        expect(dueState(todos[2], "2026-11-14")).toBe("overdue");
        expect(dueState({ dueOn: "2026-11-14" }, "2026-11-14")).toBe("today");
        expect(dueState(todos[1], "2026-11-14")).toBeNull();
    });

    test("a section's monkeys: its troops' (introcages too), not other sections'", () => {
        expect(sectionMonkeys(MONKEYS, ENCLOSURES, ["Top"]).map((m) => m.name).sort()).toEqual(["Abby", "Pip", "Ruby"]);
    });

    test("alerts: an overdue troop, Must See, not seen last session, an injury needing an update; introcage monkeys and muted ones left out", () => {
        const sessions = [
            session(1, 1, "2026-11-01", [[11, false], [12, true], [13, false]]),
            session(2, 1, "2026-11-05", [[11, false], [12, false], [13, false]]),
        ];
        const injuries = [
            { id: 7, monkeyId: 12, date: "2026-10-20", description: "Bite on tail", updates: [] },
            { id: 8, monkeyId: 21, date: "2026-10-01", description: "Koko's, not mine", updates: [] },
        ];
        const alerts = myAlerts({ monkeys: MONKEYS, enclosures: ENCLOSURES, sections: ["Top"], sessions, injuries, today: "2026-11-14" });
        expect(alerts.map((a) => [a.level, a.monkey?.name ?? null, a.text])).toEqual([
            ["urgent", null, "Goliath Troop: no monitoring session for 9 days"],
            ["urgent", "Pip", "Must See: not seen in the last 2 sessions"],
            ["warning", "Abby", "Not seen last session"],
            ["warning", "Abby", "Injury update needed: Bite on tail"],
        ]);
        const muted = myAlerts({ monkeys: MONKEYS, enclosures: ENCLOSURES, sections: ["Top"], sessions, muted: new Set([11]), today: "2026-11-06" });
        expect(muted.map((a) => a.monkey?.name)).toEqual(["Abby"]);
    });
});

describe("the page", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(monkeyData, "loadMonitoringSessions").mockResolvedValue([session(1, 1, "2020-01-01", [[11, true]])]);
        vi.spyOn(monkeyData, "loadSpotSightings").mockResolvedValue([]);
        vi.spyOn(monkeyData, "loadLastMoves").mockResolvedValue({});
        vi.spyOn(monkeyData, "loadMonitoringFor").mockResolvedValue({});
        vi.spyOn(monkeyData, "loadCurrentInjuries").mockResolvedValue([]);
    });

    test("alerts for the sections chosen; a to-do added; a weekly item ticked", async () => {
        const user = userEvent.setup();
        vi.spyOn(data, "loadDashboard").mockResolvedValue({
            todos: [],
            items: [{ id: 5, every: "week", text: "Check the water bowls", position: 0 }],
            ticks: [],
            sections: [],
        });
        const saveSections = vi.spyOn(data, "saveSections").mockResolvedValue();
        const addTodo = vi.spyOn(data, "addTodo").mockImplementation(async ({ text, dueOn }) => ({ id: 9, text, dueOn: dueOn || null, doneAt: null, createdAt: "x" }));
        const setTicked = vi.spyOn(data, "setTicked").mockResolvedValue();
        render(<StaffDashboard monkeys={MONKEYS} enclosures={ENCLOSURES} />);

        expect(await screen.findByText("Choose your sections above to see their alerts.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Top" }));
        expect(saveSections).toHaveBeenCalledWith(["Top"]);
        expect(await screen.findByText(/Goliath Troop: no monitoring session for/)).toBeInTheDocument();

        await user.type(screen.getByLabelText("New to-do"), "Order more pellets");
        await user.click(screen.getByRole("button", { name: "Add" }));
        expect(addTodo).toHaveBeenCalledWith({ text: "Order more pellets", dueOn: "" });
        expect(await screen.findByText("Order more pellets")).toBeInTheDocument();

        const week = screen.getByRole("region", { name: /This Week/ });
        expect(within(week).getByText("0 of 1 done")).toBeInTheDocument();
        await user.click(within(week).getByRole("checkbox", { name: "Check the water bowls" }));
        await waitFor(() => expect(within(week).getByText("1 of 1 done")).toBeInTheDocument());
        expect(setTicked).toHaveBeenCalledWith(5, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), true);
    });

    test("before the SQL's been run: says so", async () => {
        vi.spyOn(data, "loadDashboard").mockRejectedValue(Object.assign(new Error("My Dashboard needs supabase/staff-dashboard.sql to be run first."), { notReady: true }));
        render(<StaffDashboard monkeys={MONKEYS} enclosures={ENCLOSURES} />);
        expect(await screen.findByText(/needs supabase\/staff-dashboard.sql/)).toBeInTheDocument();
    });
});
