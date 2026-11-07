import { useEffect, useSyncExternalStore } from "react";
import { useAuth } from "./auth";
import { discardEntry, flushOutbox, outboxEntries, retryEntry, subscribeOutbox, waitingCount } from "./outbox";
import { prefillMonitoring } from "./offlinePrefill";
import { lastContact } from "./offlineFetch";
import useOnline from "./useOnline";

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

const STALE_AFTER_MS = 24 * 3600000;
const KIND_WORDS = {
    "session-start": "Monitoring session",
    "session-finish": "Monitoring session",
    "session-delete": "Cancelled session",
    "injury-add": "New injury",
    "injury-update": "Injury update",
    "injury-healed": "Injury healed",
    "condition-add": "New condition",
    "spot-add": "Mark As Seen",
    "observation-add": "Observation",
    "maintenance-add": "Maintenance report",
    "baby-save": "Baby Care records",
    "deworming-results": "Deworming results",
    "deworming-add": "Monkey added to deworming",
    "deworming-remove": "Monkey removed from deworming",
    "sheet-photo": "Deworming sheet photo",
};
const problemsNow = () => JSON.stringify(outboxEntries().filter((e) => e.status === "problem").map((e) => e.id));

// Entries the database refused: never lost without someone saying so
export function NeedsAttention() {
    useSyncExternalStore(subscribeOutbox, problemsNow);
    const problems = outboxEntries().filter((e) => e.status === "problem");
    if (!problems.length) return null;
    return (
        <section className="App-notice App-needsAttention" role="alert" aria-label="Needs Attention">
            <b>Needs Attention:</b> saved on this phone, but the database refused {problems.length === 1 ? "it" : "them"}.
            <ul>
                {problems.map((entry) => (
                    <li key={entry.id}>
                        <span>
                            <b>{KIND_WORDS[entry.kind] ?? "Entry"}:</b> {entry.problem}
                        </span>
                        <span className="App-needsAttentionButtons">
                            <button type="button" onClick={() => retryEntry(entry.id)}>
                                Try Again
                            </button>
                            <button type="button" onClick={() => window.confirm("Discard this entry? It can't be brought back.") && discardEntry(entry.id)}>
                                Discard
                            </button>
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

// "3 entries waiting to send": whatever page they're on; and a phone that's
// been out of touch for a while saying so
export function WaitingNotice() {
    const count = useWaitingCount();
    const online = useOnline();
    const last = lastContact();
    const stale = !online && last && Date.now() - last > STALE_AFTER_MS;
    return (
        <>
            {stale && (
                <p className="App-notice" role="status">
                    Not updated for over a day, so what you see may be out of date.
                </p>
            )}
            {count > 0 && (
                <p className="App-notice" role="status">
                    {count === 1 ? "1 entry" : `${count} entries`} saved on this phone, waiting to send.
                </p>
            )}
        </>
    );
}
