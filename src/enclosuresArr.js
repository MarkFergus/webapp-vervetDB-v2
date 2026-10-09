// The built-in copy of the sections and enclosures: the same list
// supabase/enclosures.sql puts in the database. Used if the database can't
// be reached (or doesn't have enclosures yet), and by the tests. Ids here
// are only for the built-in copy; the database gives each its own.
//
// An enclosure, as the rest of the site uses it:
//   { id, name, type: "troop" | "introcage", parentId (introcages),
//     special (true: a special enclosure, not a troop's home, e.g.
//     Quarantine; its cages are its introcages),
//     section (introcages: their enclosure's), established ("2014-03" or null),
//     description, features, size (square metres, or null), photos, sortOrder,
//     introcages only: troopDoor, plateSlot (true / false / null = not
//     recorded), sleepingPerches (1–10 or null) }

// (Baby Care, Quarantine and Sickbay Care Unit: the care areas for new
// intakes, not real sections but each a "section" of its own, holding just
// itself: supabase/care-areas.sql)
export const SECTION_NAMES = ["Top", "Middle", "Bottom", "Sickbay", "Baby Care", "Quarantine", "Sickbay Care Unit"];

// Troop enclosure → its section and introcage codes, in order
const LAYOUT = [
    ["Goliath", "Top", ["A", "B", "B1", "C", "D", "E", "F", "F1", "I", "J"]],
    ["Gismo", "Top", ["A", "C", "D"]],
    ["D&D", "Top", ["A", "A1", "B", "C", "D", "E"]],
    ["Royal", "Top", ["A1", "A3", "A4", "C"]],
    ["Engeltjie", "Middle", ["1", "1A", "2", "3", "4", "5", "7", "8", "9"]],
    ["Lankora", "Middle", ["A", "B", "C"]],
    ["Koko", "Middle", ["A", "A1", "B", "C", "D"]],
    ["Camelot", "Middle", ["A", "C", "D", "E"]],
    ["Skrow", "Bottom", ["B", "C"]],
    ["Robert", "Bottom", ["A", "B1", "B2", "B3", "C", "D", "E"]],
    ["Skunkey", "Bottom", ["A", "B1", "B2", "D", "E", "F", "F2"]],
    ["H&B", "Bottom", ["A", "B", "C1", "C2"]],
    ["Jalamango", "Bottom", ["A"]],
    ["Global", "Sickbay", ["A", "B", "C", "D", "E", "F"]],
    ["James", "Sickbay", ["A", "B"]],
];

// Special enclosures (not a troop's home: supabase/special-enclosures.sql
// and care-areas.sql), listed after the troop enclosures in their sections,
// with their cages / areas (full names; Sickbay Care Unit is one area,
// named the same as itself)
const cages = (name, codes) => codes.map((code) => `${name} ${code}`);
const SPECIAL = [
    ["Bachelor Block", "Top", cages("Bachelor Block", ["A", "B"])],
    ["Quarantine", "Quarantine", cages("Quarantine", ["A", "B", "C", "D", "E", "F"])],
    ["Baby Care", "Baby Care", ["Dreamland", "Neverland", "Disneyland"]],
    ["Sickbay Care Unit", "Sickbay Care Unit", ["Sickbay Care Unit"]],
];

// Introcages with their own name instead of "<enclosure> <code>"
const OWN_NAMES = {
    "Engeltjie 8": "Calypso's Corner A",
    "Engeltjie 9": "Calypso's Corner B",
    "James B": "Groomingdales",
};

const blank = { established: null, description: "", features: "", size: null, photos: [] };

function build() {
    const list = [];
    let id = 0;
    LAYOUT.forEach(([name, section], i) => {
        list.push({ ...blank, id: ++id, name, type: "troop", parentId: null, section, sortOrder: i + 1 });
    });
    LAYOUT.forEach(([name, , codes]) => {
        const parent = list.find((e) => e.type === "troop" && e.name === name);
        codes.forEach((code, i) => {
            list.push({
                ...blank,
                id: ++id,
                name: OWN_NAMES[`${name} ${code}`] ?? `${name} ${code}`,
                type: "introcage",
                troopDoor: null,
                plateSlot: null,
                sleepingPerches: null,
                parentId: parent.id,
                // the same section as its enclosure
                section: parent.section,
                sortOrder: i + 1,
            });
        });
    });
    // The special enclosures and their cages (ids after the others, so
    // theirs stay the same)
    SPECIAL.forEach(([name, section, areas], i) => {
        const parent = { ...blank, id: ++id, name, type: "troop", parentId: null, section, sortOrder: 100 + i, special: true };
        list.push(parent);
        areas.forEach((area, j) => {
            list.push({
                ...blank,
                id: ++id,
                name: area,
                type: "introcage",
                troopDoor: null,
                plateSlot: null,
                sleepingPerches: null,
                parentId: parent.id,
                section,
                sortOrder: j + 1,
            });
        });
    });
    return list;
}

const enclosuresArr = build();
export default enclosuresArr;
