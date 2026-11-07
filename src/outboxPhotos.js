// Photos waiting to send (the outbox's entries only hold words): kept in the
// phone's database, which has room for them. Where there's no such thing:
// in memory, until the app closes.
const DB = "vervetdb-outbox-photos";
const STORE = "photos";
const inMemory = new Map();

function open() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
async function run(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}
const usable = () => typeof indexedDB !== "undefined";

export const keepPhoto = (path, blob) => (usable() ? run("readwrite", (s) => s.put(blob, path)) : Promise.resolve(inMemory.set(path, blob)));
export const keptPhoto = (path) => (usable() ? run("readonly", (s) => s.get(path)) : Promise.resolve(inMemory.get(path)));
export const forgetPhoto = (path) => (usable() ? run("readwrite", (s) => s.delete(path)) : Promise.resolve(inMemory.delete(path)));
