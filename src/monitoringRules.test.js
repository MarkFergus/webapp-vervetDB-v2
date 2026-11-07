// Monitoring sessions' rules: last seen, missed in a row, overdue, the
// seen line, the WhatsApp summary and the alerts
import {
    prioritySeenLine,
    isOverdue,
    troopStages,
    latestSessionDays,
    seenLine,
    sessionAlerts,
    sessionsBefore,
    seenDaily,
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
    expect(sightingRecord(past, 1)).toEqual({ lastSeen: "2026-10-26", missed: 0, spot: null });
    expect(sightingRecord(past, 2)).toEqual({ lastSeen: "2026-10-12", missed: 2, spot: null });
    expect(sightingRecord(past, 3)).toEqual({ lastSeen: null, missed: 1, spot: null });
    expect(sightingRecord(past, 9)).toEqual({ lastSeen: null, missed: 0, spot: null });
});

test("Mark As Seen: a sighting between sessions counts as seen; only the sessions after it count as missed", () => {
    const past = troopSessions(SESSIONS, 1);
    const spot = (date, extra = {}) => ({ id: 1, monkeyId: 2, date, by: "Sam", note: "", at: `${date}T09:00:00Z`, ...extra });
    // (missed 19th and 26th; seen on the 20th: only the 26th counts)
    expect(sightingRecord(past, 2, [spot("2026-10-20")])).toEqual({ lastSeen: "2026-10-20", missed: 1, spot: spot("2026-10-20") });
    // (seen the same day as the last session, after it: not missing)
    expect(sightingRecord(past, 2, [spot("2026-10-26")])).toMatchObject({ lastSeen: "2026-10-26", missed: 0 });
    // (the latest of them counts; one before the last session it was seen in: no change)
    expect(sightingRecord(past, 2, [spot("2026-10-20"), spot("2026-10-27", { id: 2 })]).spot.id).toBe(2);
    expect(sightingRecord(past, 2, [spot("2026-10-01")])).toEqual({ lastSeen: "2026-10-12", missed: 2, spot: null });
    // (another monkey's: no change)
    expect(sightingRecord(past, 1, [spot("2026-10-27")]).spot).toBeNull();
});

test("overdue: no session yet, or the last 5 or more days ago", () => {
    const latest = latestSessionDays(SESSIONS);
    expect(latest.get(1)).toBe("2026-10-26");
    expect(isOverdue(latest.get(1), "2026-10-30")).toBe(false);
    expect(isOverdue(latest.get(1), "2026-10-31")).toBe(true);
    expect(isOverdue(undefined, "2026-11-03")).toBe(true);
});

test("the seen line", () => {
    expect(seenLine([], 10)).toBe("✅ All seen");
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
            prioritySeen: ["Victoria", "Hocus"],
            fence: "good",
            waters: "good",
            food: "good",
            introcagesChecked: true,
            perimeterChecked: true,
        })
    ).toBe(
        [
            "📋 *Skunkey Monitoring 30.10*",
            "",
            "All seen except Malawi and Daisy Mae (both seen 26.10)",
            "Victoria and Hocus both seen",
            "",
            "🐒 Paradise eye almost back to normal",
            "🐒 Rox heard coughing again",
            "",
            "🥗💧⚡️ all good",
            "☑️ Introcages & Perimeter checked",
        ].join("\n")
    );
    // Everyone seen: ✅ (and the priority ones still named, to search the chat for); a note on a check: each on its own line;
    // the Introcages / Perimeter Checks done under them (none done: no line); maintenance last
    expect(
        whatsappText({
            troop: "Skunkey",
            date: "2026-10-30",
            missing: [],
            total: 30,
            prioritySeen: ["Victoria"],
            fence: "good",
            waters: "good",
            food: "good",
            checkNotes: { waters: " topped up " },
            perimeterChecked: true,
            maintenance: "Branches cut\n\nFence break fixed ",
        })
    ).toBe(
        [
            "📋 *Skunkey Monitoring 30.10*",
            "",
            "✅ All seen",
            "Victoria seen",
            "",
            "🥗 good",
            "💧 good (topped up)",
            "⚡️ good",
            "☑️ Perimeter checked",
            "",
            "🔧 Branches cut",
            "🔧 Fence break fixed",
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
            prioritySeen: ["Victoria"],
            fence: "not_working",
            waters: "bad",
            food: "too_much",
            checkNotes: { fence: "north corner" },
            generalNotes: " Raining, low sightings \n",
        })
    ).toBe(
        [
            "📋 *Dino & Daniel Monitoring 30.10*",
            "_Raining, low sightings_",
            "",
            "All seen except Malawi (seen 19.10)",
            "Victoria seen",
            "⚠️ Malawi not seen for 2 sessions (since 19.10)",
            "",
            "🥗 too much",
            "💧 bad",
            "⚡️ not working (north corner)",
        ].join("\n")
    );
});

test("the alerts after a session", () => {
    expect(
        sessionAlerts({
            mustSee: [{ name: "Hermes", missed: 2, lastSeen: "2026-10-14" }, { name: "Pip", missed: 3, lastSeen: null }],
            staleInjuries: [{ name: "Jacob", since: "2026-10-10" }],
            fence: "low",
            waters: "good",
            food: "too_much",
            checkNotes: { fence: "Top wire sagging" },
        })
    ).toEqual([
        { level: "danger", text: "Hermes not seen last 2 sessions, last seen 14/10" },
        { level: "danger", text: "Pip not seen last 3 sessions" },
        { level: "warn", text: "Jacob's injury has not been updated since 10/10" },
        { level: "danger", check: true, text: "Fence: Low (Top wire sagging)" },
        { level: "danger", check: true, text: "Food: Too Much" },
    ]);
    expect(sessionAlerts({ fence: "good", waters: "good", food: "good" })).toEqual([]);
});

test("the priority monkeys seen", () => {
    expect(prioritySeenLine([])).toBe("");
    expect(prioritySeenLine(["Victoria"])).toBe("Victoria seen");
    expect(prioritySeenLine(["Victoria", "Hocus"])).toBe("Victoria and Hocus both seen");
    expect(prioritySeenLine(["Victoria", "Hocus", "Rox"])).toBe("Victoria, Hocus and Rox all seen");
});

test("in an introcage or Sickbay: seen every day; moved back out to the troop: seen that day", () => {
    const session = (id, date, seen) => ({ id, date, enclosureId: 1, status: "finished", finishedAt: `${date}T10:00Z`, sightings: [{ monkeyId: 7, seen }] });
    // (seen 1 Dec, in Sickbay for 3 weeks (no sessions for him), back on 22 Dec, not seen on 23 Dec)
    const past = [session(2, "2026-12-23", false), session(1, "2026-12-01", true)];
    expect(sightingRecord(past, 7)).toEqual({ lastSeen: "2026-12-01", missed: 1, spot: null });
    expect(sightingRecord(past, 7, [], { back: "2026-12-22" })).toEqual({ lastSeen: "2026-12-22", missed: 1, spot: null });
    // (moved back after the 23rd's session: nothing missed since)
    expect(sightingRecord(past, 7, [], { back: "2026-12-24" })).toEqual({ lastSeen: "2026-12-24", missed: 0, spot: null });
    // (a move longer ago than his last sighting: changes nothing)
    expect(sightingRecord(past, 7, [], { back: "2026-11-20" })).toEqual({ lastSeen: "2026-12-01", missed: 1, spot: null });
    // (in Sickbay or an introcage now: seen today, never missed)
    expect(sightingRecord(past, 7, [], { daily: true, today: "2026-12-30" })).toEqual({
        lastSeen: "2026-12-30",
        missed: 0,
        spot: null,
    });
    expect([{ inSickbay: true }, { introcage: "Gismo A" }, { stay: { introcage: "Gismo A" } }, {}].map(seenDaily)).toEqual([
        true,
        true,
        true,
        false,
    ]);
});

test("the troops' stages: each troop once, from the most urgent to the least", () => {
    const NOW = new Date("2026-11-07T12:00:00Z").getTime();
    const troop = (id, section = "Top") => ({ id, section });
    const done = (enclosureId, date, finishedAt = `${date}T09:00:00Z`) => ({ enclosureId, date, status: "finished", finishedAt });
    const sessions = [
        { enclosureId: 1, date: "2026-11-07", status: "in_progress" },
        done(1, "2026-11-06"),
        done(2, "2026-11-01"),
        done(3, "2026-10-28"),
        done(5, "2026-11-07"),
        done(5, "2026-11-06"),
        done(6, "2026-11-06"),
        done(7, "2026-11-04"),
        done(8, "2026-11-03"),
        // (entered just now, for an old day: still overdue)
        done(9, "2026-10-20", "2026-11-07T10:00:00Z"),
        // (a wild troop, just monitored)
        done(11, "2026-11-07"),
    ];
    const troops = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((id) => troop(id));
    const stages = troopStages([...troops, troop(10, "Wild"), troop(11, "Wild")], sessions, ["Top"], "2026-11-07", NOW);
    expect(stages.map((s) => [s.troop.id, s.stage, s.days])).toEqual([
        [1, "progress", 1],
        [4, "overdue", null],
        [9, "overdue", 18],
        [3, "overdue", 10],
        [2, "overdue", 6],
        [8, "rest", 4],
        [7, "rest", 3],
        [6, "recent", 1],
        [5, "recent", 0],
        [11, "recent", 0],
    ]);
});
