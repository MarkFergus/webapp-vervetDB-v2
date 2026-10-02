// "A new version is ready": Refresh switches to it, Later hides the card.
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

beforeEach(() => updateServiceWorker.mockClear());

test("shows nothing when there's no new version", () => {
    updateWaiting = false;
    render(<UpdatePrompt />);
    expect(screen.queryByText(/new version/)).toBeNull();
});

test("Refresh switches to the new version", async () => {
    updateWaiting = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    expect(screen.getByRole("status")).toHaveTextContent("A new version of vervetDB is ready.");
    await user.click(screen.getByRole("button", { name: "Refresh" }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
});

test("Later hides it without switching", async () => {
    updateWaiting = true;
    const user = userEvent.setup();
    render(<UpdatePrompt />);
    await user.click(screen.getByRole("button", { name: "Later" }));
    expect(screen.queryByText(/new version/)).toBeNull();
    expect(updateServiceWorker).not.toHaveBeenCalled();
});
