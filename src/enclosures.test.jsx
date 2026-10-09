// The Enclosures pages, and how introcage monkeys show around the site.
// Uses the built-in enclosures with Aroha moved into H&B C1, as the
// database has him once enclosures.sql has run.
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import enclosuresArr, { SECTION_NAMES } from "./enclosuresArr";
import {
    averageAge, bySection, enclosureHash, establishedText, introcageCode, introcagesOf, ordinal, rankOf, sizeRank, sizeText,
    placeHash, stepsFrom, troopRank,
} from "./enclosures";
import { fullName, homeName, placeLabel, placeName } from "./places";
import { monkeyHash } from "./monkeyLink";
import { sortEnclosures } from "./EnclosuresPage";
import { SECTIONS, inSection } from "./sections";

const byName = (name) => enclosuresArr.find((e) => e.name === name);
const HB = byName("H&B");
const HB_C1 = byName("H&B C1");
const withEnclosure = (m) => ({ ...m, introcage: null, enclosure: m.troop });
const aroha = {
    ...monkeysArr.find((m) => m.name === "Aroha"),
    troop: null,
    introcage: "H&B C1",
    enclosure: "H&B",
};
const MONKEYS = monkeysArr.map((m) => (m.name === "Aroha" ? aroha : withEnclosure(m)));
const hbTroop = MONKEYS.filter((m) => m.troop === "H&B");

// The Enclosures pages show under the site's top bar (ShowPage)
function showPage(route) {
    const user = userEvent.setup();
    render(<ShowPage route={route} monkeys={MONKEYS} enclosures={enclosuresArr} sections={SECTION_NAMES} />);
    return { user };
}

describe("where a monkey lives", () => {
    test("introcage monkeys: their introcage, with no troop", () => {
        expect(placeName(aroha)).toBe("H&B C1");
        // (shown in full: H&B is Holt & Barrington)
        expect(placeLabel(aroha)).toBe("Holt & Barrington C1");
        expect(homeName(aroha)).toBe("H&B");
        const bobo = MONKEYS.find((m) => m.troop === "Goliath");
        expect(placeLabel(bobo)).toBe("Goliath Troop");
    });

    test("an introcage monkey's link uses its enclosure, so it doesn't change when he moves", () => {
        expect(monkeyHash(aroha)).toBe("#monkey/aroha-h-b");
    });

    test("introcage codes and established dates read well", () => {
        expect(introcageCode(HB_C1, HB)).toBe("C1");
        expect(establishedText("2014-03")).toBe("March 2014");
        expect(establishedText(null)).toBeNull();
        expect(sizeText(600)).toBe("600 m²");
        expect(sizeText(1250)).toBe("1,250 m²");
        expect(sizeText(null)).toBeNull();
    });

    test("places in order: 1st, 2nd, 3rd, 4th, 11th, 22nd", () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
            "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
        ]);
    });

    test("rankings: biggest first, equal values share a place, unknowns left out", () => {
        const items = [{ v: 5 }, { v: 9 }, { v: 5 }, { v: null }, { v: 2 }];
        const ranks = items.map((item) => rankOf(item, items, (i) => i.v));
        expect(ranks).toEqual([2, 1, 2, null, 4]);
    });

    test("largest enclosure (by size) and largest troop (by troop monkeys)", () => {
        const sized = enclosuresArr.map((e) =>
            e.name === "H&B" ? { ...e, size: 900 } : e.name === "Robert" ? { ...e, size: 1500 } : e
        );
        expect(sizeRank(byName("H&B"), enclosuresArr)).toBeNull();
        expect(sizeRank(sized.find((e) => e.name === "H&B"), sized)).toBe(2);
        const counts = enclosuresArr
            .filter((e) => e.type === "troop")
            .map((e) => MONKEYS.filter((m) => !m.introcage && m.troop === e.name).length);
        expect(troopRank(HB, enclosuresArr, MONKEYS)).toBe(1 + counts.filter((n) => n > hbTroop.length).length);
    });

    test("average age: of the monkeys with a known birth year, to one decimal place", () => {
        const today = new Date(2026, 9, 7); // 7 Oct 2026: the 2025 season are babies
        expect(averageAge([{ year: 2016 }, { year: 2020 }, { year: "" }, { year: 2023 }], today)).toBe(5.3); // (9 + 5 + 2) / 3
        expect(averageAge([{ year: "" }], today)).toBeNull();
    });

    test("the built-in list: 19 enclosures (4 special) and 85 introcages, introcages in their enclosure's section", () => {
        expect(enclosuresArr.filter((e) => e.type === "troop")).toHaveLength(19);
        expect(enclosuresArr.filter((e) => e.special).map((e) => e.name)).toEqual(["Bachelor Block", "Quarantine", "Baby Care", "Sickbay Care Unit"]);
        expect(enclosuresArr.filter((e) => e.type === "introcage")).toHaveLength(85);
        expect(HB_C1.section).toBe("Bottom");
    });
});

describe("the Enclosures list", () => {
    test("every enclosure, one after another in section order, under the site's top bar", () => {
        showPage("enclosures");
        expect(screen.getByRole("link", { name: "vervetDB home" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Name or chip number")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Enclosures" })).toBeInTheDocument();
        // The totals: a pill (shorter) beside Sort, the full words for screen readers
        expect(screen.getByText("19 enclosures · 85 introcages")).toHaveClass("visually-hidden");
        expect(screen.getByText("19 enclosures")).toBeInTheDocument();
        expect(screen.getByText("85 introcages")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Sort: Section, Top first" })).toBeInTheDocument();
        // No section headings; Top first, then Sickbay, then the care areas
        expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
        // (the names wrap only after the "&": read with plain spaces)
        const names = screen.getAllByRole("article").map((a) => a.querySelector(".EnclosureCard-name").textContent.replace(/ /g, " "));
        expect(names).toHaveLength(19);
        // The special enclosures after their sections' troop enclosures; the
        // care areas (each a "section" of its own) last
        expect(names.slice(0, 5)).toEqual(["Goliath", "Gismo", "Dino & Daniel", "Royal", "Bachelor Block"]);
        expect(names.slice(-5)).toEqual(["Global", "James", "Baby Care", "Quarantine", "Sickbay Care Unit"]);
        // The monkey list's Filters bar isn't shown here
        expect(screen.queryByRole("button", { name: /^Filters/ })).toBeNull();
    });

    test("searching from here goes back to the monkey list", async () => {
        const { user } = showPage("enclosures");
        window.location.hash = "#enclosures";
        await user.type(screen.getByPlaceholderText("Name or chip number"), "A");
        expect(window.location.hash).toBe("");
    });

    test("each enclosure: a card with its troop and introcage counts, linking to its record", () => {
        showPage("enclosures");
        const link = screen.getByRole("link", { name: /^Holt & Barrington\s*\d+ troop/ });
        expect(link).toHaveTextContent(`${hbTroop.length} troop monkeys · 4 introcages`);
        expect(link).toHaveAttribute("href", enclosureHash(HB));
        // No introcage buttons on the cards (they're on each enclosure's page)
        expect(within(link.closest("article")).getAllByRole("link")).toHaveLength(1);
    });
});

describe("an enclosure's record", () => {
    test("its details, counts, introcages, troop and introcage monkeys", async () => {
        const { user } = showPage(`enclosure/${HB.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "Holt & Barrington" })).toBeInTheDocument();
        expect(screen.getByText("Section").closest("div")).toHaveTextContent("Bottom Section");
        expect(screen.getByText("Established").closest("div")).toHaveTextContent("Not recorded");
        expect(screen.getByText("Size").closest("div")).toHaveTextContent("Not recorded");
        const stat = (label) => screen.getByText(label, { selector: "dt" }).nextSibling.textContent;
        expect(stat("Troop monkeys")).toBe(String(hbTroop.length));
        expect(stat("Introcage monkeys")).toBe("1");
        expect(stat("Introcages")).toBe("4");
        // Rankings among the troop enclosures, and the troop's average age
        expect(stat("Size not recorded")).toBe("–");
        expect(stat("Largest troop")).toBe(ordinal(troopRank(HB, enclosuresArr, MONKEYS)));
        expect(stat("Average age")).toBe(String(averageAge(hbTroop)));
        expect(document.querySelector(".Enclosures-back")).toHaveAttribute("href", "#enclosures");
        // The side rail shows Enclosures as the page you're on
        expect(document.querySelector('.SideRail a[href="#enclosures"]')).toHaveAttribute("aria-current", "page");
        // Introcages: open to start with, rows with who's in each
        const c1 = screen.getByRole("link", { name: /^Holt & Barrington C1/ });
        expect(c1).toHaveAttribute("href", enclosureHash(HB_C1));
        expect(c1).toHaveTextContent("Aroha");
        expect(screen.getByRole("link", { name: /^Holt & Barrington A/ })).toHaveTextContent("Empty");
        // Maintenance comes before the monkeys, open too
        expect(screen.getByText(/maintenance log will show here once vervetDB is online/)).toBeInTheDocument();
        const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
        expect(headings.indexOf("Maintenance")).toBeLessThan(headings.findIndex((h) => h.startsWith("Monkeys")));
        // The monkeys stay folded away until asked for
        expect(screen.queryByRole("button", { name: /^Agatha,|^Apollo,/ })).toBeNull();
        const toggle = document.querySelector('.Enclosures-toggle[aria-controls="Enclosures-monkeys"]');
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        await user.click(toggle);
        expect(toggle).toHaveAttribute("aria-expanded", "true");
        // One list: the troop, then Aroha (in H&B C1) last
        const list = screen.getByRole("heading", { name: /^Monkeys/ }).parentElement;
        const rows = within(list).getAllByRole("button").slice(1); // (after the heading's own button)
        expect(rows).toHaveLength(hbTroop.length + 1);
        expect(rows.at(-1)).toHaveAccessibleName(/^Aroha, .*in Holt & Barrington C1/);
    });

    test("an introcage: its enclosure (link back), residents, no established date", async () => {
        const { user } = showPage(`enclosure/${HB_C1.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "Holt & Barrington C1" })).toBeInTheDocument();
        expect(screen.getByText(/Introcage at/)).toHaveTextContent("Introcage at Holt & Barrington");
        expect(screen.getAllByRole("link", { name: "Holt & Barrington" })[0]).toHaveAttribute("href", enclosureHash(HB));
        expect(screen.queryByText(/Established/)).toBeNull();
        // No number boxes: how many is the first detail
        expect(document.querySelector(".Enclosures-stats")).toBeNull();
        const first = document.querySelector(".Enclosures-details > div");
        expect(first).toHaveTextContent("No. of Monkeys1");
        expect(screen.getByText("Section").closest("div")).toHaveTextContent("Bottom Section");
        // Its one field is its description; no rankings or average age
        expect(screen.getByRole("heading", { name: "Description" })).toBeInTheDocument();
        expect(screen.queryByText("Average age")).toBeNull();
        expect(screen.getByRole("button", { name: /^Aroha,/ })).toBeInTheDocument();
    });

    test("an empty introcage says so", async () => {
        showPage(`enclosure/${byName("Robert B1").id}`);
        expect(screen.getByText("Nobody's in here at the moment.")).toBeInTheDocument();
    });

    test("tapping a monkey opens its pop-up, showing where it lives", async () => {
        const { user } = showPage(`enclosure/${HB_C1.id}`);
        await user.click(screen.getByRole("button", { name: /^Aroha,/ }));
        const popUp = screen.getByRole("dialog", { name: "Aroha" });
        expect(popUp).toHaveTextContent("Holt & Barrington C1");
        expect(popUp).not.toHaveTextContent("troop");
    });

    test("jump buttons: Map, Introcages, Maintenance and Monkeys, opening the monkey list", async () => {
        const { user } = showPage(`enclosure/${HB.id}`);
        const jumps = within(screen.getByRole("navigation", { name: "On this page" }));
        const labels = jumps.getAllByRole("button").map((b) => b.textContent);
        expect(labels).toEqual(["Map", "Introcages", "Maintenance", "Monkeys"]);
        const scrolled = vi.fn();
        Element.prototype.scrollIntoView = scrolled;
        await user.click(jumps.getByRole("button", { name: /^Monkeys/ }));
        await waitFor(() => expect(scrolled).toHaveBeenCalled());
        expect(scrolled.mock.contexts[0]).toHaveAttribute("id", "Enclosures-jump-monkeys");
        expect(document.querySelector('.Enclosures-toggle[aria-controls="Enclosures-monkeys"]')).toHaveAttribute("aria-expanded", "true");
        delete Element.prototype.scrollIntoView;
    });

    test("an introcage: jump buttons Map, Monkeys, Maintenance; Maintenance at the bottom", () => {
        showPage(`enclosure/${HB_C1.id}`);
        const jumps = within(screen.getByRole("navigation", { name: "On this page" }));
        expect(jumps.getAllByRole("button").map((b) => b.textContent)).toEqual(["Map", "Monkeys", "Maintenance"]);
        const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
        expect(headings.slice(-2)).toEqual(["Monkeys1", "Maintenance"]);
    });

    test("an enclosure that's gone: a message and a way back", () => {
        showPage("enclosure/99999");
        expect(screen.getByText(/couldn't be found/)).toBeInTheDocument();
    });
});

describe("stepping through the records (previous / next, swipe)", () => {
    const troopOrder = bySection(enclosuresArr, SECTION_NAMES).flatMap((g) => g.enclosures);
    const introcageOrder = troopOrder.flatMap((e) => introcagesOf(e, enclosuresArr));

    test("introcages go through every introcage, enclosure by enclosure, round from last to first", () => {
        const hb = introcagesOf(HB, enclosuresArr).map((e) => e.name);
        expect(hb).toEqual(["H&B A", "H&B B", "H&B C1", "H&B C2"]);
        const steps = stepsFrom(HB_C1, enclosuresArr, SECTION_NAMES);
        expect(steps.prev.name).toBe("H&B B");
        expect(steps.next.name).toBe("H&B C2");
        expect(steps.total).toBe(85);
        // The last of H&B's: on to the next enclosure's first
        const fromC2 = stepsFrom(byName("H&B C2"), enclosuresArr, SECTION_NAMES);
        expect(fromC2.next).toBe(introcageOrder[introcageOrder.indexOf(byName("H&B C2")) + 1]);
        expect(stepsFrom(introcageOrder.at(-1), enclosuresArr, SECTION_NAMES).next).toBe(introcageOrder[0]);
        expect(stepsFrom(introcageOrder[0], enclosuresArr, SECTION_NAMES).prev).toBe(introcageOrder.at(-1));
    });

    test("troop enclosures go through the troop enclosures", () => {
        const steps = stepsFrom(troopOrder[0], enclosuresArr, SECTION_NAMES);
        expect(steps).toMatchObject({ number: 1, total: 19, next: troopOrder[1], prev: troopOrder.at(-1) });
    });

    afterEach(() => window.history.replaceState(null, "", window.location.pathname));

    test("arrows either side of \"N of 85\" go to the previous / next introcage", async () => {
        const { user } = showPage(`enclosure/${HB_C1.id}`);
        const steps = screen.getByRole("navigation", { name: "Other introcages" });
        expect(steps).toHaveTextContent(`${introcageOrder.indexOf(HB_C1) + 1} of 85`);
        await user.click(within(steps).getByRole("link", { name: "Next introcage: Holt & Barrington C2" }));
        expect(window.location.hash).toBe(enclosureHash(byName("H&B C2")));
        await user.click(within(steps).getByRole("link", { name: "Previous introcage: Holt & Barrington B" }));
        expect(window.location.hash).toBe(enclosureHash(byName("H&B B")));
    });

    test("on an enclosure, they go to the previous / next enclosure", () => {
        showPage(`enclosure/${HB.id}`);
        const i = troopOrder.indexOf(HB);
        const steps = screen.getByRole("navigation", { name: "Other enclosures" });
        expect(within(steps).getByRole("link", { name: `Next enclosure: ${troopOrder[i + 1].name}` })).toHaveAttribute(
            "href",
            enclosureHash(troopOrder[i + 1])
        );
    });

    // A finger moving sideways (dx) over the page, starting on an element
    function swipe(element, dx, pointerType = "touch") {
        const at = (x) => ({ pointerId: 1, isPrimary: true, pointerType, clientX: x, clientY: 300 });
        fireEvent.pointerDown(element, at(200));
        fireEvent.pointerMove(element, at(200 + dx / 2));
        fireEvent.pointerMove(element, at(200 + dx));
        fireEvent.pointerUp(element, at(200 + dx));
    }

    test("phones: swipe left anywhere for the next one, right for the previous (not with a mouse)", () => {
        showPage(`enclosure/${HB_C1.id}`);
        const title = screen.getByRole("heading", { level: 1, name: "Holt & Barrington C1" });
        swipe(title, -120);
        expect(window.location.hash).toBe(enclosureHash(byName("H&B C2")));
        swipe(title, 120);
        expect(window.location.hash).toBe(enclosureHash(byName("H&B B")));
        window.history.replaceState(null, "", window.location.pathname);
        swipe(title, -120, "mouse");
        expect(window.location.hash).toBe("");
    });
});

describe("introcage monkeys on the main page", () => {
    const setup = () => {
        const user = userEvent.setup();
        const utils = render(<ShowPage monkeys={MONKEYS} />);
        return { user, ...utils };
    };

    test("their card shows the introcage", async () => {
        const { user } = setup();
        await user.type(screen.getByPlaceholderText("Name or chip number"), "Aroha");
        // Short on the card (where space is tight); in full for screen readers
        expect(screen.getByRole("button", { name: /^Aroha, .*in Holt & Barrington C1/ })).toHaveTextContent("H&B C1");
    });

    // The pop-up's blue troop / introcage pill: a link to that page
    const placePill = () => within(screen.getByRole("list", { name: "Details" })).getAllByRole("listitem")[0];
    async function openMonkey(user, name) {
        await user.type(screen.getByPlaceholderText("Name or chip number"), name);
        await user.click(screen.getAllByRole("button", { name: new RegExp(`^${name},`) })[0]);
    }

    test("their pop-up's introcage pill links to the introcage's page", async () => {
        const { user } = setup();
        await openMonkey(user, "Aroha");
        expect(within(placePill()).getByRole("link", { name: "Holt & Barrington C1" })).toHaveAttribute("href", enclosureHash(HB_C1));
    });

    test("a troop monkey's troop pill links to its enclosure's page", async () => {
        const { user } = setup();
        const someone = hbTroop.find((m) => MONKEYS.filter((x) => x.name === m.name).length === 1);
        await openMonkey(user, someone.name);
        expect(within(placePill()).getByRole("link", { name: "Holt & Barrington Troop" })).toHaveAttribute("href", enclosureHash(HB));
    });

    test("the Bandits have no enclosure, so no link", () => {
        expect(placeHash({ troop: "Bandits", introcage: null }, enclosuresArr)).toBeNull();
    });

    test("choosing their enclosure's troop includes them (until Introcage is turned off)", async () => {
        const { user, container } = setup();
        await user.selectOptions(container.querySelector("#troops"), "H&B");
        expect(screen.getByRole("button", { name: /^Aroha,/ })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /^Filters/ }));
        await user.click(within(screen.getByRole("group", { name: "Living in" })).getByRole("button", { name: "Introcage" }));
        expect(screen.queryByRole("button", { name: /^Aroha,/ })).toBeNull();
    });
});

describe("the sanctuary map", () => {
    test("each enclosure's shape in the map file, and its section's colour", async () => {
        const { mapLabel, SECTION_COLOURS } = await import("./SanctuaryMap");
        expect(mapLabel("Robert")).toBe("Robert troop");
        expect(mapLabel("D&D")).toBe("Dino & Daniel troop");
        expect(Object.keys(SECTION_COLOURS)).toEqual(["Top", "Middle", "Bottom", "Sickbay", "Baby Care", "Quarantine", "Sickbay Care Unit"]);
        // The care areas for new intakes share one purple
        expect(new Set([SECTION_COLOURS["Baby Care"], SECTION_COLOURS.Quarantine, SECTION_COLOURS["Sickbay Care Unit"]]).size).toBe(1);
        // Every troop enclosure has a shape by that name in the map (not
        // Baby Care and Sickbay Care Unit yet: still to be labelled)
        const fs = await import("node:fs");
        const svg = fs.readFileSync("public/VMF_Sanctuary_Map.svg", "utf8").replace(/&amp;/g, "&");
        const notYet = ["Baby Care", "Sickbay Care Unit"];
        for (const e of enclosuresArr.filter((x) => x.type === "troop" && !notYet.includes(x.name))) {
            expect(svg, e.name).toContain(`inkscape:label="${mapLabel(e.name)}"`);
        }
    });

    test("each introcage has its gate box(es) (or its own shape) in the map, named after it", async () => {
        const fs = await import("node:fs");
        const svg = fs.readFileSync("public/VMF_Sanctuary_Map.svg", "utf8").replace(/&amp;/g, "&");
        // (not the special enclosures' cages yet: still to be labelled on the map)
        const special = new Set(enclosuresArr.filter((x) => x.special).map((x) => x.id));
        for (const e of enclosuresArr.filter((x) => x.type === "introcage" && !special.has(x.parentId))) {
            expect(svg, e.name).toContain(`inkscape:label="${e.name}"`);
        }
    });

    test("a record shows the map card", () => {
        showPage(`enclosure/${HB.id}`);
        expect(screen.getByRole("heading", { name: "Map" })).toBeInTheDocument();
    });
});

describe("the map's small icons", () => {
    test("five kinds can be shown in the pop-up, each found in the map file", async () => {
        const { MAP_ICONS } = await import("./SanctuaryMap");
        expect(MAP_ICONS.map((i) => i.label)).toEqual(["Water Taps", "Misters", "Fence Switches", "Toilets & Showers", "Fire Pits"]);
        const fs = await import("node:fs");
        const svg = fs.readFileSync("public/VMF_Sanctuary_Map.svg", "utf8").replace(/&amp;/g, "&");
        for (const name of ["Water taps", "Mister icon", "Electric fence switches", "Toilets & showers", "Rocks & fire pits"]) {
            expect(svg, name).toContain(`inkscape:label="${name}"`);
        }
    });
});

describe("sorting the Enclosures list", () => {
    const cardNames = () =>
        screen.getAllByRole("article").map((a) => a.querySelector(".EnclosureCard-name").textContent.replace(/ /g, " "));
    // Sizes for three of them (the rest not recorded)
    const SIZED = enclosuresArr.map((e) =>
        ({ Robert: { ...e, size: 600 }, Goliath: { ...e, size: 1200 }, James: { ...e, size: 80 } })[e.name] ?? e
    );
    function setup() {
        const user = userEvent.setup();
        render(<ShowPage route="enclosures" monkeys={MONKEYS} enclosures={SIZED} sections={SECTION_NAMES} />);
        return { user };
    }
    async function chooseSort(user, name) {
        await user.click(screen.getByRole("button", { name: /^Sort:/ }));
        await user.click(screen.getByRole("menuitem", { name }));
    }

    test("the Sort menu: Name, Section, Monkeys and Size", async () => {
        const { user } = setup();
        await user.click(screen.getByRole("button", { name: "Sort: Section, Top first" }));
        expect(screen.getAllByRole("menuitem").map((i) => i.getAttribute("aria-label"))).toEqual([
            "Name",
            "Section, Sickbay first",
            "Monkeys",
            "Size",
        ]);
    });

    test("Name: A–Z, then Z–A", async () => {
        const { user } = setup();
        // (by the names shown)
        const sorted = enclosuresArr.filter((e) => e.type === "troop").map((e) => fullName(e.name)).sort((a, b) => a.localeCompare(b));
        await chooseSort(user, "Name");
        expect(cardNames()).toEqual(sorted);
        await chooseSort(user, "Name, Z–A");
        expect(cardNames()).toEqual([...sorted].reverse());
    });

    test("Section the other way: Sickbay first, each section's enclosures in their usual order, the care areas still last", async () => {
        const { user } = setup();
        await chooseSort(user, "Section, Sickbay first");
        expect(cardNames().slice(0, 2)).toEqual(["Global", "James"]);
        expect(cardNames().slice(-8)).toEqual(["Goliath", "Gismo", "Dino & Daniel", "Royal", "Bachelor Block", "Baby Care", "Quarantine", "Sickbay Care Unit"]);
    });

    test("Size: largest first (with each size on its card), unrecorded last; then smallest first", async () => {
        const { user } = setup();
        await chooseSort(user, "Size");
        expect(cardNames().slice(0, 3)).toEqual(["Goliath", "Robert", "James"]);
        expect(screen.getAllByRole("article")[0]).toHaveTextContent("1,200 m²");
        await chooseSort(user, "Size, Smallest first");
        expect(cardNames().slice(0, 3)).toEqual(["James", "Robert", "Goliath"]);
        expect(cardNames()).toHaveLength(19);
    });

    test("Monkeys: most troop monkeys first, then fewest", async () => {
        const { user } = setup();
        const count = (name) => MONKEYS.filter((m) => fullName(m.troop) === name).length;
        await chooseSort(user, "Monkeys");
        const most = cardNames().map(count);
        expect(most).toEqual([...most].sort((a, b) => b - a));
        await chooseSort(user, "Monkeys, Fewest first");
        const fewest = cardNames().map(count);
        expect(fewest).toEqual([...fewest].sort((a, b) => a - b));
    });

    test("ties keep section order", () => {
        const [a, b, c] = enclosuresArr.filter((e) => e.type === "troop");
        const sized = [{ ...a, size: 100 }, { ...b, size: 100 }, { ...c, size: 200 }];
        expect(sortEnclosures(sized, { key: "size", ascending: true }, []).map((e) => e.name)).toEqual([c.name, a.name, b.name]);
    });
});

describe("special enclosures (Bachelor Block, Quarantine)", () => {
    const QUARANTINE = enclosuresArr.find((e) => e.name === "Quarantine");
    const Q_A = enclosuresArr.find((e) => e.name === "Quarantine A");
    // Two monkeys in Quarantine A
    const IN_Q = [
        { ...monkeysArr[0], troop: null, introcage: "Quarantine A", enclosure: "Quarantine", year: 2020 },
        { ...monkeysArr[1], troop: null, introcage: "Quarantine A", enclosure: "Quarantine", year: 2024 },
    ];
    const WITH_Q = [...MONKEYS.filter((m) => !IN_Q.some((q) => q.name === m.name)), ...IN_Q];
    function showWith(route) {
        const user = userEvent.setup();
        render(<ShowPage route={route} monkeys={WITH_Q} enclosures={enclosuresArr} sections={SECTION_NAMES} />);
        return { user };
    }

    test("its cages: Quarantine A–F, and Bachelor Block A and B", () => {
        expect(introcagesOf(QUARANTINE, enclosuresArr).map((e) => e.name)).toEqual(
            ["A", "B", "C", "D", "E", "F"].map((c) => `Quarantine ${c}`)
        );
        expect(introcagesOf(enclosuresArr.find((e) => e.name === "Bachelor Block"), enclosuresArr).map((e) => e.name))
            .toEqual(["Bachelor Block A", "Bachelor Block B"]);
    });

    test("its card counts the monkeys in its cages", () => {
        showWith("enclosures");
        const card = screen.getAllByRole("article").find((a) => a.textContent.includes("Quarantine"));
        // (a care area's introcages are its "areas")
        expect(card).toHaveTextContent(/2 monkeys · 6 areas/i);
    });

    test("its page: a Special Enclosure box, its monkeys, introcages and average age; no troop numbers, rankings or Size", () => {
        showWith(`enclosure/${QUARANTINE.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "Quarantine" })).toBeInTheDocument();
        const stats = document.querySelector(".Enclosures-stats");
        expect([...stats.querySelectorAll("dd")].map((d) => d.textContent)).toEqual(["Special Enclosure", "2", "6", expect.any(String)]);
        expect(stats).not.toHaveTextContent("Troop monkeys");
        expect(stats).not.toHaveTextContent("Largest");
        expect(screen.queryByText("Size")).toBeNull();
        // A care area for new intakes: no section
        expect(screen.getByText("No Section")).toBeInTheDocument();
    });

    test("its cages' pages: no Troop Door", () => {
        showWith(`enclosure/${Q_A.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "Quarantine A" })).toBeInTheDocument();
        expect(screen.queryByText("Troop Door")).toBeNull();
        expect(screen.getByText("Plate Slot")).toBeInTheDocument();
    });

    test("not counted in the troop enclosures' rankings", () => {
        const sized = enclosuresArr.map((e) => (e.name === "Quarantine" ? { ...e, size: 99999 } : e.name === "Goliath" ? { ...e, size: 5000 } : e));
        expect(sizeRank(sized.find((e) => e.name === "Goliath"), sized)).toBe(1);
    });

    test("filtering by section: Baby Care is a section of its own; Quarantine and Sickbay Care Unit aren't filters", () => {
        expect(inSection("Baby Care", ["babyCare"])).toBe(true);
        expect(SECTIONS.map((s) => s.label)).toEqual(["Top", "Middle", "Bottom", "Sickbay", "Baby Care", "Bandits"]);
        expect(inSection("Quarantine", ["sickbay"])).toBe(false);
        expect(inSection("Sickbay Care Unit", ["sickbay"])).toBe(false);
        expect(inSection("Bachelor Block", ["top"])).toBe(true);
    });

    test("Baby Care's areas: Dreamland, Neverland, Disneyland; Sickbay Care Unit's one area has its name", () => {
        const babyCare = enclosuresArr.find((e) => e.type === "troop" && e.name === "Baby Care");
        expect(introcagesOf(babyCare, enclosuresArr).map((e) => e.name)).toEqual(["Dreamland", "Neverland", "Disneyland"]);
        const unit = enclosuresArr.find((e) => e.type === "troop" && e.name === "Sickbay Care Unit");
        expect(introcagesOf(unit, enclosuresArr).map((e) => e.name)).toEqual(["Sickbay Care Unit"]);
    });

    test("a care area's page: Areas (not Introcages); Bachelor Block keeps Introcages", () => {
        const babyCare = enclosuresArr.find((e) => e.type === "troop" && e.name === "Baby Care");
        const { unmount } = render(<ShowPage route={`enclosure/${babyCare.id}`} monkeys={MONKEYS} enclosures={enclosuresArr} sections={SECTION_NAMES} />);
        // (the jump button and the folding list)
        expect(screen.getAllByRole("button", { name: /^Areas/ })).toHaveLength(2);
        expect(document.querySelector(".Enclosures-stats")).toHaveTextContent("Areas3");
        expect(screen.queryByText("Introcages")).toBeNull();
        unmount();
        const bachelor = enclosuresArr.find((e) => e.name === "Bachelor Block");
        render(<ShowPage route={`enclosure/${bachelor.id}`} monkeys={MONKEYS} enclosures={enclosuresArr} sections={SECTION_NAMES} />);
        expect(document.querySelector(".Enclosures-stats")).toHaveTextContent("Introcages2");
    });

    test("a monkey in Sickbay Care Unit: its area's page, and No Section", () => {
        const unit = enclosuresArr.find((e) => e.type === "introcage" && e.name === "Sickbay Care Unit");
        const inUnit = { ...monkeysArr[0], troop: null, introcage: "Sickbay Care Unit", enclosure: "Sickbay Care Unit" };
        expect(placeHash(inUnit, enclosuresArr)).toBe(enclosureHash(unit));
        render(<ShowPage route={`enclosure/${unit.id}`} monkeys={[inUnit]} enclosures={enclosuresArr} sections={SECTION_NAMES} />);
        expect(screen.getByRole("heading", { level: 1, name: "Sickbay Care Unit" })).toBeInTheDocument();
        expect(screen.getByText("No Section")).toBeInTheDocument();
    });
});
