// Feeding: what each introcage monkey gets (supabase/feeding.sql), and the
// AM Plates List worked out from it.
// A monkey's feeding (once the database has it):
//   { fedBy: "localTeam" | "sickbay", amPlates (1–2), amCutSmall, amFruit,
//     amMetalPlate, pmBowls (1–2) }
// Their PM bowl is cut small when their AM plate is (no setting of its own).
// Only for monkeys in an introcage (not a troop, or a care unit's area),
// living there or staying there for now (places.js).
import { ageInYears } from "./ages";
import { currentIntrocage } from "./places";
import { ordinal } from "./enclosures";

export const DEFAULT_FEEDING = {
    fedBy: "localTeam",
    amPlates: 1,
    amCutSmall: false,
    amFruit: false,
    amMetalPlate: false,
    pmBowls: 1,
};

// Does this monkey's feeding show (an introcage monkey, or a troop monkey
// staying in an introcage for now, once the database has feeding)?
export const hasFeeding = (monkey) =>
    Boolean(monkey.feeding) && (monkey.introcageType === "introcage" || Boolean(monkey.stay));

// Who feeds it right now: Sickbay while it's in Sickbay (whatever its Fed By
// says; that comes back into force when it returns), else its Fed By
export const fedBy = (monkey) => (monkey.inSickbay ? "sickbay" : monkey.feeding.fedBy);

export const isBaby = (monkey, today = new Date()) => ageInYears(monkey.year, today) === 0;

// A baby's feed is fixed, whatever is recorded: 1 AM plate, cut small + fruit,
// and 1 PM bowl, cut small (babies in a cage share one plate: see amSummary)
export const BABY_FEEDING = { amPlates: 1, amCutSmall: true, amFruit: true, pmBowls: 1 };

// Is there a baby in this introcage (fed here, not by Sickbay)? Everyone with
// them gets cut small + fruit, whatever's recorded, so their own settings come
// back once the baby's gone. exceptId: not counting this monkey.
export function cageHasBaby(introcage, monkeys, today = new Date(), exceptId = null) {
    if (!introcage) return false;
    return monkeys.some(
        (m) =>
            m.id !== exceptId &&
            hasFeeding(m) &&
            currentIntrocage(m) === introcage &&
            fedBy(m) !== "sickbay" &&
            isBaby(m, today)
    );
}

// What they really get: a baby's fixed feed; with a baby, cut small + fruit.
//   monkeys: everyone, to see who's in their cage
function feedingOf(monkey, today, monkeys) {
    if (isBaby(monkey, today)) return { ...monkey.feeding, ...BABY_FEEDING };
    return cageHasBaby(currentIntrocage(monkey), monkeys, today, monkey.id)
        ? { ...monkey.feeding, amCutSmall: true, amFruit: true }
        : monkey.feeding;
}

// The AM plate as it's made
export function amPlate(monkey, today = new Date(), monkeys = []) {
    const f = feedingOf(monkey, today, monkeys);
    return {
        plates: f.amPlates,
        cutSmall: f.amCutSmall,
        fruit: f.amFruit,
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
export function amText(monkey, today = new Date(), monkeys = []) {
    const p = amPlate(monkey, today, monkeys);
    return [plural(p.plates, "plate"), extrasText(p.cutSmall, p.fruit), p.metal && "metal plate"]
        .filter(Boolean)
        .join(", ");
}

// "1 bowl, cut small"
export function pmText(monkey, today = new Date(), monkeys = []) {
    const f = feedingOf(monkey, today, monkeys);
    return [plural(f.pmBowls, "bowl"), f.amCutSmall && "cut small"].filter(Boolean).join(", ");
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
function rowText(introcage, monkeys, plates, babyGroup = false) {
    const label = babyGroup
        ? `${shortName(introcage.name)} babies`
        : monkeys.length <= 3
          ? monkeys.map((m) => m.name).join("/")
          : `${shortName(introcage.name)} group`;
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

// Introcages in the enclosures' order, then their own
function introcagesInOrder(enclosures) {
    const byId = Object.fromEntries(enclosures.map((e) => [e.id, e]));
    return enclosures
        .filter((e) => e.type === "introcage")
        .sort((a, b) => {
            const pa = byId[a.parentId];
            const pb = byId[b.parentId];
            return (pa?.sortOrder ?? 0) - (pb?.sortOrder ?? 0) || (pa?.id ?? 0) - (pb?.id ?? 0) || a.sortOrder - b.sortOrder;
        });
}

// The summary, group by group:
// [{ title, note, plates, cutSmall (how many of them, with or without
//    fruit), monkeys (Mainfeed's: the plates are for),
//    counts: ["6 cut small", "5 on metal plates"], rows: ["Ace/Clare x2", …],
//    babyRows: ["Gismo A babies x3 (cut small + fruit)", …] (a cage with
//    babies: one plate for all its babies and one for each adult, all cut
//    small + fruit; each on a line of its own, after the rows),
//    sickbay: "Roman & Queenie" or "" }]
// From every introcage monkey (enclosures: the site's list, for the
// introcages and their order).
export function amSummary(monkeys, enclosures, today = new Date()) {
    return plateSummary(monkeys, enclosures, AM_GROUPS, (introcage, parent, group) => groupOf(introcage, parent) === group, today);
}

// The summary above, for any groups. inGroup(introcage, parent, group)
function plateSummary(monkeys, enclosures, groups, inGroup, today) {
    const byId = Object.fromEntries(enclosures.map((e) => [e.id, e]));
    const inOrder = introcagesInOrder(enclosures);
    const fed = monkeys.filter(hasFeeding);
    return groups.map((group) => {
        const rows = [];
        const babyRows = [];
        const sickbay = [];
        const allPlates = [];
        let monkeyCount = 0;
        for (const introcage of inOrder) {
            if (!inGroup(introcage, byId[introcage.parentId], group)) continue;
            // (who's in it now: a monkey staying elsewhere is fed there)
            const here = fed
                .filter((m) => currentIntrocage(m) === introcage.name)
                .sort((a, b) => a.name.localeCompare(b.name));
            const local = here.filter((m) => fedBy(m) !== "sickbay");
            sickbay.push(...here.filter((m) => fedBy(m) === "sickbay").map((m) => m.name));
            if (!local.length) continue;
            monkeyCount += local.length;
            const babies = local.filter((m) => isBaby(m, today));
            if (babies.length) {
                // A cage with babies: they share one plate, and each adult
                // has the plates they need (almost always 1), all cut small
                // + fruit (whatever their own setting, so the babies aren't
                // left with food too big); a metal plate still as set
                const adults = local.filter((m) => !babies.includes(m));
                const plate = (metal) => ({ cutSmall: true, fruit: true, metal });
                const plates = [
                    plate(babies.some((m) => m.feeding.amMetalPlate)),
                    ...adults.flatMap((m) => Array.from({ length: m.feeding.amPlates }, () => plate(m.feeding.amMetalPlate))),
                ];
                allPlates.push(...plates);
                babyRows.push(rowText(introcage, local, plates, true));
                continue;
            }
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
            cutSmall: allPlates.filter((p) => p.cutSmall).length, monkeys: monkeyCount, counts, rows, babyRows,
            sickbay: namesText(sickbay),
        };
    });
}

// A troop's feeding, in totals (the Monitoring Notes): the troop's PM bowls
// ("2 large, 3 medium", or null), then each of its enclosure's introcages
// with anyone in it fed by Mainfeed: its AM plates (worked out as on the AM
// Plates List: babies share one) and PM bowls.
//   → { troopBowls, introcages: [{ name, plates, bowls }] }, or null (no
//   such troop enclosure)
export function troopFeeding(troopName, monkeys, enclosures, today = new Date()) {
    const enclosure = enclosures.find((e) => e.name === troopName && e.type === "troop");
    if (!enclosure) return null;
    const introcages = introcagesInOrder(enclosures).filter((e) => e.parentId === enclosure.id);
    const plates = plateSummary(monkeys, enclosures, introcages, (introcage, parent, group) => introcage.id === group.id, today);
    const fed = monkeys.filter(hasFeeding);
    return {
        troopBowls: bowlsText(enclosure.bowls),
        introcages: introcages
            .map((introcage, i) => {
                const local = fed.filter((m) => currentIntrocage(m) === introcage.name && fedBy(m) !== "sickbay");
                const bowls = local.reduce((n, m) => n + feedingOf(m, today, monkeys).pmBowls, 0);
                return { name: introcage.name, plates: plates[i].plates, bowls };
            })
            .filter((c) => c.plates || c.bowls),
    };
}

// The sections, as everywhere but the AM Plates List (its groups follow how the
// plates are delivered). Not the care units: they make their own food.
const FEEDING_SECTIONS = ["Top", "Middle", "Bottom", "Sickbay"].map((section) => ({ section, title: `${section} Section` }));

// The Feeding page (FeedingRecordsPage.jsx): every monkey with feeding, by
// section, and each section's plates, worked out as on the list:
// [{ title, plates, counts, places: [{ id, name, babies (the cage's babies
//    share a plate), monkeys: [{ monkey, sickbay, am, pm }] }] }]
// show: "all", "localTeam" or "sickbay" (places and sections left empty go)
export function feedingList(monkeys, enclosures, show = "all", today = new Date()) {
    const byId = Object.fromEntries(enclosures.map((e) => [e.id, e]));
    const inSection = (introcage, parent, group) => parent?.section === group.section;
    const fed = monkeys.filter(hasFeeding);
    const summary = plateSummary(monkeys, enclosures, FEEDING_SECTIONS, inSection, today);
    const inOrder = introcagesInOrder(enclosures);
    return FEEDING_SECTIONS.map((group, i) => {
        const places = [];
        for (const introcage of inOrder) {
            if (!inSection(introcage, byId[introcage.parentId], group)) continue;
            const here = fed
                .filter((m) => currentIntrocage(m) === introcage.name)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((monkey) => ({
                    monkey,
                    sickbay: fedBy(monkey) === "sickbay",
                    am: amText(monkey, today, fed),
                    pm: pmText(monkey, today, fed),
                }));
            const shown = here.filter((row) => show === "all" || row.sickbay === (show === "sickbay"));
            if (!shown.length) continue;
            places.push({
                id: introcage.id,
                name: introcage.name,
                babies: here.some((row) => !row.sickbay && isBaby(row.monkey, today)),
                monkeys: shown,
            });
        }
        return { title: group.title, plates: summary[i].plates, counts: summary[i].counts, places };
    }).filter((group) => group.places.length);
}

// A troop's PM bowls, the one feed they get: "2 small, 2 medium", or null if
// none are entered. bowls: { small, medium, large }
export const BOWL_SIZES = ["small", "medium", "large"];
export function bowlsText(bowls) {
    const sizes = BOWL_SIZES.filter((size) => bowls?.[size] > 0).map((size) => `${bowls[size]} ${size}`);
    return sizes.length ? sizes.join(", ") : null;
}

// Troop PM Bowls on the Feeding page: the troops by section (not the Bandits:
// a wild troop, not fed), in their own order
export function troopBowlsList(enclosures) {
    const rank = (troop) => FEEDING_SECTIONS.findIndex((g) => g.section === troop.section);
    return enclosures
        .filter((e) => e.type === "troop" && rank(e) !== -1)
        .sort((a, b) => rank(a) - rank(b) || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

// "10th Oct 2026" (the browser's own short months can be "Sept")
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function summaryDate(date = new Date()) {
    return `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}
