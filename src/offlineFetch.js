// Every database request goes through here (supabase.js), so the whole app can
// read with no signal, or on wifi that's connected but going nowhere:
//   Reads: the database's answer, saved on the phone each time (signed-in
//     staff only; cleared on signing out). No connection, or no answer in a
//     few seconds: the saved answer, if there is one.
//   Writes: given up on after a while, rather than left hanging.
// The monkeys, troops and enclosures are left out: savedData.js keeps those,
// and the app needs to know when they're not live.

const CACHE = "vervetdb-records";
const LAST_CONTACT = "vervetdb-last-contact";
// (a saved answer, once the database has had this long)
const READ_WAIT_MS = 6000;
const WRITE_WAIT_MS = 30000;
const NOT_SAVED = /\/rest\/v1\/(monkeys|troops|enclosures)(\?|$)/;

const openCache = async () => {
    try {
        return (await globalThis.caches?.open(CACHE)) ?? null;
    } catch {
        return null;
    }
};

// When the database last answered this phone (ms), or null
export function lastContact() {
    try {
        return Number(localStorage.getItem(LAST_CONTACT)) || null;
    } catch {
        return null;
    }
}
function noteContact() {
    try {
        localStorage.setItem(LAST_CONTACT, String(Date.now()));
    } catch {
        // (no room, or not allowed)
    }
}

// Signing out: nothing of theirs stays on the phone
export async function clearSavedRecords() {
    try {
        await globalThis.caches?.delete(CACHE);
    } catch {
        // (not allowed)
    }
}

function write(input, init) {
    if (init.signal) return fetch(input, init);
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), WRITE_WAIT_MS);
    return fetch(input, { ...init, signal: stop.signal })
        .then((response) => {
            if (response.ok) noteContact();
            return response;
        })
        .finally(() => clearTimeout(timer));
}

export async function offlineFetch(input, init = {}) {
    const url = typeof input === "string" ? input : (input.url ?? String(input));
    if (!url.includes("/rest/v1/")) return fetch(input, init);
    const method = (init.method ?? "GET").toUpperCase();
    if (method === "HEAD") return fetch(input, init);
    if (method !== "GET") return write(input, init);
    if (NOT_SAVED.test(url)) return fetch(input, init);
    const cache = await openCache();
    if (!cache) return fetch(input, init);

    const headers = new Headers(init.headers);
    const bearer = headers.get("Authorization")?.replace(/^Bearer /, "");
    const signedIn = Boolean(bearer) && bearer !== headers.get("apikey");
    // (the same address can be asked for as a list or as one row)
    const key = `${url}${url.includes("?") ? "&" : "?"}__accept=${encodeURIComponent(headers.get("Accept") ?? "")}`;
    const saved = () => cache.match(key);

    if (navigator.onLine === false) {
        const hit = await saved();
        if (hit) return hit;
    }
    return new Promise((resolve, reject) => {
        let answered = false;
        const timer = setTimeout(async () => {
            const hit = await saved();
            if (hit && !answered) {
                answered = true;
                resolve(hit);
            }
        }, READ_WAIT_MS);
        const useSaved = async (otherwise) => {
            const hit = await saved();
            answered = true;
            clearTimeout(timer);
            otherwise(hit);
        };
        fetch(input, init).then(
            async (response) => {
                if (response.ok) {
                    noteContact();
                    if (signedIn) await cache.put(key, response.clone()).catch(() => {});
                }
                // (signed in but the sign-in can't renew, or the database's down)
                if (response.status === 401 || response.status >= 500) {
                    return useSaved((hit) => resolve(hit ?? response));
                }
                answered = true;
                clearTimeout(timer);
                resolve(response);
            },
            (error) => useSaved((hit) => (hit ? resolve(hit) : reject(error)))
        );
    });
}
