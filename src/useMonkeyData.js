import { useEffect, useRef, useState } from "react";
import { BUILT_IN_DATA, loadMonkeyData } from "./monkeyData";
import { loadSavedCopy, saveCopy } from "./savedData";

// Loads the monkeys and troops once, when the site opens.
// status: "loading" → "live" (from the database). If the database can't be
// reached: "saved" (the copy saved on this device last time, with savedAt),
// or "built-in" if there's no saved copy (the copy built into the site).
// With no connection at all, the saved copy shows straight away.
// When the connection comes back, it tries the database again.
// monkeySaved / monkeyDeleted update the list after an edit, without
// reloading everything.
function fallbackData() {
    const saved = loadSavedCopy();
    return saved
        ? { status: "saved", savedAt: saved.savedAt, ...saved }
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
        function load() {
            loadMonkeyData()
                .then((live) => {
                    if (!cancelled) setData({ status: "live", ...live });
                })
                .catch((error) => {
                    console.error("Couldn't load monkeys from the database:", error);
                    // Keep what's showing if it's already a fallback
                    if (!cancelled) setData((d) => (d.status === "loading" ? fallbackData() : d));
                });
        }
        if (navigator.onLine !== false) load();

        // Back online: try the database again, unless it's already live
        function retry() {
            if (status.current !== "live") load();
        }
        window.addEventListener("online", retry);
        return () => {
            cancelled = true;
            window.removeEventListener("online", retry);
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

    function monkeyDeleted(id) {
        setData((d) => ({ ...d, monkeys: d.monkeys.filter((m) => m.id !== id) }));
    }

    return { ...data, monkeySaved, monkeyDeleted };
}
