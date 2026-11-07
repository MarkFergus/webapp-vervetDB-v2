// The other daily entries with no signal, reaching the database afterwards
import {
    addDewormingMonkey,
    addMaintenance,
    addObservation,
    addSpotSighting,
    loadSpotSightings,
    removeDewormingMonkey,
    saveBabyRecords,
    saveDewormingResults,
    sheetPhotoUrls,
    uploadSheetPhoto,
    withOutboxSheets,
} from "./monkeyData";
import { flushOutbox, outboxEntries, resetOutbox, setOutboxUser, waitingCount } from "./outbox";
import { supabase } from "./supabase";
import { keepPhoto, keptPhoto } from "./outboxPhotos";

let online = false;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

let inserts, rpcs, uploads, nextId;
function fakeDatabase() {
    inserts = [];
    rpcs = [];
    uploads = [];
    nextId = 100;
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
    vi.spyOn(supabase, "rpc").mockImplementation(async (name, args) => {
        rpcs.push({ name, args });
        if (name === "add_deworming_monkey") return { data: 900, error: null };
        if (name === "save_deworming_results") return { data: args.results.submit ? "submitted" : "ready", error: null };
        return { data: 2, error: null };
    });
    vi.spyOn(supabase, "from").mockImplementation((table) => ({
        insert: (row) => ({
            select: () => ({
                single: async () => {
                    inserts.push({ table, row });
                    return { data: { ...row, id: nextId++ }, error: null };
                },
            }),
        }),
    }));
    vi.spyOn(supabase.storage, "from").mockImplementation(() => ({
        upload: async (path) => {
            uploads.push(path);
            return { error: null };
        },
        createSignedUrls: async (paths) => ({ data: paths.map((path) => ({ path, signedUrl: `signed:${path}` })), error: null }),
    }));
}

beforeEach(() => {
    vi.restoreAllMocks();
    resetOutbox();
    online = false;
    setOutboxUser({ id: "me", name: "Mark" });
    fakeDatabase();
    URL.createObjectURL = () => "blob:here";
});

test("Mark As Seen, Observation, Maintenance: kept, then saved once each with their codes", async () => {
    const spot = await addSpotSighting(1, { date: "2026-11-06", note: " Up a tree " });
    expect(spot).toMatchObject({ monkeyId: 1, note: "Up a tree", by: "Mark" });
    await addObservation(2, { date: "2026-11-06", description: "Eating well" });
    const report = await addMaintenance(10, { doneOn: "2026-11-06", kind: "repair", details: "Fence" });
    expect(report).toMatchObject({ enclosureId: 10, details: "Fence", loggedBy: "Mark" });
    expect(inserts).toEqual([]);
    expect(waitingCount()).toBe(4); // (an observation's a sighting too)

    online = true;
    await flushOutbox();
    expect(inserts.map((i) => i.table)).toEqual(["monkey_sightings", "monkey_records", "monkey_sightings", "maintenance"]);
    expect(inserts.every((i) => i.row.client_ref)).toBe(true);
    expect(inserts[1].row).toMatchObject({ category: "observation", section: "rehabilitation", details: "Eating well" });
    expect(inserts[3].row).toMatchObject({ enclosure_id: 10, done_on: "2026-11-06", kind: "repair" });
});

test("a sighting waiting to send counts as seen, even with nothing else saved", async () => {
    await addSpotSighting(1, { date: "2026-11-06" });
    const failing = () => ({
        select: () => {
            const query = { gte: () => query, in: () => query, order: () => query, range: async () => ({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } }) };
            return query;
        },
    });
    supabase.from.mockImplementation(failing);
    expect((await loadSpotSightings([1])).map((s) => s.monkeyId)).toEqual([1]);
    expect(await loadSpotSightings([2])).toEqual([]);
});

test("Baby Care's batch: says what it'll save, then sends it as the whole batch", async () => {
    const entries = [{ monkeyId: 1, date: "2026-11-05", value: 200, notes: null }];
    expect(await saveBabyRecords("milk", entries, true)).toBe(1);
    online = true;
    await flushOutbox();
    expect(rpcs[0]).toMatchObject({ name: "save_milk_totals", args: { replace: true } });
    expect(rpcs[0].args.entries[0]).toMatchObject({ monkey_id: 1, value: 200 });
    // (nothing kept once sent)
    expect(outboxEntries()).toEqual([]);
});

const sheet = { id: 5, startDate: "2026-11-01", lines: [{ id: 50, monkeyId: 1, doses: {}, day4: null }] };
const results = (lines, submit = false) => ({ startedOn: "2026-11-01", staffNames: "Mark", dayNotes: {}, photos: [], daysDone: [1], lines, submit });

test("Deworming: only the latest save goes; a monkey added first; shows on the sheet meanwhile", async () => {
    const lineId = await addDewormingMonkey(5, { monkeyId: 2, kind: "added", fromDay: 1, medication: "X", dose: "1", days: 3 });
    const lines = [{ ...sheet.lines[0], doses: { 1: { result: "given" } } }, { id: lineId, monkeyId: 2, doses: { 1: { result: "given" } } }];
    await saveDewormingResults(5, results([sheet.lines[0]]));
    await saveDewormingResults(5, results(lines));
    expect(outboxEntries().map((e) => e.kind)).toEqual(["deworming-add", "deworming-results"]);

    const [shown] = withOutboxSheets([sheet]);
    expect(shown.lines.map((l) => l.monkeyId)).toEqual([1, 2]);
    expect(shown.lines[0].doses[1].result).toBe("given");
    expect(shown.daysDone).toEqual([1]);

    online = true;
    await flushOutbox();
    expect(rpcs.map((r) => r.name)).toEqual(["add_deworming_monkey", "save_deworming_results"]);
    expect(rpcs[1].args.results.doses.map((d) => d.line_id)).toEqual([50, 900]);
});

test("a monkey added and taken off again before sending: as if never there", async () => {
    const lineId = await addDewormingMonkey(5, { monkeyId: 2, kind: "added", fromDay: 1, medication: "X", dose: "1", days: 3 });
    await saveDewormingResults(5, results([sheet.lines[0], { id: lineId, monkeyId: 2, doses: {} }]));
    await removeDewormingMonkey(lineId);
    online = true;
    await flushOutbox();
    expect(rpcs.map((r) => r.name)).toEqual(["save_deworming_results"]);
    expect(outboxEntries()).toEqual([]);
});

test("Submit needs signal, and says so; what's waiting goes first", async () => {
    await saveDewormingResults(5, results([sheet.lines[0]]));
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } });
    supabase.rpc.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } });
    online = true;
    await expect(saveDewormingResults(5, results([sheet.lines[0]], true))).rejects.toThrow("Submit needs a connection");
    expect(waitingCount()).toBe(1);

    await expect(saveDewormingResults(5, results([sheet.lines[0]], true))).resolves.toBe("submitted");
    expect(rpcs.map((r) => r.args.results.submit)).toEqual([false, true]);
});

test("a sheet photo: kept on the phone and shown from there, uploaded when there's signal", async () => {
    const path = await uploadSheetPhoto(new Blob(["x"], { type: "image/jpeg" }), 5);
    expect(path).toMatch(/^5\/\d+\.jpg$/);
    expect(uploads).toEqual([]);
    expect(await sheetPhotoUrls([path])).toEqual({ [path]: "blob:here" });

    online = true;
    await flushOutbox();
    expect(uploads).toEqual([path]);
    expect(await keptPhoto(path)).toBeUndefined();
    expect(await sheetPhotoUrls([path])).toEqual({ [path]: `signed:${path}` });
});

test("a photo that's gone from the phone: Needs Attention, not stuck for ever", async () => {
    const path = await uploadSheetPhoto(new Blob(["x"], { type: "image/jpeg" }), 5);
    const { forgetPhoto } = await import("./outboxPhotos");
    await forgetPhoto(path);
    online = true;
    await flushOutbox();
    expect(outboxEntries()[0]).toMatchObject({ status: "problem" });
    await keepPhoto(path, new Blob(["x"]));
});
