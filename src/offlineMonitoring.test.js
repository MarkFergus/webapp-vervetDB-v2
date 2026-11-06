// A whole Monitoring session with no signal, reaching the database afterwards
import { addCondition, addInjury, addInjuryUpdate, deleteMonitoringSession, finishMonitoringSession, loadConditions, loadCurrentInjuries, loadSessionNotes, setInjuryHealed, startMonitoringSession, tooLongOffline, withOutboxSessions } from "./monkeyData";
import { flushOutbox, outboxEntries, resetOutbox, setOutboxUser, waitingCount } from "./outbox";
import { supabase } from "./supabase";

let online = false;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

// A pretend database: what it was asked to save
let inserts;
let rpcs;
let nextId;
let repeatOnce; // tables that say "already saved" to their next insert
function fakeDatabase() {
    inserts = [];
    rpcs = [];
    nextId = 100;
    repeatOnce = new Set();
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
    vi.spyOn(supabase, "rpc").mockImplementation(async (name, args) => {
        rpcs.push({ name, args });
        return { data: [{ id: args.session ?? args.injury_id, enclosure_id: 1, session_date: "2026-11-06", status: "finished" }], error: null };
    });
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        insert: (row) => ({
            select: () => ({
                single: async () => {
                    if (repeatOnce.delete(table)) return { data: null, error: { code: "23505" } };
                    inserts.push({ table, row });
                    return { data: { ...row, id: nextId++ }, error: null };
                },
            }),
        }),
        select: () => ({
            eq: () => ({ single: async () => ({ data: { id: 777 }, error: null }) }),
        }),
    }));
}

const finish = { date: "2026-11-06", fence: "good", waters: "ok", food: "good", seen: [1], notSeen: [2] };

beforeEach(() => {
    vi.restoreAllMocks();
    resetOutbox();
    online = false;
    setOutboxUser({ id: "me", name: "Mark" });
    fakeDatabase();
});

test("start, an injury, an update, a condition, healed, finish: all kept, then sent in order with real ids", async () => {
    const session = await startMonitoringSession(1, "2026-11-06");
    expect(session).toMatchObject({ enclosureId: 1, status: "in_progress", startedByName: "Mark", pending: true });
    const injury = await addInjury(1, { date: "2026-11-06", description: "Cut", sessionId: session.id });
    await addInjuryUpdate(injury.id, { date: "2026-11-06", details: "Cleaned", sessionId: session.id, monkeyId: 1 });
    await addCondition(2, { date: "2026-11-06", description: "Thin", sessionId: session.id });
    await setInjuryHealed(injury.id, true, "2026-11-06");
    const finished = await finishMonitoringSession(session.id, finish);
    expect(finished).toMatchObject({ id: session.id, status: "finished", pending: true });
    expect(inserts).toEqual([]);
    expect(waitingCount()).toBe(6);

    online = true;
    await flushOutbox();
    expect(waitingCount()).toBe(0);
    expect(inserts.map((i) => i.table)).toEqual(["monitoring_sessions", "injuries", "injury_updates", "monkey_conditions"]);
    const [start, cut, update, thin] = inserts.map((i) => i.row);
    expect(start.client_ref).toBeTruthy();
    expect(cut).toMatchObject({ session_id: 100, monkey_id: 1 });
    expect(update).toMatchObject({ session_id: 100, injury_id: 101 });
    expect(thin).toMatchObject({ session_id: 100 });
    expect(rpcs.map((r) => r.name)).toEqual(["set_injury_healed", "finish_monitoring_session"]);
    expect(rpcs[0].args.injury_id).toBe(101);
    expect(rpcs[1].args).toMatchObject({ session: 100, seen: [1], not_seen: [2] });
});

test("sent twice (no answer the first time): the one already saved, not another", async () => {
    await startMonitoringSession(1, "2026-11-06");
    repeatOnce.add("monitoring_sessions");
    online = true;
    await flushOutbox();
    expect(inserts).toEqual([]);
    expect(waitingCount()).toBe(0);
});

test("the list shows what's on the phone; once sent, an old saved answer doesn't hide it", async () => {
    const session = await startMonitoringSession(1, "2026-11-06");
    expect(withOutboxSessions([]).map((s) => s.id)).toEqual([session.id]);
    await finishMonitoringSession(session.id, finish);
    expect(withOutboxSessions([])[0]).toMatchObject({ status: "finished", pending: true });

    online = true;
    await flushOutbox();
    expect(withOutboxSessions([])[0]).toMatchObject({ id: session.id, status: "finished", pending: false });
    // (the database's answer: it goes by its local id on this phone, and wins)
    const fromDatabase = { id: 100, date: "2026-11-06", status: "finished", finishedAt: "2026-11-06T10:00:00Z", notes: "Theirs", startedAt: "x" };
    const list = withOutboxSessions([fromDatabase]);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: session.id, notes: "Theirs" });
});

test("cancelling one that never left the phone: it just goes; what was added stays, without it", async () => {
    const session = await startMonitoringSession(1, "2026-11-06");
    await addCondition(2, { date: "2026-11-06", description: "Thin", sessionId: session.id });
    await deleteMonitoringSession(session.id);
    expect(outboxEntries().map((e) => e.kind)).toEqual(["condition-add"]);
    online = true;
    await flushOutbox();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].row.session_id).toBeNull();
});

test("an offline entry shows with the saved records, and in the session's notes", async () => {
    const session = await startMonitoringSession(1, "2026-11-06");
    const injury = await addInjury(1, { date: "2026-11-06", description: "Cut", sessionId: session.id });
    await addInjuryUpdate(injury.id, { date: "2026-11-06", details: "Cleaned", sessionId: session.id, monkeyId: 1 });
    await addCondition(2, { date: "2026-11-06", description: "Thin", sessionId: session.id });
    const empty = () => ({
        select: () => {
            const query = { in: () => query, is: () => query, order: () => query, eq: () => query, then: (done) => done({ data: [], error: null }) };
            return query;
        },
    });
    supabase.from.mockImplementation(empty);
    const [listed] = await loadCurrentInjuries([1]);
    expect(listed).toMatchObject({ description: "Cut" });
    expect(listed.updates.map((u) => u.details)).toEqual(["Cleaned"]);
    expect((await loadConditions([2])).map((c) => c.description)).toEqual(["Thin"]);
    const notes = await loadSessionNotes(session.id);
    expect(notes.map((n) => [n.kind, n.text, n.monkeyId])).toEqual([
        ["injury", "Cut", 1],
        ["update", "Cleaned", 1],
        ["condition", "Thin", 2],
    ]);
});

test("too long without reaching the database: no new sessions (one already going can finish)", async () => {
    const session = await startMonitoringSession(1, "2026-11-06");
    localStorage.setItem("vervetdb-last-contact", String(Date.now() - 49 * 3600000));
    expect(tooLongOffline()).toBe(true);
    await expect(startMonitoringSession(1, "2026-11-06")).rejects.toThrow("over 2 days");
    await expect(finishMonitoringSession(session.id, finish)).resolves.toMatchObject({ status: "finished" });
    localStorage.removeItem("vervetdb-last-contact");
});
