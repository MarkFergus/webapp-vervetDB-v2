// Maintenance Issues with no signal: reported, fixed and closed on the phone,
// reaching the database afterwards with the right ids, and nothing's lost
import { addIssue, addIssuePhotos, closeIssue, fixIssue, loadAllMaintenance, loadMaintenanceIssues } from "./monkeyData";
import { flushOutbox, outboxProblems, resetOutbox, setOutboxUser, waitingCount } from "./outbox";
import { supabase } from "./supabase";
import { keptPhoto } from "./outboxPhotos";

let online = false;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

let steps, nextId, answer, current;
beforeEach(() => {
    vi.restoreAllMocks();
    resetOutbox();
    online = false;
    steps = [];
    nextId = 100;
    answer = { data: [], error: null };
    setOutboxUser({ id: "me", name: "Mark" });
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        const list = {
            eq: () => list,
            single: async () => ({ data: { photo_paths: current }, error: null }),
            order: () => list,
            range: () => list,
            then: (resolve) => resolve(table === "maintenance" ? { data: [], error: null } : answer),
        };
        return {
            select: () => list,
            insert: (row) => ({
                select: () => ({
                    single: async () => {
                        const id = nextId++;
                        steps.push({ step: "insert", table, row, id });
                        return { data: { ...row, id, status: "open", reported_at: "2026-11-07T10:00:00Z" }, error: null };
                    },
                }),
            }),
            update: (row) => {
                const update = { step: "update", table, row, where: {} };
                steps.push(update);
                const chain = {
                    eq: (column, value) => {
                        update.where[column] = value;
                        return chain;
                    },
                    then: (resolve) => resolve({ error: null }),
                };
                return chain;
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

const details = { enclosureId: 7, mapX: 12.5, mapY: 30, details: "Fence down", urgent: true };

test("reported with a photo and no signal: on the list here, sent later, photo first", async () => {
    const photos = [new Blob(["one"], { type: "image/jpeg" }), new Blob(["two"], { type: "image/jpeg" })];
    const issue = await addIssue({ ...details, photos });
    expect(issue).toMatchObject({ status: "open", reportedBy: "Mark", ...details });
    expect(issue.photoPaths).toHaveLength(2);
    expect(await keptPhoto(issue.photoPaths[1])).toBeTruthy();
    expect(steps).toEqual([]);
    expect(await loadMaintenanceIssues()).toEqual([expect.objectContaining({ details: "Fence down" })]);

    online = true;
    await flushOutbox();
    expect(steps.map((s) => s.step)).toEqual(["upload", "upload", "insert"]);
    expect(steps[0]).toMatchObject({ bucket: "maintenance-issues", path: issue.photoPaths[0] });
    expect(steps[2].table).toBe("maintenance_issues");
    expect(steps[2].row).toMatchObject({ enclosure_id: 7, map_x: 12.5, map_y: 30, urgent: true, photo_paths: issue.photoPaths });
    expect(steps[2].row.client_ref).toBeTruthy();
    expect(await keptPhoto(issue.photoPaths[0])).toBeUndefined();
    expect(waitingCount()).toBe(0);
});

test("reported and fixed with no signal: the report's added, and the issue points to it by their real ids", async () => {
    const issue = await addIssue(details);
    const { issue: fixed, report } = await fixIssue(issue, { doneOn: "2026-11-07", kind: "repair", details: "Mended" });
    expect(fixed.status).toBe("fixed");
    expect(report).toMatchObject({ enclosureId: 7, details: "Mended", loggedBy: "Mark" });
    expect(await loadMaintenanceIssues()).toEqual([expect.objectContaining({ status: "fixed" })]);
    expect(await loadAllMaintenance()).toEqual([expect.objectContaining({ details: "Mended" })]);

    online = true;
    await flushOutbox();
    expect(steps.map((s) => `${s.step} ${s.table}`)).toEqual(["insert maintenance_issues", "insert maintenance", "update maintenance_issues"]);
    expect(steps[2].row).toEqual({ status: "fixed", report_id: steps[1].id });
    expect(steps[2].where).toEqual({ id: steps[0].id, status: "open" });
    expect(outboxProblems()).toEqual([]);
});

test("closed with no signal: stays closed here, even once the old answer comes back", async () => {
    answer = {
        data: [{ id: 5, enclosure_id: 7, details: "Fence", urgent: false, status: "open", reported_at: "2026-11-01T10:00:00Z" }],
        error: null,
    };
    const [issue] = await loadMaintenanceIssues();
    const closed = await closeIssue(issue, "Duplicate");
    expect(closed).toMatchObject({ status: "closed", closeReason: "Duplicate", closedByName: "Mark" });
    expect((await loadMaintenanceIssues())[0].status).toBe("closed");
    online = true;
    await flushOutbox();
    expect(steps[0]).toMatchObject({ table: "maintenance_issues", row: { status: "closed", close_reason: "Duplicate" }, where: { id: 5, status: "open" } });
    // (a saved answer from before it was sent)
    expect((await loadMaintenanceIssues())[0].status).toBe("closed");
});

test("photos added with no signal: on the issue here, then added to whatever's there by then", async () => {
    answer = {
        data: [{ id: 5, enclosure_id: 7, details: "Fence", urgent: false, photo_paths: ["old.jpg"], status: "open", reported_at: "2026-11-01T10:00:00Z" }],
        error: null,
    };
    const [issue] = await loadMaintenanceIssues();
    const changed = await addIssuePhotos(issue, [new Blob(["new"], { type: "image/jpeg" })]);
    expect(changed.photoPaths).toHaveLength(2);
    expect((await loadMaintenanceIssues())[0].photoPaths).toEqual(changed.photoPaths);
    // (someone else's arrived meanwhile)
    current = ["old.jpg", "theirs.jpg"];
    online = true;
    await flushOutbox();
    expect(steps.map((s) => s.step)).toEqual(["upload", "update"]);
    expect(steps[1].row.photo_paths).toEqual(["old.jpg", "theirs.jpg", changed.photoPaths[1]]);
    expect(steps[1].where).toEqual({ id: 5 });
});

test("before the SQL's run: no issues, and no error", async () => {
    answer = { data: null, error: { code: "42P01", message: "no such table" } };
    await expect(loadMaintenanceIssues()).resolves.toEqual([]);
});

test("the database not ready for 4 photos yet: no issues shown, and a report says so rather than holding up other entries", async () => {
    answer = { data: null, error: { code: "42703", message: "no photo_paths" } };
    await expect(loadMaintenanceIssues()).resolves.toEqual([]);
    vi.spyOn(supabase, "from").mockImplementation(() => ({
        insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: "PGRST204", message: "no column" } }) }) }),
    }));
    online = false;
    await addIssue(details);
    online = true;
    await flushOutbox();
    expect(outboxProblems().map((e) => e.problem)).toEqual([expect.stringContaining("isn't ready yet")]);
});

test("a database refusal of a photo goes to Needs Attention rather than holding everything up", async () => {
    vi.spyOn(supabase.storage, "from").mockImplementation(() => ({
        upload: async () => ({ error: { statusCode: "403", message: "Not allowed" } }),
    }));
    online = false;
    await addIssue({ ...details, photos: [new Blob(["photo"])] });
    online = true;
    await flushOutbox();
    expect(outboxProblems().map((e) => e.kind)).toEqual(["issue-photo"]);
    expect(steps.map((s) => s.table)).toEqual(["maintenance_issues"]);
});
