// Where a monkey lives. Troop monkeys live in their troop's enclosure;
// introcage monkeys live in an introcage (e.g. "H&B C1") and belong to the
// enclosure, not the troop, so they have no troop.
//   monkey.troop      troop name, or null for introcage monkeys
//   monkey.introcage  introcage name, or null / missing for troop monkeys
//   monkey.enclosure  the troop enclosure it's in or beside (e.g. "H&B"),
//                     missing for the built-in copy and the Bandits

// "H&B C1" or "Goliath": what to show on cards, in lists and in searches
export function placeName(monkey) {
    return monkey.introcage || monkey.troop || "";
}

// Troops (and their enclosures and introcages) known by their initials,
// and their full names. The data keeps the initials ("H&B C1"); pages show
// the full names wherever there's room ("Holt & Barrington C1"; headings
// and cards through PlaceName.jsx, which keeps "Holt &" / "Barrington C1"
// together when it wraps). Where space is short (monkey cards and list
// rows) every one stays short, so they always match.
const FULL_NAMES = { "D&D": "Dino & Daniel", "H&B": "Holt & Barrington" };

// "H&B C1" → "Holt & Barrington C1", "D&D" → "Dino & Daniel"; any other
// name as it is
export function fullName(name) {
    const match = /^(D&D|H&B)( .*)?$/.exec(name ?? "");
    return match ? `${FULL_NAMES[match[1]]}${match[2] ?? ""}` : name;
}

// "Holt & Barrington C1" or "Goliath Troop" (Title Case, like other
// labels): for sharing, Save image and the Profile Book
export function placeLabel(monkey) {
    return monkey.introcage ? fullName(monkey.introcage) : `${fullName(monkey.troop)} Troop`;
}

// The troop enclosure a monkey is in or beside: "H&B" for both the H&B troop
// and the H&B introcages (the Bandits: their troop name)
export function homeName(monkey) {
    return monkey.enclosure || monkey.troop || "";
}

export const inIntrocage = (monkey) => Boolean(monkey.introcage);
