// The ways around (the drawer and bottom bar on phones, the side rail on
// computers) and the filter / sort toolbar.
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
    const menuButton = () => screen.getByRole("button", { name: "Menu" });
    return { user, menuButton };
}

describe("top bar", () => {
    test("the search box is always there", () => {
        setup();
        expect(screen.getByRole("textbox", { name: "Search by name or chip number" })).toBeVisible();
        expect(screen.queryByRole("button", { name: "Search" })).toBeNull();
    });
});

describe("phones: the drawer (☰, from the right)", () => {
    const drawer = () => screen.queryByRole("dialog", { name: "Menu" });
    const drawerItems = () => [...drawer().querySelectorAll(".Drawer-item")].map((i) => i.textContent);

    test("Profile Book, Install & Use Offline and About; Escape closes it, back to ☰", async () => {
        const { user, menuButton } = setup();
        expect(drawer()).toBeNull();
        await user.click(menuButton());
        expect(drawerItems()).toEqual(["Create Profile Book", "Install & Use Offline", "About"]);
        expect(within(drawer()).getByRole("button", { name: "Close menu" })).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(drawer()).toBeNull();
        expect(menuButton()).toHaveFocus();
    });

    test("choosing Create Profile Book closes it and opens the PDF pop-up", async () => {
        const { user, menuButton } = setup();
        await user.click(menuButton());
        await user.click(within(drawer()).getByRole("button", { name: "Create Profile Book" }));
        expect(drawer()).toBeNull();
        expect(await screen.findByRole("dialog", { name: "Create Profile Book" })).toBeInTheDocument();
    });

    test("admins: Add New Monkey first, opening the new monkey form; editors don't have it", async () => {
        const { user, menuButton } = setup({ signedIn: true, admin: true });
        await screen.findByRole("button", { name: "Add New Monkey" }); // (the top bar's, on computers)
        await user.click(menuButton());
        expect(drawerItems()).toEqual(["Add New Monkey", "Create Profile Book", "Install & Use Offline", "About"]);
        await user.click(within(drawer()).getByRole("button", { name: "Add New Monkey" }));
        expect(drawer()).toBeNull();
        expect(screen.getByRole("dialog", { name: "Add a monkey" })).toBeInTheDocument();
    });

    test("editors: no Add New Monkey (adding monkeys is for admins)", async () => {
        const { user, menuButton } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "You (signed in)" });
        await user.click(menuButton());
        expect(drawerItems()).toEqual(["Create Profile Book", "Install & Use Offline", "About"]);
        expect(screen.queryByRole("button", { name: "Add New Monkey" })).toBeNull(); // nor in the top bar
    });

    test("tapping outside it closes it", async () => {
        const { user, menuButton } = setup();
        await user.click(menuButton());
        await user.click(document.querySelector(".Drawer-backdrop"));
        expect(drawer()).toBeNull();
    });
});

describe("phones: the bottom bar", () => {
    const bar = () => within(screen.getByRole("navigation", { name: "Main" }));
    const barItems = () => [...document.querySelector(".BottomBar").children].map((i) => i.textContent);

    test("Monkeys, Enclosures, Map (coming soon), Game and You", () => {
        setup();
        expect(barItems()).toEqual(["Monkeys", "Enclosures", "Map", "Game", "You"]);
        expect(bar().getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        expect(bar().getByRole("link", { name: "Enclosures" })).toHaveAttribute("href", "#enclosures");
        expect(bar().getByRole("link", { name: "Game" })).toHaveAttribute("href", "#game");
    });

    test("Map: a notice says it's coming soon, gone again at the next tap", async () => {
        const { user } = setup();
        const notice = () => screen.queryByText("Interactive Map coming soon");
        expect(notice()).toBeNull();
        await user.click(bar().getByRole("button", { name: "Interactive Map (coming soon)" }));
        expect(notice()).toBeInTheDocument();
        await user.click(document.querySelector(".ShowPage-monkeys"));
        expect(notice()).toBeNull();
        // (a key press puts it away too)
        await user.click(bar().getByRole("button", { name: "Interactive Map (coming soon)" }));
        await user.keyboard("{Shift}");
        expect(notice()).toBeNull();
    });

    test("You opens the sign-in pop-up", async () => {
        const { user } = setup();
        await user.click(bar().getByRole("button", { name: "You (sign in)" }));
        expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    });

    test("signed in: You opens the account pop-up (Change password, Sign out)", async () => {
        const { user } = setup({ signedIn: true });
        await user.click(await bar().findByRole("button", { name: "You (signed in)" }));
        const dialog = await screen.findByRole("dialog", { name: "Account" });
        expect(within(dialog).getByRole("button", { name: "Change password" })).toBeInTheDocument();
        await user.click(within(dialog).getByRole("button", { name: "Sign out" }));
        expect(supabase.auth.signOut).toHaveBeenCalled();
        await waitFor(() => expect(bar().getByRole("button", { name: "You (sign in)" })).toBeInTheDocument());
    });


});

describe("computers: the side rail", () => {
    afterEach(() => localStorage.removeItem("vervetdb-rail"));
    const rail = () => screen.getByRole("complementary", { name: "Main menu" });
    const railItems = () => [...rail().querySelectorAll(".SideRail-item")].map((i) => i.textContent);
    const railButton = () => screen.getByRole("button", { name: /side menu/ });

    test("small to start with: Monkeys, Enclosures, Map (coming soon), Profile Book, Game", async () => {
        setup();
        expect(railItems()).toEqual(["Monkeys", "Enclosures", "Map", "Profile Book", "Game"]);
        await userEvent.click(within(rail()).getByRole("button", { name: "Interactive Map (coming soon)" }));
        expect(screen.getByText("Interactive Map coming soon")).toBeInTheDocument();
        expect(within(rail()).getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        expect(railButton()).toHaveAttribute("aria-expanded", "false");
    });

    test("☰ opens it out, in groups, and it's remembered", async () => {
        const { user } = setup();
        await user.click(railButton());
        expect(railButton()).toHaveAttribute("aria-expanded", "true");
        expect([...rail().querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Browse", "Tools", "App"]);
        expect(railItems()).toEqual([
            "Monkeys", "Enclosures", "Interactive Map", "Create Profile Book", "Monkey Guesser Game", "Install & Use Offline", "About",
        ]);
        expect(document.documentElement).toHaveClass("rail-open");
        expect(localStorage.getItem("vervetdb-rail")).toBe("open");
        await user.click(railButton());
        expect(document.documentElement).not.toHaveClass("rail-open");
        expect(localStorage.getItem("vervetdb-rail")).toBe("small");
    });

    test("narrower screens: ☰ opens it over the page; picking something or tapping outside puts it away", async () => {
        const realMatchMedia = window.matchMedia;
        window.matchMedia = (query) => ({ matches: false, media: query });
        try {
            const { user } = setup();
            await user.click(railButton());
            expect(rail()).toHaveClass("is-open", "is-over");
            // The page doesn't move over, and it isn't remembered
            expect(document.documentElement).not.toHaveClass("rail-open");
            expect(localStorage.getItem("vervetdb-rail")).toBe("small");
            await user.click(document.querySelector(".SideRail-backdrop"));
            expect(rail()).not.toHaveClass("is-open");

            await user.click(railButton());
            await user.click(within(rail()).getByRole("button", { name: "About" }));
            expect(rail()).not.toHaveClass("is-open");
            expect(await screen.findByRole("dialog", { name: "About vervetDB" })).toBeInTheDocument();
        } finally {
            window.matchMedia = realMatchMedia;
        }
    });

    test("Profile Book opens the PDF pop-up", async () => {
        const { user } = setup();
        await user.click(within(rail()).getByRole("button", { name: "Profile Book" }));
        expect(await screen.findByRole("dialog", { name: "Create Profile Book" })).toBeInTheDocument();
    });

    test("admins: + Add in the top bar, before the account circle", async () => {
        setup({ signedIn: true, admin: true });
        await waitFor(() => expect(screen.getByRole("button", { name: "Add New Monkey" })).toBeInTheDocument());
        expect(document.querySelector(".Nav-buttons > :first-child")).toHaveAccessibleName("Add New Monkey");
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

    test("the sort button shows the sort in use, and stays grey (it only changes the order)", async () => {
        const { user } = setup();
        const sortButton = () => screen.getByRole("button", { name: /^Sort/ });
        const choose = async (name) => {
            await user.click(sortButton());
            await user.click(screen.getByRole("menuitem", { name }));
        };
        expect(sortButton()).toHaveTextContent(/^NameA–Z$/);
        expect(sortButton()).not.toHaveClass("is-active");

        await choose("Age");
        expect(sortButton()).toHaveTextContent(/^AgeYoungest first$/);
        expect(sortButton()).not.toHaveClass("is-active");
        expect(sortButton()).toHaveAccessibleName("Sort: Age, Youngest first");
        // Age is now offered the other way round, in words
        await user.click(sortButton());
        expect(screen.getByRole("menuitem", { name: "Age, Oldest first" })).toHaveTextContent("AgeOldest first");
        expect(screen.getByRole("menuitem", { name: "Name" })).toHaveTextContent(/^Name$/);
        await user.click(screen.getByRole("menuitem", { name: "Age, Oldest first" }));
        expect(sortButton()).toHaveAccessibleName("Sort: Age, Oldest first");

        await choose("Name");
        expect(sortButton()).toHaveTextContent(/^NameA–Z$/);
        expect(sortButton()).not.toHaveClass("is-active");
    });

    test("Sort's menu closes when tapping elsewhere", async () => {
        const { user } = setup();
        await user.click(screen.getByRole("button", { name: /^Sort/ }));
        expect(screen.getByRole("menu")).toBeInTheDocument();
        await user.click(document.body);
        expect(screen.queryByRole("menu")).toBeNull();
    });
});
