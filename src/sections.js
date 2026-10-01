// The sanctuary's sections and the troops in each. Used by the Filters
// panel's Location filter. A troop added later shows under "All" until it's
// put in a section here.
export const SECTIONS = [
    { id: "top", label: "Top", troops: ["Goliath", "Gismo", "D&D", "Royal"] },
    { id: "middle", label: "Middle", troops: ["Engeltjie", "Lankora", "Koko", "Camelot"] },
    { id: "bottom", label: "Bottom", troops: ["Skrow", "Robert", "Skunkey", "H&B", "Jalamango"] },
    { id: "sickbay", label: "Sickbay", troops: ["James", "Global"] },
];

// Is this troop in the section? ("all" = every troop)
export function inSection(troop, sectionId) {
    if (sectionId === "all") return true;
    return SECTIONS.find((s) => s.id === sectionId)?.troops.includes(troop) ?? false;
}
