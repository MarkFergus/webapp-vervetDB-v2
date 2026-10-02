// Where monkey photos and their thumbnails are stored in the "monkey-photos"
// bucket. No imports, so scripts/move-photos.mjs (run by Node) can use it too.

// Small copies of every photo for the cards (and for offline use), saved
// under thumbs/ with the same name, always WebP:
//   goliath/maggie-mae-1759240000000.jpg → thumbs/goliath/maggie-mae-1759240000000.webp
export const THUMB_WIDTH = 480;
export const THUMB_HEIGHT = 384;
export const THUMB_QUALITY = 0.75;

// "Maggie Mae" → "maggie-mae", "D&D" → "d-d"
export function slug(text) {
    const s = text
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return s || "monkey";
}

// Where a photo is stored, e.g. "goliath/maggie-mae-1759240000000.webp"
export function photoPath(troop, name, extension, time = Date.now()) {
    return `${slug(troop || "unsorted")}/${slug(name)}-${time}.${extension}`;
}

// Where a photo's thumbnail is stored
export function thumbPath(path) {
    return `thumbs/${path.replace(/\.[a-z0-9]+$/i, "")}.webp`;
}
