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
