// Checks the real data loader (setupTests.js replaces it everywhere else)
import { supabase } from "./supabase";

const { loadMonkeyData, toAppMonkey } = await vi.importActual("./monkeyData");

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
        year: "", // unknown birth year
        img: ["https://i.ibb.co/q9WykWV/caryl-camelot-aug2023-min.webp"],
        bio: "",
        desc: "",
    });
    expect(toAppMonkey({ ...row, birth_year: 2019 }).year).toBe(2019);
});

// A pretend database: `from(table).select(...).order(...)` resolves to `results[table]`
function fakeDatabase(results) {
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        select: () => ({ order: () => results[table] }),
    }));
}

test("loads troops (with All Troops first) and monkeys", async () => {
    fakeDatabase({
        troops: Promise.resolve({ data: [{ name: "Goliath" }, { name: "Gismo" }], error: null }),
        monkeys: Promise.resolve({ data: [row], error: null }),
    });
    const data = await loadMonkeyData();
    expect(data.troops).toEqual(["All Troops", "Goliath", "Gismo"]);
    expect(data.monkeys).toEqual([toAppMonkey(row)]);
});

test("a database error is passed on, so the site can fall back", async () => {
    fakeDatabase({
        troops: Promise.resolve({ data: [], error: null }),
        monkeys: Promise.resolve({ data: null, error: new Error("permission denied") }),
    });
    await expect(loadMonkeyData()).rejects.toThrow("permission denied");
});

test("gives up after 10 seconds if the database doesn't answer", async () => {
    vi.useFakeTimers();
    const never = new Promise(() => {});
    fakeDatabase({ troops: never, monkeys: never });
    const loading = loadMonkeyData();
    const check = expect(loading).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(10000);
    await check;
});
