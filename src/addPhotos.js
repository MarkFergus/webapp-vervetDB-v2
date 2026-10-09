// Add Photos (QuickPhotos.jsx): photos already taken, chosen from the
// phone's gallery (or a computer's files), matched to their monkeys and
// uploaded together. This is the working-out, kept apart so it's easy to test.
import { isPlaceholderPhoto } from "./photoPaths";
import { MAX_PHOTOS } from "./monkeyFormChecks";
import { PHOTO_ASPECT } from "./photoUpload";
import { fullName, placeName } from "./places";

// A monkey's real photos (the grey "no photo yet" picture doesn't count)
export const realPhotos = (monkey) => monkey.img.filter((url) => !isPlaceholderPhoto(url));

// The middle of a photo in the site's 5:4 shape, for a photo that isn't
// cropped by hand: { x, y, width, height } in the photo's own pixels
export function centreCrop(width, height) {
    if (width / height > PHOTO_ASPECT) {
        const cropWidth = Math.round(height * PHOTO_ASPECT);
        return { x: Math.round((width - cropWidth) / 2), y: 0, width: cropWidth, height };
    }
    const cropHeight = Math.round(width / PHOTO_ASPECT);
    return { x: 0, y: Math.round((height - cropHeight) / 2), width, height: cropHeight };
}

// Monkeys matching a search: by name, or by chip number (digits)
export function searchMonkeys(monkeys, query, limit = 30) {
    const text = query.trim().toLowerCase();
    if (!text) return [];
    const byChip = /^\d+$/.test(text);
    return monkeys
        .filter((m) => (byChip ? String(m.chip ?? "").includes(text) : m.name.toLowerCase().includes(text)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, limit);
}

// The suggestions under "Who is this?", in groups, so the right monkey is
// usually one tap away. Each monkey shows once, in its first group.
//   previous: the monkey chosen for the photo before this one
//   current:  the monkey whose pop-up Add Photos was opened from
//   place:    the enclosure / introcage page it was opened on: { name, monkeys }
//   recent:   monkeys opened lately, newest first
// → [{ title, monkeys }] (empty groups left out)
export function photoSuggestions(monkeys, { previous = null, current = null, place = null, recent = [] } = {}) {
    const seen = new Set();
    const group = (title, list) => {
        const fresh = list.filter((m) => m && !seen.has(m.id));
        fresh.forEach((m) => seen.add(m.id));
        return { title, monkeys: fresh };
    };
    const needed = monkeys.filter((m) => realPhotos(m).length === 0).sort((a, b) => a.name.localeCompare(b.name));
    return [
        group("Same as the photo before", [previous]),
        group("Opened", [current]),
        group(place ? `At ${fullName(place.name)}` : "", place?.monkeys ?? []),
        group("Recently opened", recent.slice(0, 6)),
        group("Photo Needed", needed),
    ].filter((g) => g.monkeys.length > 0);
}

// "Holt & Barrington C1", "Goliath": where a monkey lives, for the lists
export const placeText = (monkey) => fullName(placeName(monkey));

// The photos chosen, matched up: for each monkey, how many new photos fit
// (up to MAX_PHOTOS) and which photos need one of its photos replaced.
//   items: [{ key, monkeyId, replace (an existing photo's address, or null) }]
// → { [key]: { full (needs a photo to replace), choices (its photos not
//   picked by another of the new photos) } }
export function photoSlots(items, monkeysById) {
    const result = {};
    const byMonkey = {};
    for (const item of items) {
        if (item.monkeyId == null) continue;
        (byMonkey[item.monkeyId] ??= []).push(item);
    }
    for (const [id, list] of Object.entries(byMonkey)) {
        const existing = realPhotos(monkeysById[id]);
        const free = Math.max(0, MAX_PHOTOS - existing.length);
        list.forEach((item, i) => {
            const full = i >= free;
            const takenByOthers = new Set(list.filter((other) => other !== item && other.replace).map((o) => o.replace));
            result[item.key] = { full, choices: full ? existing.filter((url) => !takenByOthers.has(url)) : [] };
        });
    }
    return result;
}

// Is everything ready to upload? Every photo has its monkey, and every one
// that doesn't fit has a photo to replace.
export function readyToUpload(items, slots) {
    return (
        items.length > 0 &&
        items.every((item) => item.monkeyId != null && (!slots[item.key]?.full || Boolean(item.replace)))
    );
}

// A monkey's photos after the new ones: replaced ones swapped in place, the
// rest added at the end. With no real photos before, the first new one is
// the primary photo.
//   added: [{ url, replace }]
export function photosAfter(monkey, added) {
    const photos = [...realPhotos(monkey)];
    for (const { url, replace } of added) {
        const at = replace ? photos.indexOf(replace) : -1;
        if (at >= 0) photos[at] = url;
        else photos.push(url);
    }
    return photos;
}
