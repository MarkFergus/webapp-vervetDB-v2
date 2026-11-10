// Offline use: the copy of the monkeys saved on the device, thumbnails,
// photo fallbacks and saving thumbnails in the background.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";
import MonkeyCard from "./MonkeyCard";
import { loadMonkeyData, BUILT_IN_DATA } from "./monkeyData";
import { loadSavedCopy, saveCopy, timeAgo } from "./savedData";
import { thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import { saveMap, saveThumbnails } from "./offlinePhotos";

const OURS = "https://demlwtsrnlkiskcntbcc.supabase.co/storage/v1/object/public/monkey-photos/";
const PLACEHOLDER = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";

// One monkey "from the database", so it's clear which copy is showing
const LIVE = {
    troops: ["All Troops", "Goliath"],
    troopIds: { Goliath: 1 },
    monkeys: [
        {
            id: 1, name: "Brand New", sex: "female", chip: "", troop: "Goliath", year: 2026,
            img: [`${OURS}goliath/brand-new-1.jpg`], bio: "", desc: "",
        },
    ],
};

// Pretend the device is on- or offline (and tell the page, as browsers do)
let online = true;
Object.defineProperty(navigator, "onLine", { configurable: true, get: () => online });
function goOnline(value) {
    online = value;
    act(() => window.dispatchEvent(new Event(value ? "online" : "offline")));
}

afterEach(() => {
    online = true;
    vi.mocked(loadMonkeyData).mockReset().mockImplementation(async () => BUILT_IN_DATA);
});

describe("the copy saved on the device", () => {
    test("saved and read back", () => {
        expect(loadSavedCopy()).toBeNull();
        saveCopy(LIVE);
        const copy = loadSavedCopy();
        expect(copy.monkeys).toEqual(LIVE.monkeys);
        expect(copy.troops).toEqual(LIVE.troops);
        expect(copy.savedAt).toBeGreaterThan(Date.now() - 1000);
    });

    test("an unreadable copy counts as none", () => {
        localStorage.setItem("vervetdb-saved-data", "{not json");
        expect(loadSavedCopy()).toBeNull();
        localStorage.setItem("vervetdb-saved-data", JSON.stringify({ monkeys: "nope" }));
        expect(loadSavedCopy()).toBeNull();
    });

    test.each([
        [0, "just now"],
        [60_000, "1 minute ago"],
        [5 * 60_000, "5 minutes ago"],
        [60 * 60_000, "1 hour ago"],
        [3 * 60 * 60_000, "3 hours ago"],
        [2 * 24 * 60 * 60_000, "2 days ago"],
    ])("%i ms ago reads as %s", (ago, words) => {
        expect(timeAgo(1_000_000_000 - ago, 1_000_000_000)).toBe(words);
    });
});

describe("the app with and without a connection", () => {
    test("live data is saved on the device", async () => {
        vi.mocked(loadMonkeyData).mockResolvedValue(LIVE);
        render(<App />);
        await screen.findByRole("button", { name: /^Brand New/ });
        // Saved just after the cards appear
        await waitFor(() => expect(loadSavedCopy()?.monkeys[0].name).toBe("Brand New"));
        expect(screen.queryByRole("alert")).toBeNull();
    });

    test("database unreachable (but online): the saved copy, with a note", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        saveCopy(LIVE);
        vi.mocked(loadMonkeyData).mockRejectedValue(new Error("paused"));
        render(<App />);
        expect(await screen.findByRole("alert")).toHaveTextContent(
            "Couldn't reach the database, so these are the monkeys saved on this device just now."
        );
        expect(screen.getByRole("button", { name: /^Brand New/ })).toBeInTheDocument();
    });

    test("database slow (e.g. a phone woken after a while): the saved copy with a quiet Loading…, then live", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            saveCopy(LIVE);
            let arrive;
            vi.mocked(loadMonkeyData).mockReturnValue(new Promise((done) => (arrive = done)));
            render(<App />);
            await vi.advanceTimersByTimeAsync(4100);
            expect(await screen.findByText("Loading…")).toHaveClass("is-loading");
            expect(screen.queryByRole("alert")).toBeNull();
            expect(screen.getByRole("button", { name: /^Brand New/ })).toBeInTheDocument();
            arrive({ ...LIVE, monkeys: [{ ...LIVE.monkeys[0], id: 2, name: "Fresh One" }] });
            expect(await screen.findByRole("button", { name: /^Fresh One/ })).toBeInTheDocument();
            expect(screen.queryByText("Loading…")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    test("database slow, then it fails: the Couldn't reach the database note after all", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            saveCopy(LIVE);
            let fail;
            vi.mocked(loadMonkeyData).mockReturnValue(new Promise((_, no) => (fail = no)));
            render(<App />);
            await vi.advanceTimersByTimeAsync(4100);
            expect(await screen.findByText("Loading…")).toBeInTheDocument();
            fail(new Error("The database took too long to respond"));
            expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the database");
            expect(screen.queryByText("Loading…")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    test("opened offline: the saved copy straight away, then live data once back online", async () => {
        saveCopy(LIVE);
        online = false;
        vi.mocked(loadMonkeyData).mockResolvedValue({
            ...LIVE,
            monkeys: [{ ...LIVE.monkeys[0], id: 2, name: "Fresh One" }],
        });
        render(<App />);
        // No "Loading monkeys…" and no database call
        expect(screen.getByRole("alert")).toHaveTextContent(
            "You're offline, so these are the monkeys saved on this device just now. Daily entries still save and send later; other editing is off until you're back online."
        );
        expect(await screen.findByRole("button", { name: /^Brand New/ })).toBeInTheDocument();
        expect(loadMonkeyData).not.toHaveBeenCalled();

        goOnline(true);
        expect(await screen.findByRole("button", { name: /^Fresh One/ })).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    test("opened offline with nothing saved: the built-in copy", async () => {
        online = false;
        render(<App />);
        expect(screen.getByRole("alert")).toHaveTextContent("Couldn't reach the database, so this is a saved copy");
        expect(await screen.findByRole("button", { name: /^Aroha/ })).toBeInTheDocument();
    });

    test("couldn't reach the database: coming back to the app tries again straight away", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        saveCopy(LIVE);
        vi.mocked(loadMonkeyData).mockRejectedValueOnce(new Error("paused"));
        render(<App />);
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the database");
        vi.mocked(loadMonkeyData).mockResolvedValue({ ...LIVE, monkeys: [{ ...LIVE.monkeys[0], id: 2, name: "Fresh One" }] });
        document.dispatchEvent(new Event("visibilitychange"));
        expect(await screen.findByRole("button", { name: /^Fresh One/ })).toBeInTheDocument();
        expect(screen.queryByRole("alert")).toBeNull();
    });

    test("a moment without a connection (a phone waking up): no note", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            vi.mocked(loadMonkeyData).mockResolvedValue(LIVE);
            render(<App />);
            await screen.findByRole("button", { name: /^Brand New/ });
            goOnline(false);
            await vi.advanceTimersByTimeAsync(1000);
            goOnline(true);
            await vi.advanceTimersByTimeAsync(3000);
            expect(screen.queryByRole("alert")).toBeNull();
        } finally {
            vi.useRealTimers();
        }
    });

    test("losing the connection after loading: a note that editing is off (once it's lasted a few seconds)", async () => {
        vi.mocked(loadMonkeyData).mockResolvedValue(LIVE);
        render(<App />);
        await screen.findByRole("button", { name: /^Brand New/ });
        goOnline(false);
        expect(await screen.findByRole("alert", {}, { timeout: 4000 })).toHaveTextContent(
            "You're offline. Daily entries still save and send later. Photos you haven't opened before may not show, and other editing is off"
        );
        goOnline(true);
        await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    });
});

describe("thumbnails", () => {
    test("a stored photo's thumbnail is under thumbs/, as WebP", () => {
        expect(thumbUrl(`${OURS}goliath/nova-1.jpg`)).toBe(`${OURS}thumbs/goliath/nova-1.webp`);
        expect(thumbUrl(`${OURS}thumbs/goliath/nova-1.webp`)).toBe(`${OURS}thumbs/goliath/nova-1.webp`);
    });

    test("photos stored elsewhere (the placeholder) have no thumbnail", () => {
        expect(thumbUrl(PLACEHOLDER)).toBe(PLACEHOLDER);
    });

    test("cards show the thumbnail, and the full photo if the thumbnail won't load", () => {
        const { container } = render(
            <MonkeyCard name="Nova" sex="female" year={2024} troop="Goliath" img={`${OURS}goliath/nova-1.jpg`} />
        );
        const img = container.querySelector("img");
        expect(img).toHaveAttribute("src", `${OURS}thumbs/goliath/nova-1.webp`);
        fireEvent.error(img);
        expect(img).toHaveAttribute("src", `${OURS}goliath/nova-1.jpg`);
    });

    test("fallbackTo: swaps once, then gives up and tells", () => {
        const then = vi.fn();
        const img = document.createElement("img");
        img.src = "https://x.co/full.jpg";
        const handle = fallbackTo("https://x.co/thumb.webp", then);
        handle({ currentTarget: img });
        expect(img.getAttribute("src")).toBe("https://x.co/thumb.webp");
        expect(then).not.toHaveBeenCalled();
        handle({ currentTarget: img });
        expect(then).toHaveBeenCalledTimes(1);
    });
});

describe("saving thumbnails in the background", () => {
    const monkeys = [
        { img: [`${OURS}goliath/a-1.jpg`, `${OURS}goliath/a-2.webp`] },
        { img: [PLACEHOLDER] },
        { img: [PLACEHOLDER] },
    ];
    function withServiceWorker(connection) {
        Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: {} } });
        Object.defineProperty(navigator, "connection", { configurable: true, value: connection });
    }
    afterEach(() => {
        delete navigator.serviceWorker;
        delete navigator.connection;
        vi.restoreAllMocks();
    });

    test("fetches each thumbnail once (the service worker keeps them)", async () => {
        withServiceWorker(undefined);
        const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
        await saveThumbnails(monkeys);
        expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual(
            [`${OURS}thumbs/goliath/a-1.webp`, `${OURS}thumbs/goliath/a-2.webp`, PLACEHOLDER].sort()
        );
        expect(fetch.mock.calls[0][1]).toEqual({ mode: "cors" });
    });

    test("nothing without a service worker (it couldn't keep them)", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        await saveThumbnails(monkeys);
        expect(fetch).not.toHaveBeenCalled();
    });

    test("nothing on data-saver or a very slow connection", async () => {
        const fetch = vi.spyOn(globalThis, "fetch");
        withServiceWorker({ saveData: true });
        await saveThumbnails(monkeys);
        withServiceWorker({ effectiveType: "2g" });
        await saveThumbnails(monkeys);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("saving the map ahead of time", () => {
    const before = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    beforeEach(() => {
        Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: {} } });
    });
    afterEach(() => {
        vi.unstubAllGlobals();
        if (before) Object.defineProperty(navigator, "serviceWorker", before);
        else delete navigator.serviceWorker;
    });

    test("fetched when it isn't saved yet (the service worker keeps it); not again once it is", async () => {
        const fetched = vi.fn(async () => new Response("<svg/>"));
        vi.stubGlobal("fetch", fetched);
        vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
        expect(await saveMap()).toBe(true);
        expect(fetched).toHaveBeenCalledWith("/VMF_Sanctuary_Map.svg");

        fetched.mockClear();
        vi.stubGlobal("caches", { match: vi.fn(async () => new Response("<svg/>")) });
        expect(await saveMap()).toBe(false);
        expect(fetched).not.toHaveBeenCalled();
    });

    test("no signal: no harm, and it tries again next time", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
        vi.stubGlobal("caches", { match: vi.fn(async () => undefined) });
        expect(await saveMap()).toBe(false);
    });
});
