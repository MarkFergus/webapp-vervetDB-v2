// Editing, adding and deleting monkeys. Supabase is replaced with a pretend
// version that records what would be saved.
import { useState } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import { BUILT_IN_DATA } from "./monkeyData";
import ShowPage from "./ShowPage";
import { DEFAULT_FEEDING } from "./feeding";
import { currentBabySeason } from "./ages";

const EDITOR = { id: "editor-1", email: "editor@example.com" };
const troopNames = BUILT_IN_DATA.troops.filter((t) => t !== "All Troops");
const TROOP_IDS = Object.fromEntries(troopNames.map((name, i) => [name, i + 1]));
const troopName = (id) => troopNames[id - 1];

// Live data has ids; give the built-in copy some for these tests
const startingMonkeys = () => BUILT_IN_DATA.monkeys.map((m, i) => ({ ...m, id: i + 1 }));

let saved; // what the pretend database was asked to do
function fakeSupabase({ signedIn = true, refuse = false, admin = true, role } = {}) {
    saved = { updates: [], inserts: [], deletes: [] };
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: signedIn ? { user: EDITOR } : null },
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    // A saved row, as the database would send it back
    const rowBack = (row, id) => ({
        id, ...row, troops: row.troop_id ? { name: troopName(row.troop_id) } : null,
    });
    const refusal = { data: null, error: { code: "PGRST116", message: "0 rows" } };
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        if (table === "editors") {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: EDITOR.id, is_admin: admin, ...(role && { role }) }, error: null }) }) }) };
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
function Harness({ editable = true, enclosuresLive = false, start = startingMonkeys }) {
    const [monkeys, setMonkeys] = useState(start);
    return (
        <AuthProvider>
            <ShowPage
                monkeys={monkeys}
                troops={BUILT_IN_DATA.troops}
                troopIds={TROOP_IDS}
                enclosuresLive={enclosuresLive}
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
    render(
        <Harness
            editable={options.editable ?? true}
            enclosuresLive={options.enclosuresLive}
            {...(options.start && { start: options.start })}
        />
    );
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

test("maintenance accounts can't edit or add monkeys", async () => {
    const { user } = setup({ role: "maintenance", admin: false });
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith("editors"));
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
    expect(field("Enclosure")).toHaveValue("H&B");
    expect(field("Location")).toHaveValue("troop");
    // The database here has no introcages yet: the troop is the only choice
    expect(within(field("Location")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Holt & Barrington Troop"]);
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

test("chip: \"Unknown?\" shows while the box has focus, and saves an unknown chip", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    const unknown = () => within(form()).queryByRole("button", { name: "Unknown?" });
    expect(unknown()).not.toBeInTheDocument();

    expect(within(form()).queryByText("Leave blank if no chip")).not.toBeInTheDocument();

    await user.click(field("Chip"));
    expect(unknown()).toBeInTheDocument();
    expect(within(form()).getByText("Leave blank if no chip")).toBeInTheDocument();
    await user.click(field("Name"));
    expect(unknown()).not.toBeInTheDocument();
    expect(within(form()).queryByText("Leave blank if no chip")).not.toBeInTheDocument();

    // Chosen: the box empties and shows "Unknown"; "Clear" takes its place
    await user.click(field("Chip"));
    await user.click(unknown());
    expect(field("Chip")).toHaveValue("");
    expect(field("Chip")).toHaveAttribute("placeholder", "Unknown");
    await user.click(field("Chip"));
    expect(unknown()).not.toBeInTheDocument();
    expect(within(form()).getByRole("button", { name: "Clear" })).toBeInTheDocument();
    expect(within(form()).getByText("Press Clear if no chip")).toBeInTheDocument();

    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row.chip).toBeNull();
    const details = await screen.findByRole("dialog", { name: "Aroha" });
    expect(details).toHaveTextContent("Chip Unknown");
});

test("chip: \"Clear\" undoes Unknown, back to no chip", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    await user.click(field("Chip"));
    await user.click(within(form()).getByRole("button", { name: "Unknown?" }));
    await user.click(field("Chip"));
    await user.click(within(form()).getByRole("button", { name: "Clear" }));
    expect(field("Chip")).toHaveAttribute("placeholder", "No Chip");
    expect(field("Chip")).not.toHaveFocus();
    expect(within(form()).queryByRole("button", { name: /Unknown|Clear/ })).not.toBeInTheDocument();

    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row.chip).toBe("");
});

test("chip: typing a number undoes Unknown", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    await user.click(field("Chip"));
    await user.click(within(form()).getByRole("button", { name: "Unknown?" }));
    expect(field("Chip")).toHaveAttribute("placeholder", "Unknown");
    await user.type(field("Chip"), "1011,1604");
    expect(field("Chip")).toHaveAttribute("placeholder", "No Chip");
    expect(within(form()).getByRole("button", { name: "Unknown?" })).toBeInTheDocument();
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

test("birth year: chosen from this year back to 1997, or Unknown", async () => {
    const { user } = setup();
    await openEditFor(user, "Aroha");
    const years = within(field("Birth year")).getAllByRole("option").map((o) => o.textContent);
    const thisYear = new Date().getFullYear();
    expect(years[0]).toBe("Unknown");
    expect(years[1]).toBe(String(thisYear));
    expect(years.at(-1)).toBe("1997");

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
    expect(form()).toHaveAccessibleName("Add New Monkey");

    await user.type(field("Name"), "Brand New");
    expect(field("Location")).toBeDisabled();
    await user.selectOptions(field("Enclosure"), "Goliath");
    expect(field("Location")).toHaveValue("troop");
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

test("location: moving a monkey into one of its enclosure's introcages, and back", async () => {
    const { user } = setup({ enclosuresLive: true });
    await openEditFor(user, "Aroha");
    const options = within(field("Location")).getAllByRole("option").map((o) => o.textContent);
    // (full names: "H&B" is Holt & Barrington)
    expect(options).toEqual(["Holt & Barrington Troop", ...["A", "B", "C1", "C2"].map((c) => `Holt & Barrington ${c}`)]);

    // (chosen by value: the option's "&" doesn't match as text)
    const c1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C1");
    await user.selectOptions(field("Location"), String(c1.id));
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    // A move: its date and reason first (for its Movement record)
    expect(within(form()).getByText("Move Aroha to a new home location at Holt & Barrington C1?")).toBeInTheDocument();
    expect(
        within(form()).getByText("Updates Aroha’s home location. Use Quick Actions to update current location.")
    ).toBeInTheDocument();
    expect(saved.updates).toHaveLength(0);
    fireEvent.change(within(form()).getByLabelText("Date Moved"), { target: { value: "2026-10-20" } });
    await user.type(within(form()).getByLabelText("Reason (optional)"), "Separated for a while");
    await user.click(within(form()).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    // In the introcage, not the troop
    expect(saved.updates[0].row).toMatchObject({
        troop_id: null, introcage_id: c1.id, moved_on: "2026-10-20", move_reason: "Separated for a while",
    });
    expect(await screen.findByRole("dialog", { name: "Aroha" })).toHaveTextContent("Holt & Barrington C1");

    // Back to the troop
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(field("Enclosure")).toHaveValue("H&B");
    expect(field("Location")).toHaveValue(String(c1.id));
    await user.selectOptions(field("Location"), "troop");
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await user.click(within(form()).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(saved.updates).toHaveLength(2));
    expect(saved.updates[1].row).toMatchObject({ troop_id: TROOP_IDS["H&B"], introcage_id: null });
});

test("location: choosing another enclosure starts with its troop", async () => {
    const { user } = setup({ enclosuresLive: true });
    await openEditFor(user, "Aroha");
    const c1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C1");
    await user.selectOptions(field("Location"), String(c1.id));
    await user.selectOptions(field("Enclosure"), "Robert");
    expect(field("Location")).toHaveValue("troop");
    expect(within(field("Location")).getAllByRole("option")[1]).toHaveTextContent("Robert A");
});

const byKind = (type, name) => BUILT_IN_DATA.enclosures.find((e) => e.type === type && e.name === name);

test("location: the care units; Sickbay's one area is chosen by itself", async () => {
    const { user } = setup({ enclosuresLive: true });
    await openEditFor(user, "Aroha");
    // Baby Care: its three areas to choose from, no troop
    await user.selectOptions(field("Enclosure"), `enclosure:${byKind("care_unit", "Baby Care").id}`);
    expect(field("Location")).toHaveValue("");
    expect(within(field("Location")).getAllByRole("option").map((o) => o.textContent))
        .toEqual(["Choose…", "Dreamland", "Neverland", "Disneyland"]);
    // Sickbay: just itself, already chosen
    const unit = byKind("area", "Sickbay");
    await user.selectOptions(field("Enclosure"), `enclosure:${byKind("care_unit", "Sickbay").id}`);
    expect(field("Location")).toHaveValue(String(unit.id));
    expect(within(field("Location")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Sickbay"]);
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await user.click(within(form()).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({ troop_id: null, introcage_id: unit.id });
});

test("adding a monkey: a new arrival goes into a care unit (moved to its home later, with Edit)", async () => {
    const { user } = setup({ enclosuresLive: true });
    await user.click(await screen.findByRole("button", { name: "Add New Monkey" }));
    expect(within(form()).getByText(/New arrivals start in a care unit/)).toBeInTheDocument();
    // Only the care units: no troops, no Bachelor Block
    expect(within(field("Care Unit")).getAllByRole("option").map((o) => o.textContent))
        .toEqual(["Choose…", "Baby Care", "Quarantine", "Sickbay"]);
    await user.type(field("Name"), "Brand New");
    // Quarantine: one area, chosen by itself
    const area = byKind("area", "Quarantine");
    await user.selectOptions(field("Care Unit"), `enclosure:${byKind("care_unit", "Quarantine").id}`);
    expect(field("Location")).toHaveValue(String(area.id));
    await user.click(within(form()).getByRole("button", { name: "Add monkey" }));
    await waitFor(() => expect(saved.inserts).toHaveLength(1));
    expect(saved.inserts[0]).toMatchObject({ name: "Brand New", troop_id: null, introcage_id: area.id });
});

test("editing a monkey can still move it anywhere", async () => {
    const { user } = setup({ enclosuresLive: true });
    await openEditFor(user, "Aroha");
    const options = within(field("Enclosure")).getAllByRole("option").map((o) => o.textContent);
    expect(options).toContain("Goliath");
    expect(options).toContain("Bachelor Block");
    expect(options).toContain("Quarantine");
    expect(within(form()).queryByText(/New arrivals start in a care unit/)).toBeNull();
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

test("phones: admins also find Add New Monkey in the ☰ drawer", async () => {
    const { user } = setup();
    // Signed in as an admin: wait for the computer's button, then use the drawer
    await screen.findByRole("button", { name: "Add New Monkey" });
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "Add New Monkey" }));
    expect(form()).toHaveAccessibleName("Add New Monkey");
});

describe("feeding (introcage monkeys)", () => {
    const HB_C1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C1");
    // Aroha in H&B C1, with the database's feeding
    const withAroha = () =>
        startingMonkeys().map((m) =>
            m.name === "Aroha"
                ? { ...m, troop: null, introcage: "H&B C1", introcageId: HB_C1.id, introcageType: "introcage",
                    enclosure: "H&B", year: 2015, feeding: { ...DEFAULT_FEEDING } }
                : m
        );
    const feeding = () => within(form()).queryByRole("group", { name: "Feeding" });

    test("Fed By, AM plates and PM bowls; Sickbay hides the plates; saved with the monkey", async () => {
        const { user } = setup({ enclosuresLive: true, start: withAroha });
        await openEditFor(user, "Aroha");
        expect(feeding()).not.toBeNull();
        await user.selectOptions(within(feeding()).getByLabelText("Fed By"), "Sickbay");
        expect(within(feeding()).queryByLabelText("AM Plates")).toBeNull();
        // (Aroha's a male: "his")
        expect(within(feeding()).getByText(/Sickbay delivers his plates/)).toBeInTheDocument();
        await user.selectOptions(within(feeding()).getByLabelText("Fed By"), "Local Team");
        await user.selectOptions(within(feeding()).getByLabelText("AM Plates"), "2 Plates");
        await user.click(within(feeding()).getByRole("checkbox", { name: "Metal Plate" }));
        await user.click(within(within(feeding()).getByRole("group", { name: "PM bowl extras" })).getByRole("checkbox", { name: "Cut Small" }));
        await user.click(within(form()).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saved.updates).toHaveLength(1));
        expect(saved.updates[0].row).toMatchObject({
            introcage_id: HB_C1.id, fed_by: "local_team", am_plates: 2, am_cut_small: false, am_fruit: false,
            am_metal_plate: true, pm_bowls: 1, pm_cut_small: true,
        });
        // Its pop-up: what it's fed
        const dialog = await screen.findByRole("dialog", { name: "Aroha" });
        expect(within(dialog).getByText("2 plates, metal plate")).toBeInTheDocument();
        expect(within(dialog).getByText("1 bowl, cut small")).toBeInTheDocument();
    });

    test("a troop monkey moved into an introcage: fed by Sickbay to start with (changeable)", async () => {
        // Aroha in the H&B troop, with the database's feeding (Local Team)
        const inTroop = () =>
            startingMonkeys().map((m) =>
                m.name === "Aroha" ? { ...m, troop: "H&B", introcage: null, introcageId: null, enclosure: "H&B", feeding: { ...DEFAULT_FEEDING } } : m
            );
        const { user } = setup({ enclosuresLive: true, start: inTroop });
        await openEditFor(user, "Aroha");
        expect(feeding()).toBeNull();
        await user.selectOptions(field("Location"), String(HB_C1.id));
        expect(within(feeding()).getByLabelText("Fed By")).toHaveValue("sickbay");
        await user.selectOptions(within(feeding()).getByLabelText("Fed By"), "Local Team");
        await user.click(within(form()).getByRole("button", { name: "Save" }));
        await user.click(within(form()).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saved.updates).toHaveLength(1));
        expect(saved.updates[0].row).toMatchObject({ introcage_id: HB_C1.id, fed_by: "local_team" });
    });

    test("an introcage monkey moved to another introcage keeps its Fed By", async () => {
        const { user } = setup({ enclosuresLive: true, start: withAroha });
        await openEditFor(user, "Aroha");
        const C2 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C2");
        await user.selectOptions(field("Location"), String(C2.id));
        expect(within(feeding()).getByLabelText("Fed By")).toHaveValue("localTeam");
    });

    test("not for a troop monkey: moving back to the troop hides it", async () => {
        const { user } = setup({ enclosuresLive: true, start: withAroha });
        await openEditFor(user, "Aroha");
        await user.selectOptions(field("Location"), "troop");
        expect(feeding()).toBeNull();
    });

    test("a baby's feed is locked: 1 plate, cut small + fruit, 1 bowl, cut small", async () => {
        const { user } = setup({ enclosuresLive: true, start: withAroha });
        await openEditFor(user, "Aroha");
        const amExtras = () => within(feeding()).getByRole("group", { name: "AM plate extras" });
        const pmExtras = () => within(feeding()).getByRole("group", { name: "PM bowl extras" });
        await user.selectOptions(field("Birth year"), String(currentBabySeason()));
        expect(within(feeding()).getByRole("combobox", { name: "AM Plates" })).toBeDisabled();
        expect(within(feeding()).getByRole("combobox", { name: "AM Plates" })).toHaveDisplayValue("1 Plate");
        for (const name of ["Cut Small", "Add Fruit"]) {
            expect(within(amExtras()).getByRole("checkbox", { name })).toBeChecked();
            expect(within(amExtras()).getByRole("checkbox", { name })).toBeDisabled();
        }
        expect(within(feeding()).getByRole("combobox", { name: "PM Bowls" })).toBeDisabled();
        expect(within(feeding()).getByRole("combobox", { name: "PM Bowls" })).toHaveDisplayValue("1 Bowl");
        expect(within(pmExtras()).getByRole("checkbox", { name: "Cut Small" })).toBeChecked();
        expect(within(pmExtras()).getByRole("checkbox", { name: "Cut Small" })).toBeDisabled();
        // A grown-up again: their own settings
        await user.selectOptions(field("Birth year"), "2015");
        expect(within(feeding()).getByRole("combobox", { name: "AM Plates" })).toBeEnabled();
        expect(within(feeding()).getByRole("combobox", { name: "PM Bowls" })).toBeEnabled();
        expect(within(amExtras()).getByRole("checkbox", { name: "Cut Small" })).toBeEnabled();
    });
});

test("Quick Actions (Sickbay, Released, New Injury) is for admins only, for now", async () => {
    const withSickbay = () => startingMonkeys().map((m) => ({ ...m, inSickbay: false, status: "sanctuary" }));
    // An editor: the pop-up has Edit, but no Quick Actions
    const editor = setup({ enclosuresLive: true, admin: false, start: withSickbay });
    await editor.user.click(await screen.findByRole("button", { name: /^Aroha,/ }));
    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
});

test("...and an admin has it", async () => {
    const withSickbay = () => startingMonkeys().map((m) => ({ ...m, inSickbay: false, status: "sanctuary" }));
    const { user } = setup({ enclosuresLive: true, admin: true, start: withSickbay });
    await user.click(await screen.findByRole("button", { name: /^Aroha,/ }));
    await user.click(await screen.findByRole("button", { name: "Quick Actions" }));
    expect(screen.getByRole("button", { name: "Move to Sickbay" })).toBeInTheDocument();
});

test("a move's Cancel goes back to the form without saving; no move, no question", async () => {
    const { user } = setup({ enclosuresLive: true });
    await openEditFor(user, "Aroha");
    const c1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C1");
    await user.selectOptions(field("Location"), String(c1.id));
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    // (its own Cancel: not the form's)
    await user.click(within(screen.getByRole("group", { name: "Change home location" })).getByRole("button", { name: "Cancel" }));
    expect(within(form()).queryByLabelText("Date Moved")).not.toBeInTheDocument();
    expect(field("Location")).toHaveValue(String(c1.id));
    expect(saved.updates).toHaveLength(0);
    // Back where it was: saved straight away, no move question
    await user.selectOptions(field("Location"), "troop");
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).not.toHaveProperty("moved_on");
});

test("a new home while it's away (In Sickbay): says so, then saves with the date and reason", async () => {
    const inSickbay = () => startingMonkeys().map((m) => (m.name === "Aroha" ? { ...m, inSickbay: true, sickbaySince: "2026-10-20" } : m));
    const { user } = setup({ enclosuresLive: true, start: inSickbay });
    await openEditFor(user, "Aroha");
    const c1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "H&B C1");
    await user.selectOptions(field("Location"), String(c1.id));
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    expect(
        within(form()).getByText("Aroha is temporarily in Sickbay, change home location to Holt & Barrington C1?")
    ).toBeInTheDocument();
    expect(within(form()).getByText("Use Quick Actions in the monkey card to log temporary movements.")).toBeInTheDocument();
    await user.type(within(form()).getByLabelText("Reason (optional)"), "Separating from the troop");
    await user.click(within(form()).getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({ introcage_id: c1.id, move_reason: "Separating from the troop" });
});

test("Species: changed in Edit and saved (once the database has species)", async () => {
    const withSpecies = () => startingMonkeys().map((m) => (m.name === "Aroha" ? { ...m, species: "vervet" } : m));
    const { user } = setup({ enclosuresLive: true, start: withSpecies });
    await openEditFor(user, "Aroha");
    expect(within(field("Species")).getAllByRole("option").map((o) => o.textContent)).toEqual([
        "Vervet Monkey",
        "Samango Monkey",
        "Bush Baby",
    ]);
    await user.selectOptions(field("Species"), "samango");
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({ species: "samango" });
});

test("Birth Date beside Birth Year: a date fills in the year (its season) and fixes it; Approx? for a guess", async () => {
    const withBirthDates = () => startingMonkeys().map((m) => (m.name === "Aroha" ? { ...m, birthDate: null, birthDateApprox: false } : m));
    const { user } = setup({ enclosuresLive: true, start: withBirthDates });
    await openEditFor(user, "Aroha");
    const approx = within(form()).getByRole("checkbox", { name: "Approx?" });
    // Unknown: the year's chosen as before. Approx? can be ticked first
    expect(field("Birth Date")).toHaveValue("");
    expect(field("Birth year")).toBeEnabled();
    await user.click(approx);
    fireEvent.change(field("Birth Date"), { target: { value: "2024-02-14" } });
    expect(field("Birth year")).toHaveValue("2023");
    expect(field("Birth year")).toBeDisabled();
    expect(approx).toBeChecked();
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({ birth_date: "2024-02-14", birth_date_approx: true, birth_year: 2023 });
});

test("Approx? ticked with no date: no guess is saved (unknown)", async () => {
    const withBirthDates = () => startingMonkeys().map((m) => (m.name === "Aroha" ? { ...m, birthDate: null, birthDateApprox: false } : m));
    const { user } = setup({ enclosuresLive: true, start: withBirthDates });
    await openEditFor(user, "Aroha");
    await user.click(within(form()).getByRole("checkbox", { name: "Approx?" }));
    await user.click(within(form()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saved.updates).toHaveLength(1));
    expect(saved.updates[0].row).toMatchObject({ birth_date: null, birth_date_approx: false });
});

