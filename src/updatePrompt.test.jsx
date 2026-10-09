// "Version 1.5.0 is now live!": Update switches to it, Later hides the card.
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import UpdatePrompt from "./UpdatePrompt";

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
