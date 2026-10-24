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

describe("phones: the drawer (☰, top left, from the left)", () => {
    const drawer = () => screen.queryByRole("dialog", { name: "Menu" });
    const drawerItems = () => [...drawer().querySelectorAll(".Drawer-item")].map((i) => i.textContent);
    const drawerHeadings = () => [...drawer().querySelectorAll("h2")].map((h) => h.textContent);

    test("visitors: everything (the bottom bar's just quick access), in groups with no headings or Theme; Escape closes it, back to ☰", async () => {
        const { user, menuButton } = setup();
        expect(drawer()).toBeNull();
        await user.click(menuButton());
        expect(drawerItems()).toEqual([
            "Monkeys", "Enclosures", "Interactive Map", "Statistics", "Scan QR Code", "Monkey Guesser", "Install & Use Offline", "About",
        ]);
        expect(drawer().querySelectorAll(".Drawer-group")).toHaveLength(3);
        expect(drawerHeadings()).toEqual([]);
        expect(within(drawer()).getByRole("button", { name: "Close menu" })).toHaveFocus();
        await user.keyboard("{Escape}");
        expect(drawer()).toBeNull();
        expect(menuButton()).toHaveFocus();
    });

    test("admins: Add New Monkey on its own at the top, opening the new monkey form", async () => {
        const { user, menuButton } = setup({ signedIn: true, admin: true });
        await screen.findByRole("button", { name: "Account (signed in)" });
        await waitFor(() => expect(screen.getAllByRole("button", { name: "Add New Monkey" }).length).toBeGreaterThan(0));
        await user.click(menuButton());
        expect(drawerItems()).toEqual([
            "Add New Monkey", "Monkeys", "Enclosures", "Add Photos", "Documents", "Interactive Map", "Statistics", "Scan QR Code",
            "Monkey Guesser", "Install & Use Offline", "About",
        ]);
        expect(drawer().querySelector(".Drawer-group").textContent).toBe("Add New Monkey");
        await user.click(within(drawer()).getByRole("button", { name: "Add New Monkey" }));
        expect(drawer()).toBeNull();
        expect(screen.getByRole("dialog", { name: "Add New Monkey" })).toBeInTheDocument();
    });

    test("editors: Add Photos and Documents too; no Add New Monkey; picking the game goes there", async () => {
        const { user, menuButton } = setup({ signedIn: true });
        await screen.findByRole("button", { name: "Account (signed in)" });
        await user.click(menuButton());
        expect(drawerItems()).toEqual([
            "Monkeys", "Enclosures", "Add Photos", "Documents", "Interactive Map", "Statistics", "Scan QR Code", "Monkey Guesser",
            "Install & Use Offline", "About",
        ]);
        expect(within(drawer()).queryByRole("button", { name: "Add New Monkey" })).toBeNull();
        const game = within(drawer()).getByRole("link", { name: "Monkey Guesser" });
        expect(game).toHaveAttribute("href", "#game");
        await user.click(game);
        expect(drawer()).toBeNull();
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

    test("visitors: Monkeys, Enclosures, Map, Scan and Game (no Documents; the account's in the top bar)", () => {
        setup();
        expect(barItems()).toEqual(["Monkeys", "Enclosures", "Interactive Map", "Scan", "Game"]);
        expect(bar().getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        expect(bar().getByRole("link", { name: "Enclosures" })).toHaveAttribute("href", "#enclosures");
        expect(bar().getByRole("link", { name: "Game" })).toHaveAttribute("href", "#game");
        expect(screen.queryByRole("button", { name: "Documents" })).toBeNull();
    });

    test("editors: Monkeys, Enclosures, Map, Photos and Documents (opening the PDF pop-up)", async () => {
        const { user } = setup({ signedIn: true });
        await waitFor(() => expect(bar().getByRole("button", { name: "Add Photos" })).toBeInTheDocument());
        expect(barItems()).toEqual(["Monkeys", "Enclosures", "Interactive Map", "Photos", "Documents"]);
        await user.click(bar().getByRole("button", { name: "Documents" }));
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

    test("the account circle is in the top bar (phones too): signed out, it opens Sign in", async () => {
        const { user } = setup();
        expect(screen.queryByRole("button", { name: /^You/ })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    });
});

describe("computers: the side rail", () => {
    const rail = () => screen.getByRole("complementary", { name: "Main menu" });
    const railItems = () => [...rail().querySelectorAll(".SideRail-item")].map((i) => i.textContent);

    test("every item, in groups with lines between (no headings); visitors: no Documents", async () => {
        setup();
        expect(railItems()).toEqual([
            "Monkeys", "Enclosures", "Interactive Map", "Statistics", "Monkey Guesser", "Install & Use Offline", "About",
        ]);
        expect(rail().querySelectorAll(".SideRail-group")).toHaveLength(3);
        expect(rail().querySelector("h2")).toBeNull();
        expect(within(rail()).getByRole("link", { name: "Monkeys" })).toHaveAttribute("aria-current", "page");
        await userEvent.click(within(rail()).getByRole("button", { name: "Interactive Map" }));
        expect(screen.getByRole("dialog", { name: "Sanctuary Map" })).toBeInTheDocument();
    });

    test("☰ opens it out over the page (touch screens: no hover); tapping outside, picking or Escape puts it away", async () => {
        const { user } = setup();
        const railButton = () => screen.getByRole("button", { name: /side menu/ });
        expect(railButton()).toHaveAttribute("aria-expanded", "false");
        await user.click(railButton());
        expect(rail()).toHaveClass("is-open");
        expect(railButton()).toHaveAttribute("aria-expanded", "true");
        await user.click(document.querySelector(".SideRail-backdrop"));
        expect(rail()).not.toHaveClass("is-open");
        await user.click(railButton());
        await user.keyboard("{Escape}");
        expect(rail()).not.toHaveClass("is-open");
        await user.click(railButton());
        await user.click(within(rail()).getByRole("button", { name: "About" }));
        expect(rail()).not.toHaveClass("is-open");
        expect(await screen.findByRole("dialog", { name: "About vervetDB" })).toBeInTheDocument();
    });

    test("staff: Documents, opening the PDF pop-up", async () => {
        const { user } = setup({ signedIn: true });
        await waitFor(() => expect(within(rail()).getByRole("button", { name: "Documents" })).toBeInTheDocument());
        await user.click(within(rail()).getByRole("button", { name: "Documents" }));
        expect(await screen.findByRole("dialog", { name: "Documents" })).toBeInTheDocument();
    });

    test("admins: Add New Monkey on its own at the top (not in the top bar or the account menu)", async () => {
        const { user } = setup({ signedIn: true, admin: true });
        await within(rail()).findByRole("button", { name: "Add New Monkey" });
        expect(rail().querySelector(".SideRail-group").textContent).toBe("Add New Monkey");
        expect(document.querySelector(".Nav-buttons").textContent).not.toMatch(/New/);
        await user.click(screen.getByRole("button", { name: "Account (signed in)" }));
        expect(within(screen.getByRole("menu", { name: "Account" })).queryByRole("menuitem", { name: "Add New Monkey" })).toBeNull();
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
