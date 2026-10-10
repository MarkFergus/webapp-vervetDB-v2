// Feeding: what each introcage monkey gets (supabase/feeding.sql), and the
// AM Plates List worked out from it.
// A monkey's feeding (once the database has it):
//   { fedBy: "localTeam" | "sickbay", amPlates (1–2), amCutSmall, amFruit,
//     amMetalPlate, pmBowls (1–2), pmCutSmall }
// Only for monkeys in an introcage (not a troop, or a care unit's area).
import { ageInYears } from "./ages";
import { ordinal } from "./enclosures";

export const DEFAULT_FEEDING = {
    fedBy: "localTeam",
    amPlates: 1,
    amCutSmall: false,
    amFruit: false,
    amMetalPlate: false,
    pmBowls: 1,
    pmCutSmall: false,
};

// Does this monkey's feeding show (an introcage monkey, once the database
// has feeding)?
export const hasFeeding = (monkey) => Boolean(monkey.feeding) && monkey.introcageType === "introcage";

// Babies' plates are always cut small with fruit
export const isBaby = (monkey, today = new Date()) => ageInYears(monkey.year, today) === 0;

// The AM plate as it's made: a baby's always cut small + fruit
export function amPlate(monkey, today = new Date()) {
    const f = monkey.feeding;
    const baby = isBaby(monkey, today);
    return {
        plates: f.amPlates,
        cutSmall: f.amCutSmall || baby,
        fruit: f.amFruit || baby,
        metal: f.amMetalPlate,
    };
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

// "cut small + fruit", "cut small", "add fruit", or null
function extrasText(cutSmall, fruit) {
    if (cutSmall && fruit) return "cut small + fruit";
    if (cutSmall) return "cut small";
    if (fruit) return "add fruit";
    return null;
}

// "2 plates, cut small + fruit, metal plate"
export function amText(monkey, today = new Date()) {
    const p = amPlate(monkey, today);
    return [plural(p.plates, "plate"), extrasText(p.cutSmall, p.fruit), p.metal && "metal plate"]
        .filter(Boolean)
        .join(", ");
}

// "1 bowl, cut small"
export function pmText(monkey) {
    const f = monkey.feeding;
    return [plural(f.pmBowls, "bowl"), f.pmCutSmall && "cut small"].filter(Boolean).join(", ");
}

// ---- The AM Plates List ----

// The groups the plates are made in: mostly the sections, with a few
// introcages made with another group. note: what's listed under the
// group's name. Introcages are found by their enclosure, or by name in
// introcages (which comes first).
export const AM_GROUPS = [
    {
        title: "Top Section",
        note: "Goliath, D&D, Gismo, Royal, Bachelor Block",
        enclosures: ["Goliath", "D&D", "Gismo", "Royal", "Bachelor Block"],
    },
    {
        title: "Middle Section",
        note: "Koko, Lankora, Engeltjie, Camelot",
        enclosures: ["Koko", "Lankora", "Engeltjie", "Camelot"],
    },
    {
        title: "Bottom Section",
        note: "Skunkey, H&B, Robert, Skrow",
        enclosures: ["Skunkey", "H&B", "Robert", "Skrow"],
    },
    {
        title: "Sickbay Section + Calypso",
        note: "Global, James, Jalamango, Calypso's Corner, Engeltjie 1 & 1A",
        enclosures: ["Global", "James", "Jalamango"],
        introcages: ["Calypso's Corner A", "Calypso's Corner B", "Engeltjie 1", "Engeltjie 1A"],
    },
];

// Which group an introcage's plates are made with (or null)
export function groupOf(introcage, parent) {
    return (
        AM_GROUPS.find((g) => g.introcages?.includes(introcage.name)) ??
        AM_GROUPS.find((g) => g.enclosures.includes(parent?.name)) ??
        null
    );
}

// "Rocio", "Rocio & Nita", "Armies, Bainne & BeeBee"
export function namesText(names) {
    return names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} & ${names.at(-1)}`;
}

// "Calypso's Corner B" → "Calypso B" (as the plates board calls them)
const shortName = (name) => name.replace("Calypso's Corner", "Calypso");

// One introcage's line: "Ace/Clare x2 (cut small)", "Goliath B1 group x4",
// "Leelo/Leila x3 (1 cut small)". plates: [{ cutSmall, fruit, metal }],
// one per plate.
function rowText(introcage, monkeys, plates) {
    const label = monkeys.length <= 3 ? monkeys.map((m) => m.name).join("/") : `${shortName(introcage.name)} group`;
    const count = plates.length > 1 ? ` x${plates.length}` : "";
    const all = (n) => n === plates.length;
    const extras = [];
    for (const kind of ["cut small + fruit", "cut small", "add fruit"]) {
        const n = plates.filter((p) => extrasText(p.cutSmall, p.fruit) === kind).length;
        if (n) extras.push(all(n) ? kind : `${n} ${kind}`);
    }
    const metal = plates.filter((p) => p.metal).length;
    if (metal) extras.push(all(metal) ? (metal === 1 ? "metal plate" : "metal plates") : `${metal} on metal plates`);
    return `${label}${count}${extras.length ? ` (${extras.join(", ")})` : ""}`;
}

// The summary, group by group:
// [{ title, note, plates, cutSmall (how many of them, with or without
//    fruit), monkeys (the Local Team's: the plates are for),
//    counts: ["6 cut small", "5 on metal plates"], rows: ["Ace/Clare x2", …],
//    sickbay: "Roman & Queenie" or "" }]
// From every introcage monkey (enclosures: the site's list, for the
// introcages and their order).
export function amSummary(monkeys, enclosures, today = new Date()) {
    const byId = Object.fromEntries(enclosures.map((e) => [e.id, e]));
    // Introcages in the enclosures' order, then their own
    const inOrder = enclosures
        .filter((e) => e.type === "introcage")
        .sort((a, b) => {
            const pa = byId[a.parentId];
            const pb = byId[b.parentId];
            return (pa?.sortOrder ?? 0) - (pb?.sortOrder ?? 0) || (pa?.id ?? 0) - (pb?.id ?? 0) || a.sortOrder - b.sortOrder;
        });
    const fed = monkeys.filter(hasFeeding);
    return AM_GROUPS.map((group) => {
        const rows = [];
        const sickbay = [];
        const allPlates = [];
        let monkeyCount = 0;
        for (const introcage of inOrder) {
            if (groupOf(introcage, byId[introcage.parentId]) !== group) continue;
            const here = fed
                .filter((m) => m.introcage === introcage.name)
                .sort((a, b) => a.name.localeCompare(b.name));
            const local = here.filter((m) => m.feeding.fedBy !== "sickbay");
            sickbay.push(...here.filter((m) => m.feeding.fedBy === "sickbay").map((m) => m.name));
            if (!local.length) continue;
            monkeyCount += local.length;
            const plates = local.flatMap((m) => {
                const p = amPlate(m, today);
                return Array.from({ length: p.plates }, () => p);
            });
            allPlates.push(...plates);
            rows.push(rowText(introcage, local, plates));
        }
        const counts = [];
        for (const kind of ["cut small", "cut small + fruit", "add fruit"]) {
            const n = allPlates.filter((p) => extrasText(p.cutSmall, p.fruit) === kind).length;
            if (n) counts.push(`${n} ${kind}`);
        }
        const metal = allPlates.filter((p) => p.metal).length;
        if (metal) counts.push(`${metal} on metal plates`);
        return {
            title: group.title, note: group.note, plates: allPlates.length,
            cutSmall: allPlates.filter((p) => p.cutSmall).length, monkeys: monkeyCount, counts, rows,
            sickbay: namesText(sickbay),
        };
    });
}

// "10th Oct 2026" (the browser's own short months can be "Sept")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function summaryDate(date = new Date()) {
    return `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
