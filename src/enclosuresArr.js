// The built-in copy of the sections and enclosures: the same list
// supabase/enclosures.sql puts in the database. Used if the database can't
// be reached (or doesn't have enclosures yet), and by the tests. Ids here
// are only for the built-in copy; the database gives each its own.
//
// An enclosure, as the rest of the site uses it:
//   { id, name, type: "troop" | "introcage", parentId (introcages),
//     section (introcages: their enclosure's), established ("2014-03" or null),
//     description, features, size (square metres, or null), photos, sortOrder }

export const SECTION_NAMES = ["Top", "Middle", "Bottom", "Sickbay"];

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

const blank = { established: null, description: "", features: "", size: null, photos: [] };

function build() {
    const list = [];
    let id = 0;
    LAYOUT.forEach(([name, section], i) => {
        list.push({ ...blank, id: ++id, name, type: "troop", parentId: null, section, sortOrder: i + 1 });
    });
    LAYOUT.forEach(([name, , codes]) => {
        const parent = list.find((e) => e.name === name);
        codes.forEach((code, i) => {
            list.push({
                ...blank,
                id: ++id,
                name: `${name} ${code}`,
                type: "introcage",
                parentId: parent.id,
                // the same section as its enclosure
                section: parent.section,
                sortOrder: i + 1,
            });
        });
    });
    return list;
}

const enclosuresArr = build();
export default enclosuresArr;
