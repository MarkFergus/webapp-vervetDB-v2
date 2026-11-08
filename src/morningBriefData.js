// Everything the Morning Brief needs (morningBriefRules.js), loaded the same way
// for the page and for the email (supabase/functions/morning-brief).
import { supabase } from "./supabase";
import {
    loadCurrentInjuries,
    loadDewormingCalendar,
    loadDewormingSheets,
    loadLastMoves,
    loadMaintenanceIssues,
    loadMonitoringFor,
    loadMilkTotals,
    loadMonitoringSessions,
    loadMonkeyData,
    loadSpotSightings,
    loadWeights,
} from "./monkeyData";
import { buildMorningBrief, sanctuaryToday } from "./morningBriefRules";

// Arrivals, moves and status changes dated today or yesterday
async function loadNews(monkeys, today) {
    const [y, m, d] = today.split("-").map(Number);
    const since = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const { data, error } = await supabase
        .from("monkey_records")
        .select("monkey_id, category, details, monkeys (name)")
        .in("category", ["movement", "status"])
        .gte("record_date", since)
        .order("record_date", { ascending: false });
    if (error) throw error;
    const arrivals = monkeys
        .filter((monkey) => monkey.arrivalDate >= since)
        .map((monkey) => ({ kind: "arrival", name: monkey.name, details: "" }));
    return [
        ...arrivals,
        ...data.map((r) => ({ kind: r.category, name: r.monkeys?.name ?? "", details: r.details })),
    ];
}

// Today's brief. Throws if anything can't be loaded: better no brief than
// one that wrongly looks all clear.
export async function loadMorningBrief(now = new Date()) {
    const today = sanctuaryToday(now);
    const { monkeys, enclosures, buildings = [] } = await loadMonkeyData();
    const ids = monkeys.map((m) => m.id);
    const [sessions, spots, lastMoves, monitoring, injuries, calendar, sheets, milk, weights, maintenanceIssues, news] = await Promise.all([
        loadMonitoringSessions(),
        loadSpotSightings(),
        loadLastMoves(ids),
        loadMonitoringFor(ids),
        loadCurrentInjuries(ids),
        loadDewormingCalendar(),
        loadDewormingSheets(),
        loadMilkTotals(),
        loadWeights(),
        loadMaintenanceIssues(),
        loadNews(monkeys, today),
    ]);
    return buildMorningBrief({
        monkeys,
        enclosures,
        buildings,
        sessions,
        spots,
        lastMoves,
        monitoring,
        injuries,
        calendarEvents: calendar?.events ?? [],
        sheets,
        milk,
        weights,
        maintenanceIssues,
        news,
        today,
    });
}

// Email Me (the page): today's brief, straight away (once a minute at most)
export async function emailMorningBrief() {
    const { error } = await supabase.rpc("email_morning_brief");
    if (error) {
        console.error("Emailing the Morning Brief failed:", error);
        throw new Error(error.code === "P0001" ? error.message : "Couldn't send the email right now. Please try again.");
    }
}
