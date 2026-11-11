// Records → Integration: Current Integrations (start one) and Reports (a
// batch of reports for the monkeys being integrated)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import {
    addIntegrationReports,
    loadIntegrationReportsFor,
    loadIntegrations,
    loadLatestReportDates,
    startIntegration,
    updateIntegrationStatus,
} from "./monkeyData";
import { checkReports, integrationChoices, integrationPlace, reportFrom } from "./integrations";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadIntegrations: vi.fn(),
    startIntegration: vi.fn(),
    loadLatestReportDates: vi.fn(),
    loadIntegrationReportsFor: vi.fn(),
    addIntegrationReports: vi.fn(),
    updateIntegrationStatus: vi.fn(),
}));

const monkey = (id, name, extra) => ({ id, name, sex: "female", troop: null, introcage: null, introcageType: null, img: [], ...extra });
const POPPY = monkey(1, "Poppy", { introcage: "Goliath A", introcageType: "introcage", enclosure: "Goliath" });
const RUDI = monkey(2, "Rudi", { introcage: "Gismo B", introcageType: "introcage", enclosure: "Gismo" });
const TROOPER = monkey(3, "Trooper", { troop: "Goliath" });
// (a troop monkey staying in an introcage for now: can be integrated)
const VISITOR = monkey(4, "Vera", { troop: "Gismo", stay: { id: 9, introcage: "Gismo C", enclosure: "Gismo" } });
// (in a care unit's area: not an introcage)
const ORPHAN = monkey(5, "Orla", { introcage: "Quarantine", introcageType: "area", enclosure: "Quarantine" });
const MONKEYS = [POPPY, RUDI, TROOPER, VISITOR, ORPHAN];

const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const active = (id, monkeyId, startedOn, kind = "adult") => ({ id, monkeyId, startedOn, kind, status: "active", loggedByName: "Sam" });

beforeEach(() => {
    vi.clearAllMocks();
    loadIntegrations.mockResolvedValue([]);
    loadLatestReportDates.mockResolvedValue({});
    loadIntegrationReportsFor.mockResolvedValue({});
    addIntegrationReports.mockResolvedValue(1);
});

const open = (route, { canEnter = true } = {}) => {
    const user = userEvent.setup();
    render(<RecordsPage route={route} monkeys={MONKEYS} enclosures={[]} canEnter={canEnter} />);
    return { user };
};

describe("the workings", () => {
    test("who can be integrated: introcage monkeys (or staying in one), not already integrating", () => {
        expect(integrationPlace(POPPY)).toBe("Goliath A");
        expect(integrationPlace(VISITOR)).toBe("Gismo C");
        expect(integrationPlace(TROOPER)).toBeNull();
        expect(integrationPlace(ORPHAN)).toBeNull();
        expect(integrationChoices(MONKEYS, [active(1, 2, "2026-10-01")]).map((m) => m.name)).toEqual(["Poppy", "Vera"]);
    });

    test("a report's From: the day after the last one, else the day it started (never after today)", () => {
        const now = new Date(2026, 9, 28);
        expect(reportFrom("2026-10-20", "2026-10-01", now)).toBe("2026-10-21");
        expect(reportFrom(undefined, "2026-10-01", now)).toBe("2026-10-01");
        expect(reportFrom("2026-10-28", "2026-10-01", now)).toBe("2026-10-28");
    });

    test("checking the reports: blank ones skipped; dates needed, in order, not in the future", () => {
        const now = new Date(2026, 9, 28);
        const { entries, errors } = checkReports(
            {
                1: { from: "2026-10-21", to: "2026-10-27", report: "  Calm with the troop. " },
                2: { from: "2026-10-21", to: "2026-10-27", report: "" },
                3: { from: "2026-10-27", to: "2026-10-21", report: "x" },
                4: { from: "2026-10-21", to: "2026-10-30", report: "x" },
                5: { from: "", to: "2026-10-27", report: "x" },
            },
            now
        );
        expect(entries).toEqual([{ monkeyId: 1, from: "2026-10-21", to: "2026-10-27", report: "Calm with the troop." }]);
        expect(errors).toEqual({
            3: "To can't be before From.",
            4: "To can't be in the future.",
            5: "Please give the From and To dates.",
        });
    });
});

test("Records: the Integration team, with Current Integrations and Reports", () => {
    open("records");
    const team = screen.getByRole("link", { name: /Integration/ });
    expect(team).toHaveAttribute("href", "#records/integration");
    expect(team).toHaveTextContent("Current Integrations · Reports");
});

describe("Current Integrations", () => {
    test("each one: the monkey, where it is, when it started, its type and ACTIVE", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20", "foster_mum")]);
        open("records/integration/current");
        const row = (await screen.findByText("Poppy")).closest("[role='row']");
        expect(row).toHaveTextContent("Goliath A");
        expect(row).toHaveTextContent("20th Oct 2026");
        expect(row).toHaveTextContent("Foster-Mum");
        expect(within(row).getByText("Active")).toHaveClass("is-active");
    });

    test("none yet, or the database not ready", async () => {
        const { unmount } = render(<RecordsPage route="records/integration/current" monkeys={MONKEYS} enclosures={[]} canEnter />);
        expect(await screen.findByText("No integrations going on at the moment.")).toBeInTheDocument();
        unmount();
        loadIntegrations.mockRejectedValue({ code: "42P01" });
        open("records/integration/current");
        expect(await screen.findByText(/need supabase\/integrations.sql to be run first/)).toBeInTheDocument();
    });

    test("New Integration: find the monkey, the date and the type; asks first, then starts it", async () => {
        startIntegration.mockResolvedValue(active(11, 4, "2026-10-25", "group"));
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "New Integration" }));
        const start = screen.getByRole("button", { name: "Start Integration" });
        expect(start).toBeDisabled();
        await user.type(screen.getByRole("searchbox", { name: "Search introcage monkeys" }), "gismo");
        // (introcage monkeys only: Vera's staying in Gismo C; Trooper's in the troop)
        const found = within(screen.getByRole("list", { name: "Monkeys found" }));
        expect(found.getAllByRole("button").map((b) => b.textContent)).toEqual(["RudiGismo B", "VeraGismo C"]);
        await user.click(found.getByRole("button", { name: /Vera/ }));
        await user.clear(screen.getByLabelText("Date Started"));
        await user.type(screen.getByLabelText("Date Started"), "2026-10-25");
        await user.selectOptions(screen.getByLabelText("Type"), "group");
        await user.click(start);
        const ask = screen.getByRole("dialog", { name: "Start integration for Vera?" });
        await user.click(within(ask).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(startIntegration).toHaveBeenCalledWith(4, { startedOn: "2026-10-25", kind: "group" }));
        expect(await screen.findByText("Integration started for Vera.")).toBeInTheDocument();
        expect(screen.getByText("Vera").closest("[role='row']")).toHaveTextContent("Group");
    });

    test("staff who can't enter: the list, no New Integration or Update", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        open("records/integration/current", { canEnter: false });
        await screen.findByText("Poppy");
        expect(screen.queryByRole("button", { name: "New Integration" })).toBeNull();
        expect(screen.queryByRole("button", { name: /^Update/ })).toBeNull();
    });

    test("Update → On Hold: asks first, then stays in the list as ON HOLD", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        updateIntegrationStatus.mockResolvedValue({ ...active(10, 1, "2026-10-20"), status: "on_hold" });
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        const dialog = screen.getByRole("dialog", { name: "Status Update: Poppy" });
        const select = within(dialog).getByLabelText("New Status");
        expect([...select.options].map((o) => o.textContent)).toEqual(["Choose…", "On Hold", "Completed", "Cancelled"]);
        expect(within(dialog).getByRole("button", { name: "Confirm" })).toBeDisabled();
        await user.selectOptions(select, "on_hold");
        await user.type(within(dialog).getByLabelText("Notes"), "Rudi is unwell");
        // (its date: today to start with, labelled by the status)
        const date = within(dialog).getByLabelText("Date On Hold");
        expect(date).toHaveValue(today());
        await user.clear(date);
        await user.type(date, "2026-10-26");
        await user.click(within(dialog).getByRole("button", { name: "Confirm" }));
        const ask = screen.getByRole("dialog", { name: "Mark Poppy's integration as On Hold?" });
        expect(ask).toHaveTextContent("stays in Current Integrations, as On Hold from 26th Oct 2026");
        expect(updateIntegrationStatus).not.toHaveBeenCalled();
        await user.click(within(ask).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(updateIntegrationStatus).toHaveBeenCalledWith(10, { status: "on_hold", date: "2026-10-26", notes: expect.any(String) }));
        expect(await screen.findByText("Poppy's integration is now On Hold.")).toBeInTheDocument();
        expect(within(screen.getByText("Poppy").closest("[role='row']")).getByText("On Hold")).toHaveClass("is-on_hold");
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("Update → On Hold with notes: sent with the status (for the Rehabilitation record) and added to the Integration reports on that date", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        updateIntegrationStatus.mockResolvedValue({ ...active(10, 1, "2026-10-20"), status: "on_hold" });
        addIntegrationReports.mockResolvedValue(1);
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "on_hold");
        const date = screen.getByLabelText("Date On Hold");
        await user.clear(date);
        await user.type(date, "2026-10-26");
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        await user.type(screen.getByLabelText("Notes"), "  Rudi is unwell ");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("dialog")).toHaveTextContent(`Adds "Integration placed on hold: Rudi is unwell" to Poppy's Rehabilitation records and Integration reports.`);
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() =>
            expect(addIntegrationReports).toHaveBeenCalledWith([
                { monkeyId: 1, from: "2026-10-26", to: "2026-10-26", report: "Integration on hold: Rudi is unwell" },
            ])
        );
        expect(updateIntegrationStatus).toHaveBeenCalledWith(10, { status: "on_hold", date: "2026-10-26", notes: "  Rudi is unwell " });
        expect(await screen.findByText("Poppy's integration is now On Hold.")).toBeInTheDocument();
    });

    test("Update → Completed without notes: just \"Integration completed\"; Active asks for no notes", async () => {
        loadIntegrations.mockResolvedValue([{ ...active(10, 1, "2026-10-20"), status: "on_hold" }]);
        updateIntegrationStatus.mockResolvedValue({ ...active(10, 1, "2026-10-20"), status: "completed" });
        addIntegrationReports.mockResolvedValue(1);
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "active");
        expect(screen.queryByLabelText("Notes (optional)")).toBeNull();
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(screen.getByRole("dialog")).toHaveTextContent(`Adds "Integration resumed" to Poppy's Rehabilitation records.`);
        await user.click(screen.getByRole("button", { name: "Back" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "completed");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(addIntegrationReports).toHaveBeenCalledTimes(1));
        expect(addIntegrationReports.mock.calls[0][0][0].report).toBe("Integration completed");
    });

    test("Update: if only the entry fails, the status stays saved and the message says so", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        updateIntegrationStatus.mockResolvedValue({ ...active(10, 1, "2026-10-20"), status: "on_hold" });
        addIntegrationReports.mockRejectedValue(new Error("No connection."));
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "on_hold");
        await user.type(screen.getByLabelText("Notes"), "Rudi is unwell");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByText(/now On Hold\. Its entry couldn't be added .*No connection\..*add it in Reports/)).toBeInTheDocument();
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    test("Update → Cancelled: needs a reason, a green Confirm; it leaves the list", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20"), active(11, 2, "2026-10-21")]);
        updateIntegrationStatus.mockResolvedValue({ ...active(10, 1, "2026-10-20"), status: "cancelled" });
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "cancelled");
        await user.type(screen.getByLabelText("Notes"), "Not getting on");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        const ask = screen.getByRole("dialog", { name: "Mark Poppy's integration as Cancelled?" });
        expect(ask).toHaveTextContent(/will end on .* and leave Current Integrations/);
        const confirm = within(ask).getByRole("button", { name: "Confirm" });
        expect(confirm).toHaveClass("is-confirm");
        await user.click(confirm);
        expect(await screen.findByText("Poppy's integration is now Cancelled.")).toBeInTheDocument();
        expect(screen.queryByRole("row", { name: /Poppy/ })).toBeNull();
        expect(screen.queryByText("Poppy")).toBeNull();
        expect(screen.getByText("Rudi")).toBeInTheDocument();
    });

    test("Update: the date can't be before the integration started", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "completed");
        const date = screen.getByLabelText("Date Completed");
        await user.clear(date);
        await user.type(date, "2026-10-19");
        expect(screen.getByText(/can't be before it started \(20th Oct 2026\)/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
    });

    test("Update: Cancel changes nothing; a problem shows in the pop-up", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-20")]);
        updateIntegrationStatus.mockRejectedValue(new Error("No connection."));
        const { user } = open("records/integration/current");
        await user.click(await screen.findByRole("button", { name: "Update, Poppy" }));
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.queryByRole("dialog")).toBeNull();
        await user.click(screen.getByRole("button", { name: "Update, Poppy" }));
        await user.selectOptions(screen.getByLabelText("New Status"), "completed");
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        await user.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("No connection.");
        expect(screen.getByText("Poppy").closest("[role='row']")).toHaveTextContent("Active");
    });
});

describe("Reports", () => {
    test("a card per monkey being integrated: From (after its last report), To (today), its report", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01"), active(11, 2, "2026-10-15")]);
        loadLatestReportDates.mockResolvedValue({ 1: "2026-10-20" });
        open("records/integration/reports");
        await waitFor(() => expect(screen.getByLabelText("From, Poppy")).toHaveValue("2026-10-21"));
        expect(screen.getByLabelText("To, Poppy")).toHaveValue(today());
        expect(screen.getByLabelText("From, Rudi")).toHaveValue("2026-10-15");
        expect(screen.getByText("Poppy").closest("li")).toHaveTextContent("Last report to 20th Oct 2026");
        expect(screen.getByText("Rudi").closest("li")).toHaveTextContent("No reports yet");
        expect(screen.getByLabelText("Poppy")).toHaveAttribute("maxLength", "1000");
    });

    test("Save All: the ones with a report, together; the rest skipped", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01"), active(11, 2, "2026-10-15")]);
        addIntegrationReports.mockResolvedValue(1);
        const { user } = open("records/integration/reports");
        await user.type(await screen.findByLabelText("Poppy"), "Groomed by two adults; calm.");
        expect(screen.getByText("28 / 1000")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Save All" }));
        await waitFor(() => expect(addIntegrationReports).toHaveBeenCalledTimes(1));
        expect(addIntegrationReports.mock.calls[0][0]).toEqual([
            { monkeyId: 1, from: "2026-10-01", to: today(), report: "Groomed by two adults; calm." },
        ]);
        expect(await screen.findByText("Saved 1 report.")).toBeInTheDocument();
        expect(screen.getByLabelText("Poppy")).toHaveValue("");
    });

    test("nothing written, or a date problem: says so, nothing saved", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01")]);
        const { user } = open("records/integration/reports");
        await user.click(await screen.findByRole("button", { name: "Save All" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Nothing to save yet");
        await user.type(screen.getByLabelText("Poppy"), "Calm");
        await user.clear(screen.getByLabelText("From, Poppy"));
        await user.click(screen.getByRole("button", { name: "Save All" }));
        expect(screen.getByText("Please give the From and To dates.")).toBeInTheDocument();
        expect(addIntegrationReports).not.toHaveBeenCalled();
    });

    test("none going on: points to Current Integrations", async () => {
        open("records/integration/reports");
        expect(await screen.findByRole("link", { name: "Current Integrations" })).toHaveAttribute("href", "#records/integration/current");
    });
});

describe("Reports: View (past reports)", () => {
    const report = (id, from, to, text, by = "Sam") => ({ id, from, to, report: text, loggedByName: by });

    test("Enter and View tabs; View: each monkey's reports newest first, the latest report's monkey at the top", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01"), active(11, 2, "2026-10-15"), active(12, 4, "2026-11-01")]);
        loadIntegrationReportsFor.mockResolvedValue({
            1: [report(2, "2026-10-14", "2026-10-20", "Calmer now."), report(1, "2026-10-07", "2026-10-13", "Nervous at first.", "Jo")],
            2: [report(3, "2026-10-22", "2026-10-28", "Groomed by two adults.")],
        });
        const { user } = open("records/integration/reports");
        expect(await screen.findByRole("tab", { name: "Enter" })).toHaveAttribute("aria-selected", "true");
        await user.click(screen.getByRole("tab", { name: "View" }));
        const lists = await screen.findAllByRole("list", { name: /'s reports$/ });
        // Rudi (latest report 28th Oct), then Poppy (20th Oct); Vera (none) last
        expect(lists.map((l) => l.getAttribute("aria-label"))).toEqual(["Rudi's reports", "Poppy's reports"]);
        expect(loadIntegrationReportsFor).toHaveBeenCalledWith([1, 2, 4]);
        const poppy = within(lists[1]).getAllByRole("listitem");
        expect(poppy[0]).toHaveTextContent("14th Oct – 20th Oct 2026 · Sam");
        expect(poppy[0]).toHaveTextContent("Calmer now.");
        expect(poppy[1]).toHaveTextContent("Nervous at first.");
        expect(screen.getByText("Poppy").closest("li")).toHaveTextContent("2 reports");
        expect(screen.getByText("Vera").closest("li")).toHaveTextContent("No reports yet");
        const cards = screen.getAllByText(/^(Poppy|Rudi|Vera)$/).map((n) => n.textContent);
        expect(cards).toEqual(["Rudi", "Poppy", "Vera"]);
    });

    test("more than 3 reports: the latest 3, then Show All", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01")]);
        loadIntegrationReportsFor.mockResolvedValue({
            1: [1, 2, 3, 4, 5].map((n) => report(n, `2026-10-0${n}`, `2026-10-0${n}`, `Day ${n}`)),
        });
        const { user } = open("records/integration/reports");
        await user.click(await screen.findByRole("tab", { name: "View" }));
        const list = await screen.findByRole("list", { name: "Poppy's reports" });
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
        await user.click(screen.getByRole("button", { name: "Show All (5)" }));
        expect(within(list).getAllByRole("listitem")).toHaveLength(5);
        await user.click(screen.getByRole("button", { name: "Show Fewer" }));
        expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    });

    test("staff who can't enter: View only, no tabs", async () => {
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01")]);
        loadIntegrationReportsFor.mockResolvedValue({ 1: [report(1, "2026-10-07", "2026-10-13", "Settling in.")] });
        open("records/integration/reports", { canEnter: false });
        expect(await screen.findByText("Settling in.")).toBeInTheDocument();
        expect(screen.queryByRole("tab")).toBeNull();
        expect(screen.queryByRole("button", { name: "Save All" })).toBeNull();
    });

    test("the reports couldn't load: says so", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        loadIntegrations.mockResolvedValue([active(10, 1, "2026-10-01")]);
        loadIntegrationReportsFor.mockRejectedValue(new Error("offline"));
        open("records/integration/reports", { canEnter: false });
        expect(await screen.findByText(/Couldn't load the reports/)).toBeInTheDocument();
    });
});
