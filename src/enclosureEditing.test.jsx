// Editing an enclosure's details, and its maintenance log. Supabase is
// replaced with a pretend version that records what would be saved.
import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import { BUILT_IN_DATA } from "./monkeyData";
import ShowPage from "./ShowPage";

const EDITOR = { id: "editor-1", email: "mark@example.com" };
const ROBERT = BUILT_IN_DATA.enclosures.find((e) => e.name === "Robert");
const ROBERT_B1 = BUILT_IN_DATA.enclosures.find((e) => e.name === "Robert B1");

let saved; // what the pretend database was asked to do
let log; // the pretend maintenance table
function fakeSupabase({ signedIn = true, admin = true } = {}) {
    saved = { updates: [], inserts: [], deletes: [] };
    log = [
        { id: 1, enclosure_id: ROBERT.id, done_on: "2026-09-12", details: "Cleared the drain", logged_by_name: "sam", logged_at: "2026-09-12T10:00:00Z" },
        { id: 2, enclosure_id: ROBERT.id, done_on: "2026-10-01", details: "Fixed the gate latch", logged_by_name: "mark", logged_at: "2026-10-01T09:00:00Z" },
    ];
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: signedIn ? { user: EDITOR } : null },
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        if (table === "editors") {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: EDITOR.id, is_admin: admin }, error: null }) }) }) };
        }
        if (table === "enclosures") {
            return {
                update: (row) => ({
                    eq: (_, id) => ({
                        select: () => ({
                            single: async () => {
                                saved.updates.push({ id, row });
                                return { data: { size: null, ...row }, error: null };
                            },
                        }),
                    }),
                }),
            };
        }
        // maintenance
        return {
            select: () => ({
                eq: (_, id) => ({
                    order: () => ({
                        order: async () => ({
                            data: log
                                .filter((e) => e.enclosure_id === id)
                                .sort((a, b) => b.done_on.localeCompare(a.done_on)),
                            error: null,
                        }),
                    }),
                }),
            }),
            insert: (row) => ({
                select: () => ({
                    single: async () => {
                        saved.inserts.push(row);
                        const entry = { id: 99, ...row, logged_by_name: "mark", logged_at: "2026-10-07T12:00:00Z" };
                        log.push(entry);
                        return { data: entry, error: null };
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

// ShowPage on an enclosure's page, with its own enclosures list, like App
function Harness({ route, enclosuresLive, startingEnclosures = BUILT_IN_DATA.enclosures }) {
    const [enclosures, setEnclosures] = useState(startingEnclosures);
    return (
        <AuthProvider>
            <ShowPage
                route={route}
                editable
                enclosures={enclosures}
                enclosuresLive={enclosuresLive}
                onEnclosureSaved={(e) => setEnclosures((list) => list.map((x) => (x.id === e.id ? e : x)))}
            />
        </AuthProvider>
    );
}

function setup({ route = `enclosure/${ROBERT.id}`, enclosuresLive = true, startingEnclosures, ...options } = {}) {
    fakeSupabase(options);
    const user = userEvent.setup();
    render(<Harness route={route} enclosuresLive={enclosuresLive} startingEnclosures={startingEnclosures} />);
    return { user };
}
// The Maintenance log is open to start with: wait for its heading
const openMaintenance = () => screen.findByRole("heading", { level: 2, name: "Maintenance" });

afterEach(() => vi.restoreAllMocks());

describe("editing an enclosure", () => {
    test("editors: About, Features, Size and Established, saved and shown", async () => {
        const { user } = setup();
        await user.click(await screen.findByRole("button", { name: "Edit" }));
        const form = screen.getByRole("dialog", { name: "Edit Robert" });
        await user.type(within(form).getByRole("textbox", { name: "About" }), "  The big one by the river. ");
        await user.type(within(form).getByRole("textbox", { name: "Features" }), "Pool, two shelters");
        await user.type(within(form).getByRole("textbox", { name: "Size" }), "1,200");
        await user.selectOptions(within(form).getByRole("combobox", { name: "Established month" }), "March");
        await user.selectOptions(within(form).getByRole("combobox", { name: "Established year" }), "2014");
        await user.click(within(form).getByRole("button", { name: "Save" }));

        await waitFor(() => expect(saved.updates).toHaveLength(1));
        expect(saved.updates[0]).toEqual({
            id: ROBERT.id,
            row: {
                description: "The big one by the river.",
                features: "Pool, two shelters",
                size: 1200,
                established: "2014-03-01",
                photos: [],
            },
        });
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "Edit Robert" })).toBeNull());
        expect(screen.getByText("The big one by the river.")).toBeInTheDocument();
        expect(screen.getByText("Pool, two shelters")).toBeInTheDocument();
        expect(screen.getByText("Size").closest("div")).toHaveTextContent("1,200 m²");
        expect(screen.getByText("Established").closest("div")).toHaveTextContent("March 2014");
    });

    test("size: just the number, shown in m²; anything else isn't saved", async () => {
        const { user } = setup();
        await user.click(await screen.findByRole("button", { name: "Edit" }));
        const form = screen.getByRole("dialog", { name: "Edit Robert" });
        expect(within(form).getByText("m²")).toBeInTheDocument();
        await user.type(within(form).getByRole("textbox", { name: "Size" }), "big");
        await user.click(within(form).getByRole("button", { name: "Save" }));
        expect(within(form).getByRole("alert")).toHaveTextContent("whole number of square metres");
        // Whole numbers only
        await user.clear(within(form).getByRole("textbox", { name: "Size" }));
        await user.type(within(form).getByRole("textbox", { name: "Size" }), "600.5");
        await user.click(within(form).getByRole("button", { name: "Save" }));
        expect(within(form).getByRole("alert")).toHaveTextContent("whole number");
        expect(saved.updates).toHaveLength(0);
    });

    test("a month without a year (or the other way round) isn't saved", async () => {
        const { user } = setup();
        await user.click(await screen.findByRole("button", { name: "Edit" }));
        const form = screen.getByRole("dialog", { name: "Edit Robert" });
        await user.selectOptions(within(form).getByRole("combobox", { name: "Established month" }), "March");
        await user.click(within(form).getByRole("button", { name: "Save" }));
        expect(within(form).getByRole("alert")).toHaveTextContent("both a month and a year");
        expect(saved.updates).toHaveLength(0);
    });

    test("an introcage: Description and Size only (no About or Established)", async () => {
        const { user } = setup({ route: `enclosure/${ROBERT_B1.id}` });
        await user.click(await screen.findByRole("button", { name: "Edit" }));
        const form = screen.getByRole("dialog", { name: "Edit Robert B1" });
        expect(within(form).queryByRole("textbox", { name: "About" })).toBeNull();
        expect(within(form).queryByRole("combobox", { name: "Established month" })).toBeNull();
        await user.type(within(form).getByRole("textbox", { name: "Description" }), "Shade net");
        await user.click(within(form).getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saved.updates).toHaveLength(1));
        expect(saved.updates[0].row).toEqual({ features: "Shade net", size: null, photos: [] });
    });

    test("editors who aren't admins can't edit an enclosure's details (they can still log maintenance)", async () => {
        const { user } = setup({ admin: false });
        await screen.findByRole("heading", { level: 1, name: "Robert" });
        await screen.findByText("Section");
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        await openMaintenance(user);
        expect(await screen.findByRole("button", { name: "Add Entry" })).toBeInTheDocument();
    });

    test("not signed in, or before the database has enclosures: no Edit", async () => {
        setup({ signedIn: false });
        await screen.findByRole("heading", { level: 1, name: "Robert" });
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });

    test("before the database has enclosures: no Edit, and the log isn't there yet", async () => {
        const { user } = setup({ enclosuresLive: false });
        await screen.findByRole("heading", { level: 1, name: "Robert" });
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
        await openMaintenance(user);
        expect(screen.getByText(/will show here once vervetDB is online/)).toBeInTheDocument();
    });
});

describe("the maintenance log", () => {
    test("entries newest first: the date, what was done, and who logged it", async () => {
        const { user } = setup({ signedIn: false });
        await openMaintenance(user);
        const entries = await screen.findAllByRole("listitem");
        expect(entries.map((e) => e.textContent)).toEqual([
            "1 Oct 2026Fixed the gate latchLogged by mark",
            "12 Sept 2026Cleared the drainLogged by sam",
        ]);
        // Visitors can read it, not add to it
        expect(screen.queryByRole("button", { name: "Add Entry" })).toBeNull();
    });

    test("editors add an entry: the date (today to start with) and what was done", async () => {
        const { user } = setup();
        await openMaintenance(user);
        await user.click(await screen.findByRole("button", { name: "Add Entry" }));
        const date = screen.getByLabelText("Date done");
        expect(date.value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        await user.clear(date);
        await user.type(date, "2026-10-05");
        await user.type(screen.getByRole("textbox", { name: "What was done" }), "Replaced the shade cloth");
        await user.click(screen.getByRole("button", { name: "Add Entry" }));

        await waitFor(() => expect(saved.inserts).toHaveLength(1));
        // Who logged it isn't sent: the database fills it in
        expect(saved.inserts[0]).toEqual({ enclosure_id: ROBERT.id, done_on: "2026-10-05", details: "Replaced the shade cloth" });
        const entries = await screen.findAllByRole("listitem");
        expect(entries[0]).toHaveTextContent("5 Oct 2026Replaced the shade clothLogged by mark");
    });

    test("an entry needs saying what was done", async () => {
        const { user } = setup();
        await openMaintenance(user);
        await user.click(await screen.findByRole("button", { name: "Add Entry" }));
        await user.click(screen.getByRole("button", { name: "Add Entry" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please say what was done.");
        expect(saved.inserts).toHaveLength(0);
    });

    test("admins can delete an entry, after confirming; editors can't", async () => {
        const { user } = setup({ admin: true });
        await openMaintenance(user);
        await user.click(await screen.findByRole("button", { name: "Delete the entry from 12 Sept 2026" }));
        await user.click(screen.getByRole("button", { name: "Delete" }));
        await waitFor(() => expect(saved.deletes).toEqual([1]));
        expect(screen.queryByText("Cleared the drain")).toBeNull();
    });

    test("editors who aren't admins have no delete buttons", async () => {
        const { user } = setup({ admin: false });
        await openMaintenance(user);
        await screen.findByText("Fixed the gate latch");
        expect(screen.queryByRole("button", { name: /^Delete the entry/ })).toBeNull();
    });
});

describe("enclosure photos", () => {
    const PHOTOS = ["https://example.com/robert-1.webp", "https://example.com/robert-2.webp"];
    const withPhotos = BUILT_IN_DATA.enclosures.map((e) => (e.id === ROBERT.id ? { ...e, photos: PHOTOS } : e));

    test("the record shows them one at a time, with previous / next", async () => {
        const { user } = setup({ startingEnclosures: withPhotos });
        expect(await screen.findByRole("img", { name: "Robert, photo 1 of 2" })).toHaveAttribute("src", PHOTOS[0]);
        await user.click(screen.getByRole("button", { name: "Next photo" }));
        expect(screen.getByRole("img", { name: "Robert, photo 2 of 2" })).toHaveAttribute("src", PHOTOS[1]);
        await user.click(screen.getByRole("button", { name: "Next photo" }));
        expect(screen.getByRole("img", { name: "Robert, photo 1 of 2" })).toBeInTheDocument();
    });

    test("one photo: no previous / next", async () => {
        const one = BUILT_IN_DATA.enclosures.map((e) => (e.id === ROBERT.id ? { ...e, photos: [PHOTOS[0]] } : e));
        setup({ startingEnclosures: one });
        expect(await screen.findByRole("img", { name: "Robert" })).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "Next photo" })).toBeNull();
    });

    test("the edit form lists them; making one primary and deleting one are saved", async () => {
        const { user } = setup({ startingEnclosures: withPhotos });
        await user.click(await screen.findByRole("button", { name: "Edit" }));
        const form = screen.getByRole("dialog", { name: "Edit Robert" });
        expect(within(form).getByText("Primary photo")).toBeInTheDocument();
        expect(within(form).getByText(/Upload new photo/)).toBeInTheDocument();

        await user.click(within(form).getByRole("button", { name: /Photo 2 options/ }));
        await user.click(screen.getByRole("menuitem", { name: /Make primary/i }));
        await user.click(within(form).getByRole("button", { name: /Photo 2 options/ }));
        await user.click(screen.getByRole("menuitem", { name: /Delete/i }));
        await user.click(within(form).getByRole("button", { name: "Save" }));

        await waitFor(() => expect(saved.updates).toHaveLength(1));
        expect(saved.updates[0].row.photos).toEqual([PHOTOS[1]]);
        expect(await screen.findByRole("img", { name: "Robert" })).toHaveAttribute("src", PHOTOS[1]);
    });

    test("an introcage's own photo is its picture in the enclosure's Introcages list", async () => {
        const b1Photo = "https://example.com/robert-b1.webp";
        const list = BUILT_IN_DATA.enclosures.map((e) => (e.id === ROBERT_B1.id ? { ...e, photos: [b1Photo] } : e));
        const { user } = setup({ startingEnclosures: list });
        const row = screen.getByRole("link", { name: /Robert B1/ });
        expect(row.querySelector("img")).toHaveAttribute("src", b1Photo);
    });
});
