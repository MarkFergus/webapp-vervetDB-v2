import { useEffect, useRef, useState } from "react";
import { BUILT_IN_DATA, loadMonkeyData } from "./monkeyData";
import { loadSavedCopy, saveCopy } from "./savedData";

// Loads the monkeys and troops once, when the site opens.
// status: "loading" → "live" (from the database). If the database can't be
// reached: "saved" (the copy saved on this device last time, with savedAt;
// waiting: true while the database is only being slow, see fallbackData),
// or "built-in" if there's no saved copy (the copy built into the site).
// With no connection at all, the saved copy shows straight away.
// When the connection comes back, it tries the database again.
// monkeySaved / monkeyDeleted update the list after an edit, without
// reloading everything.
const SAVED_COPY_AFTER_MS = 4000;
const RETRY_EVERY_MS = 60000;
//   waiting: the database is still loading (just slow, e.g. a phone woken
//   after a while: its sign-in renewed first), so "Loading…" rather than
//   "Couldn't reach the database"
function fallbackData(waiting = false) {
    const saved = loadSavedCopy();
    // (a copy saved before enclosures existed: the built-in ones)
    return saved
        ? { status: "saved", ...BUILT_IN_DATA, ...saved, savedAt: saved.savedAt, waiting }
        : { status: "built-in", ...BUILT_IN_DATA };
}

export default function useMonkeyData() {
    const [data, setData] = useState(() =>
        navigator.onLine === false ? fallbackData() : { status: "loading", ...BUILT_IN_DATA }
    );
    // The status, for the "back online" listener (which is set up once)
    const status = useRef(data.status);
    status.current = data.status;

    useEffect(() => {
        let cancelled = false;
        // (one load at a time)
        let loading = false;
        function load() {
            if (loading) return;
            loading = true;
            loadMonkeyData()
                .finally(() => {
                    loading = false;
                })
                .then((live) => {
                    if (!cancelled) setData({ status: "live", ...live });
                })
                .catch((error) => {
                    console.error("Couldn't load monkeys from the database:", error);
                    // Keep what's showing if it's already a fallback (no
                    // longer just loading: it couldn't be reached)
                    if (!cancelled) setData((d) => (d.status === "loading" ? fallbackData() : { ...d, waiting: false }));
                });
        }
        if (navigator.onLine !== false) load();
        // Wifi that's connected but going nowhere: what's on this phone before
        // long, rather than a loading screen (the database can still catch up)
        const waited = setTimeout(() => {
            if (!cancelled && loadSavedCopy()) setData((d) => (d.status === "loading" ? fallbackData(true) : d));
        }, SAVED_COPY_AFTER_MS);

        // Back online: try the database again, unless it's already live
        function retry() {
            if (status.current !== "live") load();
        }
        window.addEventListener("online", retry);
        // (coming back to the app, e.g. the phone woken: straight away, not up
        // to a minute later)
        const returned = () => {
            if (document.visibilityState === "visible" && navigator.onLine !== false) retry();
        };
        document.addEventListener("visibilitychange", returned);
        // (and now and then: phones don't always know when signal's back)
        const again = setInterval(() => {
            if (navigator.onLine !== false) retry();
        }, RETRY_EVERY_MS);
        return () => {
            cancelled = true;
            clearTimeout(waited);
            clearInterval(again);
            window.removeEventListener("online", retry);
            document.removeEventListener("visibilitychange", returned);
        };
    }, []);

    // Every live load or edit refreshes the copy saved on this device
    useEffect(() => {
        if (data.status === "live") saveCopy(data);
    }, [data]);

    // A monkey was changed (replaced in place) or added (on the end)
    function monkeySaved(saved) {
        setData((d) => {
            const exists = d.monkeys.some((m) => m.id === saved.id);
            return {
                ...d,
                monkeys: exists
                    ? d.monkeys.map((m) => (m.id === saved.id ? saved : m))
                    : [...d.monkeys, saved],
            };
        });
    }

    // An enclosure's details were saved (replaced in place)
    function enclosureSaved(saved) {
        setData((d) => ({ ...d, enclosures: d.enclosures.map((e) => (e.id === saved.id ? saved : e)) }));
    }

    function monkeyDeleted(id) {
        setData((d) => ({ ...d, monkeys: d.monkeys.filter((m) => m.id !== id) }));
    }

    return { ...data, monkeySaved, monkeyDeleted, enclosureSaved };
}
