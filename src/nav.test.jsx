// The ☰ menu (phones) and the filter / sort toolbar.
// (Which parts show at which screen width is CSS, which the test browser
// doesn't apply, so these check the behaviour.)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import ShowPage from "./ShowPage";

const EDITOR = { id: "editor-1", email: "editor@example.com" };

// Pretend Supabase: signed in (or not) as an editor
function fakeAuth(signedIn, admin = false) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: signedIn ? { user: EDITOR } : null },
    });
    let listener;
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((cb) => {
        listener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
    });
    vi.spyOn(supabase.auth, "signOut").mockImplementation(async () => {
        listener("SIGNED_OUT", null);
        return { error: null };
    });
    vi.spyOn(supabase, "from").mockReturnValue({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: EDITOR.id, is_admin: admin }, error: null }) }) }),
    });
}

afterEach(() => vi.restoreAllMocks());

function setup({ signedIn = false, admin = false } = {}) {
    fakeAuth(signedIn, admin);
    const user = userEvent.setup();
    render(
        <AuthProvider>
            {/* editable: live data, so editors get Add monkey */}
            <ShowPage editable />
        </AuthProvider>
    );
    const menuButton = () => screen.getByRole("button", { name: /^Menu/ });
    const menu = () => document.getElementById("Nav-menu");
    const menuItems = () => [...menu().querySelectorAll("a, button")].map((i) => i.textContent);
    return { user, menuButton, menu, menuItems };
}

describe("top bar", () => {
    test("the search box is always there", () => {
        setup();
        expect(screen.getByRole("textbox", { name: "Search by name or chip number" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    });
});

describe("☰ menu (phones)", () => {
    test("signed out: game, PDF, Sign In; focus on the first", async () => {
        const { user, menuButton, menu, menuItems } = setup();
        expect(menuButton()).toHaveAttribute("aria-expanded", "false");
        expect(menu()).toBeNull();

        await user.click(menuButton());
        expect(menuButton()).toHaveAttribute("aria-expanded", "true");
        expect(menuItems()).toEqual(["Monkey Guesser Game", "Create Profile Book", "Install & Use Offline", "About", "Sign In"]);
        expect(within(menu()).getByRole("link", { name: "Monkey Guesser Game" })).toHaveAttribute("href", "#game");
        expect(menu().querySelector("a")).toHaveFocus();
    });

    test("signed in as an editor: no Add New Monkey (admins only), Account at the end", async () => {
        const { user, menuButton, menuItems } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "Menu (signed in)" });
        await user.click(menuButton());
        expect(menuItems()).toEqual(["Monkey Guesser Game", "Create Profile Book", "Install & Use Offline", "About", "Account"]);
        expect(screen.queryByRole("button", { name: "Add New Monkey" })).toBeNull(); // nor in the top bar
    });

    test("signed in as an admin: Add New Monkey, first", async () => {
        const { user, menuButton, menuItems } = setup({ signedIn: true, admin: true });
        await screen.findByRole("button", { name: "Menu (signed in)" });
        await waitFor(() => expect(screen.getByRole("button", { name: "Add New Monkey" })).toBeInTheDocument());
        // First in the top bar too
        expect(document.querySelector(".Nav-buttons > :first-child")).toHaveAccessibleName("Add New Monkey");
        await user.click(menuButton());
        expect(menuItems()).toEqual(["Add New Monkey", "Monkey Guesser Game", "Create Profile Book", "Install & Use Offline", "About", "Account"]);
    });

    test("Sign In opens the sign-in pop-up", async () => {
        const { user, menuButton, menu } = setup();
        await user.click(menuButton());
        await user.click(within(menu()).getByRole("button", { name: "Sign In" }));
        expect(menu()).toBeNull();
        expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    });

    test("signed in: Account opens the account pop-up (Change password, Sign out)", async () => {
        const { user, menuButton, menu } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "Menu (signed in)" });
        await user.click(menuButton());
        await user.click(within(menu()).getByRole("button", { name: "Account" }));

        expect(menu()).toBeNull();
        const dialog = await screen.findByRole("dialog", { name: "Signed in" });
        expect(within(dialog).getByRole("button", { name: "Change password" })).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
        expect(supabase.auth.signOut).toHaveBeenCalled();
        await waitFor(() => expect(menuButton()).toHaveAccessibleName("Menu"));
    });

    test("choosing Create Profile Book closes the menu and opens the PDF pop-up", async () => {
        const { user, menuButton, menu } = setup();
        await user.click(menuButton());
        await user.click(within(menu()).getByRole("button", { name: "Create Profile Book" }));
        expect(menu()).toBeNull();
        expect(await screen.findByRole("dialog", { name: "Create Profile Book" })).toBeInTheDocument();
    });

    test("Escape closes it and returns focus to ☰", async () => {
        const { user, menuButton, menu } = setup();
        await user.click(menuButton());
        await user.keyboard("{Escape}");
        expect(menu()).toBeNull();
        expect(menuButton()).toHaveFocus();
    });

    test("tapping outside closes it", async () => {
        const { user, menuButton, menu } = setup();
        await user.click(menuButton());
        await user.click(document.querySelector(".ShowPage-monkeys"));
        expect(menu()).toBeNull();
    });
});

describe("filter / sort toolbar", () => {
    test("the Filters button turns blue and counts the filters in use", async () => {
        const { user } = setup();
        const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
        expect(filtersButton()).not.toHaveClass("is-active");
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
        expect(filtersButton()).toHaveClass("is-active");
        expect(filtersButton()).toHaveAccessibleName("Filters (1 on)");

        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "All Troops");
        expect(filtersButton()).not.toHaveClass("is-active");
    });

    test("the active sort shows an arrow for its direction", async () => {
        const { user } = setup();
        const button = (name) => screen.getByRole("button", { name: new RegExp(`^${name}`) });
        const arrows = (name) => button(name).querySelectorAll("svg").length;

        expect(button("Name")).toHaveAttribute("aria-pressed", "true");
        expect(arrows("Name")).toBe(1);
        expect(arrows("Troop")).toBe(0);

        await user.click(button("Age"));
        expect(arrows("Age")).toBe(1);
        expect(arrows("Name")).toBe(0);
        expect(button("Age")).toHaveAccessibleName("Age, ascending");
        await user.click(button("Age"));
        expect(button("Age")).toHaveAccessibleName("Age, descending");
    });
});
