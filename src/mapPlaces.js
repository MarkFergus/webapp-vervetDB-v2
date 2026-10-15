// The Interactive Map's places: which enclosure, introcage or area a shape on
// the map is, and what its card shows when it's tapped (WholeMap.jsx).
import { mapLabel } from "./SanctuaryMap";
import { fullName } from "./places";
import { isPlaceholderPhoto } from "./photoPaths";
import {
    TYPE_NAMES,
    hasTroop,
    introcageMonkeys,
    isInside,
    isSoleArea,
    residents,
    troopMonkeys,
} from "./enclosures";

// Map label → place. Introcages and areas are labelled with their own names
// (their gate boxes, or a shape of their own: Koko D, Bachelor Block A,
// Dreamland); enclosures as on their pages ("Goliath troop", "Bachelor
// block"). A one-area care unit's area has the unit's name: the unit wins.
export function placesByLabel(enclosures) {
    const byLabel = new Map();
    for (const place of enclosures) {
        if (isInside(place) && !isSoleArea(place, enclosures)) byLabel.set(place.name, place);
    }
    for (const place of enclosures) {
        if (!isInside(place)) byLabel.set(mapLabel(place.name), place);
    }
    return byLabel;
}

// The monkeys living in a place: an introcage's or area's residents; a troop
// enclosure's troop; a block's or care unit's, those in its introcages / areas
export function monkeysIn(place, monkeys) {
    if (isInside(place)) return residents(place, monkeys);
    return hasTroop(place) ? troopMonkeys(place, monkeys) : introcageMonkeys(place, monkeys);
}

// What a place's card shows: { photo (or null), name, kind ("Introcage at
// Goliath", "Troop Enclosure"), count (how many monkeys) }. The photo: the
// place's own, or else one of its monkeys'.
export function placeCard(place, enclosures, monkeys) {
    const living = monkeysIn(place, monkeys);
    const parent = isInside(place) ? enclosures.find((e) => e.id === place.parentId) : null;
    const monkeyPhoto = living.map((m) => m.img?.[0]).find((url) => url && !isPlaceholderPhoto(url));
    return {
        photo: place.photos?.[0] ?? monkeyPhoto ?? null,
        name: place.name,
        kind: parent ? `${TYPE_NAMES[place.type]} at ${fullName(parent.name)}` : TYPE_NAMES[place.type],
        count: living.length,
    };
}
