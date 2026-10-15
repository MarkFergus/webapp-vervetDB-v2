// The Interactive Map pop-up (WholeMap.jsx): the whole map, zooming in and
// out, and back to the whole map
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WholeMap from "./WholeMap";

// A stand-in map file: just its size, like the real one (A4)
const MAP_FILE = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595.3 841.9"><rect width="10" height="10"/></svg>';

beforeEach(() => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(MAP_FILE));
});
afterEach(() => vi.restoreAllMocks());

// The part of the map in view: [x, y, width, height]
const view = () => screen.getByRole("img", { name: "The whole sanctuary map" }).getAttribute("viewBox").split(" ").map(Number);

async function setup() {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<WholeMap onClose={onClose} />);
    await screen.findByRole("img", { name: "The whole sanctuary map" });
    return { user, onClose };
}

test("opens on the whole map, ready to zoom in", async () => {
    await setup();
    expect(screen.getByRole("dialog", { name: "Sanctuary Map" })).toBeInTheDocument();
    // (the whole map's height fits: it's taller than it is wide)
    expect(view()[3]).toBeCloseTo(841.9);
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Zoom Out" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Whole Map" })).toBeDisabled();
});

test("Zoom In and Zoom Out, and Whole Map goes back to the start", async () => {
    const { user } = await setup();
    await user.click(screen.getByRole("button", { name: "Zoom In" }));
    expect(view()[3]).toBeCloseTo(841.9 / 1.6);
    await user.click(screen.getByRole("button", { name: "Zoom In" }));
    await user.click(screen.getByRole("button", { name: "Zoom Out" }));
    expect(view()[3]).toBeCloseTo(841.9 / 1.6);
    await user.click(screen.getByRole("button", { name: "Whole Map" }));
    expect(view()[3]).toBeCloseTo(841.9);
});

test("the slider: all the way right is the closest zoom (12 times), back to 0 the whole map", async () => {
    await setup();
    const slider = screen.getByRole("slider", { name: "Zoom" });
    expect(slider).toHaveValue("0");
    fireEvent.change(slider, { target: { value: "100" } });
    expect(view()[3]).toBeCloseTo(841.9 / 12);
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeDisabled();
    // (Zoom In moves the slider along too)
    fireEvent.change(slider, { target: { value: "0" } });
    await userEvent.click(screen.getByRole("button", { name: "Zoom In" }));
    expect(Number(slider.value)).toBeGreaterThan(0);
    fireEvent.change(slider, { target: { value: "0" } });
    expect(view()[3]).toBeCloseTo(841.9);
});

test("the keyboard: + and − zoom, 0 shows the whole map, Escape closes", async () => {
    const { user, onClose } = await setup();
    await user.keyboard("+");
    expect(view()[3]).toBeCloseTo(841.9 / 1.6);
    await user.keyboard("0");
    expect(view()[3]).toBeCloseTo(841.9);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
});

test("if the map can't load, it says so", async () => {
    globalThis.fetch.mockResolvedValue(new Response("", { status: 404 }));
    // (a fresh copy: the map loaded by the tests above is kept)
    vi.resetModules();
    const { default: FreshMap } = await import("./WholeMap");
    render(<FreshMap onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Couldn't load the map/)).toBeInTheDocument());
});

describe("My Location", () => {
    // A pretend GPS: the test says where the phone is
    let gps;
    beforeEach(() => {
        gps = { watchPosition: vi.fn((found, failed) => { gps.found = found; gps.failed = failed; return 7; }), clearWatch: vi.fn() };
        Object.defineProperty(navigator, "geolocation", { value: gps, configurable: true });
    });
    afterEach(() => delete navigator.geolocation);
    // The Sickbay building's top-left corner (a reference point: 275.5, 475 on the map)
    const SICKBAY = { latitude: -(23 + 51 / 60 + 8.21 / 3600), longitude: 30 + 20 / 60 + 16.44 / 3600, accuracy: 8 };
    const dot = () => document.querySelector(".WholeMap-hereDot");

    test("finds you: a blue dot where you are, and the map moves to you", async () => {
        const { user } = await setup();
        const button = screen.getByRole("button", { name: "My Location" });
        await user.click(button);
        expect(button).toHaveAttribute("aria-pressed", "true");
        expect(screen.getByRole("status")).toHaveTextContent("Finding your location…");
        act(() => gps.found({ coords: SICKBAY }));
        expect(Number(dot().getAttribute("cx"))).toBeCloseTo(275.5, -1);
        expect(Number(dot().getAttribute("cy"))).toBeCloseTo(475, -1);
        expect(screen.getByRole("status")).toHaveTextContent("");
        // (zoomed in on you, with you in the middle)
        const [x, y, width, height] = view();
        expect(height).toBeLessThan(841.9 / 2);
        expect(x + width / 2).toBeCloseTo(Number(dot().getAttribute("cx")), 0);
        expect(y + height / 2).toBeCloseTo(Number(dot().getAttribute("cy")), 0);

        // Off again: no dot, and the phone stops being followed
        await user.click(button);
        expect(dot()).toBeNull();
        expect(gps.clearWatch).toHaveBeenCalledWith(7);
    });

    test("away from the sanctuary: says so, no dot", async () => {
        const { user } = await setup();
        await user.click(screen.getByRole("button", { name: "My Location" }));
        act(() => gps.found({ coords: { ...SICKBAY, latitude: SICKBAY.latitude + 0.05 } }));
        expect(dot()).toBeNull();
        expect(screen.getByRole("status")).toHaveTextContent("You're not at the sanctuary right now");
    });

    test("location turned off for the site: says how to turn it on", async () => {
        const { user } = await setup();
        const button = screen.getByRole("button", { name: "My Location" });
        await user.click(button);
        act(() => gps.failed({ code: 1 }));
        expect(screen.getByRole("status")).toHaveTextContent("Allow it in your browser's settings");
        expect(button).toHaveAttribute("aria-pressed", "false");
    });
});
