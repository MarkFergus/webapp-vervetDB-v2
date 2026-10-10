// The built-in copy of the sections and enclosures: the same list
// supabase/enclosures.sql puts in the database. Used if the database can't
// be reached (or doesn't have enclosures yet), and by the tests. Ids here
// are only for the built-in copy; the database gives each its own.
//
// An enclosure, as the rest of the site uses it:
//   { id, name, type ("troop" | "block" | "care_unit", and inside them
//     "introcage" | "area": see enclosures.js), parentId (introcages and
//     areas), section (introcages and areas: their enclosure's),
//     established ("2014-03" or null), description, features, size (square
//     metres, or null), photos, sortOrder,
//     introcages and areas only: troopDoor, plateSlot (true / false / null
//     = not recorded), sleepingPerches (1–10 or null) }

// (Care Units: Baby Care, Quarantine and Sickbay Care Unit, where new
// arrivals go: supabase/enclosure-types.sql)
export const SECTION_NAMES = ["Top", "Middle", "Bottom", "Sickbay", "Care Units"];

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

// The enclosures without a troop (supabase/enclosure-types.sql), listed
// after the troop enclosures in their sections: the block with its
// introcages, and the care units with their areas (full names; Quarantine
// and Sickbay Care Unit are each one area, named the same as themselves)
const OTHERS = [
    ["Bachelor Block", "block", "Top", ["Bachelor Block A", "Bachelor Block B"]],
    ["Baby Care", "care_unit", "Care Units", ["Dreamland", "Neverland", "Disneyland"]],
    ["Quarantine", "care_unit", "Care Units", ["Quarantine"]],
    ["Sickbay Care Unit", "care_unit", "Care Units", ["Sickbay Care Unit"]],
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
    // The enclosures without a troop and what's inside them (ids after the
    // others, so theirs stay the same)
    OTHERS.forEach(([name, type, section, inside], i) => {
        const parent = { ...blank, id: ++id, name, type, parentId: null, section, sortOrder: 100 + i };
        list.push(parent);
        inside.forEach((area, j) => {
            list.push({
                ...blank,
                id: ++id,
                name: area,
                type: type === "care_unit" ? "area" : "introcage",
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
