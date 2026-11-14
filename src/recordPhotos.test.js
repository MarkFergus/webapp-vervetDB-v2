// Photos on a new injury (or update, condition, record): kept on the phone
// with no signal, sent after the injury itself, with its real id
import { addInjury, loadRecordPhotos } from "./monkeyData";
import { flushOutbox, resetOutbox, setOutboxUser } from "./outbox";
import { supabase } from "./supabase";
import { keptPhoto } from "./outboxPhotos";

let online = false;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

let steps, nextId;
beforeEach(() => {
    vi.restoreAllMocks();
    resetOutbox();
    online = false;
    steps = [];
    nextId = 500;
    setOutboxUser({ id: "me", name: "Mark" });
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        const list = {
            eq: () => list,
            in: () => list,
            order: () => list,
            then: (resolve) => resolve({ data: [], error: null }),
        };
        return {
            select: () => list,
            insert: (row) => {
                const id = nextId++;
                steps.push({ step: "insert", table, row, id });
                const done = { data: { ...row, id, injury_date: row.injury_date, logged_at: "2026-11-14T10:00:00Z" }, error: null };
                return {
                    select: () => ({ single: async () => done }),
                    then: (resolve) => resolve({ error: null }),
                };
            },
        };
    });
    vi.spyOn(supabase.storage, "from").mockImplementation((bucket) => ({
        upload: async (path) => {
            steps.push({ step: "upload", bucket, path });
            return { error: null };
        },
    }));
});

test("a new injury with a photo, no signal: shown here, then sent after the injury, linked to its real id", async () => {
    const injury = await addInjury(7, { date: "2026-11-14", description: "Bite on tail", photos: [new Blob(["one"], { type: "image/jpeg" })] });
    expect(steps).toEqual([]);
    const waiting = await loadRecordPhotos("injury", [injury.id]);
    expect(waiting[injury.id]).toHaveLength(1);
    const path = waiting[injury.id][0];
    expect(await keptPhoto(path)).toBeTruthy();

    online = true;
    await flushOutbox();
    expect(steps.map((s) => `${s.step} ${s.table ?? s.bucket}`)).toEqual(["insert injuries", "upload record-photos", "insert record_photos"]);
    expect(steps[2].row).toEqual({ kind: "injury", record_id: steps[0].id, monkey_id: 7, path });
    expect(await keptPhoto(path)).toBeUndefined();
});

test("no photos: nothing extra sent", async () => {
    online = true;
    await addInjury(7, { date: "2026-11-14", description: "Scratch" });
    expect(steps.map((s) => s.table)).toEqual(["injuries"]);
});
