import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./auth";
import { flushOutbox, subscribeOutbox, waitingCount } from "./outbox";
import { prefillMonitoring } from "./offlinePrefill";

const TRY_EVERY_MS = 60000;

// How many entries are waiting to send (updates as that changes)
export const useWaitingCount = () => useSyncExternalStore(subscribeOutbox, waitingCount);

// Keeps the outbox moving while the app's open: when it opens, when signal or
// the app comes back, and every minute anyway (phones can say they're
// connected when they're not, and the other way round). And saves what
// Monitoring needs to work offline.
export default function OfflineSync({ live, monkeys, enclosures }) {
    const { user, role } = useAuth();
    const signedIn = Boolean(user);
    useEffect(() => {
        if (!signedIn) return undefined;
        const attempt = () => {
            if (navigator.onLine !== false && waitingCount() > 0) flushOutbox();
        };
        const visible = () => document.visibilityState === "visible" && attempt();
        attempt();
        const timer = setInterval(attempt, TRY_EVERY_MS);
        window.addEventListener("online", attempt);
        document.addEventListener("visibilitychange", visible);
        // (asks the phone not to clear what's saved when it runs low on space)
        navigator.storage?.persist?.().catch(() => {});
        return () => {
            clearInterval(timer);
            window.removeEventListener("online", attempt);
            document.removeEventListener("visibilitychange", visible);
        };
    }, [signedIn]);

    const staff = Boolean(role);
    useEffect(() => {
        if (!live || !staff || navigator.onLine === false) return undefined;
        const timer = setTimeout(() => prefillMonitoring(monkeys, enclosures), 5000);
        return () => clearTimeout(timer);
    }, [live, staff, monkeys, enclosures]);
    return null;
}

// "3 entries waiting to send": whatever page they're on
export function WaitingNotice() {
    const count = useWaitingCount();
    if (!count) return null;
    return (
        <p className="App-notice" role="status">
            {count === 1 ? "1 entry" : `${count} entries`} saved on this phone, waiting to send.
        </p>
    );
}
