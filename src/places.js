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

// "H&B C1" or "Goliath Troop" (Title Case, like other labels): for the
// pop-up's pills, sharing, Save image and the Profile Book
export function placeLabel(monkey) {
    return monkey.introcage || `${monkey.troop} Troop`;
}

// The troop enclosure a monkey is in or beside: "H&B" for both the H&B troop
// and the H&B introcages (the Bandits: their troop name)
export function homeName(monkey) {
    return monkey.enclosure || monkey.troop || "";
}

export const inIntrocage = (monkey) => Boolean(monkey.introcage);
