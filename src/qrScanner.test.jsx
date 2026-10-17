// Scan QR Code: which codes lead where, and the scanner's camera messages
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { qrDestination } from "./qrLink";
import QrScanner from "./QrScanner";

describe("what a code leads to", () => {
    test("an Introcage Sign's code: its page", () => {
        expect(qrDestination("https://vervetdb.com/#enclosure/26", "https://vervetdb.com")).toBe("#enclosure/26");
        expect(qrDestination("  https://vervetdb.com/#enclosure/26\n", "http://localhost:3000")).toBe("#enclosure/26");
    });

    test("a copy running elsewhere follows its own links too", () => {
        expect(qrDestination("http://localhost:3000/#enclosure/5", "http://localhost:3000")).toBe("#enclosure/5");
    });

    test("anything else: nowhere (another site, plain text, other pages)", () => {
        expect(qrDestination("https://example.com/#enclosure/26", "https://vervetdb.com")).toBeNull();
        expect(qrDestination("hello", "https://vervetdb.com")).toBeNull();
        expect(qrDestination("https://vervetdb.com/#game", "https://vervetdb.com")).toBeNull();
        expect(qrDestination("https://vervetdb.com/", "https://vervetdb.com")).toBeNull();
    });
});

describe("the scanner", () => {
    afterEach(() => {
        delete navigator.mediaDevices;
    });

    test("no camera on this device: says so; Close closes", async () => {
        const onClose = vi.fn();
        render(<QrScanner onClose={onClose} onFound={vi.fn()} />);
        expect(await screen.findByText("Couldn't start the camera on this device.")).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Close" }));
        expect(onClose).toHaveBeenCalled();
    });

    test("the camera turned off for the site: how to allow it", async () => {
        Object.defineProperty(navigator, "mediaDevices", {
            configurable: true,
            value: { getUserMedia: vi.fn().mockRejectedValue(Object.assign(new Error("no"), { name: "NotAllowedError" })) },
        });
        render(<QrScanner onClose={vi.fn()} onFound={vi.fn()} />);
        await waitFor(() => expect(screen.getByText(/The camera is turned off for vervetDB/)).toBeInTheDocument());
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { facingMode: "environment" }, audio: false });
    });
});
