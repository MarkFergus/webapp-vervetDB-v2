import { slug } from "./photoUpload";
import { homeName } from "./places";

// Links to one monkey, e.g. https://vervetdb.com/#monkey/aroha-h-b.
// Name + enclosure (its troop's, or the one its introcage is beside), as no
// two monkeys share both, and a move between a troop and its introcages
// keeps the same link.

const PREFIX = "#monkey/";

export function monkeyHash(monkey) {
    return `${PREFIX}${slug(monkey.name)}-${slug(homeName(monkey))}`;
}

// The full web address to share
export function monkeyUrl(monkey) {
    return `${window.location.origin}${window.location.pathname}${monkeyHash(monkey)}`;
}

export function isMonkeyHash(hash) {
    return hash.startsWith(PREFIX);
}

// The monkey a link points to, or null (e.g. renamed or deleted since)
export function monkeyFromHash(hash, monkeys) {
    if (!isMonkeyHash(hash)) return null;
    return monkeys.find((m) => monkeyHash(m) === hash) ?? null;
}
