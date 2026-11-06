// The outbox: entries made on this phone wait here until they reach the
// database, in the order they were made, so they survive no signal, a closed
// app or a flat battery. Kept in the phone's storage, under whoever made them,
// and only sent while that person's signed in.
//
// Each entry: { id, kind, payload, optimistic, userId, status, problem, at }
//   status   waiting; problem (the database refused it: nothing more is tried
//            until someone says); sent (kept a day, so a saved answer from
//            before it was sent doesn't hide it: see monkeyData's overlays)
//   payload.localId   the id it goes by on this phone until it has a real one;
//            later entries can refer to it (a session's injury)
import { supabase } from "./supabase";

const ENTRIES = "vervetdb-outbox";
const IDS = "vervetdb-outbox-ids";
const ME = "vervetdb-outbox-me";
const SENT_KEPT_MS = 24 * 3600000;
// Saving with poor signal: how long a form waits for the database before
// saying it's kept on the phone (the entry carries on trying)
const FORM_WAIT_MS = 5000;

const read = (key, otherwise) => {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? otherwise;
    } catch {
        return otherwise;
    }
};
const store = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
};

const listeners = new Set();
const announce = () => listeners.forEach((listener) => listener());
// A change to the outbox: listener(); returns how to stop listening
export function subscribeOutbox(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}-4000-8000-000000000000`;
export const newRef = makeId;
export const newLocalId = () => `local-${makeId()}`;
export const isLocalId = (id) => typeof id === "string" && id.startsWith("local-");

// A local id → its real one (once sent); anything else as it is
export const resolveId = (id) => (isLocalId(id) ? (read(IDS, {})[id] ?? id) : id);
// A real id → the local id it went by here, if it did
export function displayId(id) {
    const ids = read(IDS, {});
    const found = Object.keys(ids).find((local) => ids[local] === id);
    return found ?? id;
}

// Who's signed in, kept for when there's no signal: { id, name } or null
export function setOutboxUser(user) {
    try {
        store(ME, user);
    } catch {
        // (no room, or not allowed)
    }
}
export const outboxUser = () => read(ME, null);

// This person's entries (of one kind, or all), oldest first
export function outboxEntries(kind = null) {
    const me = outboxUser()?.id;
    return read(ENTRIES, []).filter((e) => e.userId === me && (!kind || e.kind === kind));
}
export const waitingCount = () => outboxEntries().filter((e) => e.status === "waiting").length;
export const outboxProblems = () => outboxEntries().filter((e) => e.status === "problem");

const change = (fn) => {
    store(ENTRIES, fn(read(ENTRIES, [])));
    announce();
};
export const dropEntries = (test) => change((list) => list.filter((e) => !test(e)));
// Changes waiting entries in place (fn(entry) → the entry)
export const editEntries = (fn) => change((list) => list.map(fn));

// A refused entry, tried once more
export function retryEntry(id) {
    change((list) => list.map((e) => (e.id === id ? { ...e, status: "waiting", problem: null } : e)));
    return flushOutbox();
}
export const discardEntry = (id) => dropEntries((e) => e.id === id);

const senders = {};
// How one kind of entry reaches the database:
//   send(payload) async → the saved row, throwing the database's error
//   describe(error) → the message to show if it's refused
export function registerSender(kind, send, describe = (error) => error.message) {
    senders[kind] = { send, describe };
}

// The database said no, and would again. Anything else (no signal, a sign-in
// that needs renewing, a database not ready yet) is tried again later, so
// nothing's lost.
const isRefusal = (error) => /^(22|23|P0)/.test(error?.code ?? "") || error?.code === "42501" || error?.code === "PGRST116";

// What's happened to entries while their form waited: id → { result } or { error }
const settled = new Map();

async function sendWaiting() {
    const { data, error: sessionError } = await supabase.auth.getSession();
    const user = data?.session?.user;
    if (sessionError || !user) return;
    for (;;) {
        // (afresh each time: another tab may have added or sent some)
        const entry = read(ENTRIES, []).find((e) => e.userId === user.id && e.status === "waiting");
        if (!entry) break;
        const sender = senders[entry.kind];
        if (!sender) break;
        // (it belongs to one that didn't get through: that comes first)
        const blocked = (entry.needs ?? []).some((local) => isLocalId(resolveId(local)));
        if (blocked) {
            setStatus(entry.id, "problem", "The entry this belongs to hasn't been sent.");
            continue;
        }
        try {
            const row = await sender.send(entry.payload);
            if (entry.payload?.localId && row?.id != null) {
                store(IDS, { ...read(IDS, {}), [entry.payload.localId]: row.id });
            }
            settled.set(entry.id, { result: row });
            setStatus(entry.id, "sent");
        } catch (error) {
            if (!isRefusal(error)) {
                console.warn("Outbox: will try again later:", error);
                break;
            }
            const message = sender.describe(error);
            settled.set(entry.id, { error: new Error(message) });
            setStatus(entry.id, "problem", message);
        }
    }
    // (sent ones have had their day)
    const now = Date.now();
    const list = read(ENTRIES, []);
    const kept = list.filter((e) => e.status !== "sent" || now - (e.sentAt ?? 0) < SENT_KEPT_MS);
    if (kept.length !== list.length) store(ENTRIES, kept);
}

function setStatus(id, status, problem = null) {
    change((list) =>
        list.map((e) => (e.id === id ? { ...e, status, problem, ...(status === "sent" && { sentAt: Date.now() }) } : e))
    );
}

// One at a time (and one tab at a time, where the phone can say so)
let running = Promise.resolve();
export function flushOutbox() {
    const once = () => (navigator.locks ? navigator.locks.request("vervetdb-outbox", sendWaiting) : sendWaiting());
    running = running.then(once).catch((error) => console.warn("Outbox: couldn't send:", error));
    return running;
}

// Saves an entry: on the phone first, then straight on to the database if it
// can. → { result, sent }: what the database saved, or (no signal yet) what
// it will be. Refused while the person's here to see it: taken back, and
// thrown as the message to show.
//   options.needs: local ids this entry refers to
export async function submit(kind, payload, optimistic, { needs = [] } = {}) {
    const entry = {
        id: makeId(),
        kind,
        payload,
        optimistic,
        needs: needs.filter(isLocalId),
        userId: outboxUser()?.id ?? null,
        status: "waiting",
        problem: null,
        at: Date.now(),
    };
    change((list) => [...list, entry]);
    if (navigator.onLine !== false) {
        await Promise.race([flushOutbox(), new Promise((resolve) => setTimeout(resolve, FORM_WAIT_MS))]);
        const outcome = settled.get(entry.id);
        settled.delete(entry.id);
        if (outcome?.error) {
            dropEntries((e) => e.id === entry.id);
            throw outcome.error;
        }
        if (outcome) return { result: outcome.result, sent: true };
    }
    return { result: optimistic, sent: false };
}

// Signed out and back in as someone else: their ids aren't kept, but entries
// are, under the person who made them. (Tests)
export function resetOutbox() {
    try {
        localStorage.removeItem(ENTRIES);
        localStorage.removeItem(IDS);
        localStorage.removeItem(ME);
    } catch {
        // (not allowed)
    }
    settled.clear();
    running = Promise.resolve();
}
