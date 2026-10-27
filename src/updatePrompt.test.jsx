// "Version 1.5.0 is now live!": Update switches to it, Later hides the card.
import { useState } from "react";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdatePrompt, { UPDATE_GIVE_UP_MS } from "./UpdatePrompt";

const updateServiceWorker = vi.fn();
let updateWaiting = false;

vi.mock("virtual:pwa-register/react", () => ({
    useRegisterSW: () => ({
        needRefresh: useState(updateWaiting),
        offlineReady: useState(false),
        updateServiceWorker,
    }),
}));

// The server's version.json (or no answer)
function serverHas(version) {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
        version ? { ok: true, json: async () => ({ version }) } : Promise.reject(new Error("offline"))
    );
}

beforeEach(() => updateServiceWorker.mockClear());
afterEach(() => vi.restoreAllMocks());

test("shows nothing when there's no new version", () => {
    updateWaiting = false;
    serverHas("1.5.0");
    render(<UpdatePrompt />);
    expect(screen.queryByRole("status")).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
});

test("says which version is live; Update switches to it", async () => {
    updateWaiting = true;
    serverHas("1.5.0");
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    expect(await screen.findByRole("status")).toHaveTextContent("Version 1.5.0 is now live!");
    expect(fetch.mock.calls[0][0]).toMatch(/^\/version\.json\?t=\d+$/);
    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
});

test("while it switches: says so, with a spinner, and no Later", async () => {
    updateWaiting = true;
    serverHas("1.5.0");
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    await user.click(await screen.findByRole("button", { name: "Update" }));
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Updating to version 1.5.0…");
    expect(status).toHaveAttribute("aria-busy", "true");
    const button = screen.getByRole("button", { name: "Updating…" });
    expect(button).toBeDisabled();
    expect(button.querySelector(".UpdatePrompt-spinner")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Later" })).toBeNull();
});

test("the switch taking too long: the page reloads anyway", async () => {
    updateWaiting = true;
    serverHas("1.5.0");
    const reload = vi.fn();
    render(<UpdatePrompt reload={reload} />);
    const update = await screen.findByRole("button", { name: "Update" });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
        act(() => update.click());
        act(() => vi.advanceTimersByTime(UPDATE_GIVE_UP_MS - 1));
        expect(reload).not.toHaveBeenCalled();
        act(() => vi.advanceTimersByTime(1));
        expect(reload).toHaveBeenCalledTimes(1);
    } finally {
        vi.useRealTimers();
    }
});

test("the number can't be found (offline): it says a new version is live", async () => {
    updateWaiting = true;
    serverHas(null);
    render(<UpdatePrompt />);
    expect(await screen.findByRole("status")).toHaveTextContent("A new version of vervetDB is now live!");
});

test("Later hides it without switching", async () => {
    updateWaiting = true;
    serverHas("1.5.0");
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    await user.click(await screen.findByRole("button", { name: "Later" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(updateServiceWorker).not.toHaveBeenCalled();
});
