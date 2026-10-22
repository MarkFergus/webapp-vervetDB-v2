// Checks the real data loader (setupTests.js replaces it everywhere else)
import { supabase } from "./supabase";

const { loadMonkeyData, saveWhereabouts, toAppMonkey, toDatabaseRow, BUILT_IN_DATA } = await vi.importActual("./monkeyData");

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const row = {
    id: 7,
    name: "Caryl",
    sex: "female",
    chip: "",
    birth_year: null,
    photos: ["https://i.ibb.co/q9WykWV/caryl-camelot-aug2023-min.webp"],
    bio: "",
    description: "",
    troops: { name: "Camelot" },
};

test("a database row becomes the same shape as the old monkeysArr entries", () => {
    expect(toAppMonkey(row)).toEqual({
        id: 7,
        name: "Caryl",
        sex: "female",
        chip: "",
        troop: "Camelot",
        introcage: null,
        introcageType: null,
        enclosure: "Camelot",
        year: "", // unknown birth year
        img: ["https://i.ibb.co/q9WykWV/caryl-camelot-aug2023-min.webp"],
        bio: "",
        desc: "",
    });
    expect(toAppMonkey({ ...row, birth_year: 2019 }).year).toBe(2019);
});

// A pretend database: `from(table).select(columns).order(...)` resolves to
// `results[table]`, or `results[table](columns)` if that's a function
function fakeDatabase(results) {
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        select: (columns) => ({
            order: () => {
                const answer = typeof results[table] === "function" ? results[table](columns) : results[table];
                // (can be filtered further: .neq)
                return Object.assign(Promise.resolve(answer), { neq: () => answer });
            },
        }),
    }));
}
const answer = (data) => Promise.resolve({ data, error: null });

// The database once enclosures.sql has run
const SECTIONS = [{ id: 1, name: "Bottom" }];
const ENCLOSURES = [
    { id: 40, name: "H&B", type: "troop", parent_id: null, section_id: 1, established: "2014-03-01",
        description: "By the river", features: "Pool", size: 600, photos: [], sort_order: 12 },
    { id: 41, name: "H&B C1", type: "introcage", parent_id: 40, section_id: null, established: null,
        description: "", features: "", size: null, photos: [], sort_order: 3 },
];
const aroha = { ...row, id: 9, name: "Aroha", troops: null, introcage_id: 41 };
const hbMonkey = { ...row, id: 8, name: "Bobo", troops: { name: "H&B" }, introcage_id: null };

test("loads troops (All Troops first), monkeys, sections and enclosures", async () => {
    fakeDatabase({
        troops: answer([{ id: 3, name: "H&B", enclosure_id: 40 }, { id: 4, name: "Bandits", enclosure_id: null }]),
        monkeys: answer([hbMonkey, aroha]),
        sections: answer(SECTIONS),
        enclosures: answer(ENCLOSURES),
    });
    const data = await loadMonkeyData();
    expect(data.troops).toEqual(["All Troops", "H&B", "Bandits"]);
    expect(data.troopIds).toEqual({ "H&B": 3, Bandits: 4 });
    expect(data.sections).toEqual(["Bottom"]);
    // Introcages take their enclosure's section; established is month + year
    expect(data.enclosures).toEqual([
        { id: 40, name: "H&B", type: "troop", parentId: null, section: "Bottom", established: "2014-03",
            description: "By the river", features: "Pool", size: 600, photos: [], sortOrder: 12 },
        { id: 41, name: "H&B C1", type: "introcage", parentId: 40, section: "Bottom", established: null,
            description: "", features: "", size: null, photos: [], sortOrder: 3 },
    ]);
    const [bobo, inC1] = data.monkeys;
    expect(bobo).toMatchObject({ troop: "H&B", introcage: null, introcageId: null, enclosure: "H&B" });
    // In an introcage: no troop, beside the H&B enclosure
    expect(inC1).toMatchObject({ name: "Aroha", troop: null, introcage: "H&B C1", introcageId: 41, enclosure: "H&B" });
});

test("once introcage-fields.sql has run: an introcage's Troop Door, Plate Slot and Sleeping Perches", async () => {
    const extra = { troop_door: null, plate_slot: null, sleeping_perches: null };
    fakeDatabase({
        troops: answer([{ id: 3, name: "H&B", enclosure_id: 40 }]),
        monkeys: answer([hbMonkey]),
        sections: answer(SECTIONS),
        enclosures: answer([
            { ...ENCLOSURES[0], ...extra },
            { ...ENCLOSURES[1], troop_door: true, plate_slot: false, sleeping_perches: 4 },
        ]),
    });
    const [hb, c1] = (await loadMonkeyData()).enclosures;
    expect(hb).not.toHaveProperty("troopDoor"); // (troop enclosures don't have them)
    expect(c1).toMatchObject({ troopDoor: true, plateSlot: false, sleepingPerches: 4 });
});

test("before enclosures.sql has run: troops and monkeys, with the built-in enclosures", async () => {
    const missing = Promise.resolve({ data: null, error: { code: "42703", message: "column does not exist" } });
    fakeDatabase({
        troops: (columns) => (columns.includes("enclosure_id") ? missing : answer([{ id: 3, name: "Camelot" }])),
        monkeys: (columns) => (columns.includes("introcage_id") ? missing : answer([row])),
        sections: missing,
        enclosures: missing,
    });
    const data = await loadMonkeyData();
    expect(data.troops).toEqual(["All Troops", "Camelot"]);
    expect(data.enclosures).toEqual(BUILT_IN_DATA.enclosures);
    expect(data.monkeys[0]).toMatchObject({ troop: "Camelot", introcage: null, enclosure: "Camelot" });
    // Saved back without the (not yet existing) introcage column
    expect(toDatabaseRow(data.monkeys[0], { Camelot: 3 })).not.toHaveProperty("introcage_id");
});

test("saving an introcage monkey keeps it in its introcage (no troop)", () => {
    const monkey = { name: "Aroha", sex: "male", chip: "", troop: null, introcage: "H&B C1", introcageId: 41,
        year: "", img: ["https://x.com/a.jpg"], bio: "", desc: "" };
    expect(toDatabaseRow(monkey, { "H&B": 3 })).toMatchObject({ troop_id: null, introcage_id: 41 });
    const moved = { ...monkey, troop: "H&B", introcage: null, introcageId: null };
    expect(toDatabaseRow(moved, { "H&B": 3 })).toMatchObject({ troop_id: 3, introcage_id: null });
});

test("a database error is passed on, so the site can fall back", async () => {
    fakeDatabase({
        troops: answer([]),
        monkeys: Promise.resolve({ data: null, error: new Error("permission denied") }),
        sections: answer([]),
        enclosures: answer([]),
    });
    await expect(loadMonkeyData()).rejects.toThrow("permission denied");
});

test("gives up after 10 seconds if the database doesn't answer", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    fakeDatabase({ troops: never, monkeys: never, sections: never, enclosures: never });
    const loading = loadMonkeyData();
    const check = expect(loading).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(10000);
    await check;
});

test("feeding: read and saved once the database has it, left out until then", async () => {
    const fed = { ...row, introcage_id: 41, fed_by: "sickbay", am_plates: 2, am_cut_small: true, am_fruit: false,
        am_metal_plate: true, pm_bowls: 1, pm_cut_small: true };
    const monkey = toAppMonkey(fed);
    expect(monkey.feeding).toEqual({
        fedBy: "sickbay", amPlates: 2, amCutSmall: true, amFruit: false, amMetalPlate: true, pmBowls: 1, pmCutSmall: true,
    });
    expect(toDatabaseRow(monkey, {})).toMatchObject({
        fed_by: "sickbay", am_plates: 2, am_cut_small: true, am_fruit: false, am_metal_plate: true, pm_bowls: 1, pm_cut_small: true,
    });
    expect(toAppMonkey(row)).not.toHaveProperty("feeding");
    expect(toDatabaseRow(toAppMonkey(row), {})).not.toHaveProperty("fed_by");
});

test("before feeding.sql: the monkeys load without feeding", async () => {
    fakeDatabase({
        troops: answer([{ id: 3, name: "H&B", enclosure_id: 40 }]),
        // (the feeding columns don't exist yet)
        monkeys: (columns) =>
            columns.includes("fed_by")
                ? Promise.resolve({ data: null, error: { code: "42703", message: "column monkeys.fed_by does not exist" } })
                : answer([hbMonkey]),
        sections: answer(SECTIONS),
        enclosures: answer(ENCLOSURES),
    });
    const data = await loadMonkeyData();
    expect(data.monkeys.map((m) => m.name)).toEqual(["Bobo"]);
    expect(data.monkeys[0]).not.toHaveProperty("feeding");
    expect(data.enclosuresLive).toBe(true);
});

// A pretend update request: records what was sent, then answers with
// answers[n] for the nth request
function fakeUpdates(answers) {
    const sent = [];
    vi.spyOn(supabase, "from").mockImplementation(() => ({
        update(r) {
            sent.push(r);
            const answer = answers[sent.length - 1];
            const chain = { eq: () => chain, select: () => chain, single: () => Promise.resolve(answer) };
            return chain;
        },
    }));
    return sent;
}

test("a move sends its date and reason along (the database adds its Movement record)", async () => {
    const sent = fakeUpdates([{ data: row, error: null }]);
    await saveWhereabouts(7, { at: "sickbay", since: "2026-10-20", note: " leg wound " });
    expect(sent[0]).toMatchObject({ in_sickbay: true, moved_on: "2026-10-20", move_reason: "leg wound" });
});

test("before movement-records.sql has run: the move is saved without them", async () => {
    const sent = fakeUpdates([{ data: null, error: { code: "PGRST204" } }, { data: row, error: null }]);
    await saveWhereabouts(7, { at: "home", since: "2026-10-21", note: "" });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toHaveProperty("moved_on", "2026-10-21");
    expect(sent[1]).not.toHaveProperty("moved_on");
    expect(sent[1]).toMatchObject({ in_sickbay: false });
});

test("species: read and saved once the database has it (species.sql)", () => {
    expect(toAppMonkey(row)).not.toHaveProperty("species");
    expect(toAppMonkey({ ...row, species: "samango" }).species).toBe("samango");
    const monkey = toAppMonkey({ ...row, troops: { name: "Jalamango" }, species: "samango" });
    expect(toDatabaseRow(monkey, { Jalamango: 28 })).toMatchObject({ species: "samango" });
    expect(toDatabaseRow(toAppMonkey(row), { Camelot: 1 })).not.toHaveProperty("species");
});

