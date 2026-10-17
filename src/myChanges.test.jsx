// The changelog: your own recent changes, in the account pop-up (computers:
// the account menu → Changelog; phones: You → Changelog). Supabase is
// replaced with a pretend version.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import ShowPage from "./ShowPage";
import { dayLabel } from "./MyChanges";

const STAFF = { id: "staff-1", email: "sam@example.com" };

// Two today, one a few days back
const now = new Date();
const today = (h, m) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).toISOString();
const CHANGES = [
    { changed_at: today(0, 2), kind: "changed", title: "Abby", troop: "Goliath", lines: ["Troop: Hendrik → Goliath", "Photos: 1 added"] },
    { changed_at: today(0, 1), kind: "maintenance", title: "Robert", troop: null, lines: ["Fixed the gate latch"], subject: "enclosure" },
    { changed_at: today(0, 0), kind: "changed", title: "Robert B1", troop: null, lines: ["Size: 12 m² → 14 m²"], subject: "introcage" },
    { changed_at: "2026-03-03T09:30:00Z", kind: "added", title: "Nova", troop: "Bandits", lines: ["Sex: Female"] },
];

function fakeSupabase({ role = "editor", changes = CHANGES, error = null } = {}) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: STAFF } } });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        select: () => ({
            eq: () => ({
                maybeSingle: async () => ({ data: table === "editors" && role ? { user_id: STAFF.id, role } : null, error: null }),
            }),
        }),
    }));
    vi.spyOn(supabase, "rpc").mockResolvedValue({ data: error ? null : changes, error });
}

afterEach(() => vi.restoreAllMocks());

function setup(options) {
    fakeSupabase(options);
    const user = userEvent.setup();
    render(
        <AuthProvider>
            <ShowPage />
        </AuthProvider>
    );
    return { user };
}

async function openChangelog(user) {
    await user.click(await screen.findByRole("button", { name: "Account (signed in)" }));
    await user.click(screen.getByRole("menuitem", { name: "Changelog" }));
    return screen.getByRole("dialog", { name: "Changelog" });
}

test("the account menu's Changelog: your changes by day, newest first", async () => {
    const { user } = setup();
    const dialog = await openChangelog(user);
    expect(supabase.rpc).toHaveBeenCalledWith("my_changes", { max_rows: 50 });

    const days = await within(dialog).findAllByRole("heading", { level: 2 });
    expect(days.map((d) => d.textContent)).toEqual(["Today", "3 March 2026"]);
    const items = within(dialog).getAllByRole("listitem").filter((li) => li.classList.contains("MyChanges-item"));
    expect(items.map((li) => li.querySelector(".MyChanges-heading").firstChild.textContent)).toEqual([
        "Changed",
        "Maintenance",
        "Changed",
        "Added",
    ]);
    // Enclosures: "Enclosure" / "Introcage" where monkeys show their troop
    expect(items[1]).toHaveTextContent("Robert (Enclosure)");
    expect(items[2]).toHaveTextContent("Robert B1 (Introcage)");
    expect(within(items[2]).getByText("Size: 12 m² → 14 m²")).toBeInTheDocument();
    expect(items[0]).toHaveTextContent("Abby (Goliath)");
    expect(within(items[0]).getByText("Troop: Hendrik → Goliath")).toBeInTheDocument();
    expect(within(items[0]).getByText("Photos: 1 added")).toBeInTheDocument();
    expect(items[1]).toHaveTextContent("Robert");
    expect(within(items[1]).getByText("Fixed the gate latch")).toBeInTheDocument();
    expect(items[0]).toHaveClass("is-changed");
    expect(items[1]).toHaveClass("is-maintenance");
});

test("← Account goes back to the signed-in pop-up; closing and reopening starts there", async () => {
    const { user } = setup();
    const dialog = await openChangelog(user);
    await user.click(within(dialog).getByRole("button", { name: "Account" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();

    // Phones (and the pop-up itself): Changelog from the signed-in pop-up
    await user.click(screen.getByRole("button", { name: "Changelog" }));
    expect(screen.getByRole("dialog", { name: "Changelog" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Account (signed in)" }));
    await user.click(screen.getByRole("menuitem", { name: "Account" }));
    expect(screen.getByRole("dialog", { name: "Account" })).toBeInTheDocument();
});

test("no changes yet: says so", async () => {
    const { user } = setup({ changes: [] });
    const dialog = await openChangelog(user);
    expect(await within(dialog).findByText(/No changes yet/)).toBeInTheDocument();
});

test("couldn't load: explained", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({ error: { message: "function not found" } });
    const dialog = await openChangelog(user);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't load your changes");
});

test("viewers: no Changelog button in the signed-in pop-up", async () => {
    const { user } = setup({ role: null });
    await user.click(await screen.findByRole("button", { name: "Account (signed in)" }));
    await user.click(screen.getByRole("menuitem", { name: "Account" }));
    expect(within(screen.getByRole("dialog", { name: "Account" })).queryByRole("button", { name: "Changelog" })).toBeNull();
});

test("day labels: Today, Yesterday, then the date", () => {
    const at = new Date(2026, 9, 9, 15, 0);
    expect(dayLabel(new Date(2026, 9, 9, 0, 5), at)).toBe("Today");
    expect(dayLabel(new Date(2026, 9, 8, 23, 59), at)).toBe("Yesterday");
    expect(dayLabel(new Date(2026, 9, 3, 12, 0), at)).toBe("3 October 2026");
});
