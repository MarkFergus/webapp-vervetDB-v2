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
// ...and its feeding (once feeding.sql has run)
const FEEDING_MONKEY_COLUMNS =
    `${NEW_MONKEY_COLUMNS}, fed_by, am_plates, am_cut_small, am_fruit, am_metal_plate, pm_bowls, pm_cut_small`;
// ...and whether it's in Sickbay (once sickbay.sql has run)
const SICKBAY_MONKEY_COLUMNS = `${FEEDING_MONKEY_COLUMNS}, in_sickbay, sickbay_since, sickbay_note`;
// ...and its status (once released-status.sql has run): "sanctuary", or
// "released" (kept on file, but not loaded)
const STATUS_MONKEY_COLUMNS = `${SICKBAY_MONKEY_COLUMNS}, status`;
// ...and a stay in an introcage (once introcage-stays.sql has run)
const STAY_MONKEY_COLUMNS = `${STATUS_MONKEY_COLUMNS}, stay_introcage_id, stay_since, stay_note`;
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
        // "introcage", or "area" (a care unit's): feeding is for introcages
        introcageType: introcage?.type ?? null,
        enclosure: introcage ? places.byId[introcage.parentId]?.name ?? null : places.homeOf(troop),
        year: row.birth_year ?? "",
        img: row.photos,
        bio: row.bio,
        desc: row.description,
    };
    // Only once the database has introcages: saved back as it is
    if ("introcage_id" in row) monkey.introcageId = row.introcage_id;
    // Once the database has feeding (see feeding.js)
    if ("fed_by" in row) {
        monkey.feeding = {
            fedBy: row.fed_by === "sickbay" ? "sickbay" : "localTeam",
            amPlates: row.am_plates,
            amCutSmall: row.am_cut_small,
            amFruit: row.am_fruit,
            amMetalPlate: row.am_metal_plate,
            pmBowls: row.pm_bowls,
            pmCutSmall: row.pm_cut_small,
        };
    }
    // Once the database has Sickbay (see sickbay.sql)
    if ("in_sickbay" in row) {
        monkey.inSickbay = row.in_sickbay;
        monkey.sickbaySince = row.sickbay_since;
        monkey.sickbayNote = row.sickbay_note;
    }
    // Once the database has a status (see released-status.sql)
    if ("status" in row) monkey.status = row.status;
    // Once the database has stays (see introcage-stays.sql): the introcage
    // it's staying in for now, or null (at home)
    if ("stay_introcage_id" in row) {
        const stay = row.stay_introcage_id ? places.byId[row.stay_introcage_id] : null;
        monkey.stay = stay
            ? {
                  id: stay.id,
                  introcage: stay.name,
                  enclosure: places.byId[stay.parentId]?.name ?? null,
                  since: row.stay_since,
                  note: row.stay_note,
              }
            : null;
    }
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
    // (a stay ends once its introcage becomes home: a move made in Edit)
    if (monkey.stay && monkey.stay.id === monkey.introcageId) {
        Object.assign(row, { stay_introcage_id: null, stay_since: null, stay_note: null });
    }
    if (monkey.feeding) {
        const f = monkey.feeding;
        Object.assign(row, {
            fed_by: f.fedBy === "sickbay" ? "sickbay" : "local_team",
            am_plates: f.amPlates,
            am_cut_small: f.amCutSmall,
            am_fruit: f.amFruit,
            am_metal_plate: f.amMetalPlate,
            pm_bowls: f.pmBowls,
            pm_cut_small: f.pmCutSmall,
        });
    }
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

// The monkeys with their Sickbay and feeding, or without them until
// sickbay.sql / feeding.sql has run (a missing column). { result, columns }
async function loadMonkeys() {
    let result;
    for (const columns of [STAY_MONKEY_COLUMNS, STATUS_MONKEY_COLUMNS, SICKBAY_MONKEY_COLUMNS, FEEDING_MONKEY_COLUMNS]) {
        const query = supabase.from("monkeys").select(columns).order("id");
        // Released monkeys stay on file but don't appear in the app
        const hasStatus = columns === STAY_MONKEY_COLUMNS || columns === STATUS_MONKEY_COLUMNS;
        result = await (hasStatus ? query.neq("status", "released") : query);
        if (result.error?.code !== "42703") return { result, columns };
    }
    return { result: await supabase.from("monkeys").select(NEW_MONKEY_COLUMNS).order("id"), columns: NEW_MONKEY_COLUMNS };
}

async function loadWithEnclosures() {
    const [troops, { result: monkeys, columns }, sections, enclosures] = await Promise.all([
        supabase.from("troops").select("id, name, enclosure_id").order("sort_order"),
        loadMonkeys(),
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
    const sectionList = sections.data.map((s) => s.name);
    // Introcages and areas: the same section as their enclosure
    const byId = Object.fromEntries(list.map((e) => [e.id, e]));
    for (const e of list) if (e.parentId) e.section = byId[e.parentId]?.section ?? null;
    monkeyColumns = columns;
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

// Where a monkey is for now, leaving its home (and its Fed By) as it is:
//   { at: "home" }, { at: "sickbay", since, note }, or
//   { at: "introcage", introcageId, since, note, fedBy } (a stay; fedBy,
//   "sickbay" or "localTeam": a troop monkey's Fed By while it's there)
// One place at a time: moving to one ends the other. The AM Plates List
// counts it as fed by Sickbay while it's in Sickbay, or in the introcage
// it's staying in. Returns the saved monkey (site shape).
export async function saveWhereabouts(id, { at, introcageId = null, since = null, note = "", fedBy }) {
    const row = {
        in_sickbay: at === "sickbay",
        sickbay_since: at === "sickbay" ? since || null : null,
        sickbay_note: at === "sickbay" ? note.trim() || null : null,
    };
    // (only once the database has stays: until then, Sickbay as before)
    if (monkeyColumns === STAY_MONKEY_COLUMNS) {
        Object.assign(row, {
            stay_introcage_id: at === "introcage" ? introcageId : null,
            stay_since: at === "introcage" ? since || null : null,
            stay_note: at === "introcage" ? note.trim() || null : null,
        });
        if (at === "introcage" && fedBy) row.fed_by = fedBy === "sickbay" ? "sickbay" : "local_team";
    }
    const { data, error } = await supabase.from("monkeys").update(row).eq("id", id).select(monkeyColumns).single();
    if (error) {
        console.error("Saving where it is failed:", error);
        throw saveProblem(error);
    }
    return toAppMonkey(data);
}

// Marks a new arrival as released (with the date and a few details): its
// record stays on file but it no longer appears in the app. Editors.
export async function saveRelease(id, { date, details = "" }) {
    const row = { status: "released", released_on: date, release_details: details.trim() || null };
    const { error } = await supabase.from("monkeys").update(row).eq("id", id);
    if (error) {
        console.error("Saving the release failed:", error);
        throw saveProblem(error);
    }
}

// ---- Arrival Info: a new arrival's arrival details (staff only) ----

// A monkey's Arrival Info ("" if none). Throws if the database hasn't got it
// yet (arrival-info.sql), or this isn't staff.
export async function loadArrivalInfo(monkeyId) {
    const { data, error } = await supabase.from("arrival_info").select("info").eq("monkey_id", monkeyId).maybeSingle();
    if (error) throw error;
    return data?.info ?? "";
}

// Saves it (editors); empty clears it
export async function saveArrivalInfo(monkeyId, info) {
    const text = info.trim();
    if (!text) {
        const { error } = await supabase.from("arrival_info").delete().eq("monkey_id", monkeyId);
        if (error) throw saveProblem(error);
        return;
    }
    const updated = await supabase.from("arrival_info").update({ info: text }).eq("monkey_id", monkeyId).select("monkey_id");
    if (updated.error) throw saveProblem(updated.error);
    if (updated.data?.length) return;
    const { error } = await supabase.from("arrival_info").insert({ monkey_id: monkeyId, info: text });
    if (error) throw saveProblem(error);
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

// ---- Integration reports: staff reports on how a monkey's integration is going ----

// An entry, as the site uses it: { id, from ("2026-10-04"), to, report,
// loggedBy (the writer's account id), loggedByName, loggedAt }
const toAppReport = (row) => ({
    id: row.id,
    from: row.from_date,
    to: row.to_date,
    report: row.report,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    loggedAt: row.logged_at,
});
const REPORT_COLUMNS = "id, from_date, to_date, report, logged_by, logged_by_name, logged_at";

// A monkey's reports, newest period first. Throws if the database hasn't
// got them yet (integration-reports.sql) or can't be reached.
export async function loadIntegration(monkeyId) {
    const { data, error } = await supabase
        .from("integration_reports")
        .select(REPORT_COLUMNS)
        .eq("monkey_id", monkeyId)
        .order("to_date", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw error;
    return data.map(toAppReport);
}

// Adds an entry ({ from, to, report }); who and when are filled in by the
// database. Returns the saved entry.
export async function addIntegration(monkeyId, { from, to, report }) {
    const { data, error } = await supabase
        .from("integration_reports")
        .insert({ monkey_id: monkeyId, from_date: from, to_date: to, report })
        .select(REPORT_COLUMNS)
        .single();
    if (error) {
        console.error("Adding an integration report failed:", error);
        throw saveProblem(error);
    }
    return toAppReport(data);
}

// Changes an entry's period or report (admins, or whoever wrote it)
export async function saveIntegration(id, { from, to, report }) {
    const { data, error } = await supabase
        .from("integration_reports")
        .update({ from_date: from, to_date: to, report })
        .eq("id", id)
        .select(REPORT_COLUMNS)
        .single();
    if (error) {
        console.error("Saving an integration report failed:", error);
        throw saveProblem(error);
    }
    return toAppReport(data);
}

// Deletes an entry (admins, or whoever wrote it)
export async function deleteIntegration(id) {
    const { data, error } = await supabase.from("integration_reports").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting an integration report failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever wrote it, can delete it.");
}

// ---- Injuries: a monkey's injuries (current and healed) ----

// An update on an injury, as the site uses it: { id, date, details,
// loggedBy (the writer's account id), loggedByName, loggedAt }
const toAppUpdate = (row) => ({
    id: row.id,
    date: row.update_date,
    details: row.details,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    loggedAt: row.logged_at,
});
const UPDATE_COLUMNS = "id, update_date, details, logged_by, logged_by_name, logged_at";
// Oldest first (they follow the injury down the page)
const byUpdateDate = (a, b) => a.date.localeCompare(b.date) || a.id - b.id;

// An injury, as the site uses it: { id, monkeyId, date ("2026-10-13"),
// description, loggedBy (the writer's account id), loggedByName, loggedAt,
// healedOn (null while it's current), healedByName, updates ([] before
// monitoring.sql has run) }
const toAppInjury = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    date: row.injury_date,
    description: row.description,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    loggedAt: row.logged_at,
    healedOn: row.healed_on,
    healedByName: row.healed_by_name,
    updates: (row.injury_updates ?? []).map(toAppUpdate).sort(byUpdateDate),
});
const INJURY_COLUMNS =
    "id, monkey_id, injury_date, description, logged_by, logged_by_name, logged_at, healed_on, healed_by_name";
// ...with their updates (once monitoring.sql has run)
const INJURY_WITH_UPDATES = `${INJURY_COLUMNS}, injury_updates (${UPDATE_COLUMNS})`;
// Whether the database has injury updates: null until known
let hasInjuryUpdates = null;

// Injuries, with their updates if the database has them (falling back to
// just the injuries before monitoring.sql has run). query(columns) → a
// Supabase query.
async function selectInjuries(query) {
    if (hasInjuryUpdates !== false) {
        const result = await query(INJURY_WITH_UPDATES);
        if (!result.error) {
            hasInjuryUpdates = true;
            return result.data.map(toAppInjury);
        }
        if (!isOlderDatabase(result.error)) throw result.error;
        hasInjuryUpdates = false;
    }
    const { data, error } = await query(INJURY_COLUMNS);
    if (error) throw error;
    return data.map(toAppInjury);
}

// Whether injuries can have updates (monitoring.sql has run)
export const injuryUpdatesAvailable = () => hasInjuryUpdates === true;

// A monkey's injuries (current and healed), newest first. Throws if the
// database hasn't got them yet (injuries.sql) or can't be reached.
export async function loadInjuries(monkeyId) {
    return selectInjuries((columns) =>
        supabase
            .from("injuries")
            .select(columns)
            .eq("monkey_id", monkeyId)
            .order("injury_date", { ascending: false })
            .order("id", { ascending: false })
    );
}

// The current (not healed) injuries of these monkeys, with their updates,
// oldest first: for the Monitoring Notes. Throws if the database can't be
// reached, or this isn't staff.
export async function loadCurrentInjuries(monkeyIds) {
    if (!monkeyIds.length) return [];
    return selectInjuries((columns) =>
        supabase
            .from("injuries")
            .select(columns)
            .in("monkey_id", monkeyIds)
            .is("healed_on", null)
            .order("injury_date")
            .order("id")
    );
}

// Adds an injury ({ date, description }); who and when are filled in by the
// database. Returns the saved injury.
export async function addInjury(monkeyId, { date, description }) {
    const { data, error } = await supabase
        .from("injuries")
        .insert({ monkey_id: monkeyId, injury_date: date, description })
        .select(INJURY_COLUMNS)
        .single();
    if (error) {
        console.error("Adding an injury failed:", error);
        throw saveProblem(error);
    }
    return toAppInjury(data);
}

// Changes an injury's date or description (admins, or whoever added it).
// (its updates aren't sent back: the caller keeps them)
export async function saveInjury(id, { date, description }) {
    const { data, error } = await supabase
        .from("injuries")
        .update({ injury_date: date, description })
        .eq("id", id)
        .select(INJURY_COLUMNS)
        .single();
    if (error) {
        console.error("Saving an injury failed:", error);
        throw saveProblem(error);
    }
    return toAppInjury(data);
}

// Healed (or back to current): today, in the name of whoever marks it
export async function setInjuryHealed(id, healed) {
    const { data, error } = await supabase.rpc("set_injury_healed", { injury_id: id, healed });
    if (error) {
        console.error("Marking an injury healed failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this.");
    return toAppInjury(data[0]);
}

// Deletes an injury (admins, or whoever added it)
export async function deleteInjury(id) {
    const { data, error } = await supabase.from("injuries").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting an injury failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever added it, can delete it.");
}

// An update on an injury ({ date, details }); who and when are filled in by
// the database. Returns the saved update.
export async function addInjuryUpdate(injuryId, { date, details }) {
    const { data, error } = await supabase
        .from("injury_updates")
        .insert({ injury_id: injuryId, update_date: date, details })
        .select(UPDATE_COLUMNS)
        .single();
    if (error) {
        console.error("Adding an injury update failed:", error);
        throw saveProblem(error);
    }
    return toAppUpdate(data);
}

// Changes an update's date or details (admins, or whoever added it)
export async function saveInjuryUpdate(id, { date, details }) {
    const { data, error } = await supabase
        .from("injury_updates")
        .update({ update_date: date, details })
        .eq("id", id)
        .select(UPDATE_COLUMNS)
        .single();
    if (error) {
        console.error("Saving an injury update failed:", error);
        throw saveProblem(error);
    }
    return toAppUpdate(data);
}

// Deletes an update (admins, or whoever added it)
export async function deleteInjuryUpdate(id) {
    const { data, error } = await supabase.from("injury_updates").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting an injury update failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever added it, can delete it.");
}

// ---- Monitoring: Condition Check and Notes for Monitoring (staff only) ----

// A monkey's monitoring, as the site uses it: { conditionCheck, notes ("" if
// none), updatedByName, updatedAt }
export const NO_MONITORING = { conditionCheck: false, notes: "", updatedByName: null, updatedAt: null };
const toAppMonitoring = (row) =>
    row
        ? {
              conditionCheck: row.condition_check,
              notes: row.notes ?? "",
              updatedByName: row.updated_by_name,
              updatedAt: row.updated_at,
          }
        : NO_MONITORING;
const MONITORING_COLUMNS = "monkey_id, condition_check, notes, updated_by_name, updated_at";

// A monkey's monitoring (NO_MONITORING if none). Throws if the database
// hasn't got it yet (monitoring.sql), or this isn't staff.
export async function loadMonitoring(monkeyId) {
    const { data, error } = await supabase.from("monitoring").select(MONITORING_COLUMNS).eq("monkey_id", monkeyId).maybeSingle();
    if (error) throw error;
    return toAppMonitoring(data);
}

// These monkeys' monitoring: monkey id → monitoring (only those that have
// some). For the Monitoring Notes.
export async function loadMonitoringFor(monkeyIds) {
    if (!monkeyIds.length) return {};
    const { data, error } = await supabase.from("monitoring").select(MONITORING_COLUMNS).in("monkey_id", monkeyIds);
    if (error) throw error;
    return Object.fromEntries(data.map((row) => [row.monkey_id, toAppMonitoring(row)]));
}

// Saves it (admins): { conditionCheck, notes }. Nothing ticked or written
// clears it. Returns what's saved.
export async function saveMonitoring(monkeyId, { conditionCheck, notes }) {
    const text = notes.trim();
    if (!conditionCheck && !text) {
        const { error } = await supabase.from("monitoring").delete().eq("monkey_id", monkeyId);
        if (error) throw saveProblem(error);
        return NO_MONITORING;
    }
    const row = { condition_check: conditionCheck, notes: text || null };
    const updated = await supabase.from("monitoring").update(row).eq("monkey_id", monkeyId).select(MONITORING_COLUMNS);
    if (updated.error) throw saveProblem(updated.error);
    if (updated.data?.length) return toAppMonitoring(updated.data[0]);
    const { data, error } = await supabase
        .from("monitoring")
        .insert({ monkey_id: monkeyId, ...row })
        .select(MONITORING_COLUMNS)
        .single();
    if (error) throw saveProblem(error);
    return toAppMonitoring(data);
}
