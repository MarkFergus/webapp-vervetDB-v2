// Latest News (#news), Favourites (the ☆ on a photo) and a monkey's Recent
// Edits (staff, beside Share in the pop-up). Supabase is replaced with a
// pretend version.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import ShowPage from "./ShowPage";
import LatestNewsPage from "./LatestNewsPage";

const STAFF = { id: "staff-1", email: "sam@example.com" };

const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "" };
const MONKEYS = [
    { ...base, id: 1, name: "Abby", troop: "Goliath", introcage: null, enclosure: "Goliath" },
    { ...base, id: 2, name: "Pip", troop: "Goliath", introcage: null, enclosure: "Goliath" },
];

const now = new Date();
const dayText = (daysAgo) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// signedIn: as staff (an editor); favourites: their saved ★ monkeys; rpc:
// what each database function answers
function fakeSupabase({ signedIn = false, favourites = [], rpc = {} } = {}) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: signedIn ? { user: STAFF } : null } });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    const deleted = vi.fn(async () => ({ error: null }));
    const inserted = vi.fn(async () => ({ error: null }));
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        // (a promise for the favourites; .eq().maybeSingle() for the role)
        select: () =>
            Object.assign(Promise.resolve({ data: table === "favourites" ? favourites : [], error: null }), {
                eq: () => ({
                    maybeSingle: async () => ({
                        data: table === "editors" ? { user_id: STAFF.id, role: "editor" } : null,
                        error: null,
                    }),
                }),
            }),
        insert: inserted,
        delete: () => ({ eq: deleted }),
    }));
    vi.spyOn(supabase, "rpc").mockImplementation(async (name) => ({ data: rpc[name] ?? [], error: null }));
    return { deleted, inserted };
}

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.removeItem("vervetdb-favourites");
    localStorage.removeItem("vervetdb-news-period");
});

describe("Latest News", () => {
    const NEWS = [
        { happened_on: dayText(0), kind: "arrival", monkey_id: 1, name: "Abby", place: "Baby Care", details: null },
        { happened_on: dayText(1), kind: "released", monkey_id: 9, name: "Bella", place: "Goliath", details: null },
    ];

    test("visitors: arrivals and releases by day; a monkey still here opens its pop-up; the period is chosen", async () => {
        fakeSupabase({ rpc: { latest_news: NEWS } });
        const onOpenMonkey = vi.fn();
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <LatestNewsPage monkeys={MONKEYS} onOpenMonkey={onOpenMonkey} />
            </AuthProvider>
        );
        expect(screen.getByRole("heading", { name: "Latest News" })).toBeInTheDocument();
        expect(await screen.findByText("New Arrival")).toBeInTheDocument();
        expect(supabase.rpc).toHaveBeenCalledWith("latest_news", { days: 7 });
        expect(screen.getByRole("heading", { name: "Today" })).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Yesterday" })).toBeInTheDocument();
        expect(screen.getByText("Released to the Wild")).toBeInTheDocument();
        // Bella's been released: not a link
        expect(screen.queryByRole("button", { name: "Bella" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Abby" }));
        expect(onOpenMonkey).toHaveBeenCalledWith(MONKEYS[0]);
        expect(screen.getByText(/sign in to see moves, injuries/i)).toBeInTheDocument();

        expect(screen.getByRole("button", { name: "7 Days" })).toHaveAttribute("aria-pressed", "true");
        await user.click(screen.getByRole("button", { name: "48 Hours" }));
        await waitFor(() => expect(supabase.rpc).toHaveBeenCalledWith("latest_news", { days: 2 }));
        expect(screen.getByRole("button", { name: "48 Hours" })).toHaveAttribute("aria-pressed", "true");
        // (remembered on this device)
        expect(localStorage.getItem("vervetdb-news-period")).toBe("2");
    });

    test("staff: moves and injuries too, with their details; nothing new says so", async () => {
        fakeSupabase({
            signedIn: true,
            rpc: {
                latest_news: [
                    { happened_on: dayText(0), kind: "movement", monkey_id: 2, name: "Pip", place: "Goliath", details: "Moved from Goliath Troop to Gismo A" },
                    { happened_on: dayText(2), kind: "injury", monkey_id: 2, name: "Pip", place: "Goliath", details: "Bite on tail" },
                ],
            },
        });
        render(
            <AuthProvider>
                <LatestNewsPage monkeys={MONKEYS} />
            </AuthProvider>
        );
        expect(await screen.findByText("Moved from Goliath Troop to Gismo A")).toBeInTheDocument();
        expect(screen.getByText("New Injury")).toBeInTheDocument();
        expect(screen.getByText("Bite on tail")).toBeInTheDocument();
        expect(screen.queryByText(/sign in to see/i)).toBeNull();
    });

    test("nothing in the period", async () => {
        fakeSupabase();
        render(
            <AuthProvider>
                <LatestNewsPage monkeys={MONKEYS} />
            </AuthProvider>
        );
        expect(await screen.findByText("Nothing new in the last 7 days.")).toBeInTheDocument();
    });
});

describe("Favourites", () => {
    test("signed out: the ☆ on a card's photo stars it, kept on this device", async () => {
        fakeSupabase();
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ShowPage monkeys={MONKEYS} />
            </AuthProvider>
        );
        await waitFor(() => expect(card("Abby")).not.toBeNull());
        const star = screen.getByRole("button", { name: "Favourite Abby" });
        expect(star).toHaveAttribute("aria-pressed", "false");
        await user.click(star);
        expect(star).toHaveAttribute("aria-pressed", "true");
        expect(JSON.parse(localStorage.getItem("vervetdb-favourites"))).toEqual([1]);
        // (a tap on the star doesn't open the pop-up)
        expect(screen.queryByRole("dialog")).toBeNull();
        expect(supabase.from).not.toHaveBeenCalledWith("favourites");
    });

    test("signed in: the account's own, from the database; the pop-up has the star too", async () => {
        const { deleted } = fakeSupabase({ signedIn: true, favourites: [{ monkey_id: 2 }] });
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ShowPage monkeys={MONKEYS} editable />
            </AuthProvider>
        );
        await waitFor(() =>
            expect(screen.getByRole("button", { name: "Favourite Pip" })).toHaveAttribute("aria-pressed", "true")
        );
        await user.click(card("Pip"));
        const dialog = await screen.findByRole("dialog");
        const star = within(dialog).getByRole("button", { name: "Favourite Pip" });
        expect(star).toHaveAttribute("aria-pressed", "true");
        await user.click(star);
        expect(star).toHaveAttribute("aria-pressed", "false");
        expect(deleted).toHaveBeenCalledWith("monkey_id", 2);
    });
});

describe("Recent Edits", () => {
    test("staff: beside Share in the pop-up, the last 7 days' edits and who made them; Back returns", async () => {
        fakeSupabase({
            signedIn: true,
            rpc: {
                monkey_recent_edits: [
                    { changed_at: new Date().toISOString(), kind: "changed", changed_by: "Sam Smith", lines: ["Bio: a → b", "Photos: 1 added"] },
                    { changed_at: new Date().toISOString(), kind: "changed", changed_by: "Sam Smith", lines: [] },
                ],
            },
        });
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ShowPage monkeys={MONKEYS} editable />
            </AuthProvider>
        );
        await waitFor(() => expect(card("Abby")).not.toBeNull());
        await user.click(card("Abby"));
        const dialog = await screen.findByRole("dialog");
        await user.click(await within(dialog).findByRole("button", { name: "Recent edits to Abby" }));
        expect(supabase.rpc).toHaveBeenCalledWith("monkey_recent_edits", { monkey: 1, days: 7 });
        const panel = await within(dialog).findByRole("region", { name: /Recent Edits/ });
        expect(await within(panel).findByText("Bio: a → b")).toBeInTheDocument();
        expect(within(panel).getAllByText("by Sam Smith")).toHaveLength(2);
        // (an edit the history doesn't put into words)
        expect(within(panel).getByText("Other details")).toBeInTheDocument();
        await user.click(within(panel).getByRole("button", { name: "Back" }));
        expect(within(dialog).queryByRole("region", { name: /Recent Edits/ })).toBeNull();
    });

    test("visitors: no Recent Edits", async () => {
        fakeSupabase();
        const user = userEvent.setup();
        render(
            <AuthProvider>
                <ShowPage monkeys={MONKEYS} editable />
            </AuthProvider>
        );
        await waitFor(() => expect(card("Abby")).not.toBeNull());
        await user.click(card("Abby"));
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).queryByRole("button", { name: /Recent edits/ })).toBeNull();
    });
});

// A monkey's card (its label starts "Abby, …")
function card(name) {
    return document.querySelector(`.MonkeyCard[aria-label^="${name},"]`);
}
