import { supabase } from "./supabase";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import enclosuresArr, { SECTION_NAMES } from "./enclosuresArr";

// The built-in copy of the data, used if the database can't be reached
export const BUILT_IN_DATA = {
    monkeys: monkeysArr,
    troops: groupsArr,
    troopIds: {},
    enclosures: enclosuresArr,
    sections: SECTION_NAMES,
};

// Give up on the database after this long and use the built-in copy
const TIMEOUT_MS = 10000;

// The columns loaded for each monkey (troops (name): its troop's name;
// introcage_id: its introcage, for monkeys in one)
const OLD_MONKEY_COLUMNS = "id, name, sex, chip, birth_year, photos, bio, description, troops (name)";
const NEW_MONKEY_COLUMNS = `${OLD_MONKEY_COLUMNS}, introcage_id`;
// Which set the database has (the new one once enclosures.sql has run)
let monkeyColumns = NEW_MONKEY_COLUMNS;

// Looking up places while turning rows into monkeys: enclosures by id, and
// each troop's home enclosure. Set by loadMonkeyData (built-in until then).
let places = makePlaces(enclosuresArr, {});

function makePlaces(enclosures, troopHomes) {
    const byId = Object.fromEntries(enclosures.map((e) => [e.id, e]));
    // Troops without a home given (the built-in copy) live in the troop
    // enclosure of the same name
    const homeOf = (troop) =>
        troop in troopHomes
            ? byId[troopHomes[troop]]?.name ?? null
            : enclosures.find((e) => e.type === "troop" && e.name === troop)?.name ?? null;
    return { byId, homeOf };
}

// The troop enclosure a troop lives in ("Robert"), or null (the Bandits)
export const troopHome = (troop) => places.homeOf(troop);

// A database row → the shape the rest of the site uses (the same as the
// entries in monkeysArr.js, plus where it lives), so pages don't need to
// know where data came from. See places.js.
export function toAppMonkey(row) {
    const troop = row.troops?.name ?? null;
    const introcage = row.introcage_id ? places.byId[row.introcage_id] : null;
    const monkey = {
        id: row.id,
        name: row.name,
        sex: row.sex,
        chip: row.chip,
        troop,
        introcage: introcage?.name ?? null,
        enclosure: introcage ? places.byId[introcage.parentId]?.name ?? null : places.homeOf(troop),
        year: row.birth_year ?? "",
        img: row.photos,
        bio: row.bio,
        desc: row.description,
    };
    // Only once the database has introcages: saved back as it is
    if ("introcage_id" in row) monkey.introcageId = row.introcage_id;
    return monkey;
}

// The other way: a monkey in the site's shape → the database's columns.
// troopIds turns a troop's name into its id in the troops table.
export function toDatabaseRow(monkey, troopIds) {
    const row = {
        name: monkey.name,
        sex: monkey.sex,
        // null = unknown, "" = no chip
        chip: monkey.chip === null ? null : String(monkey.chip),
        troop_id: monkey.troop ? troopIds[monkey.troop] : null,
        birth_year: monkey.year === "" ? null : Number(monkey.year),
        photos: monkey.img,
        bio: monkey.bio,
        description: monkey.desc,
    };
    if (monkey.introcageId !== undefined) row.introcage_id = monkey.introcageId ?? null;
    return row;
}

// A database enclosure → the site's shape (see enclosuresArr.js)
function toAppEnclosure(row, sectionNames) {
    const enclosure = {
        id: row.id,
        name: row.name,
        type: row.type,
        parentId: row.parent_id,
        section: sectionNames[row.section_id] ?? null,
        // stored as the 1st of the month: "2014-03-01" → "2014-03"
        established: row.established ? row.established.slice(0, 7) : null,
        description: row.description,
        features: row.features,
        // square metres (a number), or null
        size: row.size == null ? null : Number(row.size),
        photos: row.photos,
        sortOrder: row.sort_order,
    };
    // Introcages and areas, once introcage-fields.sql has run (until then
    // the form leaves these out)
    if ((row.type === "introcage" || row.type === "area") && "troop_door" in row) {
        Object.assign(enclosure, introcageDetails(row));
    }
    return enclosure;
}

// Until enclosure-types.sql has run: the "special" enclosures as the new
// types (one in a "section" of its own is a care unit, in Care Units; the
// other a block; a care unit's introcages are its areas). rows: the
// database's, in the same order as list.
const OLD_CARE_SECTIONS = ["Baby Care", "Quarantine", "Sickbay Care Unit"];
function fromOldTypes(rows, list, sections) {
    if (!rows.some((row) => "special" in row)) return sections;
    list.forEach((e, i) => {
        if (!rows[i].special) return;
        if (e.section === e.name) Object.assign(e, { type: "care_unit", section: "Care Units" });
        else e.type = "block";
    });
    const byId = Object.fromEntries(list.map((e) => [e.id, e]));
    for (const e of list) if (e.parentId && byId[e.parentId]?.type === "care_unit") e.type = "area";
    return [...sections.filter((s) => !OLD_CARE_SECTIONS.includes(s)), "Care Units"];
}

// An introcage's Troop Door, Plate Slot (true / false, or null: not
// recorded) and Sleeping Perches (1–10, or null)
const introcageDetails = (row) => ({
    troopDoor: row.troop_door,
    plateSlot: row.plate_slot,
    sleepingPerches: row.sleeping_perches,
});

// The database doesn't have the enclosures yet (enclosures.sql not run):
// a missing table, column or link
const isOlderDatabase = (error) => ["42703", "42P01", "PGRST200", "PGRST204", "PGRST205"].includes(error?.code);

function throwIfError(...results) {
    for (const r of results) if (r.error) throw r.error;
}

async function loadWithEnclosures() {
    const [troops, monkeys, sections, enclosures] = await Promise.all([
        supabase.from("troops").select("id, name, enclosure_id").order("sort_order"),
        supabase.from("monkeys").select(NEW_MONKEY_COLUMNS).order("id"),
        supabase.from("sections").select("id, name").order("sort_order"),
        supabase
            .from("enclosures")
            // (everything: the introcage details only once introcage-fields.sql has run)
            .select("*")
            .order("sort_order"),
    ]);
    throwIfError(troops, monkeys, sections, enclosures);
    const sectionNames = Object.fromEntries(sections.data.map((s) => [s.id, s.name]));
    const list = enclosures.data.map((row) => toAppEnclosure(row, sectionNames));
    const sectionList = fromOldTypes(enclosures.data, list, sections.data.map((s) => s.name));
    // Introcages and areas: the same section as their enclosure
    const byId = Object.fromEntries(list.map((e) => [e.id, e]));
    for (const e of list) if (e.parentId) e.section = byId[e.parentId]?.section ?? null;
    monkeyColumns = NEW_MONKEY_COLUMNS;
    places = makePlaces(list, Object.fromEntries(troops.data.map((t) => [t.name, t.enclosure_id])));
    return {
        troops: troops.data,
        monkeys: monkeys.data,
        enclosures: list,
        sections: sectionList,
        enclosuresLive: true,
    };
}

// Before enclosures.sql: troops and monkeys only, with the built-in enclosures
async function loadWithoutEnclosures() {
    const [troops, monkeys] = await Promise.all([
        supabase.from("troops").select("id, name").order("sort_order"),
        supabase.from("monkeys").select(OLD_MONKEY_COLUMNS).order("id"),
    ]);
    throwIfError(troops, monkeys);
    monkeyColumns = OLD_MONKEY_COLUMNS;
    places = makePlaces(enclosuresArr, {});
    return {
        troops: troops.data,
        monkeys: monkeys.data,
        enclosures: enclosuresArr,
        sections: SECTION_NAMES,
        enclosuresLive: false,
    };
}

// Loads the troops, monkeys, sections and enclosures from Supabase.
// Returns { monkeys, troops, troopIds, enclosures, sections, enclosuresLive
// (false: the database hasn't got enclosures yet, so they can't be edited) }:
// troops starts
// with "All Troops" (like groupsArr); troopIds maps troop name → id (needed
// for saving). Throws if the database can't be reached.
export async function loadMonkeyData() {
    const request = loadWithEnclosures().catch((error) => {
        if (isOlderDatabase(error)) return loadWithoutEnclosures();
        throw error;
    });
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The database took too long to respond")), TIMEOUT_MS)
    );
    const { troops, monkeys, enclosures, sections, enclosuresLive } = await Promise.race([request, timeout]);
    return {
        enclosuresLive,
        troops: ["All Troops", ...troops.map((t) => t.name)],
        troopIds: Object.fromEntries(troops.map((t) => [t.name, t.id])),
        monkeys: monkeys.map(toAppMonkey),
        enclosures,
        sections,
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
    const { data, error } = await request.select(monkeyColumns).single();
    if (error) {
        console.error("Saving monkey failed:", error);
        throw saveProblem(error);
    }
    return toAppMonkey(data);
}

// Saves just a monkey's photos (Add Photos), leaving everything else as it
// is in the database. Returns the saved monkey (site shape).
export async function saveMonkeyPhotos(id, photos) {
    const { data, error } = await supabase.from("monkeys").update({ photos }).eq("id", id).select(monkeyColumns).single();
    if (error) {
        console.error("Saving photos failed:", error);
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
    // Nothing deleted: not allowed (only admins can delete), or already gone
    if (!data?.length) {
        throw new Error("The database didn't allow this. Only admins can delete monkeys.");
    }
}

// ---- Enclosures: editing their details, and the maintenance log ----

// Saves an enclosure's details. changes: any of { description, features,
// size (square metres, or null), established ("2014-03" or null), photos,
// troopDoor, plateSlot, sleepingPerches (introcages) }.
// Returns the enclosure with them.
export async function saveEnclosure(enclosure, changes) {
    const row = {};
    if ("description" in changes) row.description = changes.description;
    if ("features" in changes) row.features = changes.features;
    if ("size" in changes) row.size = changes.size;
    if ("photos" in changes) row.photos = changes.photos;
    if ("troopDoor" in changes) row.troop_door = changes.troopDoor;
    if ("plateSlot" in changes) row.plate_slot = changes.plateSlot;
    if ("sleepingPerches" in changes) row.sleeping_perches = changes.sleepingPerches;
    // stored as the 1st of the month
    if ("established" in changes) row.established = changes.established ? `${changes.established}-01` : null;
    const { data, error } = await supabase
        .from("enclosures")
        .update(row)
        .eq("id", enclosure.id)
        .select("*")
        .single();
    if (error) {
        console.error("Saving enclosure failed:", error);
        throw saveProblem(error);
    }
    return {
        ...enclosure,
        description: data.description,
        features: data.features,
        size: data.size == null ? null : Number(data.size),
        established: data.established ? data.established.slice(0, 7) : null,
        photos: data.photos ?? enclosure.photos,
        ...("troop_door" in data && introcageDetails(data)),
    };
}

// A log entry, as the site uses it: { id, doneOn ("2026-10-05"), details,
// loggedBy (the name before the @), loggedAt }
const toAppEntry = (row) => ({
    id: row.id,
    doneOn: row.done_on,
    details: row.details,
    loggedBy: row.logged_by_name,
    loggedAt: row.logged_at,
});
const ENTRY_COLUMNS = "id, done_on, details, logged_by_name, logged_at";

// An enclosure's maintenance log, newest first
export async function loadMaintenance(enclosureId) {
    const { data, error } = await supabase
        .from("maintenance")
        .select(ENTRY_COLUMNS)
        .eq("enclosure_id", enclosureId)
        .order("done_on", { ascending: false })
        .order("id", { ascending: false });
    if (error) {
        console.error("Loading the maintenance log failed:", error);
        throw new Error("Couldn't load the maintenance log. Please check your connection.");
    }
    return data.map(toAppEntry);
}

// Adds an entry ({ doneOn, details }); who and when are filled in by the
// database. Returns the saved entry.
export async function addMaintenance(enclosureId, { doneOn, details }) {
    const { data, error } = await supabase
        .from("maintenance")
        .insert({ enclosure_id: enclosureId, done_on: doneOn, details })
        .select(ENTRY_COLUMNS)
        .single();
    if (error) {
        console.error("Adding maintenance failed:", error);
        throw saveProblem(error);
    }
    return toAppEntry(data);
}

// Deletes an entry (admins only)
export async function deleteMaintenance(id) {
    const { data, error } = await supabase.from("maintenance").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting maintenance failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins can delete log entries.");
}
