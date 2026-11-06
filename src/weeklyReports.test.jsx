// Weekly Reports (Admin Dashboard → Weekly Reports, #admin/reports): each
// admin's own weekly report email settings (weekly-reports.sql), and Past
// Reports: any week's report (weekly-report-contents.sql) to View or Email Me
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import AdminPage from "./AdminPage";
import { nextReport, pastWeeks, weekBefore, weekRunsText } from "./weeklyReportRules";

vi.mock("@react-pdf/renderer", () => ({
    pdf: vi.fn(() => ({ toBlob: async () => new Blob(["%PDF-"]) })),
    Font: { register: () => {}, registerHyphenationCallback: () => {} },
    StyleSheet: { create: (s) => s },
    Document: () => null,
    Page: () => null,
    View: () => null,
    Text: () => null,
}));

// A week's report, as weekly_report gives it: its lines (worded by the
// database, weekly-report-email.sql), every section
const SECTION_LINES = {
    monitoring: {
        id: "monitoring",
        title: "Monitoring",
        groups: [
            { title: "Troops Monitored", lines: [{ text: "Skunkey · 2 sessions" }] },
            {
                title: "Sessions",
                lines: [
                    {
                        text: "Tue 27 Oct · Skunkey · Sam · 0 seen, 2 not seen",
                        sub: ["Fence Not Working: North corner · Waters Bad · Food Low: Ran out", "Notes: Rainy"],
                    },
                ],
            },
            {
                title: "Not Seen",
                lines: [{ text: "Malawi (Skunkey): not seen Tue 27 Oct, Fri 30 Oct · Must See", alert: true }],
            },
            { title: "New Injuries", lines: [] },
        ],
        missing: ["Holt & Barrington: not monitored this week"],
    },
    baby_care: {
        id: "baby_care",
        title: "Baby Care",
        groups: [
            {
                title: "Milk Totals",
                lines: [],
                table: { head: ["", "Mon 26", "Tue 27", "Total"], rows: [["Muse", "190", "–", "190 ml"]] },
            },
        ],
        missing: ["Muse: no milk total Tue 27 Oct"],
    },
    integration: { id: "integration", title: "Integration", groups: [{ title: "Reports", lines: [] }], missing: [] },
    deworming: {
        id: "deworming",
        title: "Deworming",
        groups: [
            {
                title: "Completed",
                lines: [
                    {
                        text: "Dino & Daniel Troop · 6-Month · Mon 26 Oct – Wed 28 Oct · Sam",
                        sub: ["24 monkeys", "Issues:", "Bruno: Day 2 1/2 dose, Day 3 Skipped"],
                    },
                ],
            },
            { title: "In Progress", lines: [] },
            { title: "Due in the Next 2 Weeks", lines: [{ text: "None due" }] },
        ],
        missing: [],
    },
    maintenance: {
        id: "maintenance",
        title: "Maintenance",
        groups: [{ title: "Maintenance Completed", lines: [] }],
        missing: ["No maintenance reports this week"],
    },
};
const reportFor = (sections) => ({
    title: "Weekly Report: Mon 26 Oct – Sun 1 Nov",
    ended: true,
    sections: sections.map((id) => SECTION_LINES[id]),
});

const ME = { id: "admin-1", email: "me@example.com" };

// Pretend Supabase: signed in as an admin, with these settings saved (null:
// none yet; "missing": the table isn't there yet). → the upserts
function fakeSupabase({ settings = null, report = "ok", emailError = null } = {}) {
    vi.spyOn(supabase, "rpc").mockImplementation(async (name, args) => {
        if (report === "missing") return { data: null, error: { code: "PGRST202" } };
        if (name === "weekly_report") return { data: reportFor(args.sections), error: null };
        if (name === "email_me_weekly_report")
            return emailError ? { data: null, error: emailError } : { data: ME.email, error: null };
        return { data: null, error: null };
    });
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: ME } } });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
    const upserts = [];
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        if (table === "weekly_report_settings") {
            return {
                select: () => ({
                    eq: () => ({
                        maybeSingle: async () =>
                            settings === "missing"
                                ? { data: null, error: { code: "PGRST205" } }
                                : { data: settings, error: null },
                    }),
                }),
                upsert: async (row) => {
                    upserts.push(row);
                    return { error: null };
                },
            };
        }
        return {
            select: () => ({
                eq: () => ({ maybeSingle: async () => ({ data: { user_id: ME.id, role: "admin" }, error: null }) }),
            }),
        };
    });
    return upserts;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const renderPage = () =>
    render(
        <AuthProvider>
            <AdminPage route="admin/reports" />
        </AuthProvider>
    );

describe("the week and when it's sent", () => {
    test("a week starting on any day runs to the day before", () => {
        expect(weekRunsText(1)).toBe("Monday – Sunday");
        expect(weekRunsText(2)).toBe("Tuesday – Monday");
        expect(weekRunsText(0)).toBe("Sunday – Saturday");
    });

    test("the latest full week before the email", () => {
        // Monday 2 Nov 2026, 07:00
        const monday = new Date(2026, 10, 2, 7);
        expect(weekBefore(monday, 1)).toMatchObject({ from: "2026-10-26", to: "2026-11-01" });
        // a Tue–Mon week isn't over until Tuesday: the one before
        expect(weekBefore(monday, 2)).toMatchObject({ from: "2026-10-20", to: "2026-10-26" });
        expect(weekBefore(new Date(2026, 10, 3, 7), 2)).toMatchObject({ from: "2026-10-27", to: "2026-11-02" });
    });

    test("the next email: later today, or next week once the time has gone", () => {
        const settings = { weekStarts: 1, sendDay: 1, sendHour: 7 };
        expect(nextReport(settings, new Date(2026, 10, 2, 6, 30)).text).toBe(
            "Monday 2 Nov at 07:00, covering Mon 26 Oct – Sun 1 Nov"
        );
        expect(nextReport(settings, new Date(2026, 10, 2, 7, 0)).text).toBe(
            "Monday 9 Nov at 07:00, covering Mon 2 Nov – Sun 8 Nov"
        );
        expect(nextReport({ weekStarts: 2, sendDay: 2, sendHour: 18 }, new Date(2026, 10, 1, 12)).text).toBe(
            "Tuesday 3 Nov at 18:00, covering Tue 27 Oct – Mon 2 Nov"
        );
    });
});

describe("the settings", () => {
    test("off to start with, every section ticked, sent to your sign-in email", async () => {
        fakeSupabase();
        renderPage();
        expect(await screen.findByText("me@example.com")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Weekly Reports" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByText("Off: no emails are sent.")).toBeInTheDocument();
        expect(screen.getByLabelText("My Week Runs")).toHaveDisplayValue("Monday – Sunday");
        expect(screen.getByLabelText("Send day")).toHaveDisplayValue("Monday");
        expect(screen.getByLabelText("Send time")).toHaveDisplayValue("07:00");
        for (const name of [/^Monitoring.+/, /^Baby Care.+/, /^Integration.+/, /^Deworming.+/, /^Maintenance.+/]) {
            expect(screen.getByRole("checkbox", { name })).toBeChecked();
        }
        // (as saved: Saved!, until something changes)
        expect(screen.getByRole("button", { name: "Saved!" })).toBeInTheDocument();
    });

    test("turned on, with your own week and time: saved, and the next email shown", async () => {
        const upserts = fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole("button", { name: "On" }));
        await user.selectOptions(screen.getByLabelText("My Week Runs"), "Tuesday – Monday");
        await user.selectOptions(screen.getByLabelText("Send day"), "Tuesday");
        await user.selectOptions(screen.getByLabelText("Send time"), "06:00");
        await user.click(screen.getByRole("checkbox", { name: /^Maintenance.+/ }));
        expect(screen.getByText(/^Next email: Tuesday \d+ \w+ at 06:00, covering Tue/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(await screen.findByRole("button", { name: "Saved!" })).toBeInTheDocument();
        expect(upserts).toEqual([
            {
                user_id: ME.id,
                enabled: true,
                week_starts: 2,
                send_day: 2,
                send_hour: 6,
                sections: ["monitoring", "baby_care", "integration", "deworming"],
            },
        ]);
        // (a change: Save again)
        await user.selectOptions(screen.getByLabelText("Send time"), "07:00");
        expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    });

    test("your saved settings", async () => {
        fakeSupabase({
            settings: { enabled: true, week_starts: 0, send_day: 0, send_hour: 20, sections: ["baby_care"] },
        });
        renderPage();
        expect(await screen.findByRole("button", { name: "On" })).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByLabelText("My Week Runs")).toHaveDisplayValue("Sunday – Saturday");
        expect(screen.getByLabelText("Send time")).toHaveDisplayValue("20:00");
        expect(screen.getByRole("checkbox", { name: /^Baby Care.+/ })).toBeChecked();
        expect(screen.getByRole("checkbox", { name: /^Monitoring.+/ })).not.toBeChecked();
    });

    test("on, with nothing ticked: asked to tick one", async () => {
        const upserts = fakeSupabase({
            settings: { enabled: true, week_starts: 1, send_day: 1, send_hour: 7, sections: ["maintenance"] },
        });
        const user = userEvent.setup();
        renderPage();
        await user.click(await screen.findByRole("checkbox", { name: /^Maintenance.+/ }));
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please tick at least one section to include.");
        expect(upserts).toEqual([]);
    });

    test("before weekly-reports.sql is run: says so", async () => {
        fakeSupabase({ settings: "missing" });
        renderPage();
        expect(await screen.findByText(/supabase\/weekly-reports\.sql needs to be run/)).toBeInTheDocument();
    });
});

describe("Past Reports", () => {
    test("this week and the 26 before it, in your own week", () => {
        const weeks = pastWeeks(2, 26, new Date(2026, 10, 1, 12));
        expect(weeks).toHaveLength(27);
        expect(weeks[0]).toEqual({ from: "2026-10-27", to: "2026-11-02", label: "Tue 27 Oct – Mon 2 Nov (this week)" });
        expect(weeks[1].label).toBe("Tue 20 Oct – Mon 26 Oct");
    });

    test("View: last week to start with, your ticked sections, empty ones say so", async () => {
        fakeSupabase({
            settings: {
                enabled: false,
                week_starts: 1,
                send_day: 1,
                send_hour: 7,
                sections: ["monitoring", "maintenance"],
            },
        });
        const user = userEvent.setup();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        expect(card.getByRole("checkbox", { name: "Baby Care" })).not.toBeChecked();
        await user.click(card.getByRole("button", { name: "View" }));
        const report = await card.findByRole("article");
        expect(supabase.rpc).toHaveBeenCalledWith("weekly_report", {
            week_from: pastWeeks(1)[1].from,
            sections: ["monitoring", "maintenance"],
        });
        expect(
            within(report)
                .getAllByRole("heading", { level: 4 })
                .map((h) => h.textContent)
        ).toEqual(["Monitoring", "Maintenance"]);
        expect(within(report).getByRole("group", { name: "Monitoring: Missing" })).toHaveTextContent(
            "Holt & Barrington: not monitored this week"
        );
        expect(within(report).getByRole("group", { name: "Maintenance: Missing" })).toHaveTextContent(
            "No maintenance reports this week"
        );
        expect(within(report).getAllByText("None this week").length).toBeGreaterThan(0);
    });

    test("no PDF to download", async () => {
        fakeSupabase();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        expect(card.getByRole("button", { name: "View" })).toBeInTheDocument();
        expect(card.queryByRole("button", { name: /PDF/ })).toBeNull();
    });

    test("View: the milk totals' table, and a Must See in red", async () => {
        fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        await user.click(card.getByRole("button", { name: "View" }));
        const report = await card.findByRole("article");
        expect(within(report).getByRole("row", { name: /Muse/ })).toHaveTextContent("Muse190–190 ml");
        expect(within(report).getByText(/Must See/)).toHaveClass("is-alert");
        expect(within(report).getByText("Notes: Rainy")).toBeInTheDocument();
        // (Deworming: what was completed, with its issues; nothing missing)
        const deworming = within(report).getByRole("region", { name: "Deworming" });
        expect(deworming).toHaveTextContent("24 monkeys");
        expect(deworming).toHaveTextContent("Bruno: Day 2 1/2 dose, Day 3 Skipped");
        expect(within(report).queryByRole("group", { name: "Deworming: Missing" })).not.toBeInTheDocument();
    });

    test("Email Me: sent to your sign-in email", async () => {
        fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        await user.click(card.getByRole("button", { name: "Email Me" }));
        expect(await card.findByRole("status")).toHaveTextContent("Sent to me@example.com.");
        expect(supabase.rpc).toHaveBeenCalledWith("email_me_weekly_report", {
            week_from: pastWeeks(1)[1].from,
            sections: ["monitoring", "baby_care", "integration", "deworming", "maintenance"],
        });
    });

    test("Email Me twice in a minute: the database's own words", async () => {
        fakeSupabase({
            emailError: { code: "P0001", message: "Please wait a minute before emailing another report." },
        });
        const user = userEvent.setup();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        await user.click(card.getByRole("button", { name: "Email Me" }));
        expect(await card.findByRole("alert")).toHaveTextContent(
            "Please wait a minute before emailing another report."
        );
    });

    test("before weekly-report-email.sql is run: says so", async () => {
        fakeSupabase({ report: "missing" });
        const user = userEvent.setup();
        renderPage();
        const card = within(await screen.findByRole("region", { name: "Past Reports" }));
        await user.click(card.getByRole("button", { name: "View" }));
        expect(await card.findByRole("alert")).toHaveTextContent("supabase/weekly-report-email.sql needs to be run");
    });
});
