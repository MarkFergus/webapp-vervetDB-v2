// Records → Sections → Feeding: everyone's feeding on one page, the AM Plates
// List to download, and Troop Bowls
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RecordsPage from "./RecordsPage";
import { OpenMonkeyContext } from "./openMonkey";
import { amSummary, amText, bowlsText, cageHasBaby, feedingList, pmText, troopBowlsList } from "./feeding";
import { saveEnclosure } from "./monkeyData";

vi.mock("./monkeyData", async (original) => ({ ...(await original()), saveEnclosure: vi.fn() }));

const feeding = (extra = {}) => ({
    fedBy: "localTeam", amPlates: 1, amCutSmall: false, amFruit: false, amMetalPlate: false, pmBowls: 1, ...extra,
});
const monkey = (id, name, introcage, enclosure, extra = {}) => ({
    id, name, troop: null, introcage, introcageType: "introcage", enclosure, year: 2015, img: [], feeding: feeding(), ...extra,
});
const NO_BOWLS = { small: 0, medium: 0, large: 0 };
const ENCLOSURES = [
    { id: 1, name: "Goliath", type: "troop", parentId: null, sortOrder: 1, section: "Top", bowls: { small: 2, medium: 2, large: 0 } },
    { id: 2, name: "Goliath A", type: "introcage", parentId: 1, sortOrder: 1, section: "Top" },
    { id: 3, name: "Koko", type: "troop", parentId: null, sortOrder: 2, section: "Middle", bowls: NO_BOWLS },
    { id: 4, name: "Koko A", type: "introcage", parentId: 3, sortOrder: 1, section: "Middle" },
    { id: 5, name: "Bandits", type: "troop", parentId: null, sortOrder: 3, section: null, bowls: NO_BOWLS },
];
const MONKEYS = [
    monkey(1, "Ace", "Goliath A", "Goliath", { feeding: feeding({ amPlates: 2, amCutSmall: true, pmBowls: 2 }) }),
    monkey(2, "Roman", "Koko A", "Koko", { feeding: feeding({ fedBy: "sickbay" }) }),
    monkey(3, "Tiny", "Koko A", "Koko", { year: new Date().getFullYear() - 1 + (new Date().getMonth() >= 9 ? 1 : 0) }),
    { ...monkey(4, "Wild", null, "Goliath"), introcageType: null, troop: "Goliath" },
];
const ADMIN = { isAdmin: true, canAdd: true, canSee: true };
const EDITOR = { isAdmin: false, canAdd: true, canSee: true };

const open = (staff, extra = {}) =>
    render(
        <RecordsPage route="records/sections/feeding" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter staff={staff} {...extra} />
    );

beforeEach(() => vi.clearAllMocks());

describe("the list", () => {
    test("each group's introcages and monkeys, troop monkeys left out", () => {
        const groups = feedingList(MONKEYS, ENCLOSURES);
        expect(groups.map((g) => g.title)).toEqual(["Top Section", "Middle Section"]);
        expect(groups[0].plates).toBe(2);
        expect(groups[0].places[0].monkeys[0]).toMatchObject({ sickbay: false, am: "2 plates, cut small", pm: "2 bowls, cut small" });
        expect(groups.flatMap((g) => g.places.flatMap((p) => p.monkeys.map((r) => r.monkey.name)))).toEqual(["Ace", "Roman", "Tiny"]);
    });

    test("filtered by who feeds them; a monkey in Sickbay counts as Sickbay's", () => {
        const names = (show, list = MONKEYS) => feedingList(list, ENCLOSURES, show).flatMap((g) => g.places.flatMap((p) => p.monkeys.map((r) => r.monkey.name)));
        expect(names("localTeam")).toEqual(["Ace", "Tiny"]);
        expect(names("sickbay")).toEqual(["Roman"]);
        expect(names("sickbay", [...MONKEYS.slice(0, 1).map((m) => ({ ...m, inSickbay: true }))])).toEqual(["Ace"]);
    });

    test("babies at home: noted on their introcage, not when the only baby is fed by Sickbay", () => {
        const koko = (list) => feedingList(list, ENCLOSURES).find((g) => g.title === "Middle Section").places[0];
        expect(koko(MONKEYS).babies).toBe(true);
        const tiny = MONKEYS[2];
        expect(koko([MONKEYS[1], { ...tiny, feeding: feeding({ fedBy: "sickbay" }) }]).babies).toBe(false);
    });
});

test("in the normal sections: Calypso's Corner with Engeltjie, unlike the AM Plates List", () => {
    const enclosures = [
        { id: 1, name: "Engeltjie", type: "troop", parentId: null, sortOrder: 1, section: "Middle" },
        { id: 2, name: "Engeltjie 1", type: "introcage", parentId: 1, sortOrder: 1 },
        { id: 3, name: "Calypso's Corner A", type: "introcage", parentId: 1, sortOrder: 2 },
    ];
    const list = [monkey(1, "Cal", "Calypso's Corner A", "Engeltjie"), monkey(2, "Eng", "Engeltjie 1", "Engeltjie")];
    const groups = feedingList(list, enclosures);
    expect(groups.map((g) => g.title)).toEqual(["Middle Section"]);
    expect(groups[0].places.map((p) => p.name)).toEqual(["Engeltjie 1", "Calypso's Corner A"]);
    expect(groups[0].plates).toBe(2);
    const plates = amSummary(list, enclosures);
    expect(plates.find((g) => g.title === "Middle Section").plates).toBe(0);
    expect(plates.find((g) => g.title === "Sickbay Section + Calypso").plates).toBe(2);
});

describe("in with a baby: cut small + fruit, whatever's recorded", () => {
    const year = MONKEYS[2].year;
    const adult = monkey(7, "Nita", "Koko A", "Koko");
    const baby = monkey(3, "Tiny", "Koko A", "Koko", { year });
    const row = (list, name = "Nita") =>
        feedingList(list, ENCLOSURES).flatMap((g) => g.places.flatMap((p) => p.monkeys)).find((r) => r.monkey.name === name);

    test("on the AM plate and the PM bowl", () => {
        expect(row([adult, baby])).toMatchObject({ am: "1 plate, cut small + fruit", pm: "1 bowl, cut small" });
        expect(row([adult])).toMatchObject({ am: "1 plate", pm: "1 bowl" });
        expect(amText(adult, undefined, [adult, baby])).toBe("1 plate, cut small + fruit");
    });

    test("a baby in another cage, or fed by Sickbay, doesn't count", () => {
        expect(cageHasBaby("Koko A", [{ ...baby, introcage: "Goliath A" }])).toBe(false);
        expect(cageHasBaby("Koko A", [{ ...baby, feeding: feeding({ fedBy: "sickbay" }) }])).toBe(false);
        expect(cageHasBaby("Koko A", [{ ...baby, inSickbay: true }])).toBe(false);
        expect(cageHasBaby("Koko A", [baby])).toBe(true);
        expect(cageHasBaby("Koko A", [baby], undefined, baby.id)).toBe(false);
    });

    test("a metal plate stays as set, and what's saved isn't changed", () => {
        const metal = { ...adult, feeding: feeding({ amMetalPlate: true }) };
        expect(amText(metal, undefined, [metal, baby])).toBe("1 plate, cut small + fruit, metal plate");
        expect(metal.feeding.amCutSmall).toBe(false);
    });
});

test("the PM bowl is cut small with the AM plate", () => {
    const pm = (cut) => pmText(monkey(1, "Ace", "Goliath A", "Goliath", { feeding: feeding({ amCutSmall: cut, pmBowls: 2 }) }));
    expect(pm(true)).toBe("2 bowls, cut small");
    expect(pm(false)).toBe("2 bowls");
});

describe("the page", () => {
    test("a tile in Sections", () => {
        render(<RecordsPage route="records/sections" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter staff={EDITOR} />);
        expect(screen.getByRole("link", { name: /Feeding/ })).toHaveAttribute("href", "#records/sections/feeding");
    });

    test("groups with plate counts; Fed by Sickbay; the filter; a tap opens the monkey", async () => {
        const openMonkey = vi.fn();
        const user = userEvent.setup();
        render(
            <OpenMonkeyContext.Provider value={openMonkey}>
                <RecordsPage route="records/sections/feeding" monkeys={MONKEYS} enclosures={ENCLOSURES} canEnter staff={EDITOR} />
            </OpenMonkeyContext.Provider>
        );
        const top = within(screen.getByRole("region", { name: "Top Section" }));
        expect(top.getByText("2 plates · 2 cut small")).toBeInTheDocument();
        expect(top.getByText("2 plates, cut small")).toBeInTheDocument();
        const middle = within(screen.getByRole("region", { name: "Middle Section" }));
        expect(middle.getByText("Fed by Sickbay")).toBeInTheDocument();
        expect(middle.getByText("Babies share one plate. All plates here cut small + fruit.")).toBeInTheDocument();
        await user.click(top.getByRole("button", { name: "Ace" }));
        expect(openMonkey).toHaveBeenCalledWith(MONKEYS[0]);
        await user.click(screen.getByRole("tab", { name: "Sickbay" }));
        expect(screen.queryByRole("region", { name: "Top Section" })).toBeNull();
        expect(screen.getByRole("button", { name: "Roman" })).toBeInTheDocument();
    });

    test("the AM Plates List to download", () => {
        open(EDITOR);
        expect(screen.getByRole("button", { name: "AM Plates List" })).toBeInTheDocument();
    });
});

describe("Troop PM Bowls", () => {
    test("in words, by size", () => {
        expect(bowlsText({ small: 2, medium: 2, large: 0 })).toBe("2 small, 2 medium");
        expect(bowlsText({ small: 0, medium: 0, large: 6 })).toBe("6 large");
        expect(bowlsText(NO_BOWLS)).toBeNull();
        expect(bowlsText(undefined)).toBeNull();
    });

    test("the fed troops in the list's order, not the Bandits", () => {
        expect(troopBowlsList(ENCLOSURES).map((t) => t.name)).toEqual(["Goliath", "Koko"]);
    });

    test("shows each troop's; only admins can edit", async () => {
        const user = userEvent.setup();
        const { unmount } = open(EDITOR);
        await user.click(screen.getByRole("tab", { name: "Troops" }));
        const bowls = within(screen.getByRole("region", { name: "Troop PM Bowls" }));
        expect(bowls.getByText("2 small, 2 medium")).toBeInTheDocument();
        expect(bowls.getByText("Not entered")).toBeInTheDocument();
        expect(bowls.queryByRole("button", { name: "Edit" })).toBeNull();
        unmount();
        open({ ...ADMIN, readOnly: true });
        await user.click(screen.getByRole("tab", { name: "Troops" }));
        expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    });

    test("an admin enters a number: only what changed is saved, and the app told", async () => {
        const saved = { ...ENCLOSURES[2], bowls: { small: 2, medium: 1, large: 0 } };
        saveEnclosure.mockResolvedValue(saved);
        const onEnclosureSaved = vi.fn();
        const user = userEvent.setup();
        open(ADMIN, { onEnclosureSaved });
        await user.click(screen.getByRole("tab", { name: "Troops" }));
        await user.click(screen.getByRole("button", { name: "Edit" }));
        expect(screen.getByLabelText("Medium bowls for Goliath Troop")).toHaveValue(2);
        await user.type(screen.getByLabelText("Small bowls for Koko Troop"), "2");
        await user.type(screen.getByLabelText("Medium bowls for Koko Troop"), "1");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onEnclosureSaved).toHaveBeenCalledWith(saved));
        expect(saveEnclosure).toHaveBeenCalledTimes(1);
        expect(saveEnclosure).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }), { bowls: { small: 2, medium: 1, large: 0 } });
    });

    test("a number out of range: says so, nothing saved", async () => {
        const user = userEvent.setup();
        open(ADMIN);
        await user.click(screen.getByRole("tab", { name: "Troops" }));
        await user.click(screen.getByRole("button", { name: "Edit" }));
        await user.type(screen.getByLabelText("Large bowls for Koko Troop"), "500");
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please check the numbers for Koko");
        expect(saveEnclosure).not.toHaveBeenCalled();
    });

    test("the toggle: Introcages to start with, Troops without the Fed By filter, and back", async () => {
        const user = userEvent.setup();
        open(EDITOR);
        expect(screen.getByRole("tab", { name: "Introcages" })).toHaveAttribute("aria-selected", "true");
        expect(screen.queryByRole("region", { name: "Troop PM Bowls" })).toBeNull();
        await user.click(screen.getByRole("tab", { name: "Troops" }));
        expect(screen.getByRole("region", { name: "Troop PM Bowls" })).toBeInTheDocument();
        expect(screen.queryByRole("region", { name: "Top Section" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Mainfeed" })).toBeNull();
        await user.click(screen.getByRole("tab", { name: "Introcages" }));
        expect(screen.getByRole("region", { name: "Top Section" })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: "Mainfeed" })).toBeInTheDocument();
    });

    test("before troop-bowls.sql has run: no section", () => {
        render(
            <RecordsPage
                route="records/sections/feeding"
                monkeys={MONKEYS}
                enclosures={ENCLOSURES.map(({ bowls, ...e }) => e)}
                canEnter
                staff={ADMIN}
            />
        );
        expect(screen.queryByRole("region", { name: "Troop PM Bowls" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Troops" })).toBeNull();
    });
});
