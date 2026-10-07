// The Enclosures pages, and how introcage monkeys show around the site.
// Uses the built-in enclosures with Aroha moved into H&B C1, as the
// database has him once enclosures.sql has run.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import enclosuresArr, { SECTION_NAMES } from "./enclosuresArr";
import { enclosureHash, establishedText, introcageCode, sizeText } from "./enclosures";
import { homeName, placeLabel, placeName } from "./places";
import { monkeyHash } from "./monkeyLink";

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
        expect(placeLabel(aroha)).toBe("H&B C1");
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

    test("the built-in list: 15 enclosures and 73 introcages, introcages in their enclosure's section", () => {
        expect(enclosuresArr.filter((e) => e.type === "troop")).toHaveLength(15);
        expect(enclosuresArr.filter((e) => e.type === "introcage")).toHaveLength(73);
        expect(HB_C1.section).toBe("Bottom");
    });
});

describe("the Enclosures list", () => {
    test("every enclosure, one after another in section order, under the site's top bar", () => {
        showPage("enclosures");
        expect(screen.getByRole("link", { name: "vervetDB home" })).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Name or chip number")).toBeInTheDocument();
        expect(screen.getByRole("heading", { level: 1, name: "Enclosures" })).toBeInTheDocument();
        expect(screen.getByText("15 troop enclosures · 73 introcages")).toBeInTheDocument();
        // No section headings; Top first, Sickbay last
        expect(screen.queryAllByRole("heading", { level: 2 })).toHaveLength(0);
        const names = screen.getAllByRole("article").map((a) => a.querySelector(".EnclosureCard-name").textContent);
        expect(names).toHaveLength(15);
        expect(names.slice(0, 4)).toEqual(["Goliath", "Gismo", "D&D", "Royal"]);
        expect(names.slice(-2)).toEqual(["Global", "James"]);
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
        const link = screen.getByRole("link", { name: /^H&B\s*\d+ troop/ });
        expect(link).toHaveTextContent(`${hbTroop.length} troop monkeys · 4 introcages`);
        expect(link).toHaveAttribute("href", enclosureHash(HB));
        // No introcage buttons on the cards (they're on each enclosure's page)
        expect(within(link.closest("article")).getAllByRole("link")).toHaveLength(1);
    });
});

describe("an enclosure's record", () => {
    test("its details, counts, introcages, troop and introcage monkeys", async () => {
        const { user } = showPage(`enclosure/${HB.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "H&B" })).toBeInTheDocument();
        expect(screen.getByText("Section").closest("div")).toHaveTextContent("Bottom");
        expect(screen.getByText("Established").closest("div")).toHaveTextContent("Not recorded");
        expect(screen.getByText("Size").closest("div")).toHaveTextContent("Not recorded");
        const stat = (label) => screen.getByText(label, { selector: "dt" }).nextSibling.textContent;
        expect(stat("Troop monkeys")).toBe(String(hbTroop.length));
        expect(stat("Introcage monkeys")).toBe("1");
        expect(stat("Introcages")).toBe("4");
        expect(document.querySelector(".Enclosures-back")).toHaveAttribute("href", "#enclosures");
        // The top bar's page button switches to Monkeys while here
        expect(document.querySelector(".Nav-pageLink")).toHaveAccessibleName("Monkeys");
        expect(document.querySelector(".Nav-pageLink")).toHaveAttribute("href", "#");
        // Introcages: folded away, then rows with who's in each
        expect(screen.queryByRole("link", { name: /^H&B C1/ })).toBeNull();
        await user.click(screen.getByRole("button", { name: /^Introcages/ }));
        const c1 = screen.getByRole("link", { name: /^H&B C1/ });
        expect(c1).toHaveAttribute("href", enclosureHash(HB_C1));
        expect(c1).toHaveTextContent("Aroha");
        expect(screen.getByRole("link", { name: /^H&B A/ })).toHaveTextContent("Empty");
        // Maintenance comes before the monkeys, folded away too
        await user.click(screen.getByRole("button", { name: "Maintenance" }));
        expect(screen.getByText(/maintenance log will show here once vervetDB is online/)).toBeInTheDocument();
        const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
        expect(headings.indexOf("Maintenance")).toBeLessThan(headings.findIndex((h) => h.startsWith("Troop")));
        expect(screen.queryByRole("button", { name: /^Agatha,|^Apollo,/ })).toBeNull();
        await user.click(screen.getByRole("button", { name: /^Troop/ }));
        await user.click(screen.getByRole("button", { name: /^In introcages/ }));
        expect(screen.getByRole("button", { name: /^Troop/ })).toHaveAttribute("aria-expanded", "true");
        // Aroha under "In introcages", not in the troop
        const inIntrocages = screen.getByRole("heading", { name: /^In introcages/ }).parentElement;
        expect(within(inIntrocages).getByRole("button", { name: /^Aroha, .*in H&B C1/ })).toBeInTheDocument();
        const troop = screen.getByRole("heading", { name: /^Troop/ }).parentElement;
        expect(within(troop).queryByRole("button", { name: /^Aroha,/ })).toBeNull();
        // (the rows, plus the heading's own button)
        expect(within(troop).getAllByRole("button")).toHaveLength(hbTroop.length + 1);
    });

    test("an introcage: its enclosure (link back), residents, no established date", async () => {
        const { user } = showPage(`enclosure/${HB_C1.id}`);
        expect(screen.getByRole("heading", { level: 1, name: "H&B C1" })).toBeInTheDocument();
        expect(screen.getByText(/Introcage at/)).toHaveTextContent("Introcage at H&B");
        expect(screen.getAllByRole("link", { name: "H&B" })[0]).toHaveAttribute("href", enclosureHash(HB));
        expect(screen.queryByText(/Established/)).toBeNull();
        expect(screen.getByText("Resident", { selector: "dt" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: /^Residents/ }));
        expect(screen.getByRole("button", { name: /^Aroha,/ })).toBeInTheDocument();
    });

    test("an empty introcage says so", async () => {
        const { user } = showPage(`enclosure/${byName("Robert B1").id}`);
        await user.click(screen.getByRole("button", { name: /^Residents/ }));
        expect(screen.getByText("Nobody's in here at the moment.")).toBeInTheDocument();
    });

    test("tapping a monkey opens its pop-up, showing where it lives", async () => {
        const { user } = showPage(`enclosure/${HB_C1.id}`);
        await user.click(screen.getByRole("button", { name: /^Residents/ }));
        await user.click(screen.getByRole("button", { name: /^Aroha,/ }));
        const popUp = screen.getByRole("dialog", { name: "Aroha" });
        expect(popUp).toHaveTextContent("H&B C1");
        expect(popUp).not.toHaveTextContent("troop");
    });

    test("an enclosure that's gone: a message and a way back", () => {
        showPage("enclosure/99999");
        expect(screen.getByText(/couldn't be found/)).toBeInTheDocument();
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
        expect(screen.getByRole("button", { name: /^Aroha, .*in H&B C1/ })).toHaveTextContent("H&B C1");
    });

    test("they're not in their enclosure's troop", async () => {
        const { user, container } = setup();
        await user.selectOptions(container.querySelector("#troops"), "H&B");
        expect(screen.queryByRole("button", { name: /^Aroha,/ })).toBeNull();
    });
});

describe("the sanctuary map", () => {
    test("each enclosure's shape in the map file, and its section's colour", async () => {
        const { mapLabel, SECTION_COLOURS } = await import("./SanctuaryMap");
        expect(mapLabel("Robert")).toBe("Robert troop");
        expect(mapLabel("D&D")).toBe("Dino & Daniel troop");
        expect(Object.keys(SECTION_COLOURS)).toEqual(["Top", "Middle", "Bottom", "Sickbay"]);
        // Every troop enclosure has a shape by that name in the map
        const fs = await import("node:fs");
        const svg = fs.readFileSync("public/VMF_Sanctuary_Map.svg", "utf8").replace(/&amp;/g, "&");
        for (const e of enclosuresArr.filter((x) => x.type === "troop")) {
            expect(svg, e.name).toContain(`inkscape:label="${mapLabel(e.name)}"`);
        }
    });

    test("each introcage has its gate box(es) (or its own shape) in the map, named after it", async () => {
        const fs = await import("node:fs");
        const svg = fs.readFileSync("public/VMF_Sanctuary_Map.svg", "utf8").replace(/&amp;/g, "&");
        for (const e of enclosuresArr.filter((x) => x.type === "introcage")) {
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
