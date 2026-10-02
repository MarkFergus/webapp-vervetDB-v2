// A copy of the monkeys saved on this device, so the site still works with
// no signal. Updated every time the data loads from the database (and after
// each edit). Browser storage can be missing or full: then nothing is saved
// and the site falls back to the built-in copy, as before.

const KEY = "vervetdb-saved-data";

export function saveCopy({ monkeys, troops, troopIds }) {
    try {
        localStorage.setItem(KEY, JSON.stringify({ savedAt: Date.now(), monkeys, troops, troopIds }));
    } catch {
        // Not saved this time; the previous copy (if any) stays
    }
}

// The saved copy: { savedAt, monkeys, troops, troopIds }, or null if there isn't one
export function loadSavedCopy() {
    try {
        const copy = JSON.parse(localStorage.getItem(KEY));
        if (copy && Array.isArray(copy.monkeys) && Array.isArray(copy.troops) && copy.savedAt) {
            return copy;
        }
    } catch {
        // Unreadable: treat as no copy
    }
    return null;
}

// "just now", "5 minutes ago", "2 hours ago", "3 days ago"
export function timeAgo(time, now = Date.now()) {
    const minutes = Math.floor((now - time) / 60000);
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
    if (minutes < 1) return "just now";
    if (minutes < 60) return plural(minutes, "minute");
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return plural(hours, "hour");
    return plural(Math.floor(hours / 24), "day");
}
