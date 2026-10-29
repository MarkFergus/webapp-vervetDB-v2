import { currentBabySeason } from "./ages";
import { SICKBAY_UNIT } from "./enclosures";
import { homeName } from "./places";

// The sanctuary's sections and the troops in each, and the enclosures
// without a troop (Bachelor Block, and the care units: their monkeys are in
// their introcages / areas).
// Used by the Filters panel's Location filter. A troop added later shows
// under "All Sections" until it's put in a section here.
//   chip: how a chosen section reads in the filter chips under the toolbar
export const SECTIONS = [
    { id: "top", label: "Top", chip: "Top section", troops: ["Goliath", "Gismo", "D&D", "Royal", "Bachelor Block"] },
    { id: "middle", label: "Middle", chip: "Middle section", troops: ["Engeltjie", "Lankora", "Koko", "Camelot"] },
    {
        id: "bottom",
        label: "Bottom",
        chip: "Bottom section",
        troops: ["Skrow", "Robert", "Skunkey", "H&B", "Jalamango"],
    },
    { id: "sickbay", label: "Sickbay", chip: "Sickbay section", troops: ["James", "Global"] },
    // The care units, where new arrivals go (choosing any other section
    // leaves their monkeys out)
    {
        id: "careUnits",
        label: "Care Units",
        chip: "Care Units",
        troops: ["Baby Care", "Quarantine", "Sickbay"],
    },
    // The wild troop at the sanctuary: not in a section, so a "section" of its own
    { id: "bandits", label: "Bandits", chip: "Bandits", troops: ["Bandits"] },
];

// Is this troop in any of the chosen sections? (none chosen = every troop)
//   sectionIds: e.g. ["top", "sickbay"], or [] for all
export function inSection(troop, sectionIds) {
    if (!sectionIds.length) return true;
    return SECTIONS.some((s) => sectionIds.includes(s.id) && s.troops.includes(troop));
}

// The Filters panel's Quick Filters: the views staff use most. Several can
// be on at once (showing the monkeys in any of them; none on = everyone).
//   section: a section's id (its troops' enclosures; also narrows the
//            Enclosures box); otherwise test(monkey, today, favourites) decides
// (The care units are only here, not in the Enclosures box.)
//   label(today): the button and its chip under the toolbar
export const QUICK_FILTERS = [
    { id: "top", section: "top", label: () => "Top Section" },
    { id: "middle", section: "middle", label: () => "Middle Section" },
    { id: "bottom", section: "bottom", label: () => "Bottom Section" },
    { id: "sickbay", section: "sickbay", label: () => "Sickbay Section" },
    // (the wild troop: not in the Enclosures box, this is the way to them)
    { id: "bandits", section: "bandits", label: () => "Bandits" },
    { id: "babyCare", label: () => "Baby Care", test: (m) => homeName(m) === "Baby Care" },
    // (with the monkeys in Sickbay for now, as on its page)
    { id: "sickbayCare", label: () => "Sickbay", test: (m) => homeName(m) === SICKBAY_UNIT || Boolean(m.inSickbay) },
    // The ★ ones (favourites.js: a Set of their ids)
    { id: "favourites", label: () => "Favourites", test: (m, today, favourites) => Boolean(favourites?.has(m.id)) },
    // This season's sanctuary babies (born this baby season or since: the
    // year changes on 1 October), not the Bandits' wild-born babies
    {
        id: "babies",
        label: (today = new Date()) => `Babies ${currentBabySeason(today)}`,
        test: (m, today = new Date()) =>
            Boolean(m.year) && Number(m.year) >= currentBabySeason(today) && m.troop !== "Bandits",
    },
];

// Is this monkey in any of the chosen Quick Filters? ([] = every monkey)
//   favourites: a Set of the ★ monkeys' ids
export function inQuickFilters(monkey, ids, today = new Date(), favourites = new Set()) {
    if (!ids.length) return true;
    return QUICK_FILTERS.some(
        (q) =>
            ids.includes(q.id) &&
            (q.section ? inSection(homeName(monkey), [q.section]) : q.test(monkey, today, favourites))
    );
}

// The sections among the chosen Quick Filters (for the Enclosures box)
export const quickSections = (ids) => QUICK_FILTERS.filter((q) => q.section && ids.includes(q.id)).map((q) => q.section);
