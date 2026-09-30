import { supabase } from "./supabase";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";

// The built-in copy of the data, used if the database can't be reached
export const BUILT_IN_DATA = { monkeys: monkeysArr, troops: groupsArr, troopIds: {} };

// Give up on the database after this long and use the built-in copy
const TIMEOUT_MS = 10000;

// The columns loaded for each monkey (troops (name): its troop's name)
const MONKEY_COLUMNS =
    "id, name, sex, chip, birth_year, photos, bio, description, troops (name)";

// A database row → the shape the rest of the site uses (the same as the
// entries in monkeysArr.js), so pages don't need to know where data came from
export function toAppMonkey(row) {
    return {
        id: row.id,
        name: row.name,
        sex: row.sex,
        chip: row.chip,
        troop: row.troops.name,
        year: row.birth_year ?? "",
        img: row.photos,
        bio: row.bio,
        desc: row.description,
    };
}

// The other way: a monkey in the site's shape → the database's columns.
// troopIds turns a troop's name into its id in the troops table.
export function toDatabaseRow(monkey, troopIds) {
    return {
        name: monkey.name,
        sex: monkey.sex,
        chip: String(monkey.chip),
        troop_id: troopIds[monkey.troop],
        birth_year: monkey.year === "" ? null : Number(monkey.year),
        photos: monkey.img,
        bio: monkey.bio,
        description: monkey.desc,
    };
}

// Loads the troops and monkeys from Supabase.
// Returns { monkeys, troops, troopIds }: troops starts with "All Troops"
// (like groupsArr); troopIds maps troop name → id (needed for saving).
// Throws if the database can't be reached.
export async function loadMonkeyData() {
    const request = Promise.all([
        supabase.from("troops").select("id, name").order("sort_order"),
        supabase.from("monkeys").select(MONKEY_COLUMNS).order("id"),
    ]);
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The database took too long to respond")), TIMEOUT_MS)
    );
    const [troopsResult, monkeysResult] = await Promise.race([request, timeout]);
    if (troopsResult.error) throw troopsResult.error;
    if (monkeysResult.error) throw monkeysResult.error;
    return {
        troops: ["All Troops", ...troopsResult.data.map((t) => t.name)],
        troopIds: Object.fromEntries(troopsResult.data.map((t) => [t.name, t.id])),
        monkeys: monkeysResult.data.map(toAppMonkey),
    };
}

// Turns a database refusal into something readable
function saveProblem(error) {
    // No row came back: the database wouldn't let this account change it
    if (error.code === "PGRST116" || error.code === "42501") {
        return new Error(
            "The database didn't allow this change. Are you still signed in as an editor?"
        );
    }
    // A data rule (check constraint) refused it
    if (error.code === "23514") {
        return new Error("The database refused one of the details. Please check the form.");
    }
    return new Error("Couldn't save right now. Please check your connection and try again.");
}

// Saves a monkey (site shape). With an id, updates that monkey; without one,
// adds a new monkey. Returns the saved monkey (site shape, with its id).
export async function saveMonkey(monkey, troopIds, id) {
    const row = toDatabaseRow(monkey, troopIds);
    const request = id
        ? supabase.from("monkeys").update(row).eq("id", id)
        : supabase.from("monkeys").insert(row);
    const { data, error } = await request.select(MONKEY_COLUMNS).single();
    if (error) {
        console.error("Saving monkey failed:", error);
        throw saveProblem(error);
    }
    return toAppMonkey(data);
}

// Deletes a monkey for good
export async function deleteMonkey(id) {
    const { data, error } = await supabase
        .from("monkeys")
        .delete()
        .eq("id", id)
        .select("id");
    if (error) {
        console.error("Deleting monkey failed:", error);
        throw saveProblem(error);
    }
    // Nothing deleted: not allowed (or already gone)
    if (!data?.length) throw saveProblem({ code: "PGRST116" });
}
