import { thumbUrl } from "./photoPaths";

// Saves every photo's thumbnail on the device (about 8 MB), so the cards
// work offline. The service worker keeps each one the first time it's
// fetched (see vite.config.js), so ones already saved cost nothing.
// Only runs where that works (an installed or service-worker-controlled
// site), and not on data-saver mode or very slow connections.
const AT_ONCE = 4;

export function canSavePhotos() {
    if (!navigator.serviceWorker?.controller) return false;
    const connection = navigator.connection;
    if (connection?.saveData) return false;
    if (["slow-2g", "2g"].includes(connection?.effectiveType)) return false;
    return true;
}

export async function saveThumbnails(monkeys) {
    if (!canSavePhotos()) return;
    const urls = [...new Set(monkeys.flatMap((m) => m.img).map(thumbUrl))];
    let next = 0;
    async function worker() {
        while (next < urls.length) {
            const url = urls[next++];
            try {
                await fetch(url, { mode: "cors" });
            } catch {
                // Offline or a hiccup: it'll be tried again next time
            }
        }
    }
    await Promise.all(Array.from({ length: AT_ONCE }, worker));
}

// ---- "Download all photos" (the Install & Use Offline pop-up) ----

// The service worker's stores (see vite.config.js)
const PHOTO_CACHE = "vervetdb-photos";
const THUMB_CACHE = "vervetdb-thumbnails";
// Typical sizes, for "about 45 MB" (measured October 2026)
const PHOTO_BYTES = 94 * 1024;
const THUMB_BYTES = 15 * 1024;
const STORED = "/storage/v1/object/public/monkey-photos/";

// Every real photo (not the "no photo yet" picture), once each
export function allPhotos(monkeys) {
    return [...new Set(monkeys.flatMap((m) => m.img))].filter((url) => url.includes(STORED));
}

// Whether photos can be saved here (a service worker is in charge of the page)
export function offlineSupported() {
    return Boolean(navigator.serviceWorker?.controller && window.caches);
}

async function savedIn(cacheName) {
    const cache = await caches.open(cacheName);
    return new Set((await cache.keys()).map((request) => request.url));
}

// What's saved on this device:
// { photos: { saved, total }, thumbs: { saved, total }, missing: [urls], bytesLeft }
export async function photoStatus(monkeys) {
    const photos = allPhotos(monkeys);
    const thumbs = photos.map(thumbUrl);
    const [savedPhotos, savedThumbs] = await Promise.all([savedIn(PHOTO_CACHE), savedIn(THUMB_CACHE)]);
    const missingPhotos = photos.filter((url) => !savedPhotos.has(url));
    const missingThumbs = thumbs.filter((url) => !savedThumbs.has(url));
    return {
        photos: { saved: photos.length - missingPhotos.length, total: photos.length },
        thumbs: { saved: thumbs.length - missingThumbs.length, total: thumbs.length },
        missing: [...missingThumbs, ...missingPhotos],
        bytesLeft: missingPhotos.length * PHOTO_BYTES + missingThumbs.length * THUMB_BYTES,
    };
}

// A rough size, so a big download doesn't come as a surprise:
// "50–60 MB", "about 8 MB", "under 1 MB"
export function aboutSize(bytes) {
    const mb = bytes / 1048576;
    if (mb < 1) return "under 1 MB";
    if (mb < 10) return `about ${Math.round(mb)} MB`;
    const from = Math.floor(mb / 10) * 10;
    return `${from}–${from + 10} MB`;
}

// Fetches each address (the service worker keeps it). A few at a time;
// "too many requests" or a dropped connection waits and tries again.
// onProgress(done, total, url, saved) after each one; stops early if `signal` is aborted.
// Returns how many couldn't be saved.
export async function downloadPhotos(urls, { onProgress, signal } = {}) {
    // Ask the browser to keep them even when the device is low on space
    navigator.storage?.persist?.().catch(() => {});
    let next = 0;
    let done = 0;
    let failed = 0;
    async function fetchOne(url) {
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await fetch(url, { mode: "cors", signal });
                if (response.ok) return true;
                if (response.status !== 429 && response.status < 500) return false;
            } catch (error) {
                if (signal?.aborted) throw error;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
        }
        return false;
    }
    async function worker() {
        while (next < urls.length && !signal?.aborted) {
            const url = urls[next++];
            let saved;
            try {
                saved = await fetchOne(url);
            } catch {
                return; // stopped
            }
            if (!saved) failed++;
            done++;
            onProgress?.(done, urls.length, url, saved);
        }
    }
    await Promise.all(Array.from({ length: 3 }, worker));
    return failed;
}
