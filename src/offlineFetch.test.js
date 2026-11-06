// Reading with no signal, or on wifi going nowhere
import { clearSavedRecords, lastContact, offlineFetch } from "./offlineFetch";

const BASE = "https://x.supabase.co/rest/v1/";
const headers = { apikey: "pub", Authorization: "Bearer my-token", Accept: "application/json" };
let online = true;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });

// A pretend Cache Storage
function fakeCaches() {
    const stores = new Map();
    return {
        open: async (name) => {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                match: async (key) => store.get(key)?.clone(),
                put: async (key, response) => void store.set(key, response),
            };
        },
        delete: async (name) => stores.delete(name),
    };
}
const answer = (body, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
    online = true;
    localStorage.clear();
    vi.stubGlobal("caches", fakeCaches());
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

test("saved when it answers, and used when there's no signal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries?a=1`, { headers });
    expect(lastContact()).toBeTruthy();
    online = false;
    fetch.mockClear();
    const response = await offlineFetch(`${BASE}injuries?a=1`, { headers });
    expect(await response.json()).toEqual([1]);
    expect(fetch).not.toHaveBeenCalled();
});

test("phone says it's connected but the request fails: the saved answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers });
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    expect(await (await offlineFetch(`${BASE}injuries`, { headers })).json()).toEqual([1]);
});

test("nothing saved: the failure comes through as before", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    await expect(offlineFetch(`${BASE}injuries`, { headers })).rejects.toThrow("Failed to fetch");
});

test("wifi going nowhere: the saved answer after a few seconds", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers });
    vi.useFakeTimers();
    fetch.mockImplementation(() => new Promise(() => {}));
    const pending = offlineFetch(`${BASE}injuries`, { headers });
    await vi.advanceTimersByTimeAsync(7000);
    expect(await (await pending).json()).toEqual([1]);
});

test("visitors' answers aren't saved, nor the monkeys (savedData keeps those)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers: { apikey: "pub", Authorization: "Bearer pub" } });
    await offlineFetch(`${BASE}monkeys?select=id`, { headers });
    online = false;
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(offlineFetch(`${BASE}injuries`, { headers })).rejects.toThrow();
    await expect(offlineFetch(`${BASE}monkeys?select=id`, { headers })).rejects.toThrow();
});

test("a sign-in that can't renew, or a database that's down: the saved answer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers });
    fetch.mockResolvedValue(answer({ message: "JWT expired" }, 401));
    expect(await (await offlineFetch(`${BASE}injuries`, { headers })).json()).toEqual([1]);
});

test("signing out: nothing stays", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers });
    await clearSavedRecords();
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(offlineFetch(`${BASE}injuries`, { headers })).rejects.toThrow();
});

test("writes are never served from what's saved", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => answer([1])));
    await offlineFetch(`${BASE}injuries`, { headers });
    fetch.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(offlineFetch(`${BASE}injuries`, { method: "POST", headers })).rejects.toThrow();
});
