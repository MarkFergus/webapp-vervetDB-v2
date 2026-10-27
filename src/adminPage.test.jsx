// The Admin Dashboard (#admin): its parts; Staff Access (#admin/staff): who
// can do what, and every staff account with its user type to change
// (admins only). The Monkey Archive: archive.test.jsx
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import AdminPage, { ACCESS, USER_TYPES } from "./AdminPage";
import ShowPage from "./ShowPage";

const ME = { id: "admin-1", email: "me@example.com" };

const STAFF = [
    { user_id: "admin-1", full_name: "Mark Fergus", email: "me@example.com", role: "admin" },
    { user_id: "editor-2", full_name: "Sam Smith", email: "sam@example.com", role: "editor" },
    { user_id: "new-3", full_name: null, email: "newbie@example.com", role: null },
];

// Pretend Supabase: signed in as an admin (or an editor); staff_list and
// set_staff_role answered by rpc (or failing)
function fakeSupabase({ admin = true, saveError = null } = {}) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: ME } } });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
    vi.spyOn(supabase, "from").mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: ME.id, is_admin: admin }, error: null }) }) }),
    });
    return vi.spyOn(supabase, "rpc").mockImplementation(async (name) => {
        if (name === "staff_list") return { data: STAFF, error: null };
        if (name === "set_staff_role") return { data: null, error: saveError };
        return { data: null, error: null };
    });
}

afterEach(() => {
    vi.restoreAllMocks();
    window.location.hash = "";
});

const renderPage = () =>
    render(
        <AuthProvider>
            <AdminPage route="admin/staff" />
        </AuthProvider>
    );

describe("the dashboard's parts", () => {
    test("Staff Access first, then the Monkey Archive, each its own page", () => {
        fakeSupabase();
        render(
            <AuthProvider>
                <AdminPage route="admin" />
            </AuthProvider>
        );
        expect(screen.getByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeInTheDocument();
        const links = screen.getAllByRole("link");
        expect(links.map((a) => a.getAttribute("href"))).toEqual(["#admin/staff", "#admin/archive"]);
        expect(links[0]).toHaveTextContent("Staff Access");
        expect(links[1]).toHaveTextContent("Monkey Archive");
        // (the staff list isn't loaded until its page)
        expect(screen.queryByRole("table")).toBeNull();
    });

    test("Staff Access: the way back to the dashboard", () => {
        fakeSupabase();
        renderPage();
        expect(screen.getByRole("heading", { level: 1, name: "Staff Access" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Admin Dashboard" })).toHaveAttribute("href", "#admin");
    });
});

describe("Access", () => {
    test("a tick or a dash for each user type, in order", () => {
        fakeSupabase();
        renderPage();
        const table = screen.getByRole("table");
        const heads = within(table).getAllByRole("columnheader").slice(1).map((th) => th.querySelector(".Admin-long").textContent);
        expect(heads).toEqual(["Visitors", "Limited", "Maintenance", "Editors", "Admins"]);
        const row = within(table).getByRole("row", { name: /Edit Monitoring Notes/ });
        expect(within(row).getAllByLabelText(/Yes|No/).map((icon) => icon.getAttribute("aria-label"))).toEqual(["No", "No", "No", "No", "Yes"]);
        const cards = within(table).getByRole("row", { name: /Monkey cards/ });
        expect(within(cards).getAllByLabelText("Yes")).toHaveLength(5);
        // Limited: sees what staff see, changes nothing
        const limited = (what) => within(within(table).getByRole("row", { name: what })).getAllByLabelText(/Yes|No/)[1].getAttribute("aria-label");
        expect(limited(/Full Profile/)).toBe("Yes");
        expect(limited(/Documents/)).toBe("Yes");
        expect(limited(/Log maintenance/)).toBe("No");
        expect(limited(/Edit monkeys/)).toBe("No");
    });

    test("admins can do everything", () => {
        for (const row of ACCESS) expect(row.who).toContain("admin");
        expect(USER_TYPES.map((t) => t.id)).toEqual(["visitor", "limited", "maintenance", "editor", "admin"]);
    });
});

describe("Staff", () => {
    test("every account: name (or the start of the email), email and user type", async () => {
        fakeSupabase();
        renderPage();
        expect(await screen.findByText("3 accounts")).toBeInTheDocument();
        expect(screen.getByText("sam@example.com")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "User type for Sam Smith" })).toHaveValue("editor");
        // no name set: the start of the email; no role yet: No access
        expect(screen.getByRole("combobox", { name: "User type for newbie" })).toHaveValue("");
        expect(screen.getByRole("option", { name: "No access" })).toBeDisabled();
    });

    test("your own user type can't be changed", async () => {
        fakeSupabase();
        renderPage();
        const mine = await screen.findByRole("combobox", { name: "User type for Mark Fergus" });
        expect(mine).toBeDisabled();
        expect(screen.getByText("(you)")).toBeInTheDocument();
    });

    test("changing a user type saves it", async () => {
        const rpc = fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        const sam = await screen.findByRole("combobox", { name: "User type for Sam Smith" });
        await user.selectOptions(sam, "maintenance");
        expect(rpc).toHaveBeenCalledWith("set_staff_role", { target: "editor-2", new_role: "maintenance" });
        await waitFor(() => expect(sam).toHaveValue("maintenance"));
        expect(sam).toBeEnabled();
        await user.selectOptions(sam, "limited");
        expect(rpc).toHaveBeenCalledWith("set_staff_role", { target: "editor-2", new_role: "limited" });
        await waitFor(() => expect(sam).toHaveValue("limited"));
    });

    test("nobody can be made an admin: a message instead, nothing saved, OK puts it away", async () => {
        const rpc = fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        const sam = await screen.findByRole("combobox", { name: "User type for Sam Smith" });
        await user.selectOptions(sam, "admin");
        const bubble = screen.getByRole("alertdialog");
        expect(bubble).toHaveTextContent("Upgrading to admin is disabled, please request access changes to Mark");
        expect(within(bubble).getByRole("button", { name: "OK" })).toHaveFocus();
        expect(rpc).not.toHaveBeenCalledWith("set_staff_role", expect.anything());
        expect(sam).toHaveValue("editor");
        await user.click(within(bubble).getByRole("button", { name: "OK" }));
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    test("the message also goes with Escape", async () => {
        fakeSupabase();
        const user = userEvent.setup();
        renderPage();
        await user.selectOptions(await screen.findByRole("combobox", { name: "User type for newbie" }), "admin");
        expect(screen.getByRole("alertdialog")).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    test("a refused change says so, and keeps the old type", async () => {
        fakeSupabase({ saveError: { code: "42501", message: "no" } });
        vi.spyOn(console, "error").mockImplementation(() => {});
        const user = userEvent.setup();
        renderPage();
        const sam = await screen.findByRole("combobox", { name: "User type for Sam Smith" });
        await user.selectOptions(sam, "maintenance");
        expect(await screen.findByRole("alert")).toHaveTextContent("Are you still signed in as an admin?");
        expect(sam).toHaveValue("editor");
    });

    test("the list not loading says so", async () => {
        fakeSupabase();
        supabase.rpc.mockResolvedValue({ data: null, error: { message: "gone" } });
        vi.spyOn(console, "error").mockImplementation(() => {});
        renderPage();
        expect(await screen.findByText(/Couldn't load the staff list/)).toBeInTheDocument();
    });
});

describe("#admin", () => {
    test("admins get the dashboard", async () => {
        fakeSupabase();
        render(
            <AuthProvider>
                <ShowPage route="admin" editable />
            </AuthProvider>
        );
        expect(await screen.findByRole("heading", { level: 1, name: "Admin Dashboard" })).toBeInTheDocument();
    });

    test("anyone else is sent home", async () => {
        fakeSupabase({ admin: false });
        window.location.hash = "#admin";
        render(
            <AuthProvider>
                <ShowPage route="admin" editable />
            </AuthProvider>
        );
        await waitFor(() => expect(window.location.hash).toBe(""));
        expect(screen.queryByRole("heading", { name: "Admin Dashboard" })).toBeNull();
    });

    test("its parts too: an archived monkey's page", async () => {
        fakeSupabase({ admin: false });
        window.location.hash = "#admin/archive/poppy-12";
        render(
            <AuthProvider>
                <ShowPage route="admin/archive/poppy-12" editable />
            </AuthProvider>
        );
        await waitFor(() => expect(window.location.hash).toBe(""));
    });
});

describe("#records", () => {
    test("not signed in: sent home", async () => {
        vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: null } });
        vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({ data: { subscription: { unsubscribe: () => {} } } });
        window.location.hash = "#records";
        render(
            <AuthProvider>
                <ShowPage route="records" editable />
            </AuthProvider>
        );
        await waitFor(() => expect(window.location.hash).toBe(""));
        expect(screen.queryByRole("heading", { name: "Records" })).toBeNull();
    });

    test("staff get the Records page", async () => {
        fakeSupabase({ admin: false });
        render(
            <AuthProvider>
                <ShowPage route="records" editable />
            </AuthProvider>
        );
        expect(await screen.findByRole("heading", { level: 1, name: "Records" })).toBeInTheDocument();
    });
});
