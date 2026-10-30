// Monitoring sessions' rules: last seen, missed in a row, overdue, the
// seen line, the WhatsApp summary and the alerts
import {
    isOverdue,
    latestSessionDays,
    seenLine,
    sessionAlerts,
    sessionsBefore,
    sightingRecord,
    troopSessions,
    whatsappText,
} from "./monitoringRules";

const session = (id, date, sightings, extra = {}) => ({
    id, enclosureId: 1, date, status: "finished", finishedAt: `${date}T10:00:00Z`,
    sightings: Object.entries(sightings).map(([monkeyId, seen]) => ({ monkeyId: Number(monkeyId), seen })), ...extra,
});
const SESSIONS = [
    session(1, "2026-10-12", { 1: true, 2: true }),
    session(2, "2026-10-19", { 1: true, 2: false }),
    session(3, "2026-10-26", { 1: true, 2: false, 3: false }),
    session(4, "2026-10-29", {}, { status: "in_progress", finishedAt: null }),
    session(5, "2026-10-27", { 1: true }, { enclosureId: 2 }),
];

test("a troop's finished sessions, newest first", () => {
    expect(troopSessions(SESSIONS, 1).map((s) => s.id)).toEqual([3, 2, 1]);
    expect(troopSessions(SESSIONS, 1, 3).map((s) => s.id)).toEqual([2, 1]);
    // (a finished one: only those before it; in progress: all)
    expect(sessionsBefore(SESSIONS, 1, SESSIONS[1]).map((s) => s.id)).toEqual([1]);
    expect(sessionsBefore(SESSIONS, 1, SESSIONS[3]).map((s) => s.id)).toEqual([3, 2, 1]);
});

test("last seen, and sessions missed in a row (sessions it wasn't on don't count)", () => {
    const past = troopSessions(SESSIONS, 1);
    expect(sightingRecord(past, 1)).toEqual({ lastSeen: "2026-10-26", missed: 0 });
    expect(sightingRecord(past, 2)).toEqual({ lastSeen: "2026-10-12", missed: 2 });
    expect(sightingRecord(past, 3)).toEqual({ lastSeen: null, missed: 1 });
    expect(sightingRecord(past, 9)).toEqual({ lastSeen: null, missed: 0 });
});

test("overdue: no session yet, or the last over a week ago", () => {
    const latest = latestSessionDays(SESSIONS);
    expect(latest.get(1)).toBe("2026-10-26");
    expect(isOverdue(latest.get(1), "2026-11-02")).toBe(false);
    expect(isOverdue(latest.get(1), "2026-11-03")).toBe(true);
    expect(isOverdue(undefined, "2026-11-03")).toBe(true);
});

test("the seen line", () => {
    expect(seenLine([], 10)).toBe("All seen");
    expect(seenLine([{ name: "Malawi", lastSeen: "2026-10-26" }, { name: "Daisy Mae", lastSeen: "2026-10-26" }], 10)).toBe(
        "All seen except Malawi and Daisy Mae (both seen 26.10)"
    );
    expect(seenLine([{ name: "Malawi", lastSeen: "2026-10-26" }], 10)).toBe("All seen except Malawi (seen 26.10)");
    expect(
        seenLine([{ name: "Malawi", lastSeen: "2026-10-26" }, { name: "Rox", lastSeen: "2026-10-19" }, { name: "Pip", lastSeen: null }], 10)
    ).toBe("All seen except Malawi (seen 26.10), Rox (seen 19.10) and Pip (not seen before)");
    expect(seenLine([{ name: "A", lastSeen: "2026-10-01" }, { name: "B", lastSeen: "2026-10-01" }, { name: "C", lastSeen: "2026-10-01" }], 9)).toBe(
        "All seen except A, B and C (all seen 01.10)"
    );
});

test("the WhatsApp summary, as staff post it", () => {
    expect(
        whatsappText({
            troop: "Skunkey",
            date: "2026-10-30",
            missing: [{ name: "Malawi", lastSeen: "2026-10-26" }, { name: "Daisy Mae", lastSeen: "2026-10-26" }],
            total: 30,
            notes: [
                { name: "Paradise", text: "eye almost back to normal" },
                { name: "Rox", text: "heard coughing again" },
            ],
            fence: "good",
            waters: "ok",
            food: "good",
        })
    ).toBe(
        [
            "📋 Skunkey Monitoring 30.10",
            "",
            "All seen except Malawi and Daisy Mae (both seen 26.10)",
            "",
            "🐒 Paradise eye almost back to normal",
            "🐒 Rox heard coughing again",
            "",
            "🥗 good",
            "💧 good",
            "⚡️ good",
        ].join("\n")
    );
    // Must See, problems and general notes; full troop names
    expect(
        whatsappText({
            troop: "D&D",
            date: "2026-10-30",
            missing: [{ name: "Malawi", lastSeen: "2026-10-19" }],
            total: 30,
            mustSee: [{ name: "Malawi", missed: 2, lastSeen: "2026-10-19" }],
            fence: "not_working",
            waters: "not_ok",
            food: "low",
            generalNotes: " Raining, low sightings \n",
        })
    ).toBe(
        [
            "📋 Dino & Daniel Monitoring 30.10",
            "_Raining, low sightings_",
            "",
            "All seen except Malawi (seen 19.10)",
            "⚠️ Malawi not seen for 2 sessions (since 19.10)",
            "",
            "🥗 low",
            "💧 not ok",
            "⚡️ not working",
        ].join("\n")
    );
});

test("the alerts after a session", () => {
    expect(
        sessionAlerts({
            mustSee: [{ name: "Hermes", missed: 2, lastSeen: "2026-10-14" }, { name: "Pip", missed: 3, lastSeen: null }],
            staleInjuries: [{ name: "Jacob", since: "2026-10-10" }],
            fence: "low",
            waters: "ok",
            food: "high",
        })
    ).toEqual([
        { level: "danger", text: "Hermes has not been seen since 14/10, missing on the last 2 sessions" },
        { level: "danger", text: "Pip has not been seen in the last 3 sessions" },
        { level: "warn", text: "Jacob's injury has not been updated since 10/10" },
        { level: "danger", check: true, text: "Fence: Low" },
        { level: "danger", check: true, text: "Food: High" },
    ]);
    expect(sessionAlerts({ fence: "good", waters: "ok", food: "good" })).toEqual([]);
});
