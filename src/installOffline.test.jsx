// "Install & Use Offline": install steps or button, and saving every photo.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import App from "./App";
import { installPlatform, listenForInstall } from "./installApp";
import { aboutSize, allPhotos, downloadPhotos, photoStatus, saveThumbnails } from "./offlinePhotos";
import { loadMonkeyData } from "./monkeyData";

listenForInstall();

// Who's "signed in" for these tests (null = signed out)
const auth = vi.hoisted(() => ({ user: null }));
vi.mock("./auth", async (importOriginal) => ({
    ...(await importOriginal()),
    useAuth: () => ({ user: auth.user, isEditor: Boolean(auth.user), isAdmin: false, ready: true }),
}));
// The automatic thumbnail saving is checked here only by whether it starts
// (offline.test.jsx checks what it does)
vi.mock("./offlinePhotos", async (importOriginal) => ({
    ...(await importOriginal()),
    saveThumbnails: vi.fn(),
}));
afterEach(() => {
    auth.user = null;
});

const OURS = "https://demlwtsrnlkiskcntbcc.supabase.co/storage/v1/object/public/monkey-photos/";
const PLACEHOLDER = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";
const MONKEYS = [
    { id: 1, name: "Ava", troop: "Goliath", sex: "female", year: 2020, chip: "", bio: "", desc: "",
      img: [`${OURS}goliath/ava-1.jpg`, `${OURS}goliath/ava-2.jpg`] },
    { id: 2, name: "Bo", troop: "Goliath", sex: "male", year: 2021, chip: "", bio: "", desc: "",
      img: [`${OURS}goliath/bo-1.webp`] },
    { id: 3, name: "Cy", troop: "Goliath", sex: "male", year: 2022, chip: "", bio: "", desc: "",
      img: [PLACEHOLDER] },
];
const thumb = (name) => `${OURS}thumbs/goliath/${name}.webp`;

// A pretend service worker store: { cacheName: [urls] }
function fakeCaches(saved) {
    window.caches = {
        open: async (name) => ({
            keys: async () => (saved[name] ?? []).map((url) => ({ url })),
        }),
    };
    Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { controller: {} } });
}
afterEach(() => {
    delete window.caches;
    delete navigator.serviceWorker;
    vi.restoreAllMocks();
});

describe("which install steps", () => {
    test.each([
        ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1", 5, "iphone"],
        ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5, "iphone"], // an iPad
        ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 0, "computer"], // a Mac
        ["Mozilla/5.0 (Linux; Android 15) Chrome/140.0 Mobile", 5, "android"],
        ["Mozilla/5.0 (Android 15; Mobile; rv:143.0) Gecko/143.0 Firefox/143.0", 5, "android"],
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0", 0, "firefox"],
        ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36 Edg/140.0", 0, "computer"],
    ])("%s → %s", (userAgent, touchPoints, expected) => {
        expect(installPlatform(userAgent, touchPoints)).toBe(expected);
    });
});

describe("photo helpers", () => {
    test("every real photo once (not the placeholder)", () => {
        expect(allPhotos(MONKEYS)).toEqual([`${OURS}goliath/ava-1.jpg`, `${OURS}goliath/ava-2.jpg`, `${OURS}goliath/bo-1.webp`]);
    });

    test("what's saved, what's missing and roughly how big", async () => {
        fakeCaches({
            "vervetdb-photos": [`${OURS}goliath/ava-1.jpg`],
            "vervetdb-thumbnails": [thumb("ava-1"), thumb("ava-2"), thumb("bo-1")],
        });
        const status = await photoStatus(MONKEYS);
        expect(status.photos).toEqual({ saved: 1, total: 3 });
        expect(status.thumbs).toEqual({ saved: 3, total: 3 });
        expect(status.missing).toEqual([`${OURS}goliath/ava-2.jpg`, `${OURS}goliath/bo-1.webp`]);
        expect(status.bytesLeft).toBe(2 * 94 * 1024);
    });

    test.each([
        [59 * 1048576, "50–60 MB"],
        [45.5 * 1048576, "40–50 MB"],
        [8.2 * 1048576, "about 8 MB"],
        [300 * 1024, "under 1 MB"],
    ])("%i bytes reads as %s", (bytes, words) => {
        expect(aboutSize(bytes)).toBe(words);
    });

    test("downloading: each one fetched, progress reported, 'too many requests' retried", async () => {
        vi.useFakeTimers();
        const responses = { a: [429, 200], b: [200], c: [404] };
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => ({
            ok: responses[url][0] === 200,
            status: responses[url].shift(),
        }));
        const progress = [];
        const done = downloadPhotos(["a", "b", "c"], { onProgress: (n, total) => progress.push(`${n}/${total}`) });
        await vi.runAllTimersAsync();
        expect(await done).toBe(1); // c couldn't be saved
        expect(fetch.mock.calls.filter(([url]) => url === "a")).toHaveLength(2);
        expect(progress.at(-1)).toBe("3/3");
        vi.useRealTimers();
    });

    test("Stop: no more photos are fetched", async () => {
        const stopper = new AbortController();
        const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
            stopper.abort();
            return { ok: true, status: 200 };
        });
        await downloadPhotos(["a", "b", "c", "d", "e", "f", "g"], { signal: stopper.signal });
        expect(fetch.mock.calls.length).toBeLessThanOrEqual(3); // only the first few, already under way
    });
});

describe("the pop-up", () => {
    const dialog = () => screen.getByRole("dialog", { name: "Install & Use Offline" });

    // Phones: ☰ (the drawer)
    async function openFromMenu(user) {
        await user.click(screen.getByRole("button", { name: "Menu" }));
        await user.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "Install & Use Offline" }));
    }

    test("☰ → Install & Use Offline: install steps for this browser", async () => {
        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        await openFromMenu(user);
        expect(within(dialog()).getByText(/install icon/)).toBeInTheDocument();
        expect(within(dialog()).getByRole("heading", { name: "Use Offline" })).toBeInTheDocument();
        expect(within(dialog()).getByText("Download all photos to make available when offline.")).toBeInTheDocument();
        // No service worker here (a test): explains instead of offering a download
        expect(within(dialog()).getByText(/isn't ready in this window yet/)).toBeInTheDocument();
    });

    test("computers: the side rail (opened out) has it", async () => {
        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        await user.click(screen.getByRole("button", { name: "Open the side menu" }));
        await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Install & Use Offline" }));
        localStorage.removeItem("vervetdb-rail");
        expect(await screen.findByRole("dialog", { name: "Install & Use Offline" })).toBeInTheDocument();
    });

    test("where the browser offers it: an Install app button", async () => {
        const prompt = vi.fn();
        const offer = new Event("beforeinstallprompt");
        Object.assign(offer, { prompt, userChoice: Promise.resolve({ outcome: "accepted" }) });
        act(() => window.dispatchEvent(offer));

        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        await openFromMenu(user);
        await user.click(within(dialog()).getByRole("button", { name: "Install app" }));
        expect(prompt).toHaveBeenCalled();
        expect(await within(dialog()).findByText("You're using the installed app.")).toBeInTheDocument();
    });

    test("signed out: the counts, and Sign in instead of Download all", async () => {
        fakeCaches({});
        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        await openFromMenu(user);
        expect(await within(dialog()).findAllByText("0 of 3")).toHaveLength(2);
        expect(within(dialog()).queryByRole("button", { name: /Download all photos/ })).toBeNull();
        expect(within(dialog()).getByText(/Staff can download every photo \(under 1 MB\)/)).toBeInTheDocument();
        await user.click(within(dialog()).getByRole("button", { name: "Sign in to download all photos" }));
        expect(await screen.findByRole("dialog", { name: "Sign in" })).toBeInTheDocument();
    });

    test("signed in: counts, Download all, then everything saved", async () => {
        auth.user = { email: "staff@example.com" };
        const saved = { "vervetdb-photos": [], "vervetdb-thumbnails": [thumb("ava-1"), thumb("ava-2"), thumb("bo-1")] };
        fakeCaches(saved);
        vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
            saved["vervetdb-photos"].push(url); // the service worker keeps it
            return { ok: true, status: 200 };
        });

        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        await openFromMenu(user);
        expect(await within(dialog()).findByText("0 of 3")).toBeInTheDocument();
        expect(within(dialog()).getByText("3 of 3")).toBeInTheDocument(); // thumbnails
        await user.click(within(dialog()).getByRole("button", { name: "Download all photos (under 1 MB)" }));
        expect(await within(dialog()).findByText("Every photo is saved on this device.")).toBeInTheDocument();
        await waitFor(() => expect(within(dialog()).getAllByText("3 of 3")).toHaveLength(2));
    });
});

describe("saving thumbnails automatically", () => {
    afterEach(() => {
        vi.mocked(saveThumbnails).mockClear();
        vi.mocked(loadMonkeyData).mockReset().mockImplementation(async () => ({ monkeys: MONKEYS, troops: ["All Troops", "Goliath"], troopIds: {} }));
    });

    test("not for visitors who aren't signed in (on the website)", async () => {
        vi.mocked(loadMonkeyData).mockResolvedValue({ monkeys: MONKEYS, troops: ["All Troops", "Goliath"], troopIds: {} });
        render(<App />);
        await screen.findByRole("button", { name: /^Ava/ });
        await new Promise((resolve) => setTimeout(resolve, 3500));
        expect(saveThumbnails).not.toHaveBeenCalled();
    });

    test("for signed-in staff", async () => {
        auth.user = { email: "staff@example.com" };
        vi.mocked(loadMonkeyData).mockResolvedValue({ monkeys: MONKEYS, troops: ["All Troops", "Goliath"], troopIds: {} });
        render(<App />);
        await screen.findByRole("button", { name: /^Ava/ });
        await waitFor(() => expect(saveThumbnails).toHaveBeenCalledWith(MONKEYS), { timeout: 5000 });
    });

    test("for anyone using the installed app", async () => {
        window.matchMedia = (query) => ({ matches: query === "(display-mode: standalone)" });
        vi.mocked(loadMonkeyData).mockResolvedValue({ monkeys: MONKEYS, troops: ["All Troops", "Goliath"], troopIds: {} });
        try {
            render(<App />);
            await screen.findByRole("button", { name: /^Ava/ });
            await waitFor(() => expect(saveThumbnails).toHaveBeenCalled(), { timeout: 5000 });
        } finally {
            delete window.matchMedia;
        }
    });
});
