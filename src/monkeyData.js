import { supabase } from "./supabase";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";

// The built-in copy of the data, used if the database can't be reached
export const BUILT_IN_DATA = { monkeys: monkeysArr, troops: groupsArr };

// Give up on the database after this long and use the built-in copy
const TIMEOUT_MS = 10000;

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

// Loads the troops and monkeys from Supabase.
// Returns { monkeys, troops } where troops starts with "All Troops" (like
// groupsArr), or throws if the database can't be reached.
export async function loadMonkeyData() {
    const request = Promise.all([
        supabase.from("troops").select("name").order("sort_order"),
        supabase
            .from("monkeys")
            .select("id, name, sex, chip, birth_year, photos, bio, description, troops (name)")
            .order("id"),
    ]);
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The database took too long to respond")), TIMEOUT_MS)
    );
    const [troopsResult, monkeysResult] = await Promise.race([request, timeout]);
    if (troopsResult.error) throw troopsResult.error;
    if (monkeysResult.error) throw monkeysResult.error;
    return {
        troops: ["All Troops", ...troopsResult.data.map((t) => t.name)],
        monkeys: monkeysResult.data.map(toAppMonkey),
    };
}
