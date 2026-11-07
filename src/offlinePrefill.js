// So the daily entries work with no signal, even for a troop nobody's opened
// on this phone: saves each troop's briefing and the lists the forms need (the
// same requests their pages make, which offlineFetch.js keeps), now and then,
// while there's a connection.
import {
    keepInjurySnapshot,
    loadAllMaintenance,
    loadBabyRecords,
    loadConditions,
    loadCurrentInjuries,
    loadDewormingCalendar,
    loadDewormingSheets,
    loadLastMoves,
    loadMaintenanceIssues,
    loadMonitoringFor,
    loadMonitoringSessions,
    loadMoves,
    loadSpotSightings,
} from "./monkeyData";
import { hasTroop } from "./enclosures";
import { monkeysIn } from "./stats";

const LAST_RUN = "vervetdb-prefill-at";
const EVERY_MS = 30 * 60000;

// A troop's monkeys: the troop, then each introcage's
export function troopMonkeys(monkeys, troop) {
    const inTroop = troop ? [...monkeysIn(monkeys, troop, "troop")].sort((a, b) => a.name.localeCompare(b.name)) : [];
    const inIntrocages = troop
        ? [...monkeysIn(monkeys, troop, "introcages")].sort(
              (a, b) => (a.introcage ?? "").localeCompare(b.introcage ?? "") || a.name.localeCompare(b.name)
          )
        : [];
    return { inTroop, inIntrocages, all: [...inTroop, ...inIntrocages] };
}

export async function prefillMonitoring(monkeys, enclosures, now = Date.now()) {
    try {
        if (now - Number(localStorage.getItem(LAST_RUN) ?? 0) < EVERY_MS) return false;
        localStorage.setItem(LAST_RUN, String(now));
    } catch {
        return false;
    }
    const quietly = (promise) => promise.catch(() => null);
    await Promise.all([
        quietly(loadMonitoringSessions()),
        quietly(loadSpotSightings()),
        quietly(loadAllMaintenance()),
        quietly(loadMaintenanceIssues()),
        quietly(loadDewormingSheets()),
        quietly(loadDewormingCalendar()),
        quietly(loadBabyRecords("milk")),
        quietly(loadBabyRecords("weights")),
        quietly(loadMoves()),
    ]);
    // (a troop at a time: this mustn't get in the way of the page)
    for (const troop of enclosures.filter(hasTroop)) {
        if (navigator.onLine === false) return false;
        const ids = troopMonkeys(monkeys, troop).all.map((m) => m.id);
        await Promise.all([
            quietly(loadCurrentInjuries(ids).then((list) => keepInjurySnapshot(list, ids))),
            quietly(loadConditions(ids)),
            quietly(loadMonitoringFor(ids)),
            quietly(loadLastMoves(ids)),
        ]);
    }
    return true;
}
