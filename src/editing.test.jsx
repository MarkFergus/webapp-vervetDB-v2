// Editing, adding and deleting monkeys. Supabase is replaced with a pretend
// version that records what would be saved.
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import { BUILT_IN_DATA } from "./monkeyData";
import ShowPage from "./ShowPage";

const EDITOR = { id: "editor-1", email: "editor@example.com" };
const troopNames = BUILT_IN_DATA.troops.filter((t) => t !== "All Troops");
const TROOP_IDS = Object.fromEntries(troopNames.map((name, i) => [name, i + 1]));
const troopName = (id) => troopNames[id - 1];

// Live data has ids; give the built-in copy some for these tests
const startingMonkeys = () => BUILT_IN_DATA.monkeys.map((m, i) => ({ ...m, id: i + 1 }));

let saved; // what the pretend database was asked to do
function fakeSupabase({ signedIn = true, refuse = false, admin = true } = {}) {
    saved = { updates: [], inserts: [], deletes: [] };
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: signedIn ? { user: EDITOR } : null },
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    // A saved row, as the database would send it back
    const rowBack = (row, id) => ({
        id, ...row, troops: { name: troopName(row.troop_id) },
    });
    const refusal = { data: null, error: { code: "PGRST116", message: "0 rows" } };
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        if (table === "editors") {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: EDITOR.id, is_admin: admin }, error: null }) }) }) };
        }
        return {
            update: (row) => ({
                eq: (_, id) => ({
                    select: () => ({
                        single: async () => {
                            if (refuse) return refusal;
                            saved.updates.push({ id, row });
                            return { data: rowBack(row, id), error: null };
                        },
                    }),
                }),
            }),
            insert: (row) => ({
                select: () => ({
                    single: async () => {
                        saved.inserts.push(row);
                        return { data: rowBack(row, 9999), error: null };
                    },
                }),
            }),
            delete: () => ({
                eq: (_, id) => ({
                    select: async () => {
                        saved.deletes.push(id);
                        return { data: [{ id }], error: null };
                    },
                }),
            }),
        };
    });
}

// ShowPage with its own list, like App gives it
function Harness({ editable = true }) {
    const [monkeys, setMonkeys] = useState(startingMonkeys);
    return (
        <AuthProvider>
            <ShowPage
                monkeys={monkeys}
                troops={BUILT_IN_DATA.troops}
                troopIds={TROOP_IDS}
                editable={editable}
                onMonkeySaved={(m) =>
                    setMonkeys((list) =>
                        list.some((x) => x.id === m.id)
                            ? list.map((x) => (x.id === m.id ? m : x))
                            : [...list, m]
                    )
                }
                onMonkeyDeleted={(id) => setMonkeys((list) => list.filter((x) => x.id !== id))}
            />
        </AuthProvider>
    );
}

function setup(options = {}) {
    fakeSupabase(options);
    const user = userEvent.setup();
    render(<Harness editable={options.editable ?? true} />);
    return { user };
}

afterEach(() => vi.restoreAllMocks());

const card = (name) => screen.getByRole("button", { name: new RegExp(`^${name},`) });
const form = () => screen.getByRole("dialog", { name: /^(Edit|Add)/ });
const field = (label) => within(form()).getByLabelText(label, { exact: false });

async function openEditFor(user, name) {
    // Search first, in case the monkey isn't on the first page of cards
    await user.type(await screen.findByLabelText("Search by name or chip number"), name);
    await user.click(await screen.findByRole("button", { name: new RegExp(`^${name},`) }));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
}

test("visitors see no Edit or Add buttons", async () => {
    const { user } = setup({ signedIn: false });
    await user.click(await screen.findByRole("button", { name: /^Aroha,/ }));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add (New )?Monkey/i })).toBeNull();
});

test("no editing when the site is showing its built-in copy", async () => {
    const { user } = setup({ editable: false });
    await user.click(await screen.findByRole("button", { name: /^Aroha,/ }));
    // Give sign-in time to finish, then check
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("editors"));
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
});

test("editing: the form is filled in, and saving shows the new details", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");

    expect(form()).toHaveAccessibleName("Edit Aroha");
    expect(field("Name")).toHaveValue("Aroha");
    expect(field("Name")).toHaveFocus();
    expect(field("Troop")).toHaveValue("H&B");
    expect(field("Birth year")).toHaveValue("2016");
    expect(field("Chip")).toHaveValue("19806");

    await user.clear(field("Bio"));
    await user.type(field("Bio"), "Arrived as an orphan in  2016. Loves  grapes. ");
    await user.clear(field("Chip"));
    await user.type(field("Chip"), "19806 1234");
    await user.click(within(form()).getByRole("button", { name: "Save" }));

    // Saved (tidied), and the monkey's pop-up shows the new details
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({
        name: "Aroha",
        chip: "19806 & 1234",
        bio: "Arrived as an orphan in 2016. Loves grapes.",
        troop_id: TROOP_IDS["H&B"],
        birth_year: 2016,
    });
    const details = await screen.findByRole("dialog", { name: "Aroha" });
    expect(details).toHaveTextContent("Loves grapes.");
    expect(details).toHaveTextContent("19806 & 1234");
});

test("problems are explained and nothing is saved until they're fixed", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    await user.clear(field("Name"));
    await user.click(within(form()).getByRole("button", { name: "Save" }));

    expect(within(form()).getByText("Please enter a name.")).toBeInTheDocument();
    expect(field("Name")).toHaveAttribute("aria-invalid", "true");
    expect(saved.updates).toHaveLength(0);
});

test("birth year: chosen from this year back to 2000, or Unknown", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    const years = within(field("Birth year")).getAllByRole("option").map((o) => o.textContent);
    const thisYear = new Date().getFullYear();
    expect(years[0]).toBe("Unknown");
    expect(years[1]).toBe(String(thisYear));
    expect(years.at(-1)).toBe("2000");

    await user.selectOptions(field("Birth year"), "Unknown");
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row.birth_year).toBeNull();
});

test("adding a monkey: it appears in the list and its pop-up opens", async () => {
    const { user } = setup();
    const addButton = await screen.findByRole("button", { name: "Add New Monkey" });
    // In the top bar with the other buttons, not the sort / filter row
    expect(addButton.closest(".Nav-buttons")).not.toBeNull();
    expect(document.querySelector(".ShowPage-toolbar button[title='Add New Monkey']")).toBeNull();
    await user.click(addButton);
    expect(form()).toHaveAccessibleName("Add a monkey");

    await user.type(field("Name"), "Brand New");
    await user.selectOptions(field("Troop"), "Goliath");
    await user.selectOptions(field("Sex"), "female");
    await user.selectOptions(field("Birth year"), "2026");
    await user.click(within(form()).getByRole("button", { name: "Add monkey" }));

    await waitFor(() => expect(saved.inserts).toHaveLength(1));
    // No photo given: the placeholder is used
    expect(saved.inserts[0]).toMatchObject({
        name: "Brand New", sex: "female", birth_year: 2026, troop_id: TROOP_IDS.Goliath,
        photos: ["https://i.ibb.co/2YvYtBJ/blank-image-min.jpg"],
    });
    expect(await screen.findByRole("dialog", { name: "Brand New" })).toBeInTheDocument();
    expect(document.querySelector(".ShowPage-monkeys")).toHaveTextContent("Brand New");
});

// The photos listed in the form, in order (from their previews)
const formPhotos = () =>
    within(form()).queryAllByRole("img", { name: /^Photo \d/ }).map((img) => img.getAttribute("src"));
const DARBY_1 = "https://i.ibb.co/gyWCTvJ/darby-james-may2024-2-min.webp";
const DARBY_2 = "https://i.ibb.co/TcByhLx/darby-james-may2024-min.webp";

test("photos: previews only (no link boxes), and ⋮ → Delete photo removes one", async () => {
    const { user } = setup();
    await openEditFor(user, "Darby");
    expect(formPhotos()).toEqual([DARBY_1, DARBY_2]);
    expect(within(form()).getByText("Primary photo")).toBeInTheDocument();
    expect(within(form()).queryByRole("textbox", { name: /Photo link/ })).toBeNull();
    expect(within(form()).queryByRole("button", { name: /Add photo link/ })).toBeNull();

    await user.click(within(form()).getByRole("button", { name: /^Photo 1 options/ }));
    await user.click(within(form()).getByRole("menuitem", { name: "Delete photo" }));
    expect(formPhotos()).toEqual([DARBY_2]);
    await user.click(within(form()).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row.photos).toEqual([DARBY_2]);
});

test("⋮ → Make primary photo moves it first (card and Profile Book photo)", async () => {
    const { user } = setup();
    await openEditFor(user, "Darby");
    const options = (n) => within(form()).getByRole("button", { name: new RegExp(`^Photo ${n} options`) });
    expect(options(1)).toHaveAccessibleName("Photo 1 options (primary photo)");

    // The primary photo's menu has only Delete
    await user.click(options(1));
    expect(within(form()).getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Delete photo"]);
    await user.keyboard("{Escape}");

    await user.click(options(2));
    const makePrimary = within(form()).getByRole("menuitem", { name: "Make primary photo" });
    expect(makePrimary).toHaveFocus(); // first item, ready for the keyboard
    await user.click(makePrimary);
    expect(within(form()).queryByRole("menu")).toBeNull();
    expect(formPhotos()).toEqual([DARBY_2, DARBY_1]);
    expect(options(1)).toHaveAccessibleName("Photo 1 options (primary photo)");

    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row.photos).toEqual([DARBY_2, DARBY_1]);
});

test("the photo menu: arrow keys move, Escape closes just the menu, a click outside closes it", async () => {
    const { user } = setup();
    await openEditFor(user, "Darby");
    const options2 = within(form()).getByRole("button", { name: /^Photo 2 options/ });

    await user.click(options2);
    expect(options2).toHaveAttribute("aria-expanded", "true");
    await user.keyboard("{ArrowDown}");
    expect(within(form()).getByRole("menuitem", { name: "Delete photo" })).toHaveFocus();
    await user.keyboard("{ArrowDown}"); // wraps round
    expect(within(form()).getByRole("menuitem", { name: "Make primary photo" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(within(form()).queryByRole("menu")).toBeNull();
    expect(options2).toHaveFocus();
    expect(form()).toBeInTheDocument(); // the edit form is still open

    await user.click(options2);
    await user.click(field("Bio"));
    expect(within(form()).queryByRole("menu")).toBeNull();
});

test("deleting asks first, then removes the monkey", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    await user.click(within(form()).getByRole("button", { name: "Delete" }));
    expect(within(form()).getByText("Delete Aroha for good?")).toBeInTheDocument();

    await user.click(within(form()).getByRole("button", { name: "Keep" }));
    expect(saved.deletes).toHaveLength(0);

    await user.click(within(form()).getByRole("button", { name: "Delete" }));
    await user.click(within(form()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(saved.deletes).toEqual([1]));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.queryByRole("button", { name: /^Aroha,/ })).toBeNull();
});

test("editors who aren't admins can edit but have no Delete button", async () => {
    const { user } = setup({ admin: false });
    await openEditFor(user, "Aroha");
    expect(within(form()).getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(within(form()).queryByRole("button", { name: "Delete" })).toBeNull();
});

test("if the database refuses a delete, it says only admins can delete", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup();
    // The pretend database deletes nothing, as it would for a non-admin
    const realFrom = supabase.from.getMockImplementation();
    supabase.from.mockImplementation((table) => ({
        ...realFrom(table),
        delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
    }));
    await openEditFor(user, "Aroha");
    await user.click(within(form()).getByRole("button", { name: "Delete" }));
    await user.click(within(form()).getByRole("button", { name: "Delete" }));

    expect(await within(form()).findByText(/Only admins can delete monkeys/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Aroha,/ })).toBeInTheDocument();
});

test("if the database refuses, the form stays open with a clear message", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { user } = setup({ refuse: true });
    await openEditFor(user, "Aroha");
    await user.type(field("Bio"), " More.");
    await user.click(within(form()).getByRole("button", { name: "Save" }));

    expect(await within(form()).findByText(/didn't allow this change/)).toBeInTheDocument();
    expect(field("Bio")).toHaveValue("Arrived as an orphan in 2016. More.");
});

test("closing with unsaved changes asks first", async () => {
    const { user } = setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await openEditFor(user, "Aroha");

    // No changes: closes straight away
    await user.click(within(form()).getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /^Edit/ })).toBeNull());

    // Changes: asks, and "no" keeps the form open
    await user.click(card("Aroha"));
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.type(field("Bio"), " x");
    await user.keyboard("{Escape}");
    expect(confirm).toHaveBeenCalledWith("Discard your changes?");
    expect(form()).toBeInTheDocument();
});

test("phones: editors also find Add monkey in the ☰ menu", async () => {
    const { user } = setup();
    // Signed in as an editor: wait for the desktop button, then use the menu
    await screen.findByRole("button", { name: "Add New Monkey" });
    await user.click(screen.getByRole("button", { name: /^Menu/ }));
    const menu = document.getElementById("Nav-menu");
    await user.click(within(menu).getByRole("button", { name: "Add New Monkey" }));
    expect(form()).toHaveAccessibleName("Add a monkey");
});
