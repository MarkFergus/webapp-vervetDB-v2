// The outbox: entries wait on the phone, in order, and nothing's lost
import { displayId, discardEntry, flushOutbox, isLocalId, newLocalId, outboxEntries, outboxProblems, registerSender, resetOutbox, resolveId, retryEntry, setOutboxUser, submit, waitingCount } from "./outbox";
import { supabase } from "./supabase";

let online = true;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

const signedIn = (id = "me") =>
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: { id } } }, error: null });

beforeEach(() => {
    resetOutbox();
    online = true;
    setOutboxUser({ id: "me", name: "Mark" });
    signedIn();
});

test("with signal: saved straight away, with the real answer", async () => {
    registerSender("a", async () => ({ id: 5, real: true }));
    const { result, sent } = await submit("a", { localId: "local-1" }, { id: "local-1" });
    expect(sent).toBe(true);
    expect(result.real).toBe(true);
    expect(waitingCount()).toBe(0);
    expect(resolveId("local-1")).toBe(5);
    expect(displayId(5)).toBe("local-1");
});

test("no signal: kept, with what it will be; sent later, in order", async () => {
    const order = [];
    registerSender("a", async (p) => {
        order.push(p.n);
        return { id: p.n };
    });
    online = false;
    const first = await submit("a", { n: 1 }, { n: 1 });
    await submit("a", { n: 2 }, { n: 2 });
    expect(first).toEqual({ result: { n: 1 }, sent: false });
    expect(order).toEqual([]);
    expect(waitingCount()).toBe(2);

    online = true;
    await flushOutbox();
    expect(order).toEqual([1, 2]);
    expect(waitingCount()).toBe(0);
});

test("the connection drops: it stops, keeps the rest, and carries on later", async () => {
    let down = true;
    const sent = [];
    registerSender("a", async (p) => {
        if (down) throw { message: "TypeError: Failed to fetch", code: "" };
        sent.push(p.n);
        return {};
    });
    online = false;
    await submit("a", { n: 1 }, {});
    await submit("a", { n: 2 }, {});
    online = true;
    await flushOutbox();
    expect(waitingCount()).toBe(2);
    down = false;
    await flushOutbox();
    expect(sent).toEqual([1, 2]);
});

test("a database that isn't ready (SQL not run) isn't a refusal: tried again", async () => {
    registerSender("a", async () => {
        throw { code: "42703", message: "column client_ref does not exist" };
    });
    online = false;
    await submit("a", {}, {});
    online = true;
    await flushOutbox();
    expect(waitingCount()).toBe(1);
    expect(outboxProblems()).toHaveLength(0);
});

test("refused while they're here: taken back, and the message shown", async () => {
    registerSender("a", async () => { throw { code: "42501" }; }, () => "Not allowed.");
    await expect(submit("a", {}, {})).rejects.toThrow("Not allowed.");
    expect(outboxEntries()).toHaveLength(0);
});

test("refused later: kept to Try Again or Discard; what needs it waits with it", async () => {
    let refuse = true;
    registerSender("a", async () => {
        if (refuse) throw { code: "23514" };
        return { id: 9 };
    }, () => "Refused.");
    registerSender("b", async ({ on }) => ({ on: resolveId(on) }));
    online = false;
    const session = newLocalId();
    await submit("a", { localId: session }, {});
    await submit("b", { on: session }, {}, { needs: [session] });
    online = true;
    await flushOutbox();
    expect(outboxProblems().map((e) => e.problem)).toEqual(["Refused.", "The entry this belongs to hasn't been sent."]);

    refuse = false;
    const [first, second] = outboxProblems();
    await retryEntry(first.id);
    await retryEntry(second.id);
    expect(outboxProblems()).toHaveLength(0);
    expect(resolveId(session)).toBe(9);
    discardEntry(first.id);
    expect(outboxEntries().some((e) => e.id === first.id)).toBe(false);
});

test("only the person who made them sends them", async () => {
    const send = vi.fn(async () => ({}));
    registerSender("a", send);
    online = false;
    await submit("a", {}, {});
    online = true;
    signedIn("someone-else");
    setOutboxUser({ id: "someone-else", name: "Sam" });
    await flushOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(waitingCount()).toBe(0); // (not theirs to see)

    signedIn("me");
    setOutboxUser({ id: "me", name: "Mark" });
    expect(waitingCount()).toBe(1);
    await flushOutbox();
    expect(send).toHaveBeenCalledTimes(1);
});

test("no sign-in to send with yet (no signal to renew it): stays, unrefused", async () => {
    const send = vi.fn(async () => ({}));
    registerSender("a", send);
    online = false;
    await submit("a", {}, {});
    online = true;
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: null }, error: { message: "network" } });
    await flushOutbox();
    expect(send).not.toHaveBeenCalled();
    expect(waitingCount()).toBe(1);
});

test("local ids", () => {
    expect(isLocalId(newLocalId())).toBe(true);
    expect(isLocalId(5)).toBe(false);
    expect(resolveId(5)).toBe(5);
});
