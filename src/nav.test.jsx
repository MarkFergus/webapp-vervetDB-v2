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
    const drawerHeadings = () => [...drawer().querySelectorAll("h2")].map((h) => h.textContent);

    test("visitors: Scan QR Code, Install & Use Offline and About (the game's in the bottom bar); Escape closes it, back to ☰", async () => {
        const { user, menuButton } = setup();
        expect(drawer()).toBeNull();
        await user.click(menuButton());
        expect(drawerItems()).toEqual(["Scan QR Code", "Install & Use Offline", "About"]);
        expect(drawerHeadings()).toEqual(["Tools", "App"]); // (Tools: just Scan)
        expect(within(drawer()).getByRole("button", { name: "Close menu" })).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(drawer()).toBeNull();
        expect(menuButton()).toHaveFocus();
    });

    test("staff: choosing the game closes it and goes to the game", async () => {
        const { user, menuButton } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "You (signed in)" });
        await user.click(menuButton());
        const game = within(drawer()).getByRole("link", { name: "Monkey Guesser" });
        expect(game).toHaveAttribute("href", "#game");
        await user.click(game);
        expect(drawer()).toBeNull();
    });

    test("admins: Add New Monkey first, opening the new monkey form; editors don't have it", async () => {
        const { user, menuButton } = setup({ signedIn: true, admin: true });
        await screen.findByRole("button", { name: "Add New Monkey" }); // (the top bar's, on computers)
        await user.click(menuButton());
        // (staff: Documents here, and the game, as Photos has its place in the bottom bar)
        expect(drawerItems()).toEqual(["Add New Monkey", "Documents", "Scan QR Code", "Monkey Guesser", "Install & Use Offline", "About"]);
        expect(drawerHeadings()).toEqual(["Tools", "App"]);
        await user.click(within(drawer()).getByRole("button", { name: "Add New Monkey" }));
        expect(drawer()).toBeNull();
        expect(screen.getByRole("dialog", { name: "Add New Monkey" })).toBeInTheDocument();
    });

    test("editors: no Add New Monkey (adding monkeys is for admins)", async () => {
        const { user, menuButton } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "You (signed in)" });
        await user.click(menuButton());
        expect(drawerItems()).toEqual(["Documents", "Scan QR Code", "Monkey Guesser", "Install & Use Offline", "About"]);
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
    // (Map, the green circle in the middle, has no label: its read-out name)
    const barItems = () =>
        [...document.querySelector(".BottomBar").children].map((i) => i.textContent || i.getAttribute("aria-label"));

    test("visitors: Monkeys, Enclosures, Map, Game and You (no Documents)", () => {
        setup();
        expect(barItems()).toEqual(["Monkeys", "Enclosures", "Interactive Map", "Game", "You"]);
        expect(bar().getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        expect(bar().getByRole("link", { name: "Enclosures" })).toHaveAttribute("href", "#enclosures");
        expect(bar().getByRole("link", { name: "Game" })).toHaveAttribute("href", "#game");
        expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();
    });

    test("staff: Monkeys, Enclosures, Map, Photos and You; Documents in the ☰ menu, opening the PDF pop-up", async () => {
        const { user, menuButton } = setup({ signedIn: true });
        await waitFor(() => expect(bar().getByRole("button", { name: "Add Photos" })).toBeInTheDocument());
        expect(barItems()).toEqual(["Monkeys", "Enclosures", "Interactive Map", "Photos", "You"]);
        expect(bar().queryByRole("link", { name: "Game" })).toBeNull(); // (in the ☰ menu)
        expect(bar().queryByRole("button", { name: "Documents" })).toBeNull();
        await user.click(menuButton());
        const menu = screen.getByRole("dialog", { name: "Menu" });
        await user.click(within(menu).getByRole("button", { name: "Documents" }));
        expect(await screen.findByRole("dialog", { name: "Documents" })).toBeInTheDocument();
    });

    test("Map opens the Interactive Map; Escape closes it, back to the button", async () => {
        const { user } = setup();
        const mapButton = bar().getByRole("button", { name: "Interactive Map" });
        await user.click(mapButton);
        expect(screen.getByRole("dialog", { name: "Sanctuary Map" })).toBeInTheDocument();
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Sanctuary Map" })).toBeNull();
        expect(mapButton).toHaveFocus();
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

    test("small to start with: Monkeys, Enclosures, Map, Game (visitors: no Documents)", async () => {
        setup();
        expect(railItems()).toEqual(["Monkeys", "Enclosures", "Map", "Game"]);
        await userEvent.click(within(rail()).getByRole("button", { name: "Interactive Map" }));
        expect(screen.getByRole("dialog", { name: "Sanctuary Map" })).toBeInTheDocument();
        await userEvent.keyboard("{Escape}");
        expect(within(rail()).getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        expect(railButton()).toHaveAttribute("aria-expanded", "false");
    });

    test("☰ opens it out, in groups, and it's remembered", async () => {
        const { user } = setup();
        await user.click(railButton());
        expect(railButton()).toHaveAttribute("aria-expanded", "true");
        expect([...rail().querySelectorAll("h2")].map((h) => h.textContent)).toEqual(["Tools", "App"]);
        expect(railItems()).toEqual([
            "Monkeys", "Enclosures", "Interactive Map", "Monkey Guesser", "Install & Use Offline", "About",
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

    test("staff: Documents, opening the PDF pop-up", async () => {
        const { user } = setup({ signedIn: true });
        await waitFor(() => expect(within(rail()).getByRole("button", { name: "Documents" })).toBeInTheDocument());
        await user.click(within(rail()).getByRole("button", { name: "Documents" }));
        expect(await screen.findByRole("dialog", { name: "Documents" })).toBeInTheDocument();
    });

    test("admins: + New in the top bar, before the account circle", async () => {
        setup({ signedIn: true, admin: true });
        await waitFor(() => expect(screen.getByRole("button", { name: "Add New Monkey" })).toBeInTheDocument());
        expect(document.querySelector(".Nav-buttons > :first-child")).toHaveAccessibleName("Add New Monkey");
        expect(document.querySelector(".Nav-buttons > :first-child")).toHaveTextContent(/^New$/);
    });
});

describe("filter / sort toolbar", () => {
    test("the Filters button turns blue and counts the filters in use", async () => {
        const { user } = setup();
        const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
        expect(filtersButton()).not.toHaveClass("is-active");
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Goliath");
        expect(filtersButton()).toHaveClass("is-active");
        expect(filtersButton()).toHaveAccessibleName("Filters (1 on)");

        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "All Troops");
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
