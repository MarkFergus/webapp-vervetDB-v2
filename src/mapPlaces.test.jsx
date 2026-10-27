// The Interactive Map's places (mapPlaces.js) and tapping them in the map
// pop-up (WholeMap.jsx): a small card with a photo, the name and Open Page
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import enclosuresArr from "./enclosuresArr";
import { monkeysIn, placeCard, placesByLabel } from "./mapPlaces";
import WholeMap, { inkscapeLabel } from "./WholeMap";

const byName = (name, type) => enclosuresArr.find((e) => e.name === name && (!type || e.type === type));
const monkey = (name, troop, introcage = null, img = [`${name}.jpg`]) => ({ name, troop, introcage, img });
const MONKEYS = [
    monkey("Rocio", "Goliath"),
    monkey("Nita", "Goliath", "Goliath A"),
    monkey("Hope", "Goliath", "Goliath A", ["https://i.ibb.co/2YvYtBJ/blank-image-min.jpg"]),
    monkey("Pantshula", "Bachelor Block", "Bachelor Block A"),
];

describe("which place a map label is", () => {
    const labels = placesByLabel(enclosuresArr);

    test("enclosures by their map names, introcages and areas by their own", () => {
        expect(labels.get("Goliath troop")).toBe(byName("Goliath", "troop"));
        expect(labels.get("Dino & Daniel troop")).toBe(byName("D&D", "troop"));
        expect(labels.get("Bachelor block")).toBe(byName("Bachelor Block"));
        expect(labels.get("Goliath A")).toBe(byName("Goliath A"));
        expect(labels.get("Groomingdales")).toBe(byName("Groomingdales"));
        expect(labels.get("Dreamland")).toBe(byName("Dreamland"));
    });

    test("a one-area care unit: its name is the unit, not the area; the Sickbay is the Sickbay building", () => {
        expect(labels.get("Quarantine")).toBe(byName("Quarantine", "care_unit"));
        expect(labels.get("Sickbay building")).toBe(byName("Sickbay", "care_unit"));
    });

    test("anything else on the map isn't a place", () => {
        expect(labels.get("Main feed")).toBeUndefined();
        expect(labels.get("Goliath")).toBeUndefined(); // (the name label, not the shape)
    });
});

describe("a place's card", () => {
    test("an introcage: its first monkey's photo (not a blank one), what it is and how many live there", () => {
        expect(monkeysIn(byName("Goliath A"), MONKEYS).map((m) => m.name)).toEqual(["Hope", "Nita"]);
        expect(placeCard(byName("Goliath A"), enclosuresArr, MONKEYS)).toEqual({
            photo: "Nita.jpg",
            name: "Goliath A",
            kind: "Introcage at Goliath",
            count: 2,
        });
    });

    test("an enclosure: its own photo first; its troop counted (not its introcages)", () => {
        const goliath = { ...byName("Goliath", "troop"), photos: ["goliath.jpg"] };
        expect(placeCard(goliath, enclosuresArr, MONKEYS)).toMatchObject({
            photo: "goliath.jpg",
            kind: "Troop Enclosure",
            count: 1,
        });
    });

    test("a block counts the monkeys in its introcages; no photos: none", () => {
        expect(placeCard(byName("Bachelor Block"), enclosuresArr, MONKEYS)).toMatchObject({ kind: "Block", count: 1 });
        expect(placeCard(byName("Dreamland"), enclosuresArr, MONKEYS)).toMatchObject({
            photo: null,
            kind: "Area at Baby Care",
            count: 0,
        });
    });
});

describe("tapping the map", () => {
    // A stand-in map: Goliath's enclosure and one gate box, and a tree
    const MAP_FILE = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 595.3 841.9">
        <polygon inkscape:label="Goliath troop" points="0,0 50,0 50,50" />
        <rect inkscape:label="Goliath A" width="5" height="5" />
        <rect inkscape:label="Tree" width="5" height="5" />
        <text inkscape:label="Goliath A">A</text>
        <g inkscape:label="Goliath troop"><text>Goliath</text></g>
    </svg>`;
    beforeEach(() => vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(MAP_FILE)));
    afterEach(() => {
        vi.restoreAllMocks();
        delete document.elementFromPoint;
    });

    const shape = (label) => [...document.querySelectorAll(".WholeMap-view svg *")].find((el) => inkscapeLabel(el) === label);
    // A tap at a shape (jsdom has no layout: the shape is said to be under it)
    async function tap(user, label) {
        document.elementFromPoint = () => (label ? shape(label) : document.querySelector(".WholeMap-view svg"));
        await user.pointer({ keys: "[MouseLeft]", target: document.querySelector(".WholeMap-view") });
    }

    async function setup() {
        const user = userEvent.setup();
        const onClose = vi.fn();
        render(<WholeMap onClose={onClose} enclosures={enclosuresArr} monkeys={MONKEYS} />);
        // (the drawing loads first: on a busy machine running every test at
        // once that can take longer than the usual second)
        await screen.findByRole("img", { name: "The whole sanctuary map" }, { timeout: 5000 });
        return { user, onClose };
    }

    test("the places are marked; the rest of the map isn't", async () => {
        await setup();
        expect(shape("Goliath troop")).toHaveAttribute("data-place", String(byName("Goliath", "troop").id));
        expect(shape("Goliath A")).toHaveAttribute("data-place", String(byName("Goliath A").id));
        expect(shape("Tree")).not.toHaveAttribute("data-place");
        // (not the name written on the map, though it's labelled the same)
        // (nor a group of text named like the place)
        for (const text of document.querySelectorAll(".WholeMap-view text")) {
            expect(text).not.toHaveAttribute("data-place");
            expect(text.parentNode).not.toHaveAttribute("data-place");
        }
    });

    test("tapping an introcage: picked out, its card with Open Page", async () => {
        const { user, onClose } = await setup();
        await tap(user, "Goliath A");
        expect(shape("Goliath A")).toHaveClass("is-picked");
        const card = screen.getByRole("region", { name: "Goliath A" });
        expect(within(card).getByText("Introcage at Goliath")).toBeInTheDocument();
        expect(within(card).getByText("2 monkeys")).toBeInTheDocument();
        // (the photo: decoration, the name's beside it)
        expect(card.querySelector("img")).toHaveAttribute("src", expect.stringContaining("Nita"));
        const open = within(card).getByRole("link", { name: "Open Page" });
        expect(open).toHaveAttribute("href", `#enclosure/${byName("Goliath A").id}`);
        await user.click(open);
        expect(onClose).toHaveBeenCalled();
    });

    // (it slides back out to the left first; a slow machine running every
    // test at once can take a while)
    const cardGone = () => waitFor(() => expect(screen.queryByRole("region")).toBeNull(), { timeout: 5000 });

    test("a closing card slides out first, still picked out until it's gone", async () => {
        const { user } = await setup();
        await tap(user, "Goliath troop");
        await user.click(screen.getByRole("button", { name: "Close Goliath" }));
        // (sliding out; a slow machine may already have finished the 0.22s slide)
        const leaving = screen.queryByRole("region", { name: "Goliath" });
        if (leaving) expect(leaving).toHaveClass("is-leaving");
        await cardGone();
        expect(shape("Goliath troop")).not.toHaveClass("is-picked");
    });

    test("tapping somewhere else, the card's close or Escape puts the card away (Escape again: the map)", async () => {
        const { user, onClose } = await setup();
        await tap(user, "Goliath troop");
        expect(screen.getByRole("region", { name: "Goliath" })).toBeInTheDocument();
        await tap(user, null);
        await cardGone();
        expect(shape("Goliath troop")).not.toHaveClass("is-picked");

        await tap(user, "Goliath troop");
        await user.click(screen.getByRole("button", { name: "Close Goliath" }));
        await cardGone();

        await tap(user, "Goliath troop");
        await user.keyboard("{Escape}");
        await cardGone();
        expect(onClose).not.toHaveBeenCalled();
        await user.keyboard("{Escape}");
        expect(onClose).toHaveBeenCalled();
    });
});
