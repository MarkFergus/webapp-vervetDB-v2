// The sanctuary's sections and the troops in each. Used by the Filters
// panel's Location filter. A troop added later shows under "All Sections"
// until it's put in a section here.
//   chip: how a chosen section reads in the filter chips under the toolbar
export const SECTIONS = [
    { id: "top", label: "Top", chip: "Top section", troops: ["Goliath", "Gismo", "D&D", "Royal"] },
    { id: "middle", label: "Middle", chip: "Middle section", troops: ["Engeltjie", "Lankora", "Koko", "Camelot"] },
    {
        id: "bottom",
        label: "Bottom",
        chip: "Bottom section",
        troops: ["Skrow", "Robert", "Skunkey", "H&B", "Jalamango"],
    },
    { id: "sickbay", label: "Sickbay", chip: "Sickbay section", troops: ["James", "Global"] },
    // The wild troop at the sanctuary: not in a section, so a "section" of its own
    { id: "bandits", label: "Bandits", chip: "Bandits", troops: ["Bandits"] },
];

// Is this troop in any of the chosen sections? (none chosen = every troop)
//   sectionIds: e.g. ["top", "sickbay"], or [] for all
export function inSection(troop, sectionIds) {
    if (!sectionIds.length) return true;
    return SECTIONS.some((s) => sectionIds.includes(s.id) && s.troops.includes(troop));
}
