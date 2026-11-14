import { microchipText } from "./chipRules";
import { isExpiredSignIn, signInRenewed, supabase } from "./supabase";
import {
    displayId,
    dropEntries,
    editEntries,
    flushOutbox,
    isLocalId,
    newLocalId,
    newRef,
    outboxEntries,
    outboxUser,
    registerSender,
    resolveId,
    submit,
} from "./outbox";
import { lastContact } from "./offlineFetch";
import { forgetPhoto, keepPhoto, keptPhoto } from "./outboxPhotos";
import groupsArr from "./groupsArr";
import enclosuresArr, { SECTION_NAMES } from "./enclosuresArr";

// The built-in shape of the data before the database answers: no monkeys
// (an old copy would be out of date), but the troops, sections and
// enclosures, which pages still lean on
export const BUILT_IN_DATA = {
    monkeys: [],
    troops: groupsArr,
    troopIds: {},
    enclosures: enclosuresArr,
    buildings: [],
    sections: SECTION_NAMES,
};

// Give up on the database after this long and use the built-in copy (a phone
// woken after a while can take a good few seconds: its sign-in renewed first)
const TIMEOUT_MS = 20000;

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
// no longer at the sanctuary (kept on file, but only loaded for the Monkey
// Archive: monkeyStatus.js)
const STATUS_MONKEY_COLUMNS = `${SICKBAY_MONKEY_COLUMNS}, status`;
// ...and a stay in an introcage (once introcage-stays.sql has run)
const STAY_MONKEY_COLUMNS = `${STATUS_MONKEY_COLUMNS}, stay_introcage_id, stay_since, stay_note`;
// ...and its species (once species.sql has run)
const SPECIES_MONKEY_COLUMNS = `${STAY_MONKEY_COLUMNS}, species`;
// ...and its birth date (once birth-date.sql has run)
const BIRTH_MONKEY_COLUMNS = `${SPECIES_MONKEY_COLUMNS}, birth_date, birth_date_approx`;
// ...and its arrival date and reason (once arrival-details.sql has run)
const ARRIVAL_MONKEY_COLUMNS = `${BIRTH_MONKEY_COLUMNS}, arrival_date, arrival_reason`;
// ...and where they were taken on arrival (once arrival-place.sql has run)
const ARRIVAL_PLACE_MONKEY_COLUMNS = `${ARRIVAL_MONKEY_COLUMNS}, arrival_place, arrival_place_id`;
// ...and the condition they arrived in (once arrival-condition.sql has run)
const ARRIVAL_CONDITION_MONKEY_COLUMNS = `${ARRIVAL_PLACE_MONKEY_COLUMNS}, arrival_condition`;
// ...and Vasectomised? (once vet-visits.sql has run)
const VASECTOMY_MONKEY_COLUMNS = `${ARRIVAL_CONDITION_MONKEY_COLUMNS}, vasectomised`;
// Newest first: each set has all the ones after it (loadMonkeys tries them
// in turn)
const COLUMN_SETS = [
    VASECTOMY_MONKEY_COLUMNS, ARRIVAL_CONDITION_MONKEY_COLUMNS, ARRIVAL_PLACE_MONKEY_COLUMNS, ARRIVAL_MONKEY_COLUMNS, BIRTH_MONKEY_COLUMNS, SPECIES_MONKEY_COLUMNS, STAY_MONKEY_COLUMNS, STATUS_MONKEY_COLUMNS, SICKBAY_MONKEY_COLUMNS,
    FEEDING_MONKEY_COLUMNS,
];
// Whether the database's set includes `columns` (the newer ones do)
const has = (columns) => COLUMN_SETS.includes(monkeyColumns) && COLUMN_SETS.indexOf(monkeyColumns) <= COLUMN_SETS.indexOf(columns);
// Which set the database has (the new one once enclosures.sql has run)
let monkeyColumns = NEW_MONKEY_COLUMNS;
// (development only: this file knows which columns the database has, found
// once when the app loads. A change to it while the app is open reloads the
// page, else that's lost: Edit would miss Birth Date, Arrival… and a save
// would send back a monkey without them)
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());
// Whether monkeys have a species (species.sql has run): for a new monkey's form
export const speciesAvailable = () => has(SPECIES_MONKEY_COLUMNS);
// ...and a birth date (birth-date.sql has run)
export const birthDateAvailable = () => has(BIRTH_MONKEY_COLUMNS);
// ...and an arrival date and reason (arrival-details.sql has run)
export const arrivalDetailsAvailable = () => has(ARRIVAL_MONKEY_COLUMNS);
// ...and a Condition Received (arrival-condition.sql has run)
export const arrivalConditionAvailable = () => has(ARRIVAL_CONDITION_MONKEY_COLUMNS);
// ...and Vasectomised?, Vet Visits and Vasectomies (vet-visits.sql has run)
export const vasectomyAvailable = () => has(VASECTOMY_MONKEY_COLUMNS);

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
// entries in the old built-in copy, plus where it lives), so pages don't need to
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
    // ...and its latest status change (archived monkeys: monkey-archive.sql;
    // a release from before it: released_on and release_details)
    if ("status_on" in row) {
        monkey.statusOn = row.status_on ?? row.released_on ?? null;
        monkey.statusDetails = row.status_details ?? row.release_details ?? null;
    }
    // ...and a species: "vervet", "samango" or "bush_baby" (species.sql)
    if ("species" in row) monkey.species = row.species;
    // ...and a birth date: "2026-11-12" or null (unknown), and whether it's
    // a guess (birth-date.sql)
    if ("birth_date" in row) {
        monkey.birthDate = row.birth_date;
        monkey.birthDateApprox = row.birth_date_approx;
    }
    // ...and an arrival date ("2026-10-27") and reason ("orphaned"), or null
    // (not recorded): arrival-details.sql
    if ("arrival_date" in row) {
        monkey.arrivalDate = row.arrival_date;
        monkey.arrivalReason = row.arrival_reason;
    }
    // ...and where they were taken ("Dreamland"), or null (not known):
    // arrival-place.sql
    if ("arrival_place" in row) {
        monkey.arrivalPlace = row.arrival_place;
        monkey.arrivalPlaceId = row.arrival_place_id;
    }
    // ...and the condition they arrived in: "healthy", "injured", "sick" or
    // null (not recorded): arrival-condition.sql
    if ("arrival_condition" in row) monkey.arrivalCondition = row.arrival_condition;
    // ...and Vasectomised? (true, or false: not recorded): vet-visits.sql
    if ("vasectomised" in row) monkey.vasectomised = Boolean(row.vasectomised);
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
    // (once the database has species)
    if (monkey.species !== undefined) row.species = monkey.species;
    // (once the database has birth dates; only a date can be a guess)
    if (monkey.birthDate !== undefined) {
        row.birth_date = monkey.birthDate || null;
        row.birth_date_approx = Boolean(monkey.birthDate && monkey.birthDateApprox);
    }
    // (a new arrival's arrival date and reason: asked only when adding one)
    if (monkey.arrivalDate !== undefined) {
        row.arrival_date = monkey.arrivalDate || null;
        row.arrival_reason = monkey.arrivalReason || null;
    }
    // (once the database has it)
    if (monkey.arrivalCondition !== undefined) row.arrival_condition = monkey.arrivalCondition || null;
    if (monkey.vasectomised !== undefined) row.vasectomised = monkey.vasectomised || null;
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
            // (no setting of its own: as the AM plate, feeding.js. Still stored
            // for the summary email)
            pm_cut_small: f.amCutSmall,
        });
    }
    return row;
}

// How many of each size of bowl a troop gets (0: none)
const troopBowls = (row) => ({ small: row.bowls_small ?? 0, medium: row.bowls_medium ?? 0, large: row.bowls_large ?? 0 });

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
    // A troop's PM bowls by size, once troop-bowls.sql has run
    if ("bowls_small" in row) enclosure.bowls = troopBowls(row);
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

// The database sends 1,000 rows at most, and says nothing about any left
// over: so a list that can grow past that is fetched 1,000 at a time, until
// there's no more. → { data, error }, as a single request gives.
//   makeQuery(): a new request, in an order that can't change between batches
const BATCH = 1000;
export async function fetchAll(makeQuery) {
    const rows = [];
    for (let from = 0; ; from += BATCH) {
        const { data, error } = await makeQuery().range(from, from + BATCH - 1);
        if (error) return { data: null, error };
        rows.push(...data);
        if (data.length < BATCH) return { data: rows, error: null };
    }
}

function throwIfError(...results) {
    for (const r of results) if (r.error) throw r.error;
}

// The monkeys with their Sickbay and feeding, or without them until
// sickbay.sql / feeding.sql has run (a missing column). { result, columns }
async function loadMonkeys() {
    let result;
    for (const columns of COLUMN_SETS) {
        // Monkeys no longer at the sanctuary stay on file but don't appear
        // in the app (admins can read them: the Monkey Archive)
        const hasStatus = COLUMN_SETS.indexOf(columns) <= COLUMN_SETS.indexOf(STATUS_MONKEY_COLUMNS);
        result = await fetchAll(() => {
            const query = supabase.from("monkeys").select(columns).order("id");
            return hasStatus ? query.eq("status", "sanctuary") : query;
        });
        if (result.error?.code !== "42703") return { result, columns };
    }
    return { result: await fetchAll(() => supabase.from("monkeys").select(NEW_MONKEY_COLUMNS).order("id")), columns: NEW_MONKEY_COLUMNS };
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
    // (buildings: places for maintenance only, kept apart from the monkeys'
    // enclosures, buildings.sql)
    const all = enclosures.data.map((row) => toAppEnclosure(row, sectionNames));
    const list = all.filter((e) => e.type !== "building");
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
        buildings: all.filter((e) => e.type === "building"),
        sections: sectionList,
        enclosuresLive: true,
    };
}

// Before enclosures.sql: troops and monkeys only, with the built-in enclosures
async function loadWithoutEnclosures() {
    const [troops, monkeys] = await Promise.all([
        supabase.from("troops").select("id, name").order("sort_order"),
        fetchAll(() => supabase.from("monkeys").select(OLD_MONKEY_COLUMNS).order("id")),
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
// Returns { monkeys, troops, troopIds, enclosures, buildings, sections, enclosuresLive
// (false: the database hasn't got enclosures yet, so they can't be edited) }:
// troops starts
// with "All Troops" (like groupsArr); troopIds maps troop name → id (needed
// for saving). Throws if the database can't be reached.
export async function loadMonkeyData() {
    const attempt = () =>
        loadWithEnclosures().catch((error) => {
            if (isOlderDatabase(error)) return loadWithoutEnclosures();
            throw error;
        });
    // Turned down for a run-out sign-in (opening the app after a while: the
    // renewal's still going): once it's renewed, again, rather than "Couldn't
    // reach the database"
    const request = attempt().catch(async (error) => {
        if (!isExpiredSignIn(error)) throw error;
        await signInRenewed();
        return attempt();
    });
    const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("The database took too long to respond")), TIMEOUT_MS)
    );
    const { troops, monkeys, enclosures, buildings = [], sections, enclosuresLive } = await Promise.race([request, timeout]);
    return {
        enclosuresLive,
        troops: ["All Troops", ...troops.map((t) => t.name)],
        troopIds: Object.fromEntries(troops.map((t) => [t.name, t.id])),
        monkeys: monkeys.map(toAppMonkey),
        enclosures,
        buildings,
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
    return offlineError();
}

// A save that never reached the database (no signal): .offline, so a page
// can say what it kept
function offlineError() {
    const problem = new Error("Couldn't save right now. Please check your connection and try again.");
    problem.offline = true;
    return problem;
}
const isOffline = (error) =>
    navigator.onLine === false || /failed to fetch|networkerror|load failed|network request failed/i.test(String(error?.message));

// A move's date and reason, sent along with it: the database adds the
// Movement record (supabase/movement-records.sql).
//   move: { on ("2026-10-21"), reason } or null
const moveColumns = (move) => (move ? { moved_on: move.on || null, move_reason: move.reason?.trim() || null } : {});

// Saves a change to a monkey, with the move's date and reason if there's
// one. Before movement-records.sql has run (no such columns), saved
// without them (and no record is made).
async function updateMonkey(id, row, move) {
    const send = (r) => supabase.from("monkeys").update(r).eq("id", id).select(monkeyColumns).single();
    if (!move) return send(row);
    const result = await send({ ...row, ...moveColumns(move) });
    return isOlderDatabase(result.error) ? send(row) : result;
}

// Saves a monkey (site shape). With an id, updates that monkey; without one,
// adds a new monkey. Returns the saved monkey (site shape, with its id).
//   move: changing where it lives (Edit): its date and reason, or null
export async function saveMonkey(monkey, troopIds, id, move = null) {
    const row = toDatabaseRow(monkey, troopIds);
    const { data, error } = id
        ? await updateMonkey(id, row, move)
        : await supabase.from("monkeys").insert(row).select(monkeyColumns).single();
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
// The move's date and reason (since, note) go into its Movement record.
export async function saveWhereabouts(id, { at, introcageId = null, since = null, note = "", fedBy }) {
    const row = {
        in_sickbay: at === "sickbay",
        sickbay_since: at === "sickbay" ? since || null : null,
        sickbay_note: at === "sickbay" ? note.trim() || null : null,
    };
    // (only once the database has stays: until then, Sickbay as before)
    if (has(STAY_MONKEY_COLUMNS)) {
        Object.assign(row, {
            stay_introcage_id: at === "introcage" ? introcageId : null,
            stay_since: at === "introcage" ? since || null : null,
            stay_note: at === "introcage" ? note.trim() || null : null,
        });
        if (at === "introcage" && fedBy) row.fed_by = fedBy === "sickbay" ? "sickbay" : "local_team";
    }
    const { data, error } = await updateMonkey(id, row, { on: since, reason: note });
    if (error) {
        console.error("Saving where it is failed:", error);
        throw saveProblem(error);
    }
    return toAppMonkey(data);
}

// A new status, with its date and details (monkey-archive.sql; the
// database adds its Status record). Leaving the sanctuary: its record stays
// on file but it no longer appears in the app. Admins; editors only
// Release to Wild. Back to the sanctuary: returns the monkey (site shape),
// else null.
export async function saveStatus(id, { status, date, details = "" }) {
    const { error } = await supabase.rpc("set_monkey_status", {
        monkey_id: id,
        new_status: status,
        status_on: date,
        details: details.trim(),
    });
    if (error) {
        // (before monkey-archive.sql: a release as before)
        if (error.code === "PGRST202" && status === "released") return saveOldRelease(id, { date, details });
        console.error("Saving the status failed:", error);
        throw saveProblem(error);
    }
    if (status !== "sanctuary") return null;
    const { data, error: loadError } = await supabase.from("monkeys").select(monkeyColumns).eq("id", id).single();
    if (loadError) throw saveProblem(loadError);
    return toAppMonkey(data);
}

async function saveOldRelease(id, { date, details }) {
    const row = { status: "released", released_on: date, release_details: details.trim() || null };
    const { error } = await supabase.from("monkeys").update(row).eq("id", id);
    if (error) {
        console.error("Saving the release failed:", error);
        throw saveProblem(error);
    }
    return null;
}

// Marks a new arrival as released (with the date and a few details).
// Editors.
export const saveRelease = (id, { date, details = "" }) => saveStatus(id, { status: "released", date, details });

// The Monkey Archive (admins): every monkey no longer at the sanctuary,
// each with its status changes (its Status records, newest first: { id,
// date, details, by }). Throws if the database hasn't got it yet
// (monkey-archive.sql: error.code "42703"), or this isn't an admin.
export async function loadArchive() {
    const { data, error } = await supabase
        .from("monkeys")
        .select(`${monkeyColumns}, status_on, status_details, released_on, release_details`)
        .neq("status", "sanctuary")
        .order("id");
    if (error) throw error;
    const ids = data.map((row) => row.id);
    const changes = ids.length
        ? await supabase
              .from("monkey_records")
              .select("id, monkey_id, record_date, details, logged_by_name")
              .eq("category", "status")
              .in("monkey_id", ids)
              .order("record_date", { ascending: false })
              .order("id", { ascending: false })
        : { data: [] };
    if (changes.error) throw changes.error;
    return data.map((row) => ({
        ...toAppMonkey(row),
        statusChanges: changes.data
            .filter((c) => c.monkey_id === row.id)
            .map((c) => ({ id: c.id, date: c.record_date, details: c.details, by: c.logged_by_name })),
    }));
}

// Monkey Intake (admins): every monkey that arrived in a year, or was
// released, died, escaped or went missing in it (their current status), as
// the app's monkeys with statusOn / statusDetails; and their Arrival Info
// { monkeyId: text } (none if that can't be read). Throws a message if the
// database hasn't got arrival dates yet.
export async function loadIntake(year) {
    if (!arrivalDetailsAvailable()) throw new Error("Please run supabase/arrival-details.sql first.");
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const within = (column) => `and(${column}.gte.${from},${column}.lte.${to})`;
    const { data, error } = await supabase
        .from("monkeys")
        .select(`${monkeyColumns}, status_on, status_details, released_on, release_details`)
        .or([within("arrival_date"), within("status_on"), within("released_on")].join(","))
        .order("id");
    if (error) throw error;
    const monkeys = data.map(toAppMonkey);
    const arrived = monkeys.filter((m) => m.arrivalDate?.startsWith(`${year}-`)).map((m) => m.id);
    const notes = {};
    if (arrived.length) {
        const info = await supabase.from("arrival_info").select("monkey_id, info").in("monkey_id", arrived);
        for (const row of info.data ?? []) notes[row.monkey_id] = row.info;
    }
    return { monkeys, notes };
}

// ---- Meds & Sickbay: Vet Visits and Vasectomies (vet-visits.sql) ----
// Adding either also adds the monkey's Medical record (and a vasectomy at a
// vet, or a vet visit for one, adds the other): the database does that.

// (with the monkey's name and status: an archived monkey isn't in the app's
// list, so the lists can still name them. Admins only: others can't read
// archived monkeys, so it's null)
const MEDS_MONKEY = "monkey:monkeys(name, status)";
const VET_VISIT_COLUMNS = `id, monkey_id, visit_date, practice, practice_other, reason, details, logged_by, logged_by_name, ${MEDS_MONKEY}`;
const VASECTOMY_COLUMNS = `id, monkey_id, done_on, vet, vet_other, details, vet_visit_id, logged_by, logged_by_name, ${MEDS_MONKEY}`;
const medsMonkey = (row) => (row.monkey ? { name: row.monkey.name, status: row.monkey.status } : null);

const toVetVisit = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    date: row.visit_date,
    practice: row.practice,
    practiceOther: row.practice_other ?? "",
    reason: row.reason,
    details: row.details ?? "",
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    monkey: medsMonkey(row),
});
const toVasectomy = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    date: row.done_on,
    vet: row.vet,
    vetOther: row.vet_other ?? "",
    details: row.details ?? "",
    vetVisitId: row.vet_visit_id,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    monkey: medsMonkey(row),
});

// A missing table (vet-visits.sql not run yet): said plainly
function medsProblem(error) {
    if (error?.code === "PGRST205" || error?.code === "42P01") return new Error("Please run supabase/vet-visits.sql first.");
    return error;
}

// One year's vet visits, newest first
export async function loadVetVisits(year) {
    const { data, error } = await supabase
        .from("vet_visits")
        .select(VET_VISIT_COLUMNS)
        .gte("visit_date", `${year}-01-01`)
        .lte("visit_date", `${year}-12-31`)
        .order("visit_date", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw medsProblem(error);
    return data.map(toVetVisit);
}

// A new vet visit (id null) or a change to one. values: { monkeyId, date,
// practice, practiceOther, reason, details }
export async function saveVetVisit(id, values) {
    const row = {
        visit_date: values.date,
        practice: values.practice,
        practice_other: values.practice === "other" ? values.practiceOther.trim() || null : null,
        reason: values.reason,
        details: values.details.trim() || null,
    };
    const { data, error } = id
        ? await supabase.from("vet_visits").update(row).eq("id", id).select(VET_VISIT_COLUMNS).single()
        : await supabase.from("vet_visits").insert({ ...row, monkey_id: values.monkeyId }).select(VET_VISIT_COLUMNS).single();
    if (error) throw error.code === "PGRST205" ? medsProblem(error) : saveProblem(error);
    return toVetVisit(data);
}

// The vet visit or vasectomy behind a Medical record (the database added
// the record: its record_id), or null (an older record typed in by hand).
// For the Full Profile's Medical records: changed where it's kept.
export async function loadVetVisitByRecord(recordId) {
    const { data, error } = await supabase.from("vet_visits").select(VET_VISIT_COLUMNS).eq("record_id", recordId).maybeSingle();
    if (error) throw medsProblem(error);
    return data ? toVetVisit(data) : null;
}
export async function loadVasectomyByRecord(recordId) {
    const { data, error } = await supabase.from("vasectomies").select(VASECTOMY_COLUMNS).eq("record_id", recordId).maybeSingle();
    if (error) throw medsProblem(error);
    return data ? toVasectomy(data) : null;
}

export async function deleteVetVisit(id) {
    const { error } = await supabase.from("vet_visits").delete().eq("id", id);
    if (error) throw saveProblem(error);
}

// Every vasectomy, newest first
export async function loadVasectomies() {
    const { data, error } = await supabase
        .from("vasectomies")
        .select(VASECTOMY_COLUMNS)
        .order("done_on", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw medsProblem(error);
    return data.map(toVasectomy);
}

// A new vasectomy (id null) or a change to one. values: { monkeyId, date,
// vet, vetOther, details }
export async function saveVasectomy(id, values) {
    const row = {
        done_on: values.date,
        vet: values.vet,
        vet_other: values.vet === "other" ? values.vetOther.trim() || null : null,
        details: values.details.trim() || null,
    };
    const { data, error } = id
        ? await supabase.from("vasectomies").update(row).eq("id", id).select(VASECTOMY_COLUMNS).single()
        : await supabase.from("vasectomies").insert({ ...row, monkey_id: values.monkeyId }).select(VASECTOMY_COLUMNS).single();
    if (error) throw error.code === "PGRST205" ? medsProblem(error) : saveProblem(error);
    return toVasectomy(data);
}

export async function deleteVasectomy(id) {
    const { error } = await supabase.from("vasectomies").delete().eq("id", id);
    if (error) throw saveProblem(error);
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

// ---- Named By: who named a monkey (staff only: named-by.sql) ----

// A monkey's Named By ("" if none). Throws if the database hasn't got it
// yet, or this isn't staff.
export async function loadNamedBy(monkeyId) {
    const { data, error } = await supabase.from("named_by").select("name").eq("monkey_id", monkeyId).maybeSingle();
    if (error) throw error;
    return data?.name ?? "";
}

// Saves it (editors); empty clears it
export async function saveNamedBy(monkeyId, name) {
    const text = name.trim();
    if (!text) {
        const { error } = await supabase.from("named_by").delete().eq("monkey_id", monkeyId);
        if (error) throw saveProblem(error);
        return;
    }
    const updated = await supabase.from("named_by").update({ name: text }).eq("monkey_id", monkeyId).select("monkey_id");
    if (updated.error) throw saveProblem(updated.error);
    if (updated.data?.length) return;
    const { error } = await supabase.from("named_by").insert({ monkey_id: monkeyId, name: text });
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
    if ("bowls" in changes) {
        row.bowls_small = changes.bowls.small;
        row.bowls_medium = changes.bowls.medium;
        row.bowls_large = changes.bowls.large;
    }
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
        ...("bowls_small" in data && { bowls: troopBowls(data) }),
        photos: data.photos ?? enclosure.photos,
        ...("troop_door" in data && introcageDetails(data)),
    };
}

// A log entry, as the site uses it: { id, doneOn ("2026-10-05"), kind
// ("routine" / "repair", or null: logged before there were kinds), details,
// loggedBy (their name), loggedById (their account id: who can change it),
// loggedAt; enclosureId: in the list of every enclosure's }
const toAppEntry = (row) => ({
    id: row.id,
    ...(row.enclosure_id != null && { enclosureId: row.enclosure_id }),
    doneOn: row.done_on,
    kind: row.kind ?? null,
    details: row.details,
    loggedBy: row.logged_by_name,
    loggedById: row.logged_by,
    loggedAt: row.logged_at,
});
const OLD_ENTRY_COLUMNS = "id, done_on, details, logged_by, logged_by_name, logged_at";
// ...and Routine / Repair (once maintenance-kind.sql has run)
const KIND_ENTRY_COLUMNS = `${OLD_ENTRY_COLUMNS}, kind`;
// Whether the database has kinds: null until known
let hasMaintenanceKind = null;
const entryColumns = () => (hasMaintenanceKind === false ? OLD_ENTRY_COLUMNS : KIND_ENTRY_COLUMNS);

// Whether entries can be Routine / Repair (maintenance-kind.sql has run)
export const maintenanceKindsAvailable = () => hasMaintenanceKind === true;

// An enclosure's maintenance log, newest first
export async function loadMaintenance(enclosureId) {
    const query = (columns) =>
        supabase
            .from("maintenance")
            .select(columns)
            .eq("enclosure_id", enclosureId)
            .order("done_on", { ascending: false })
            .order("id", { ascending: false });
    let { data, error } = await query(entryColumns());
    // (before maintenance-kind.sql: without them)
    if (error?.code === "42703" && hasMaintenanceKind !== false) {
        hasMaintenanceKind = false;
        ({ data, error } = await query(OLD_ENTRY_COLUMNS));
    } else if (!error) {
        hasMaintenanceKind = hasMaintenanceKind ?? true;
    }
    if (error) {
        console.error("Loading the maintenance log failed:", error);
        throw new Error("Couldn't load the maintenance log. Please check your connection.");
    }
    return withOutboxMaintenance(data.map(toAppEntry), enclosureId);
}

// Records → Maintenance: every enclosure's log, newest first (each with
// its enclosureId)
export async function loadAllMaintenance() {
    const query = (columns) =>
        fetchAll(() =>
            supabase
                .from("maintenance")
                .select(`${columns}, enclosure_id`)
                .order("done_on", { ascending: false })
                .order("id", { ascending: false })
        );
    let { data, error } = await query(entryColumns());
    // (before maintenance-kind.sql: without them)
    if (error?.code === "42703" && hasMaintenanceKind !== false) {
        hasMaintenanceKind = false;
        ({ data, error } = await query(OLD_ENTRY_COLUMNS));
    } else if (!error) {
        hasMaintenanceKind = hasMaintenanceKind ?? true;
    }
    if (error) {
        console.error("Loading the maintenance reports failed:", error);
        if (!error.code) return withOutboxMaintenance([]);
        throw new Error("Couldn't load the maintenance reports. Please check your connection.");
    }
    return withOutboxMaintenance(data.map(toAppEntry));
}

// Adds an entry ({ doneOn, kind, details }); who and when are filled in by
// the database. Returns the saved entry.
export async function addMaintenance(enclosureId, { doneOn, kind, details }) {
    refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    const optimistic = {
        id: localId,
        enclosureId,
        doneOn,
        kind: kind ?? null,
        details,
        loggedBy: me?.name ?? null,
        loggedById: me?.id ?? null,
        loggedAt: new Date().toISOString(),
    };
    const { result } = await submit("maintenance-add", { ref: newRef(), localId, enclosureId, doneOn, kind, details }, optimistic);
    return result;
}

registerSender(
    "maintenance-add",
    async ({ ref, enclosureId, doneOn, kind, details }) => {
        const row = { client_ref: ref, enclosure_id: enclosureId, done_on: doneOn, details };
        if (hasMaintenanceKind !== false && kind) row.kind = kind;
        return toAppEntry(await insertOnce("maintenance", row, `${entryColumns()}, enclosure_id`));
    },
    (error) => saveProblem(error).message
);

// What's on this phone and not in the database's answer yet
function withOutboxMaintenance(list, enclosureId = null) {
    const added = outboxEntries("maintenance-add")
        .filter(({ payload }) => (enclosureId == null || payload.enclosureId === enclosureId) && !list.some((r) => sameId(r.id, payload.localId)))
        .map((e) => e.optimistic);
    return [...added, ...list].sort((a, b) => b.doneOn.localeCompare(a.doneOn));
}

// Changes an entry's date, Maintenance Type or details (admins, or whoever
// wrote it in: maintenance-own.sql). Returns the saved entry.
export async function saveMaintenance(id, { doneOn, kind, details }) {
    const row = { done_on: doneOn, details };
    if (maintenanceKindsAvailable() && kind) row.kind = kind;
    const { data, error } = await supabase.from("maintenance").update(row).eq("id", resolveId(id)).select(entryColumns()).single();
    if (error) {
        console.error("Saving maintenance failed:", error);
        throw saveProblem(error);
    }
    return toAppEntry(data);
}

// Deletes an entry (admins, or whoever wrote it in: maintenance-own.sql)
export async function deleteMaintenance(id) {
    const { data, error } = await supabase.from("maintenance").delete().eq("id", resolveId(id)).select("id");
    if (error) {
        console.error("Deleting maintenance failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever wrote it in, can delete it.");
}

// ---- Maintenance issues: what needs doing (maintenanceIssues.js) ----

const ISSUE_BUCKET = "maintenance-issues";
const ISSUE_PHOTO_WIDTH = 1600;
const ISSUE_COLUMNS =
    "id, enclosure_id, map_x, map_y, details, urgent, photo_paths, done_photo_paths, job_order, status, close_reason, report_id, closed_at, closed_by_name, reported_by, reported_by_name, reported_at";

const toAppIssue = (row) => ({
    id: row.id,
    enclosureId: row.enclosure_id,
    mapX: row.map_x,
    mapY: row.map_y,
    details: row.details,
    urgent: row.urgent,
    photoPaths: row.photo_paths ?? [],
    // After photos: added with Job Done (maintenance-done-photos.sql)
    donePhotoPaths: row.done_photo_paths ?? [],
    // its place on the Job List (null: not moved yet; maintenance-job-order.sql)
    jobOrder: row.job_order ?? null,
    status: row.status,
    closeReason: row.close_reason,
    reportId: row.report_id,
    closedAt: row.closed_at,
    closedByName: row.closed_by_name,
    reportedBy: row.reported_by_name,
    reportedById: row.reported_by,
    reportedAt: row.reported_at,
});

// What's on this phone and not in the database's answer yet
function withOutboxIssues(list) {
    let out = list.map((i) => ({ ...i, id: displayId(i.id) }));
    for (const { payload, optimistic } of outboxEntries("issue-add")) {
        if (!out.some((i) => sameId(i.id, payload.localId))) out = [optimistic, ...out];
    }
    for (const { payload } of outboxEntries("issue-photos")) {
        out = out.map((i) => (sameId(i.id, payload.id) ? { ...i, photoPaths: [...new Set([...i.photoPaths, ...payload.paths])] } : i));
    }
    for (const kind of ["issue-fix", "issue-close"]) {
        for (const { payload, optimistic, status } of outboxEntries(kind)) {
            out = out.map((i) => (sameId(i.id, payload.id) && (status !== "sent" || i.status === "open") ? { ...i, ...optimistic } : i));
        }
    }
    return out;
}

// Every issue, newest first. (Before maintenance-issues.sql has run: none.)
export async function loadMaintenanceIssues() {
    const { data, error } = await supabase.from("maintenance_issues").select(ISSUE_COLUMNS).order("reported_at", { ascending: false });
    if (error) {
        // (42703: the first version of the file, with one photo)
        if (["42P01", "PGRST205", "42703"].includes(error.code)) return withOutboxIssues([]);
        console.error("Loading the maintenance issues failed:", error);
        if (!error.code) return withOutboxIssues([]);
        throw new Error("Couldn't load the maintenance jobs. Please check your connection.");
    }
    return withOutboxIssues(data.map(toAppIssue));
}

// A photo, shrunk to send (couldn't here: as it is)
async function shrunkPhoto(file, width) {
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, width / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        return (await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85))) ?? file;
    } catch {
        return file;
    }
}

// Photos, kept on the phone and on their way, each an entry of its own → their
// paths in storage
async function sendIssuePhotos(photos) {
    const paths = [];
    for (const photo of photos) {
        const path = `${newRef()}.jpg`;
        await keepPhoto(path, await shrunkPhoto(photo, ISSUE_PHOTO_WIDTH));
        try {
            await submit("issue-photo", { path }, { path });
        } catch (error) {
            await forgetPhoto(path);
            throw error;
        }
        paths.push(path);
    }
    return paths;
}

// Reports an issue ({ enclosureId, mapX, mapY, details, urgent, photos: files }).
// Works with no signal. Returns the issue.
export async function addIssue({ enclosureId, mapX = null, mapY = null, details, urgent, photos = [] }) {
    refuseIfTooLong();
    const me = outboxUser();
    const ref = newRef();
    const localId = newLocalId();
    const photoPaths = await sendIssuePhotos(photos);
    const optimistic = {
        id: localId,
        enclosureId,
        mapX,
        mapY,
        details,
        urgent,
        photoPaths,
        donePhotoPaths: [],
        status: "open",
        closeReason: null,
        reportId: null,
        closedAt: null,
        closedByName: null,
        reportedBy: me?.name ?? null,
        reportedById: me?.id ?? null,
        reportedAt: new Date().toISOString(),
    };
    const payload = { ref, localId, enclosureId, mapX, mapY, details, urgent, photoPaths };
    const { result } = await submit("issue-add", payload, optimistic);
    return { ...result, id: displayId(result.id) };
}

registerSender(
    "issue-photo",
    async ({ path }) => {
        const blob = await keptPhoto(path);
        if (!blob) throw { code: "P0001", message: "A job's photo has gone from this phone." };
        const { error } = await supabase.storage.from(ISSUE_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        // (already there: sent before the answer got back)
        if (error && !/already exists|duplicate/i.test(error.message ?? "") && String(error.statusCode) !== "409") {
            console.error("Uploading an issue's photo failed:", error);
            // (the database said no, and would again; anything else: tried later)
            throw { code: /^4/.test(String(error.statusCode ?? "")) ? "P0001" : "", message: error.message };
        }
        await forgetPhoto(path);
        return { path };
    },
    (error) => error.message
);

registerSender(
    "issue-add",
    async ({ ref, enclosureId, mapX, mapY, details, urgent, photoPaths }) => {
        const row = { client_ref: ref, enclosure_id: enclosureId, map_x: mapX, map_y: mapY, details, urgent, photo_paths: photoPaths };
        try {
            return toAppIssue(await insertOnce("maintenance_issues", row, ISSUE_COLUMNS));
        } catch (error) {
            // (the database isn't ready: said so, rather than holding up what's behind it)
            if (["42703", "PGRST204", "PGRST205", "42P01"].includes(error.code)) {
                throw { code: "P0001", message: "Maintenance jobs aren't ready yet. Please try again a little later." };
            }
            throw error;
        }
    },
    (error) => (error.code === "P0001" ? error.message : saveProblem(error).message)
);

// More photos on an issue already reported. Works with no signal. Returns the
// issue.
export async function addIssuePhotos(issue, photos) {
    const paths = await sendIssuePhotos(photos);
    await submit("issue-photos", { id: issue.id, paths }, { paths }, { needs: [issue.id] });
    return { ...issue, photoPaths: [...issue.photoPaths, ...paths] };
}

registerSender(
    "issue-photos",
    async ({ id, paths }) => {
        // (added to what's there now: someone else may have added some)
        const realId = resolveId(id);
        const { data, error } = await supabase.from("maintenance_issues").select("photo_paths").eq("id", realId).single();
        if (error) throw error;
        const { error: saveError } = await supabase
            .from("maintenance_issues")
            .update({ photo_paths: [...new Set([...(data.photo_paths ?? []), ...paths])] })
            .eq("id", realId);
        if (saveError) throw saveError;
        return {};
    },
    (error) => (error.code === "23514" ? "A job can only have 4 photos." : saveProblem(error).message)
);

// Fixed: adds its Maintenance report ({ doneOn, kind, details }), and the issue
// closes. Works with no signal. → { issue, report }
//   photos: After photos (files), up to 4, kept on the job
export async function fixIssue(issue, values, photos = []) {
    const report = await addMaintenance(issue.enclosureId, values);
    const donePaths = await sendIssuePhotos(photos);
    const optimistic = {
        status: "fixed",
        reportId: report.id,
        closedAt: new Date().toISOString(),
        closedByName: outboxUser()?.name ?? null,
        donePhotoPaths: donePaths,
    };
    await submit("issue-fix", { id: issue.id, reportId: report.id, donePaths }, optimistic, { needs: [issue.id, report.id] });
    return { issue: { ...issue, ...optimistic }, report: { ...report, enclosureId: issue.enclosureId } };
}

registerSender(
    "issue-fix",
    async ({ id, reportId, donePaths = [] }) => {
        // (someone else got there first: theirs stands)
        const change = { status: "fixed", report_id: resolveId(reportId) };
        if (donePaths.length) change.done_photo_paths = donePaths;
        const { error } = await supabase
            .from("maintenance_issues")
            .update(change)
            .eq("id", resolveId(id))
            .eq("status", "open");
        if (error) throw error;
        return {};
    },
    (error) => saveProblem(error).message
);

// Closed without a report: no longer offered, but one may still be waiting on a
// phone from before, and is sent as it was
registerSender(
    "issue-close",
    async ({ id, reason }) => {
        const { error } = await supabase
            .from("maintenance_issues")
            .update({ status: "closed", close_reason: reason })
            .eq("id", resolveId(id))
            .eq("status", "open");
        if (error) throw error;
        return {};
    },
    (error) => saveProblem(error).message
);

// The Job List's order (admins; with a signal): saves each job's new place
// ([{ id, jobOrder }], from moveJob). Throws a message to show.
export async function saveJobOrder(changes) {
    for (const { id, jobOrder } of changes) {
        const { data, error } = await supabase
            .from("maintenance_issues")
            .update({ job_order: jobOrder })
            .eq("id", resolveId(id))
            .select("id");
        if (error) {
            console.error("Saving the Job List's order failed:", error);
            throw saveProblem(error);
        }
        if (!data?.length) throw new Error("The database didn't allow this. Only admins can change the order.");
    }
}

// Changes an issue's place, details or urgency. Returns the saved issue.
export async function saveIssue(id, { enclosureId, details, urgent }) {
    const { data, error } = await supabase
        .from("maintenance_issues")
        .update({ enclosure_id: enclosureId, details, urgent })
        .eq("id", resolveId(id))
        .select(ISSUE_COLUMNS)
        .single();
    if (error) {
        console.error("Saving the issue failed:", error);
        throw saveProblem(error);
    }
    return { ...toAppIssue(data), id };
}

// Deletes an issue and its photos (admins)
export async function deleteIssue(issue) {
    const { data, error } = await supabase.from("maintenance_issues").delete().eq("id", resolveId(issue.id)).select("id");
    if (error) {
        console.error("Deleting the issue failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins can delete a job.");
    if (issue.photoPaths.length) {
        const { error: photoError } = await supabase.storage.from(ISSUE_BUCKET).remove(issue.photoPaths);
        if (photoError) console.warn("Deleting the issue's photos failed:", photoError);
    }
}

// An issue's photo, to show: from this phone while it's waiting to send; null
// if it can't be fetched just now
export async function issuePhotoUrl(path) {
    const waiting = outboxEntries("issue-photo").some((e) => e.status !== "sent" && e.payload.path === path);
    if (waiting) {
        const blob = await keptPhoto(path).catch(() => null);
        if (blob) return URL.createObjectURL(blob);
    }
    const { data, error } = await supabase.storage.from(ISSUE_BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
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

// Records → Integration → Reports: several monkeys' reports at once
// ([{ monkeyId, from, to, report }]); who and when are filled in by the
// database. → how many were saved
export async function addIntegrationReports(entries) {
    const { data, error } = await supabase
        .from("integration_reports")
        .insert(entries.map((e) => ({ monkey_id: e.monkeyId, from_date: e.from, to_date: e.to, report: e.report })))
        .select("id");
    if (error) {
        console.error("Adding integration reports failed:", error);
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an editor?");
        throw saveProblem(error);
    }
    return data.length;
}

// Each monkey's latest report period end ({ monkeyId: "2026-10-27" }), for
// the next report's From
export async function loadLatestReportDates(monkeyIds) {
    if (!monkeyIds.length) return {};
    const { data, error } = await supabase
        .from("integration_reports")
        .select("monkey_id, to_date")
        .in("monkey_id", monkeyIds)
        .order("to_date", { ascending: false });
    if (error) throw error;
    const latest = {};
    for (const row of data) latest[row.monkey_id] ??= row.to_date;
    return latest;
}

// Several monkeys' reports at once (Records → Integration → Reports, View):
// { monkeyId: [reports, newest period first] }
export async function loadIntegrationReportsFor(monkeyIds) {
    if (!monkeyIds.length) return {};
    const { data, error } = await supabase
        .from("integration_reports")
        .select(`monkey_id, ${REPORT_COLUMNS}`)
        .in("monkey_id", monkeyIds)
        .order("to_date", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw error;
    const byMonkey = {};
    for (const row of data) (byMonkey[row.monkey_id] ??= []).push(toAppReport(row));
    return byMonkey;
}

// ---- Current Integrations (supabase/integrations.sql) ----

const toAppIntegration = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    startedOn: row.started_on,
    kind: row.kind,
    status: row.status,
    statusOn: row.status_on ?? null,
    place: row.place ?? null,
    loggedByName: row.logged_by_name ?? null,
});

// The integrations going on now (Active or On Hold), earliest first. Throws if the database
// hasn't got them yet (error.code "42P01" / "PGRST205"), or can't be reached.
export async function loadIntegrations() {
    const { data, error } = await supabase
        .from("integrations")
        .select("id, monkey_id, started_on, kind, status, logged_by_name")
        .in("status", ["active", "on_hold"])
        .order("started_on")
        .order("id");
    if (error) throw error;
    return data.map(toAppIntegration);
}

// Starts one ({ startedOn, kind }), in the starter's name. Returns it.
export async function startIntegration(monkeyId, { startedOn, kind }) {
    const { data, error } = await supabase
        .from("integrations")
        .insert({ monkey_id: monkeyId, started_on: startedOn, kind })
        .select("id, monkey_id, started_on, kind, status, logged_by_name")
        .single();
    if (error) {
        console.error("Starting an integration failed:", error);
        if (error.code === "23505") throw new Error("This monkey already has an integration going on.");
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an editor?");
        throw saveProblem(error);
    }
    return toAppIntegration(data);
}

// Status Update: a new status (INTEGRATION_STATUSES) and the day it
// changed. Completed and Cancelled end it that day; Active and On Hold clear
// the end. Returns it.
// notes: the Status Update's (kept with it for its Integration record in
// the monkey's Rehabilitation records: integration-records.sql)
export async function updateIntegrationStatus(id, { status, date, notes = "" }) {
    const ending = status === "completed" || status === "cancelled";
    const { data, error } = await supabase
        .from("integrations")
        .update({ status, status_on: date, ended_on: ending ? date : null, status_note: notes.trim() || null })
        .eq("id", id)
        .select("id, monkey_id, started_on, kind, status, status_on, logged_by_name")
        .maybeSingle();
    if (error) {
        console.error("Updating an integration's status failed:", error);
        if (error.code === "23505") throw new Error("This monkey already has another integration going on.");
        if (error.code === "23514" && /ended/.test(error.message)) throw new Error("The date can't be before the integration started.");
        if (["42703", "PGRST204"].includes(error.code) && /status_note/.test(error.message)) {
            throw new Error("Please run supabase/integration-records.sql first.");
        }
        if (["23514", "42703", "PGRST204"].includes(error.code)) throw new Error("Please run supabase/integration-statuses.sql first.");
        throw saveProblem(error);
    }
    if (!data) throw new Error("The database didn't allow this. Are you still signed in as an editor?");
    return toAppIntegration(data);
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

// ---- Monkey Records: a monkey's Rehabilitation and Medical records ----

// A record, as the site uses it: { id, section ("rehabilitation" /
// "medical"), date ("2026-10-21"), category ("vet_visit"), details,
// loggedBy (the writer's account id), loggedByName, loggedAt }
const toAppRecord = (row) => ({
    id: row.id,
    section: row.section,
    date: row.record_date,
    category: row.category,
    details: row.details,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    loggedAt: row.logged_at,
});
const RECORD_COLUMNS = "id, section, record_date, category, details, logged_by, logged_by_name, logged_at";

// A monkey's records (both sections), newest first. Throws if the database
// hasn't got them yet (monkey-records.sql) or can't be reached.
export async function loadRecords(monkeyId) {
    const { data, error } = await supabase
        .from("monkey_records")
        .select(RECORD_COLUMNS)
        .eq("monkey_id", monkeyId)
        .order("record_date", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw error;
    const saved = data.map(toAppRecord);
    const added = outboxEntries("observation-add")
        .filter(({ payload }) => payload.monkeyId === monkeyId && !saved.some((r) => sameId(r.id, payload.localId)))
        .map((e) => e.optimistic);
    return [...added, ...saved].sort((a, b) => b.date.localeCompare(a.date));
}

// A Movement's where from and to, from the form (none: not sent, so other
// records aren't touched): the database finds the places (movement-places.sql)
const movePlaces = ({ fromPlace, toPlace }) =>
    fromPlace || toPlace ? { move_kind: "move", from_place: fromPlace, to_place: toPlace } : {};

// Adds a record ({ section, date, category, details, fromPlace?, toPlace? });
// who and when are filled in by the database. Returns the saved record.
export async function addRecord(monkeyId, { section, date, category, details, fromPlace, toPlace }) {
    const { data, error } = await supabase
        .from("monkey_records")
        .insert({ monkey_id: monkeyId, section, record_date: date, category, details, ...movePlaces({ fromPlace, toPlace }) })
        .select(RECORD_COLUMNS)
        .single();
    if (error) {
        console.error("Adding a record failed:", error);
        throw saveProblem(error);
    }
    return toAppRecord(data);
}

// Changes a record's date, category or details (admins, or whoever wrote it)
export async function saveRecord(id, { date, category, details, fromPlace, toPlace }) {
    const { data, error } = await supabase
        .from("monkey_records")
        .update({ record_date: date, category, details, ...movePlaces({ fromPlace, toPlace }) })
        .eq("id", id)
        .select(RECORD_COLUMNS)
        .single();
    if (error) {
        console.error("Saving a record failed:", error);
        throw saveProblem(error);
    }
    return toAppRecord(data);
}

// Deletes a record (admins, or whoever wrote it)
export async function deleteRecord(id) {
    const { data, error } = await supabase.from("monkey_records").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting a record failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever wrote it, can delete it.");
}

// A monkey's chip as it is now ("1011 & 1604"; "" no chip; null unknown)
export async function loadChip(monkeyId) {
    const { data, error } = await supabase.from("monkeys").select("chip").eq("id", monkeyId).single();
    if (error) throw saveProblem(error);
    return data.chip;
}

// Adds a Microchip record ({ number, date, note }), and with it the number to
// the monkey (the database does both: microchip-records.sql). Returns the
// monkey's chip now.
export async function addMicrochip(monkeyId, { number, date, note }) {
    await addRecord(monkeyId, { section: "medical", date, category: "microchip", details: microchipText({ number, note }) });
    return loadChip(monkeyId);
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

// What's on this phone and may not be in the database's answer yet (saved
// with no signal, or the answer's from before it was sent)
const sameId = (a, b) => resolveId(a) === resolveId(b);
function withOutboxInjuries(list, monkeyIds) {
    let out = list;
    for (const { payload, optimistic } of outboxEntries("injury-add")) {
        if (monkeyIds.includes(payload.monkeyId) && !out.some((i) => sameId(i.id, payload.localId))) out = [...out, optimistic];
    }
    for (const { payload, optimistic } of outboxEntries("injury-update")) {
        out = out.map((i) =>
            sameId(i.id, payload.injuryId) && !(i.updates ?? []).some((u) => sameId(u.id, payload.localId))
                ? { ...i, updates: [...(i.updates ?? []), optimistic] }
                : i
        );
    }
    for (const { payload, optimistic, status } of outboxEntries("injury-healed")) {
        out = out.map((i) =>
            sameId(i.id, payload.injuryId) && (status !== "sent" || !i.healedOn) ? { ...i, healedOn: optimistic.healedOn, healedByName: optimistic.healedByName } : i
        );
    }
    return out;
}

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
    const list = await selectInjuries((columns) =>
        supabase
            .from("injuries")
            .select(columns)
            .eq("monkey_id", monkeyId)
            .order("injury_date", { ascending: false })
            .order("id", { ascending: false })
    ).catch((error) => injurySnapshot(error, [monkeyId]));
    return withOutboxInjuries(list, [monkeyId]);
}

// No signal, and these monkeys' injuries weren't saved under this request (a
// monkey not opened on this phone): every current injury, saved as a list
// with the troops' briefings (offlinePrefill.js)
const INJURY_SNAPSHOT = "vervetdb-injuries-snapshot";
export function keepInjurySnapshot(injuries, monkeyIds) {
    try {
        const others = JSON.parse(localStorage.getItem(INJURY_SNAPSHOT) ?? "[]").filter((i) => !monkeyIds.includes(i.monkeyId));
        localStorage.setItem(INJURY_SNAPSHOT, JSON.stringify([...others, ...injuries.filter((i) => !isLocalId(i.id))]));
    } catch {
        // (no room, or not allowed)
    }
}
function injurySnapshot(error, monkeyIds) {
    if (error.code || !isOffline(error)) throw error;
    // (nothing saved at all, e.g. just installed: none known, so entries can
    // still be made)
    const saved = JSON.parse(localStorage.getItem(INJURY_SNAPSHOT) ?? "[]");
    hasInjuryUpdates = hasInjuryUpdates ?? true;
    return saved.filter((i) => monkeyIds.includes(i.monkeyId));
}

// The current (not healed) injuries of these monkeys, with their updates,
// oldest first: for the Monitoring Notes. Throws if the database can't be
// reached, or this isn't staff.
export async function loadCurrentInjuries(monkeyIds) {
    if (!monkeyIds.length) return [];
    const list = await selectInjuries((columns) =>
        supabase
            .from("injuries")
            .select(columns)
            .in("monkey_id", monkeyIds)
            .is("healed_on", null)
            .order("injury_date")
            .order("id")
    ).catch((error) => injurySnapshot(error, monkeyIds));
    return withOutboxInjuries(list, monkeyIds).filter((i) => !i.healedOn);
}

// The injuries of these monkeys healed on or since a day ("2026-04-30"),
// with their updates: Records → Sections → Injuries, Past. Throws if the
// database can't be reached, or this isn't staff.
export async function loadPastInjuries(monkeyIds, since) {
    if (!monkeyIds.length) return [];
    return selectInjuries((columns) =>
        supabase
            .from("injuries")
            .select(columns)
            .in("monkey_id", monkeyIds)
            .gte("healed_on", since)
            .order("injury_date")
            .order("id")
    );
}

// Adds an injury ({ date, description }); who and when are filled in by the
// database. Returns the saved injury.
//   sessionId: added during a monitoring session (its WhatsApp summary)
export async function addInjury(monkeyId, { date, description, sessionId = null }) {
    if (!sessionId) refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    const payload = { ref: newRef(), localId, monkeyId, date, description, sessionId };
    const optimistic = {
        id: localId,
        monkeyId,
        date,
        description,
        loggedBy: me?.id ?? null,
        loggedByName: me?.name ?? null,
        loggedAt: new Date().toISOString(),
        healedOn: null,
        healedByName: null,
        updates: [],
    };
    const { result } = await submit("injury-add", payload, optimistic, { needs: [sessionId] });
    return { ...result, id: localId };
}

// A row added from the outbox; sent twice (the signal dropped before the
// answer came back): the one already saved
async function insertOnce(table, row, columns) {
    const { data, error } = await supabase.from(table).insert(row).select(columns).single();
    if (!error) return data;
    if (error.code !== "23505") throw error;
    const again = await supabase.from(table).select(columns).eq("client_ref", row.client_ref).single();
    if (again.error) throw again.error;
    return again.data;
}

registerSender(
    "injury-add",
    async ({ ref, monkeyId, date, description, sessionId }) => {
        const sessionNow = resolveId(sessionId);
        return toAppInjury(
            await insertOnce(
                "injuries",
                { client_ref: ref, monkey_id: monkeyId, injury_date: date, description, ...(sessionNow && { session_id: sessionNow }) },
                INJURY_COLUMNS
            )
        );
    },
    (error) => saveProblem(error).message
);

// Changes an injury's date or description (admins, or whoever added it).
// (its updates aren't sent back: the caller keeps them)
export async function saveInjury(id, { date, description }) {
    const { data, error } = await supabase
        .from("injuries")
        .update({ injury_date: date, description })
        .eq("id", resolveId(id))
        .select(INJURY_COLUMNS)
        .single();
    if (error) {
        console.error("Saving an injury failed:", error);
        throw saveProblem(error);
    }
    return toAppInjury(data);
}

// Healed (or back to current): today, in the name of whoever marks it
//   onDate: the day it healed (a session entered late); none: today
export async function setInjuryHealed(id, healed, onDate = null) {
    const send = async () => {
        const { data, error } = await supabase.rpc("set_injury_healed", {
            injury_id: resolveId(id),
            healed,
            ...(onDate && { on_date: onDate }),
        });
        if (error) throw error;
        if (!data?.length) throw { code: "42501" };
        return toAppInjury(data[0]);
    };
    // (Restore needs the database: it's never offline work)
    if (!healed) {
        try {
            return await send();
        } catch (error) {
            console.error("Marking an injury healed failed:", error);
            throw saveProblem(error);
        }
    }
    const me = outboxUser();
    const healedOn = onDate ?? new Date().toISOString().slice(0, 10);
    const { result } = await submit(
        "injury-healed",
        { injuryId: id, onDate },
        { id, healedOn, healedByName: me?.name ?? null },
        { needs: [id] }
    );
    return { ...result, id };
}

registerSender(
    "injury-healed",
    async ({ injuryId, onDate }) => {
        const { data, error } = await supabase.rpc("set_injury_healed", {
            injury_id: resolveId(injuryId),
            healed: true,
            ...(onDate && { on_date: onDate }),
        });
        if (error) throw error;
        if (!data?.length) throw { code: "42501" };
        return toAppInjury(data[0]);
    },
    (error) => saveProblem(error).message
);

// Deletes an injury (admins, or whoever added it)
export async function deleteInjury(id) {
    const { data, error } = await supabase.from("injuries").delete().eq("id", resolveId(id)).select("id");
    if (error) {
        console.error("Deleting an injury failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever added it, can delete it.");
}

// An update on an injury ({ date, details }); who and when are filled in by
// the database. Returns the saved update.
//   sessionId: added during a monitoring session (its WhatsApp summary)
//   monkeyId: whose it is (for the session's summary, before it's sent)
export async function addInjuryUpdate(injuryId, { date, details, sessionId = null, monkeyId = null }) {
    const me = outboxUser();
    const localId = newLocalId();
    const optimistic = {
        id: localId,
        date,
        details,
        loggedBy: me?.id ?? null,
        loggedByName: me?.name ?? null,
        loggedAt: new Date().toISOString(),
    };
    const { result } = await submit(
        "injury-update",
        { ref: newRef(), localId, injuryId, monkeyId, date, details, sessionId },
        optimistic,
        { needs: [injuryId, sessionId] }
    );
    return { ...result, id: localId };
}

registerSender(
    "injury-update",
    async ({ ref, injuryId, date, details, sessionId }) => {
        const sessionNow = resolveId(sessionId);
        return toAppUpdate(
            await insertOnce(
                "injury_updates",
                { client_ref: ref, injury_id: resolveId(injuryId), update_date: date, details, ...(sessionNow && { session_id: sessionNow }) },
                UPDATE_COLUMNS
            )
        );
    },
    (error) => saveProblem(error).message
);

// Changes an update's date or details (admins, or whoever added it)
export async function saveInjuryUpdate(id, { date, details }) {
    const { data, error } = await supabase
        .from("injury_updates")
        .update({ update_date: date, details })
        .eq("id", resolveId(id))
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
    const { data, error } = await supabase.from("injury_updates").delete().eq("id", resolveId(id)).select("id");
    if (error) {
        console.error("Deleting an injury update failed:", error);
        throw saveProblem(error);
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins, or whoever added it, can delete it.");
}

// ---- Monitoring: Condition Check and Notes for Monitoring (staff only) ----

// A monkey's monitoring, as the site uses it: { conditionCheck, notes ("" if
// none), alertsMuted (Mute Alerts: monitoring-mute.sql),
// updatedByName, updatedAt }
export const NO_MONITORING = { conditionCheck: false, notes: "", alertsMuted: false, updatedByName: null, updatedAt: null };
const toAppMonitoring = (row) =>
    row
        ? {
              conditionCheck: row.condition_check,
              notes: row.notes ?? "",
              alertsMuted: Boolean(row.alerts_muted),
              updatedByName: row.updated_by_name,
              updatedAt: row.updated_at,
          }
        : NO_MONITORING;
const MONITORING_COLUMNS = "monkey_id, condition_check, notes, alerts_muted, updated_by_name, updated_at";
// (before monitoring-mute.sql: without Mute)
const OLDER_MONITORING_COLUMNS = "monkey_id, condition_check, notes, updated_by_name, updated_at";
async function selectMonitoring(build) {
    const result = await build(MONITORING_COLUMNS);
    return isOlderDatabase(result.error) ? build(OLDER_MONITORING_COLUMNS) : result;
}

// A monkey's monitoring (NO_MONITORING if none). Throws if the database
// hasn't got it yet (monitoring.sql), or this isn't staff.
export async function loadMonitoring(monkeyId) {
    const { data, error } = await selectMonitoring((columns) =>
        supabase.from("monitoring").select(columns).eq("monkey_id", monkeyId).maybeSingle()
    );
    if (error) throw error;
    return toAppMonitoring(data);
}

// These monkeys' monitoring: monkey id → monitoring (only those that have
// some). For the Monitoring Notes, and who's muted.
export async function loadMonitoringFor(monkeyIds) {
    if (!monkeyIds.length) return {};
    const { data, error } = await selectMonitoring((columns) =>
        supabase.from("monitoring").select(columns).in("monkey_id", monkeyIds)
    );
    if (error) throw error;
    return Object.fromEntries(data.map((row) => [row.monkey_id, toAppMonitoring(row)]));
}

// Saves it: { conditionCheck, notes, alertsMuted (admins; left out: kept
// as it is) }. Nothing ticked or written, and not muted, clears it.
// Returns what's saved.
export async function saveMonitoring(monkeyId, { conditionCheck, notes, alertsMuted }) {
    const text = notes.trim();
    // (alertsMuted left out: it may be muted, so kept, not cleared)
    if (!conditionCheck && !text && alertsMuted === false) {
        const { error } = await supabase.from("monitoring").delete().eq("monkey_id", monkeyId);
        if (error) throw saveProblem(error);
        return NO_MONITORING;
    }
    const row = {
        condition_check: conditionCheck,
        notes: text || null,
        ...(alertsMuted === undefined ? {} : { alerts_muted: alertsMuted }),
    };
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

// ---- Monitoring sessions and conditions (supabase/monitoring-sessions.sql) ----

// A session, as the site uses it: { id, enclosureId, date, status
// ("in_progress" / "finished"), foodUsed, fence, waters, food, their short
// notes (fenceNote, watersNote, foodNote), introcagesChecked,
// perimeterChecked, notes, maintenance, startedBy, startedByName,
// startedAt, finishedAt, sightings: [{ monkeyId, seen }] }
// (supabase/monitoring-checks.sql)
const toAppSession = (row) => ({
    id: row.id,
    enclosureId: row.enclosure_id,
    date: row.session_date,
    status: row.status,
    foodUsed: row.food_used,
    fence: row.fence,
    waters: row.waters,
    food: row.food,
    fenceNote: row.fence_note ?? "",
    watersNote: row.waters_note ?? "",
    foodNote: row.food_note ?? "",
    introcagesChecked: Boolean(row.introcages_checked),
    perimeterChecked: Boolean(row.perimeter_checked),
    notes: row.notes ?? "",
    maintenance: row.maintenance ?? "",
    startedBy: row.started_by,
    startedByName: row.started_by_name,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    sightings: (row.monitoring_sightings ?? []).map((s) => ({ monkeyId: s.monkey_id, seen: s.seen })),
});
const SESSION_COLUMNS =
    "id, enclosure_id, session_date, status, food_used, fence, waters, food, fence_note, waters_note, food_note, " +
    "introcages_checked, perimeter_checked, notes, maintenance, started_by, started_by_name, started_at, finished_at";
const SESSION_WITH_SIGHTINGS = `${SESSION_COLUMNS}, monitoring_sightings (monkey_id, seen)`;

// A friendly message for a session that couldn't load (or before
// monitoring-sessions.sql has run)
function sessionProblem(error) {
    console.error("Monitoring sessions failed:", error);
    if (isOffline(error)) return offlineError();
    if (isOlderDatabase(error) || error?.code === "PGRST202") {
        return new Error("Monitoring isn't ready yet: supabase/monitoring-checks.sql needs to be run.");
    }
    return error instanceof Error && !error.code ? error : saveProblem(error);
}

// Every session (in progress and finished), newest first: the last year's
// (for missing monkeys, last seen and the History). Throws a message to show.
export async function loadMonitoringSessions() {
    const since = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await fetchAll(() =>
        supabase
            .from("monitoring_sessions")
            .select(SESSION_WITH_SIGHTINGS)
            .gte("session_date", since)
            .order("session_date", { ascending: false })
            .order("started_at", { ascending: false })
            .order("id", { ascending: false })
    );
    if (error) {
        // (no signal, and nothing saved on this phone yet: what's in the outbox,
        // so a session can still be started and finished)
        if (!error.code || isOffline(error)) return withOutboxSessions([]);
        throw sessionProblem(error);
    }
    return withOutboxSessions(data.map(toAppSession));
}

// Sessions from this phone keep their local id for good (so an open one's
// draft and page carry on, whenever it's sent), with what hasn't reached the
// database's answer yet added on top. pending: still waiting to send.
export function withOutboxSessions(list) {
    let out = list.map((s) => ({ ...s, id: displayId(s.id) }));
    for (const { payload, optimistic, status } of outboxEntries("session-start")) {
        if (!out.some((s) => s.id === payload.localId)) out.push({ ...optimistic, pending: status !== "sent" });
    }
    for (const { payload, optimistic, status } of outboxEntries("session-finish")) {
        const id = displayId(resolveId(payload.sessionId));
        out = out.map((s) =>
            s.id === id && (status !== "sent" || !s.finishedAt) ? { ...s, ...optimistic, id, pending: status !== "sent" } : s
        );
    }
    const deleted = outboxEntries("session-delete").map((e) => displayId(resolveId(e.payload.sessionId)));
    return out
        .filter((s) => !deleted.includes(s.id))
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.startedAt).localeCompare(String(a.startedAt)));
}

// How long a phone can go without reaching the database and still start new
// sessions: past this, what it knows is too old to go by. (A session already
// started can always be finished.)
export const OFFLINE_LIMIT_MS = 48 * 3600000;
export const tooLongOffline = (now = Date.now()) => {
    const last = lastContact();
    return Boolean(last) && navigator.onLine === false && now - last > OFFLINE_LIMIT_MS;
};
function refuseIfTooLong() {
    if (tooLongOffline()) {
        throw new Error("This phone hasn't reached the database for over 2 days, so what it knows may be out of date. Please connect before adding anything new.");
    }
}

// Start Session: in progress, in the signed-in person's name (no signal: on
// this phone for now)
export async function startMonitoringSession(enclosureId, date) {
    refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    const optimistic = toAppSession({
        id: localId,
        enclosure_id: enclosureId,
        session_date: date,
        status: "in_progress",
        started_by: me?.id ?? null,
        started_by_name: me?.name ?? null,
        started_at: new Date().toISOString(),
    });
    const { result, sent } = await submit("session-start", { ref: newRef(), localId, enclosureId, date }, optimistic);
    return { ...result, id: localId, pending: !sent };
}

registerSender(
    "session-start",
    async ({ ref, enclosureId, date }) =>
        toAppSession(await insertOnce("monitoring_sessions", { client_ref: ref, enclosure_id: enclosureId, session_date: date }, SESSION_COLUMNS)),
    (error) => sessionProblem(error).message
);

// Finish Session (or change a finished one): { date, foodUsed, fence,
// waters, food, fenceNote, watersNote, foodNote, introcagesChecked,
// perimeterChecked, notes, maintenance, seen: [ids], notSeen: [ids] }.
// Returns it, finished.
export async function finishMonitoringSession(id, details) {
    const text = (value) => value?.trim() ?? "";
    const sightings = [
        ...details.seen.map((monkeyId) => ({ monkeyId, seen: true })),
        ...details.notSeen.map((monkeyId) => ({ monkeyId, seen: false })),
    ];
    const optimistic = {
        id,
        date: details.date,
        status: "finished",
        foodUsed: details.foodUsed || null,
        fence: details.fence,
        waters: details.waters,
        food: details.food,
        fenceNote: text(details.fenceNote),
        watersNote: text(details.watersNote),
        foodNote: text(details.foodNote),
        introcagesChecked: Boolean(details.introcagesChecked),
        perimeterChecked: Boolean(details.perimeterChecked),
        notes: text(details.notes),
        maintenance: text(details.maintenance),
        finishedAt: new Date().toISOString(),
        sightings,
    };
    const { result, sent } = await submit("session-finish", { sessionId: id, details }, optimistic, { needs: [id] });
    return { ...result, id, pending: !sent };
}

registerSender(
    "session-finish",
    async ({ sessionId, details }) => {
        const { date, foodUsed, fence, waters, food, notes, seen, notSeen } = details;
        const text = (value) => value?.trim() || null;
        const { data, error } = await supabase.rpc("finish_monitoring_session", {
            session: resolveId(sessionId),
            on_date: date,
            food_used: foodUsed || null,
            fence,
            waters,
            food,
            notes: text(notes),
            seen,
            not_seen: notSeen,
            fence_note: text(details.fenceNote),
            waters_note: text(details.watersNote),
            food_note: text(details.foodNote),
            introcages_checked: Boolean(details.introcagesChecked),
            perimeter_checked: Boolean(details.perimeterChecked),
            maintenance: text(details.maintenance),
        });
        if (error) throw error;
        const row = Array.isArray(data) ? data[0] : data;
        return toAppSession({
            ...row,
            monitoring_sightings: [
                ...seen.map((m) => ({ monkey_id: m, seen: true })),
                ...notSeen.map((m) => ({ monkey_id: m, seen: false })),
            ],
        });
    },
    // (its own words: "Only whoever started this session…")
    (error) => (error.code === "P0001" ? error.message : sessionProblem(error).message)
);

// Cancel Session (in progress) or Delete (finished): whoever started it, or
// an admin. One that never left this phone just goes, and anything added
// during it stays on record, without the session.
export async function deleteMonitoringSession(id) {
    if (isLocalId(resolveId(id))) {
        dropEntries((e) => (e.kind === "session-start" && e.payload.localId === id) || (e.kind === "session-finish" && e.payload.sessionId === id));
        editEntries((e) =>
            e.payload?.sessionId === id ? { ...e, payload: { ...e.payload, sessionId: null }, needs: (e.needs ?? []).filter((n) => n !== id) } : e
        );
        return;
    }
    await submit("session-delete", { sessionId: id }, { id });
}

registerSender(
    "session-delete",
    async ({ sessionId }) => {
        const session = resolveId(sessionId);
        const { data, error } = await supabase.from("monitoring_sessions").delete().eq("id", session).select("id");
        if (error) throw error;
        if (data?.length) return { id: session };
        // (nothing deleted: already gone, as when sent twice; or not allowed)
        const still = await supabase.from("monitoring_sessions").select("id").eq("id", session);
        if (still.error) throw still.error;
        if (still.data?.length) throw { code: "42501" };
        return { id: session };
    },
    (error) => saveProblem(error).message
);

// A condition, as the site uses it: { id, monkeyId, date, description,
// sessionId, loggedBy, loggedByName, loggedAt }
const toAppCondition = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    date: row.condition_date,
    description: row.description,
    sessionId: row.session_id,
    loggedBy: row.logged_by,
    loggedByName: row.logged_by_name,
    loggedAt: row.logged_at,
});
const CONDITION_COLUMNS = "id, monkey_id, condition_date, description, session_id, logged_by, logged_by_name, logged_at";

// These monkeys' conditions, newest first. Throws if the database hasn't
// got them yet, or can't be reached.
export async function loadConditions(monkeyIds) {
    if (!monkeyIds.length) return [];
    const { data, error } = await supabase
        .from("monkey_conditions")
        .select(CONDITION_COLUMNS)
        .in("monkey_id", monkeyIds)
        .order("condition_date", { ascending: false })
        .order("id", { ascending: false });
    if (error) throw error;
    const saved = data.map(toAppCondition);
    const added = outboxEntries("condition-add")
        .filter(({ payload }) => monkeyIds.includes(payload.monkeyId) && !saved.some((c) => sameId(c.id, payload.localId)))
        .map((e) => e.optimistic);
    return [...added, ...saved].sort((a, b) => b.date.localeCompare(a.date));
}

// A new condition ({ date, description, sessionId })
export async function addCondition(monkeyId, { date, description, sessionId = null }) {
    if (!sessionId) refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    const optimistic = {
        id: localId,
        monkeyId,
        date,
        description,
        sessionId,
        loggedBy: me?.id ?? null,
        loggedByName: me?.name ?? null,
        loggedAt: new Date().toISOString(),
    };
    const { result } = await submit("condition-add", { ref: newRef(), localId, monkeyId, date, description, sessionId }, optimistic, {
        needs: [sessionId],
    });
    return { ...result, id: localId };
}

registerSender(
    "condition-add",
    async ({ ref, monkeyId, date, description, sessionId }) =>
        toAppCondition(
            await insertOnce(
                "monkey_conditions",
                { client_ref: ref, monkey_id: monkeyId, condition_date: date, description, session_id: resolveId(sessionId) },
                CONDITION_COLUMNS
            )
        ),
    (error) => sessionProblem(error).message
);

// Changes a condition's date or description (admins, or whoever added it)
export async function saveCondition(id, { date, description }) {
    const { data, error } = await supabase
        .from("monkey_conditions")
        .update({ condition_date: date, description })
        .eq("id", resolveId(id))
        .select(CONDITION_COLUMNS)
        .single();
    if (error) throw saveProblem(error);
    return toAppCondition(data);
}

// Deletes a condition (admins, or whoever added it)
export async function deleteCondition(id) {
    const { data, error } = await supabase.from("monkey_conditions").delete().eq("id", resolveId(id)).select("id");
    if (error) throw saveProblem(error);
    if (!data?.length) throw saveProblem({ code: "PGRST116" });
}

// ---- Sightings between sessions (supabase/monkey-sightings.sql) ----

// A sighting: { id, monkeyId, date, note, loggedBy, by, at }
const SPOT_COLUMNS = "id, monkey_id, seen_on, note, source, logged_by, logged_by_name, logged_at";
const toAppSpot = (row) => ({
    id: row.id,
    monkeyId: row.monkey_id,
    date: row.seen_on,
    note: row.note ?? "",
    // what it came from: a record that shows they were seen ("dewormed",
    // "observation"…, last-seen.sql), or null: Mark As Seen
    source: row.source ?? null,
    loggedBy: row.logged_by,
    by: row.logged_by_name ?? "Staff",
    at: row.logged_at,
});

// Sightings in the last year (all monkeys, or some), newest first. Before
// monkey-sightings.sql has run: none.
export async function loadSpotSightings(monkeyIds = null) {
    const since = new Date(Date.now() - 366 * 86400000).toISOString().slice(0, 10);
    const { data, error } = await fetchAll(() => {
        const query = supabase.from("monkey_sightings").select(SPOT_COLUMNS).gte("seen_on", since);
        return (monkeyIds ? query.in("monkey_id", monkeyIds) : query)
            .order("seen_on", { ascending: false })
            .order("logged_at", { ascending: false })
            .order("id", { ascending: false });
    });
    const added = () =>
        outboxEntries("spot-add")
            .filter(({ payload }) => !monkeyIds || monkeyIds.includes(payload.monkeyId))
            .map((e) => e.optimistic);
    if (error) {
        if (isOlderDatabase(error) || !error.code) return added();
        throw sessionProblem(error);
    }
    const saved = data.map(toAppSpot);
    return [...added().filter((a) => !saved.some((r) => sameId(r.id, a.id))), ...saved].sort((a, b) => b.date.localeCompare(a.date));
}

// Mark As Seen: a missing monkey seen between sessions ({ date, note })
export async function addSpotSighting(monkeyId, { date, note = "" }) {
    refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    // (a sighting's note is short; an Observation's or Behaviour's can be longer)
    const words = note.trim().slice(0, 200).trimEnd();
    const optimistic = {
        id: localId,
        monkeyId,
        date,
        note: words,
        loggedBy: me?.id ?? null,
        by: me?.name ?? "Staff",
        at: new Date().toISOString(),
    };
    const { result } = await submit("spot-add", { ref: newRef(), localId, monkeyId, date, note: words }, optimistic);
    return result;
}

registerSender(
    "spot-add",
    async ({ ref, monkeyId, date, note }) =>
        toAppSpot(await insertOnce("monkey_sightings", { client_ref: ref, monkey_id: monkeyId, seen_on: date, note: note || null }, SPOT_COLUMNS)),
    (error) => sessionProblem(error).message
);

// Deletes a sighting (admins, or whoever added it)
export async function deleteSpotSighting(id) {
    // (never sent: it just goes)
    if (isLocalId(resolveId(id))) return dropEntries((e) => e.kind === "spot-add" && e.payload.localId === id);
    const { data, error } = await supabase.from("monkey_sightings").delete().eq("id", resolveId(id)).select("id");
    if (error) throw sessionProblem(error);
    if (!data?.length) throw saveProblem({ code: "PGRST116" });
}

// The day each monkey last moved (its latest Movement record: e.g. back
// out to its troop from Sickbay) → { monkeyId: "2026-12-22" }. Before
// movement-records.sql, or offline: none.
export async function loadLastMoves(monkeyIds) {
    if (!monkeyIds.length) return {};
    const { data, error } = await supabase
        .from("monkey_records")
        .select("monkey_id, record_date")
        .eq("category", "movement")
        .in("monkey_id", monkeyIds)
        .order("record_date", { ascending: false });
    if (error) return {};
    const moves = {};
    for (const row of data) if (!moves[row.monkey_id]) moves[row.monkey_id] = row.record_date;
    return moves;
}

// Observation (the pop-up's Quick Actions): a quick note on how a monkey's
// doing ({ date, description }): an Observation in its Medical
// records, and a sighting (as Mark As Seen), so it counts as seen that day.
// Throws a message to show.
export async function addObservation(monkeyId, { date, description }) {
    refuseIfTooLong();
    const me = outboxUser();
    const localId = newLocalId();
    const details = description.trim();
    const optimistic = {
        id: localId,
        section: "medical",
        date,
        category: "observation",
        details,
        loggedBy: me?.id ?? null,
        loggedByName: me?.name ?? null,
        loggedAt: new Date().toISOString(),
    };
    await submit("observation-add", { ref: newRef(), localId, monkeyId, date, details }, optimistic);
    await addSpotSighting(monkeyId, { date, note: description });
}

registerSender(
    "observation-add",
    async ({ ref, monkeyId, date, details }) =>
        toAppRecord(
            await insertOnce(
                "monkey_records",
                { client_ref: ref, monkey_id: monkeyId, section: "medical", record_date: date, category: "observation", details },
                RECORD_COLUMNS
            )
        ),
    (error) => (error.code === "42501" ? "Observations aren't ready yet: supabase/behaviour-observation.sql needs to be run." : saveProblem(error).message)
);

// A monkey's finished sessions it was on the checklist for (newest first,
// as sessions with just its sighting), and its sightings between them:
// { sessions, spots } (the pop-up: is it missing?)
export async function loadMonkeySightings(monkeyId) {
    const [sightings, spots] = await Promise.all([
        supabase
            .from("monitoring_sightings")
            .select("seen, monitoring_sessions!inner (id, session_date, status, finished_at)")
            .eq("monkey_id", monkeyId)
            .eq("monitoring_sessions.status", "finished")
            .order("session_date", { referencedTable: "monitoring_sessions", ascending: false })
            .limit(20),
        loadSpotSightings([monkeyId]),
    ]);
    // (no signal, and not opened on this phone: from the list of all sessions)
    if (sightings.error && !sightings.error.code) {
        const all = await loadMonitoringSessions();
        const sessions = all.filter((x) => x.status === "finished" && x.sightings.some((y) => y.monkeyId === monkeyId)).map((x) => ({
            id: x.id,
            date: x.date,
            status: "finished",
            finishedAt: x.finishedAt,
            sightings: x.sightings.filter((y) => y.monkeyId === monkeyId),
        }));
        return { sessions: sessions.slice(0, 20), spots };
    }
    if (sightings.error) throw sessionProblem(sightings.error);
    const sessions = sightings.data
        .map((r) => ({
            id: r.monitoring_sessions.id,
            date: r.monitoring_sessions.session_date,
            status: "finished",
            finishedAt: r.monitoring_sessions.finished_at,
            sightings: [{ monkeyId, seen: r.seen }],
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || String(b.finishedAt).localeCompare(String(a.finishedAt)));
    return { sessions, spots };
}

// Everything for a monkey's Timeline that isn't loaded elsewhere: every session
// they were on the checklist for, as sessions with just their sighting
export async function loadTimelineSessions(monkeyId) {
    const { data, error } = await fetchAll(() =>
        supabase
            .from("monitoring_sightings")
            .select("seen, session_id, monitoring_sessions!inner (id, session_date, status)")
            .eq("monkey_id", monkeyId)
            .eq("monitoring_sessions.status", "finished")
            .order("session_id")
    );
    if (error) throw sessionProblem(error);
    return data.map((r) => ({
        id: r.monitoring_sessions.id,
        date: r.monitoring_sessions.session_date,
        status: "finished",
        sightings: [{ monkeyId, seen: r.seen }],
    }));
}

// A monkey's integrations, past and present, for their Timeline
export async function loadMonkeyIntegrations(monkeyId) {
    const load = (columns) => supabase.from("integrations").select(columns).eq("monkey_id", monkeyId).order("started_on");
    const COLUMNS = "id, monkey_id, started_on, kind, status, status_on, logged_by_name";
    let { data, error } = await load(`${COLUMNS}, place`);
    // (before integration-place.sql: without where)
    if (isOlderDatabase(error)) ({ data, error } = await load(COLUMNS));
    if (error) throw error;
    return data.map(toAppIntegration);
}

// What was added during a session, oldest first: [{ monkeyId, text, kind
// ("injury" / "update" / "condition"), at }] (its WhatsApp 🐒 lines)
export async function loadSessionNotes(sessionId) {
    const session = resolveId(sessionId);
    // (never sent yet: just what's on this phone)
    const none = { data: [] };
    const [injuries, updates, conditions] = isLocalId(session)
        ? [none, none, none]
        : await Promise.all([
              supabase.from("injuries").select("id, monkey_id, description, logged_at").eq("session_id", session),
              supabase.from("injury_updates").select("id, details, logged_at, injuries (monkey_id)").eq("session_id", session),
              supabase.from("monkey_conditions").select("id, monkey_id, description, logged_at").eq("session_id", session),
          ]);
    throwIfError(injuries, updates, conditions);
    const here = (kind, rows) =>
        outboxEntries(kind).filter(
            ({ payload }) => payload.sessionId != null && sameId(payload.sessionId, sessionId) && !rows.some((r) => sameId(r.id, payload.localId))
        );
    return [
        ...injuries.data.map((r) => ({ monkeyId: r.monkey_id, text: r.description, kind: "injury", at: r.logged_at })),
        ...updates.data.map((r) => ({ monkeyId: r.injuries?.monkey_id, text: r.details, kind: "update", at: r.logged_at })),
        ...conditions.data.map((r) => ({ monkeyId: r.monkey_id, text: r.description, kind: "condition", at: r.logged_at })),
        ...here("injury-add", injuries.data).map(({ payload, optimistic }) => ({ monkeyId: payload.monkeyId, text: payload.description, kind: "injury", at: optimistic.loggedAt })),
        ...here("injury-update", updates.data).map(({ payload, optimistic }) => ({ monkeyId: payload.monkeyId, text: payload.details, kind: "update", at: optimistic.loggedAt })),
        ...here("condition-add", conditions.data).map(({ payload, optimistic }) => ({ monkeyId: payload.monkeyId, text: payload.description, kind: "condition", at: optimistic.loggedAt })),
    ].sort((a, b) => a.at.localeCompare(b.at));
}

// ---- Baby Care: milk totals (supabase/milk-totals.sql) ----

// Every baby's daily milk totals, oldest first: [{ monkeyId, date, ml,
// notes }]. Throws if the database hasn't got them yet, or can't be reached.
export async function loadMilkTotals() {
    const { data, error } = await fetchAll(() =>
        supabase
            .from("milk_totals")
            .select("monkey_id, milk_date, total_ml, notes")
            .order("milk_date")
            .order("monkey_id")
    );
    if (error) throw error;
    return data.map((row) => ({ monkeyId: row.monkey_id, date: row.milk_date, ml: row.total_ml, notes: row.notes ?? null }));
}


// ---- The Admin Dashboard (supabase/admin-dashboard.sql, admins only) ----

// Every account: [{ userId, name (null: not set), email, role ("admin",
// "editor", "maintenance", or null: no access yet) }]
export async function loadStaff() {
    const { data, error } = await supabase.rpc("staff_list");
    if (error) throw error;
    return data.map((row) => ({ userId: row.user_id, name: row.full_name ?? null, email: row.email, role: row.role ?? null }));
}

// Staff Activity (admins only, supabase/staff-activity.sql and
// staff-activity-dates.sql): one person's changes (person null: everyone's)
// from since up to until (Dates), newest first, as staff_activity gives
// them. Throws a message to show.
export async function loadStaffActivity(person, since, until) {
    const { data, error } = await supabase.rpc("staff_activity", {
        person,
        since: since.toISOString(),
        until: until.toISOString(),
    });
    if (error) {
        // (PGRST202: no such function yet)
        if (isOlderDatabase(error) || error.code === "PGRST202")
            throw new Error("Staff Activity isn't ready yet: supabase/staff-activity-dates.sql needs to be run.");
        throw new Error("Couldn't load Staff Activity right now. Please check your connection and try again.");
    }
    return data ?? [];
}

// Gives an account a user type (not your own: the database refuses)
export async function saveStaffRole(userId, role) {
    const { error } = await supabase.rpc("set_staff_role", { target: userId, new_role: role });
    if (error) {
        console.error("Changing a user type failed:", error);
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an admin?");
        throw saveProblem(error);
    }
}

// Weekly Reports (supabase/weekly-reports.sql, admins only): your own
// settings ({ enabled, weekStarts, sendDay, sendHour, sections }), or null
// if you haven't saved any yet. Throws a message to show.
export async function loadWeeklySettings(userId) {
    const { data, error } = await supabase
        .from("weekly_report_settings")
        .select("enabled, week_starts, send_day, send_hour, sections")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) {
        if (isOlderDatabase(error)) throw new Error("Weekly Reports aren't ready yet: supabase/weekly-reports.sql needs to be run.");
        throw new Error("Couldn't load your Weekly Reports settings. Please check your connection and try again.");
    }
    return data
        ? { enabled: data.enabled, weekStarts: data.week_starts, sendDay: data.send_day, sendHour: data.send_hour, sections: data.sections }
        : null;
}

// Saves your own Weekly Reports settings (added the first time)
export async function saveWeeklySettings(userId, settings) {
    const { error } = await supabase.from("weekly_report_settings").upsert({
        user_id: userId,
        enabled: settings.enabled,
        week_starts: settings.weekStarts,
        send_day: settings.sendDay,
        send_hour: settings.sendHour,
        sections: settings.sections,
    });
    if (error) {
        console.error("Saving Weekly Reports settings failed:", error);
        if (isOlderDatabase(error)) throw new Error("Weekly Reports aren't ready yet: supabase/weekly-reports.sql needs to be run.");
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an admin?");
        throw saveProblem(error);
    }
}

// A week's report (weekly-report-email.sql, admins only), the 7 days from
// `from` ("2026-10-26"), the sections chosen: its lines, as
// weekly_report_view words them ({ title, ended, sections }). Throws a
// message to show.
export async function loadWeeklyReport(from, sections) {
    const { data, error } = await supabase.rpc("weekly_report", { week_from: from, sections });
    if (error) {
        console.error("Loading a weekly report failed:", error);
        if (error.code === "PGRST202") throw new Error("Past Reports aren't ready yet: supabase/weekly-report-email.sql needs to be run.");
        if (error.code === "42501") throw new Error("Weekly Reports are for admins only. Are you still signed in as an admin?");
        throw new Error("Couldn't load that week's report. Please check your connection and try again.");
    }
    return data;
}

// Email Me: a week's report to your own sign-in email, now (one a minute at
// most) → the address it went to. Throws a message to show.
export async function emailMeWeeklyReport(from, sections) {
    const { data, error } = await supabase.rpc("email_me_weekly_report", { week_from: from, sections });
    if (error) {
        console.error("Emailing a weekly report failed:", error);
        if (error.code === "PGRST202") throw new Error("Email Me isn't ready yet: supabase/weekly-report-email.sql needs to be run.");
        if (error.code === "42501") throw new Error("Weekly Reports are for admins only. Are you still signed in as an admin?");
        // (the database's own words: "Please wait a minute…")
        if (error.code === "P0001") throw new Error(error.message);
        throw new Error("Couldn't send the email. Please check your connection and try again.");
    }
    return data;
}

// ---- Records: Baby Care's milk totals and weights
// (supabase/baby-care-records.sql) ----

const BABY_TABLES = {
    milk: { table: "milk_totals", date: "milk_date", value: "total_ml", save: "save_milk_totals" },
    weights: { table: "weights", date: "weigh_date", value: "grams", save: "save_weights" },
};

// Every baby's milk totals or weights ("milk" / "weights"), oldest first:
// [{ monkeyId, date, value, notes, loggedByName }]. Throws if the database
// hasn't got them yet, or can't be reached.
export async function loadBabyRecords(kindId) {
    const t = BABY_TABLES[kindId];
    const { data, error } = await fetchAll(() =>
        supabase
            .from(t.table)
            .select(`monkey_id, ${t.date}, ${t.value}, notes, logged_by_name`)
            .order(t.date)
            .order("monkey_id")
    );
    // (no signal, and nothing saved on this phone yet: entries can still be made)
    if (error && !error.code) return withOutboxBaby(kindId, []);
    if (error) throw error;
    return withOutboxBaby(
        kindId,
        data.map((row) => ({
            monkeyId: row.monkey_id,
            date: row[t.date],
            value: row[t.value],
            notes: row.notes ?? null,
            loggedByName: row.logged_by_name ?? null,
        }))
    );
}

// What's waiting to send on top of what's saved: a baby's value that day (as
// the database will: replaced, or left as it was)
function withOutboxBaby(kindId, list) {
    let out = list;
    for (const { payload, status } of outboxEntries("baby-save")) {
        if (payload.kindId !== kindId || status === "sent") continue;
        for (const e of payload.entries) {
            const there = out.some((r) => r.monkeyId === e.monkeyId && r.date === e.date);
            if (there && !payload.replace) continue;
            const row = { monkeyId: e.monkeyId, date: e.date, value: e.value, notes: e.notes ?? null, loggedByName: outboxUser()?.name ?? null };
            out = there ? out.map((r) => (r.monkeyId === e.monkeyId && r.date === e.date ? row : r)) : [...out, row];
        }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.monkeyId - b.monkeyId);
}

// One monkey's weights (the Records page's), oldest first, for its Medical
// records: [{ monkeyId, date, value, notes, loggedByName }]
export async function loadMonkeyWeights(monkeyId) {
    const { data, error } = await supabase
        .from("weights")
        .select("monkey_id, weigh_date, grams, notes, logged_by_name")
        .eq("monkey_id", monkeyId)
        .order("weigh_date");
    if (error) throw error;
    return data.map((row) => ({
        monkeyId: row.monkey_id,
        date: row.weigh_date,
        value: row.grams,
        notes: row.notes ?? null,
        loggedByName: row.logged_by_name ?? null,
    }));
}

// Every baby's weights, oldest first, for Statistics: [{ monkeyId, date,
// grams }]
export async function loadWeights() {
    return (await loadBabyRecords("weights")).map((r) => ({ monkeyId: r.monkeyId, date: r.date, grams: r.value }));
}

// Every monkey's moves, oldest first: [{ monkeyId, date, kind ("move" or
// "home"), fromId, toId }] (movement-places.sql; who was in Baby Care on a
// past day)
export async function loadMoves() {
    const { data, error } = await fetchAll(() =>
        supabase
            .from("monkey_records")
            .select("monkey_id, record_date, move_kind, from_place_id, to_place_id")
            .eq("category", "movement")
            .order("record_date")
            .order("id")
    );
    if (error) throw error;
    return data.map((r) => ({ monkeyId: r.monkey_id, date: r.record_date, kind: r.move_kind, fromId: r.from_place_id, toId: r.to_place_id }));
}

// ---- Weekly Baby Reports (supabase/baby-weekly-reports.sql) ----

// Every week's reports, newest week first: [{ id, monkeyId, week (its
// Monday), report (null: Not recorded), loggedByName, loggedAt }]. Throws if the database hasn't
// got them yet (error.code "42P01" / "PGRST205"), or can't be reached.
export async function loadBabyWeeklyReports() {
    const { data, error } = await fetchAll(() =>
        supabase
            .from("baby_weekly_reports")
            .select("id, monkey_id, week_start, report, logged_by_name, logged_at")
            .order("week_start", { ascending: false })
            .order("id")
    );
    if (error) throw error;
    return data.map((r) => ({
        id: r.id,
        monkeyId: r.monkey_id,
        week: r.week_start,
        report: r.report,
        loggedByName: r.logged_by_name ?? null,
        loggedAt: r.logged_at,
    }));
}

// A week's reports ([{ monkeyId, report }]; report null: Not recorded).
// edit false (Enter): a new week, refused if it's been reported already;
// edit true (View → Edit): changes to that week's. → how many were saved
export async function saveBabyWeeklyReports(week, entries, edit = false) {
    const { data, error } = await supabase.rpc("save_baby_weekly_reports", {
        week_start: week,
        reports: entries.map((e) => ({ monkey_id: e.monkeyId, report: e.report })),
        edit,
    });
    if (error) {
        console.error("Saving the weekly baby reports failed:", error);
        if (error.code === "42501") throw new Error("The database didn't allow this. Are you still signed in as an editor?");
        throw saveProblem(error);
    }
    return data;
}

// Save All: a batch of milk totals or weights ([{ monkeyId, date, value,
// notes }]); a baby that already has one that day is replaced (replace
// true) or left as it was. → how many were saved
export async function saveBabyRecords(kindId, entries, replace) {
    refuseIfTooLong();
    // (with no signal it can't know how many it'll leave as they were: it
    // says all of them, and what's waiting shows as it'll be)
    const { result } = await submit("baby-save", { kindId, entries, replace }, { count: entries.length });
    return result.count;
}

registerSender(
    "baby-save",
    async ({ kindId, entries, replace }) => {
        const { data, error } = await supabase.rpc(BABY_TABLES[kindId].save, {
            entries: entries.map((e) => ({ monkey_id: e.monkeyId, date: e.date, value: e.value, notes: e.notes })),
            replace,
        });
        if (error) throw error;
        return { count: data };
    },
    (error) => {
        console.error("Saving records failed:", error);
        if (error.code === "42501") return "The database didn't allow this. Are you still signed in as an editor?";
        if (error.code === "23514") return "The database refused one of the values or the date. Please check them.";
        return saveProblem(error).message;
    }
);

// ---- Deworming (supabase/deworming.sql) ----

// A database sheet → { id, groupKey, groupName, session, startDate,
// instructions, status ("ready", "submitted", "approved"), preparedByName,
// startedOn, staffNames, dayNotes ({ 1: "…" }), photos (paths), daysDone
// (the days saved complete: [1, 2]),
// submittedByName, approvedByName, returnNote, lines: [{ id, monkeyId,
// medication, dose, days, recordText, kind ("list", "added",
// "accidental"), fromDay, addedByName, day4, doses: { 1: { result, food,
// note, medication, dose } } }] }
const toAppSheet = (row) => ({
    id: row.id,
    groupKey: row.group_key,
    groupName: row.group_name,
    session: row.session,
    startDate: row.start_date,
    instructions: row.instructions ?? "",
    status: row.status,
    preparedByName: row.prepared_by_name ?? null,
    startedOn: row.started_on ?? null,
    staffNames: row.staff_names ?? "",
    dayNotes: row.day_notes ?? {},
    photos: row.photos ?? [],
    daysDone: row.days_done ?? [],
    submittedByName: row.submitted_by_name ?? null,
    approvedByName: row.approved_by_name ?? null,
    returnNote: row.return_note ?? null,
    photoEmailedAt: row.photo_emailed_at ?? null,
    // (deworming-different-schedule.sql: those left off on purpose)
    differentSchedule: row.different_schedule ?? [],
    lines: (row.deworming_lines ?? []).map((l) => ({
        id: l.id,
        monkeyId: l.monkey_id,
        medication: l.medication,
        dose: l.dose,
        days: l.days,
        recordText: l.record_text ?? null,
        kind: l.kind ?? "list",
        fromDay: l.from_day ?? 1,
        addedByName: l.added_by_name ?? null,
        day4: l.day_4 ?? null,
        doses: Object.fromEntries(
            (l.deworming_doses ?? []).map((d) => [
                d.day,
                {
                    result: d.result,
                    food: d.food ?? null,
                    note: d.note ?? null,
                    medication: d.medication ?? null,
                    dose: d.dose ?? null,
                },
            ])
        ),
    })),
});

const SHEET_COLUMNS = "id, group_key, group_name, session, start_date, instructions, status, prepared_by_name";
const resultColumns = (lineColumns) =>
    "started_on, staff_names, day_notes, photos, days_done, submitted_by_name, approved_by_name, return_note, photo_emailed_at, " +
    `deworming_lines (id, monkey_id, medication, dose, days, record_text, ${lineColumns}` +
    "deworming_doses (day, result, food, note, medication, dose))";
// (deworming-additions.sql: the monkeys staff added, and Day 4)
const ADDED_COLUMNS = "kind, from_day, added_by_name, day_4, ";

// Every deworming sheet, newest first. Throws a message to show. (Before
// deworming-results.sql has run: the sheets without their results.)
export async function loadDewormingSheets() {
    const load = (columns) =>
        supabase
            .from("deworming_sheets")
            .select(columns)
            .order("start_date", { ascending: false })
            .order("id", { ascending: false });
    let { data, error } = await load(`${SHEET_COLUMNS}, different_schedule, ${resultColumns(ADDED_COLUMNS)}`);
    if (isOlderDatabase(error)) ({ data, error } = await load(`${SHEET_COLUMNS}, ${resultColumns(ADDED_COLUMNS)}`));
    if (isOlderDatabase(error)) ({ data, error } = await load(`${SHEET_COLUMNS}, ${resultColumns("")}`));
    if (isOlderDatabase(error)) {
        ({ data, error } = await load(`${SHEET_COLUMNS}, deworming_lines (id, monkey_id, medication, dose, days)`));
    }
    if (error) {
        console.error("Loading deworming sheets failed:", error);
        if (isOlderDatabase(error))
            throw new Error("Deworming isn't ready yet: supabase/deworming.sql needs to be run.");
        if (!error.code) throw new Error("The deworming lists aren't saved on this phone yet. Please open this page once with signal.");
        throw new Error("Couldn't load the deworming lists. Please check your connection and try again.");
    }
    return withOutboxSheets(data.map(toAppSheet));
}

// A sheet with what's waiting to send on top: monkeys added, and results
export function withOutboxSheets(list) {
    const waiting = (kind) => outboxEntries(kind).filter((e) => e.status !== "sent");
    return list.map((sheet) => {
        let out = sheet;
        for (const { payload, optimistic } of waiting("deworming-add")) {
            if (payload.sheetId === sheet.id && !out.lines.some((l) => sameId(l.id, payload.localId))) {
                out = { ...out, lines: [...out.lines, optimistic] };
            }
        }
        for (const { payload } of waiting("deworming-remove")) {
            out = { ...out, lines: out.lines.filter((l) => !sameId(l.id, payload.lineId)) };
        }
        for (const { payload } of waiting("deworming-results")) {
            if (payload.sheetId !== sheet.id) continue;
            const { startedOn, staffNames, dayNotes, photos, daysDone, lines } = payload.results;
            const changed = (l) => lines.find((x) => sameId(x.id, l.id));
            out = {
                ...out,
                startedOn,
                staffNames,
                dayNotes,
                photos,
                daysDone,
                lines: out.lines.map((l) => (changed(l) ? { ...l, doses: changed(l).doses, day4: changed(l).day4 } : l)),
            };
        }
        return out;
    });
}

// Prepare Sheet's Save (admins): a new sheet (no id) or a change to one,
// with its monkeys → its id. Throws a message to show.
export async function saveDewormingSheet(sheet) {
    const { data, error } = await supabase.rpc("save_deworming_sheet", {
        sheet: {
            id: sheet.id ?? null,
            group_key: sheet.groupKey,
            group_name: sheet.groupName,
            session: sheet.session,
            start_date: sheet.startDate,
            instructions: sheet.instructions,
            different_schedule: sheet.differentSchedule ?? [],
            lines: sheet.lines.map((l) => ({
                monkey_id: l.monkeyId,
                medication: l.medication,
                dose: l.dose,
                days: l.days,
            })),
        },
    });
    if (error) {
        console.error("Saving a deworming sheet failed:", error);
        if (error.code === "PGRST202")
            throw new Error("Deworming isn't ready yet: supabase/deworming.sql needs to be run.");
        if (error.code === "42501")
            throw new Error("Only admins can prepare deworming lists. Are you still signed in as an admin?");
        if (error.code === "P0001") throw new Error(error.message);
        throw saveProblem(error);
    }
    return data;
}

// Deletes a sheet (admins). Throws a message to show.
export async function deleteDewormingSheet(id) {
    const { data, error } = await supabase.from("deworming_sheets").delete().eq("id", id).select("id");
    if (error) {
        console.error("Deleting a deworming sheet failed:", error);
        throw offlineError();
    }
    if (!data?.length) throw new Error("The database didn't allow this. Only admins can delete deworming lists.");
}

// A deworming problem from the database, as words to show
function dewormingProblem(error, what) {
    console.error(`${what} failed:`, error);
    if (error.code === "PGRST202")
        return new Error("This isn't ready yet: supabase/deworming-results.sql needs to be run.");
    if (error.code === "42501") return new Error("The database didn't allow this. Are you still signed in?");
    // (the database's own words: "Please add a photo…")
    if (error.code === "P0001") return new Error(error.message);
    return saveProblem(error);
}

// Saves a sheet's results (staff, as they go), or submits them for
// approval (submit: true) → its status. Throws a message to show.
//   results: { startedOn, staffNames, dayNotes, photos, daysDone, lines
//   (with their doses), submit }
export async function saveDewormingResults(sheetId, results) {
    // Submit needs the database there and then: what it emails is made from
    // what's saved. What's waiting goes first.
    if (results.submit) {
        await flushOutbox();
        return sendDewormingResults(sheetId, results).catch((error) => {
            if (!error.code) throw new Error("Submit needs a connection. Everything entered is kept on this phone: please try again when there's signal.");
            throw dewormingProblem(error, "Saving deworming results");
        });
    }
    // (each save has the whole sheet, so only the latest needs to go)
    dropEntries((e) => e.kind === "deworming-results" && e.status === "waiting" && e.payload.sheetId === sheetId);
    const needs = results.lines.map((l) => l.id);
    const { result } = await submit("deworming-results", { sheetId, results }, { status: "ready" }, { needs });
    return result.status ?? result;
}

async function sendDewormingResults(sheetId, results) {
    const { data, error } = await supabase.rpc("save_deworming_results", {
        sheet: sheetId,
        results: {
            started_on: results.startedOn,
            staff_names: results.staffNames,
            day_notes: results.dayNotes,
            photos: results.photos,
            days_done: results.daysDone ?? [],
            submit: Boolean(results.submit),
            // (each line's Day 4 decision)
            day_4: results.lines.map((l) => ({ line_id: resolveId(l.id), day_4: l.day4 ?? null })),
            doses: results.lines.flatMap((l) =>
                Object.entries(l.doses ?? {}).map(([day, d]) => ({
                    line_id: resolveId(l.id),
                    day: Number(day),
                    result: d.result,
                    food: d.food,
                    note: d.note,
                    medication: d.medication,
                    dose: d.dose,
                }))
            ),
        },
    });
    if (error) throw error;
    return data;
}

registerSender(
    "deworming-results",
    async ({ sheetId, results }) => ({ status: await sendDewormingResults(sheetId, results) }),
    (error) => dewormingProblem(error, "Saving deworming results").message
);

// A deworming problem with a monkey staff add or remove, as words to show
function additionProblem(error, what) {
    if (error.code === "PGRST202") {
        console.error(`${what} failed:`, error);
        return new Error("Adding monkeys isn't ready yet: supabase/deworming-additions.sql needs to be run.");
    }
    return dewormingProblem(error, what);
}

// Add Monkey (staff, while completing a sheet) → the new line's id.
//   line: { monkeyId, kind ("added" / "accidental"), fromDay, medication,
//   dose, days }
export async function addDewormingMonkey(sheetId, line) {
    const localId = newLocalId();
    const optimistic = { ...line, id: localId, doses: {}, day4: null, recordText: null };
    await submit("deworming-add", { ref: newRef(), localId, sheetId, line }, optimistic);
    return localId;
}

registerSender(
    "deworming-add",
    async ({ sheetId, line }) => {
        const { data, error } = await supabase.rpc("add_deworming_monkey", {
            sheet: sheetId,
            line: {
                monkey_id: line.monkeyId,
                kind: line.kind,
                from_day: line.fromDay,
                medication: line.medication,
                dose: line.dose,
                days: line.days,
            },
        });
        if (error) throw error;
        return { id: data };
    },
    (error) => additionProblem(error, "Adding a monkey to deworming").message
);

// Removes a monkey staff added (not one of the sheet's own). One that never
// left this phone just goes.
export async function removeDewormingMonkey(lineId) {
    if (isLocalId(resolveId(lineId))) {
        dropEntries((e) => e.kind === "deworming-add" && e.payload.localId === lineId);
        editEntries((e) =>
            e.kind === "deworming-results"
                ? {
                      ...e,
                      needs: (e.needs ?? []).filter((n) => n !== lineId),
                      payload: { ...e.payload, results: { ...e.payload.results, lines: e.payload.results.lines.filter((l) => l.id !== lineId) } },
                  }
                : e
        );
        return;
    }
    await submit("deworming-remove", { lineId }, {});
}

registerSender(
    "deworming-remove",
    async ({ lineId }) => {
        const { error } = await supabase.rpc("remove_deworming_monkey", { line: resolveId(lineId) });
        if (error) throw error;
        return {};
    },
    (error) => additionProblem(error, "Removing a monkey from deworming").message
);

// Approve (admins): each monkey's record, in these words → how many
// records were added. records: [{ lineId, text }]
export async function approveDewormingSheet(sheetId, records) {
    const { data, error } = await supabase.rpc("approve_deworming_sheet", {
        sheet: sheetId,
        records: records.map((r) => ({ line_id: r.lineId, text: r.text })),
    });
    if (error) throw dewormingProblem(error, "Approving deworming");
    return data;
}

// Send Back (admins): a submitted sheet back to staff, with a note
export async function returnDewormingSheet(sheetId, note) {
    const { error } = await supabase.rpc("return_deworming_sheet", { sheet: sheetId, note });
    if (error) throw dewormingProblem(error, "Sending deworming back");
}

// ---- Deworming's Schedule: Outlook's events (supabase/deworming-calendar.sql) ----

// The calendar's deworming events and its last fetch → { events: [{ uid,
// title, startsOn }], sync: { syncedAt, ok, message, events } or null }, or
// null before deworming-calendar.sql is run. Throws a message to show.
export async function loadDewormingCalendar() {
    const [events, sync] = await Promise.all([
        supabase.from("deworming_calendar").select("uid, title, starts_on").order("starts_on"),
        supabase.from("deworming_calendar_sync").select("synced_at, ok, message, events").maybeSingle(),
    ]);
    if (isOlderDatabase(events.error) || isOlderDatabase(sync.error)) return null;
    if (events.error || sync.error) {
        console.error("Loading the deworming calendar failed:", events.error ?? sync.error);
        throw new Error("Couldn't load the schedule. Please check your connection and try again.");
    }
    return {
        events: events.data.map((e) => ({ uid: e.uid, title: e.title, startsOn: e.starts_on })),
        sync: sync.data
            ? { syncedAt: sync.data.synced_at, ok: sync.data.ok, message: sync.data.message, events: sync.data.events }
            : null,
    };
}

// Refresh Now (admins): fetches Outlook's calendar again. Throws a message.
export async function refreshDewormingCalendar() {
    const { data, error } = await supabase.rpc("refresh_deworming_calendar");
    if (error) throw dewormingProblem(error, "Refreshing the deworming calendar");
    return data;
}

// ---- The paper sheets' photos (private: the deworming-sheets bucket) ----

const SHEET_BUCKET = "deworming-sheets";
// Big enough to read handwriting, small enough to upload on a phone
const SHEET_PHOTO_WIDTH = 2000;

// A photo of a paper sheet, shrunk and uploaded → its path
export async function uploadSheetPhoto(file, sheetId) {
    let blob = file;
    try {
        const bitmap = await createImageBitmap(file);
        const scale = Math.min(1, SHEET_PHOTO_WIDTH / Math.max(bitmap.width, bitmap.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bitmap.width * scale);
        canvas.height = Math.round(bitmap.height * scale);
        canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        blob = (await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.85))) ?? file;
    } catch {
        // (couldn't shrink it here: the photo as it is)
    }
    // (kept on the phone first, then sent like any other entry; its name's
    // already its name in storage, so the results can list it straight away)
    const path = `${sheetId}/${Date.now()}.jpg`;
    await keepPhoto(path, blob);
    try {
        await submit("sheet-photo", { path }, { path });
    } catch (error) {
        await forgetPhoto(path);
        throw error;
    }
    return path;
}

registerSender(
    "sheet-photo",
    async ({ path }) => {
        const blob = await keptPhoto(path);
        if (!blob) throw { code: "P0001", message: "A sheet photo's gone from this phone. Please add it again." };
        const { error } = await supabase.storage.from(SHEET_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        // (already there: sent before the answer got back)
        if (error && !/already exists|duplicate/i.test(error.message ?? "") && String(error.statusCode) !== "409") {
            console.error("Uploading a sheet photo failed:", error);
            throw { code: "", message: error.message };
        }
        await forgetPhoto(path);
        return { path };
    },
    (error) => error.message
);

// The photos themselves, as data URLs (for the emailed PDF), in order
export async function sheetPhotoData(paths) {
    return Promise.all(
        paths.map(async (path) => {
            const { data, error } = await supabase.storage.from(SHEET_BUCKET).download(path);
            if (error) throw error;
            return new Promise((done, fail) => {
                const reader = new FileReader();
                reader.onload = () => done(reader.result);
                reader.onerror = () => fail(reader.error);
                reader.readAsDataURL(data);
            });
        })
    );
}

// Emails a submitted sheet's photos (a PDF) to whoever gets them
// (supabase/deworming-sheet-email.sql) → the addresses. Throws if not sent.
export async function emailDewormingSheet(sheetId, pdfBlob, fileName) {
    const dataUrl = await new Promise((done, fail) => {
        const reader = new FileReader();
        reader.onload = () => done(reader.result);
        reader.onerror = () => fail(reader.error);
        reader.readAsDataURL(pdfBlob);
    });
    const { data, error } = await supabase.rpc("email_deworming_sheet", {
        sheet: sheetId,
        pdf: dataUrl.slice(dataUrl.indexOf(",") + 1),
        file_name: fileName,
    });
    if (error) throw dewormingProblem(error, "Emailing the deworming sheet");
    return data;
}

// The photos' addresses to show (for an hour) → { path: url }
export async function sheetPhotoUrls(paths) {
    if (!paths.length) return {};
    // (still on this phone: from here)
    const waiting = outboxEntries("sheet-photo").filter((e) => e.status !== "sent").map((e) => e.payload.path);
    const here = await Promise.all(
        paths
            .filter((p) => waiting.includes(p))
            .map(async (p) => {
                const blob = await keptPhoto(p).catch(() => null);
                return blob ? [p, URL.createObjectURL(blob)] : null;
            })
    );
    const rest = paths.filter((p) => !waiting.includes(p));
    const { data, error } = rest.length ? await supabase.storage.from(SHEET_BUCKET).createSignedUrls(rest, 3600) : { data: [] };
    if (error) console.error("Loading sheet photos failed:", error);
    return Object.fromEntries([...here.filter(Boolean), ...(error ? [] : data.filter((d) => d.signedUrl).map((d) => [d.path, d.signedUrl]))]);
}
