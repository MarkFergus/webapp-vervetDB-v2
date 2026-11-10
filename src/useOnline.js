import { useEffect, useState } from "react";

// Whether the device thinks it has a connection (updates when that changes).
// Going offline only counts once it's lasted a few seconds: a phone waking up
// often says "no connection" for a moment before its wifi or data is back.
export const OFFLINE_AFTER_MS = 3000;

export default function useOnline() {
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    useEffect(() => {
        let wait = null;
        const update = () => {
            clearTimeout(wait);
            if (navigator.onLine !== false) {
                setOnline(true);
                return;
            }
            // (still offline a few seconds later: then it counts)
            wait = setTimeout(() => setOnline(navigator.onLine !== false), OFFLINE_AFTER_MS);
        };
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            clearTimeout(wait);
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);
    return online;
}
