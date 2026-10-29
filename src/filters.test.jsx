// The Filters panel (Quick Filters, troop, birth year, age group, sex), the filter chips,
// and sorting by sex.
import { render, screen, within } from "@testing-library/react";
import { fullName } from "./places";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { ageInYears } from "./ages";
import { SECTIONS } from "./sections";
import { currentBabySeason } from "./ages";

const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
const panel = () => screen.getByRole("dialog", { name: "Filters" });
// Location: Troop and Introcage pills, both on to start with
// Quick Filters: toggle buttons (several can be on)
const quickPill = (name) => within(screen.getByRole("group", { name: "Quick Filters" })).getByRole("button", { name });
const locationPill = (name) => within(screen.getByRole("group", { name: "Living in" })).getByRole("button", { name });
// The monkeys' cards, in order (their names are "Aroha, …"; not their ☆)
const shownNames = () =>
    [...document.querySelectorAll(".ShowPage-monkeys .MonkeyCard")].map((b) => b.getAttribute("aria-label").split(",")[0]);
// Age categories: toggle buttons (several can be on)
const ageButton = (name) =>
    within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: new RegExp(`^${name}`) });
// Sex: Female and Male pills, both on to start with
const sexPill = (name) => within(screen.getByRole("group", { name: "Sex" })).getByRole("button", { name });
const status = () => screen.getByText(/^Showing \d+ monkeys?$/);
const expectShowing = (n) => expect(status()).toHaveTextContent(`Showing ${n} monkey`);

function setup() {
    const user = userEvent.setup();
    render(<ShowPage />);
    return { user };
}

test("Filters opens the panel, ready to use; Escape closes it and returns to the button", async () => {
    const { user } = setup();
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    await user.click(filtersButton());
    expect(panel()).toBeInTheDocument();
    expect(filtersButton()).toHaveAttribute("aria-expanded", "true");
    expect(quickPill("Top Section")).toHaveFocus(); // the first choice

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    expect(filtersButton()).toHaveFocus();
});

test("the Bandits Quick Filter has the bandit icon (just the name for screen readers)", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    const icon = quickPill("Bandits").querySelector("svg.bandit-icon");
    expect(icon).not.toBeNull();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(quickPill("Top Section").querySelector("svg")).toBeNull();
});

test("the count beside Sort leaves out the Bandits, unless their Quick Filter is on", async () => {
    const user = userEvent.setup();
    const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "" };
    const monkeys = [
        { ...base, id: 1, name: "Wildy", troop: "Bandits", introcage: null, enclosure: null },
        { ...base, id: 2, name: "Scruff", troop: "Bandits", introcage: null, enclosure: null },
        { ...base, id: 3, name: "Rocio", troop: "Goliath", introcage: null, enclosure: "Goliath" },
    ];
    render(<ShowPage monkeys={monkeys} troops={["All Troops", "Goliath", "Bandits"]} />);
    const count = () => document.querySelector(".ShowPage-count");
    // No filters: says who is counted
    expect(count()).toHaveTextContent(/^1sanctuary monkey$/);
    expect(count()).toHaveAttribute("title", "1 sanctuary monkey (not counting the Bandits)");
    expectShowing(3); // (the list itself still has everyone)

    await user.click(filtersButton());
    await user.click(quickPill("Bandits"));
    expect(count()).toHaveTextContent(/^2$/); // (a filter on: just the number)
    expect(count()).toHaveAttribute("title", "2 monkeys");
});

test("birth years: this year back to 1997", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    const years = within(screen.getByRole("combobox", { name: "Filter by year" }))
        .getAllByRole("option")
        .map((o) => o.textContent);
    const thisYear = new Date().getFullYear();
    // ("Choose a year…" only shows in the box, not in the list)
    expect(years[0]).toBe("Any year");
    expect(years[1]).toBe(String(thisYear));
    expect(years.at(-1)).toBe("1997");
    expect(years).toHaveLength(thisYear - 1997 + 2);
});

test.each([
    ["Babies", (age) => age === 0],
    ["Juveniles", (age) => age !== null && age >= 1 && age <= 3],
    ["Young Adults", (age) => age !== null && age >= 4 && age <= 10],
    ["Senior Adults", (age) => age !== null && age >= 11 && age <= 19],
    ["Golden Oldies", (age) => age !== null && age >= 20],
])("Age: %s", async (group, fits) => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(ageButton(group));
    expect(ageButton(group)).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "false");
    const expected = monkeysArr.filter((m) => fits(ageInYears(m.year))).length;
    expectShowing(expected);
    expect(within(panel()).getByRole("button", { name: /^Show / })).toHaveTextContent(
        `Show ${expected} monkey`
    );
});

test("several age categories together, e.g. Young Adults + Juveniles; All turns them off", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(ageButton("Young Adults"));
    await user.click(ageButton("Juveniles"));
    // (no birth year: in neither)
    const fits = (age) => age !== null && age >= 1 && age <= 10;
    expectShowing(monkeysArr.filter((m) => fits(ageInYears(m.year))).length);
    // A chip for each
    expect([...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent)).toEqual([
        "Juveniles",
        "Young Adults",
    ]);
    expect(filtersButton()).toHaveAccessibleName("Filters (2 on)");

    // Tapping one again turns just that one off
    await user.click(ageButton("Juveniles"));
    expect(ageButton("Young Adults")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("Juveniles")).toHaveAttribute("aria-pressed", "false");

    await user.click(ageButton("All Ages"));
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("Young Adults")).toHaveAttribute("aria-pressed", "false");
    expectShowing(monkeysArr.length);
});

test("Sex: both on to start with; tap one off, back on; the last one can't go off", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    expect(sexPill("Female")).toHaveAttribute("aria-pressed", "true");
    expect(sexPill("Male")).toHaveAttribute("aria-pressed", "true");
    expectShowing(monkeysArr.length); // everyone, unknown sex included

    await user.click(sexPill("Female"));
    expect(sexPill("Female")).toHaveAttribute("aria-pressed", "false");
    expectShowing(monkeysArr.filter((m) => m.sex === "male").length);

    await user.click(sexPill("Male")); // the only one on: nothing happens
    expect(sexPill("Male")).toHaveAttribute("aria-pressed", "true");
    expectShowing(monkeysArr.filter((m) => m.sex === "male").length);

    await user.click(sexPill("Female")); // back on: everyone again
    expectShowing(monkeysArr.length);
});

test("Category: pills with \"All Ages\" to start with", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("All Ages")).toHaveClass("is-all");
});

test("Sex, and filters combine", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(sexPill("Male")); // Male off: females only
    expectShowing(monkeysArr.filter((m) => m.sex === "female").length);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Goliath");
    expectShowing(monkeysArr.filter((m) => m.sex === "female" && m.troop === "Goliath").length);
});

test("filters in use show as chips: remove one, or Clear All", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Goliath");
    await user.click(ageButton("Young Adults"));
    await user.click(sexPill("Female")); // Female off: males only
    await user.click(within(panel()).getByRole("button", { name: /^Show / }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();

    expect(filtersButton()).toHaveAccessibleName("Filters (3 on)");
    const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);
    expect(chips()).toEqual(["Goliath", "Young Adults", "Male"]);

    await user.click(screen.getByRole("button", { name: "Remove filter: Young Adults" }));
    expect(chips()).toEqual(["Goliath", "Male"]);
    expectShowing(monkeysArr.filter((m) => m.sex === "male" && m.troop === "Goliath").length);

    await user.click(screen.getByRole("button", { name: "Clear All" }));
    expect(chips()).toEqual([]);
    expect(filtersButton()).toHaveAccessibleName("Filters");
    expectShowing(monkeysArr.length);
});

// Sort → pick an option from its menu
async function chooseSort(user, label) {
    await user.click(screen.getByRole("button", { name: /^Sort/ }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`) }));
}

test("sort by sex: females first, then males (and back)", async () => {
    const { user } = setup();
    // (Only the first 100 are on screen, so check the order rather than the ends)
    const rank = { female: 0, male: 1, "": 2 };
    const sexOf = (name) => monkeysArr.find((m) => m.name === name).sex;
    const inOrder = (ranks) => ranks.every((r, i) => i === 0 || ranks[i - 1] <= r);

    await chooseSort(user, "Sex");
    const firstWay = shownNames().map((n) => rank[sexOf(n)]);
    expect(firstWay[0]).toBe(0); // a female first
    expect(inOrder(firstWay)).toBe(true);

    await chooseSort(user, "Sex");
    const otherWay = shownNames().map((n) => rank[sexOf(n)]);
    expect(otherWay[0]).toBe(1); // now a male first
    expect(inOrder(otherWay.map((r) => (r === 2 ? 2 : 1 - r)))).toBe(true);
});

describe("Location", () => {
    // Aroha in an introcage at H&B (the built-in copy has nobody in one)
    const aroha = { ...monkeysArr.find((m) => m.name === "Aroha"), troop: null, introcage: "H&B C1", enclosure: "H&B" };
    const MONKEYS = monkeysArr.map((m) => (m.name === "Aroha" ? aroha : m));
    const hbTroop = MONKEYS.filter((m) => m.troop === "H&B");
    function setupWithIntrocage() {
        const user = userEvent.setup();
        render(<ShowPage monkeys={MONKEYS} />);
        return { user };
    }
    const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);

    test("Troop and Introcage: both on to start with (everyone)", async () => {
        const { user } = setupWithIntrocage();
        await user.click(filtersButton());
        expect(locationPill("Troop")).toHaveAttribute("aria-pressed", "true");
        expect(locationPill("Introcage")).toHaveAttribute("aria-pressed", "true");
        expectShowing(MONKEYS.length);
    });

    test("Troop off: only introcage monkeys, with a chip; the last pill on can't go off", async () => {
        const { user } = setupWithIntrocage();
        await user.click(filtersButton());
        await user.click(locationPill("Troop"));
        expect(locationPill("Troop")).toHaveAttribute("aria-pressed", "false");
        expectShowing(1);
        expect(shownNames()).toEqual(["Aroha"]);
        expect(chips()).toEqual(["In introcages"]);

        await user.click(locationPill("Introcage")); // the only one on: stays on
        expect(locationPill("Introcage")).toHaveAttribute("aria-pressed", "true");
        expectShowing(1);

        await user.click(locationPill("Troop")); // back on: everyone
        expectShowing(MONKEYS.length);
        expect(chips()).toEqual([]);
    });

    test("Introcage off: only troop monkeys", async () => {
        const { user } = setupWithIntrocage();
        await user.click(filtersButton());
        await user.click(locationPill("Introcage"));
        expectShowing(MONKEYS.length - 1);
        expect(shownNames()).not.toContain("Aroha");
        expect(chips()).toEqual(["In troops"]);
    });

    test("a troop chosen: its monkeys and those in its enclosure's introcages; each pill changes the count", async () => {
        const { user } = setupWithIntrocage();
        const showButton = () => screen.getByRole("button", { name: /^Show \d+ monkeys?$/ });
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "H&B");
        // Both on: the troop and its introcages
        expectShowing(hbTroop.length + 1);
        expect(showButton()).toHaveTextContent(`Show ${hbTroop.length + 1} monkeys`);
        // Introcage off: just the troop
        await user.click(locationPill("Introcage"));
        expectShowing(hbTroop.length);
        expect(showButton()).toHaveTextContent(`Show ${hbTroop.length} monkeys`);
        // Introcage only: the ones in H&B's introcages
        await user.click(locationPill("Introcage"));
        await user.click(locationPill("Troop"));
        expectShowing(1);
        expect(showButton()).toHaveTextContent("Show 1 monkey");
        expect(chips()).toEqual(["In introcages", "Holt & Barrington"]);
        // Another troop: nobody in its introcages
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Goliath");
        expect(screen.getByText("No monkeys found")).toBeInTheDocument();
    });

    test("Clear All puts both back on", async () => {
        const { user } = setupWithIntrocage();
        await user.click(filtersButton());
        await user.click(locationPill("Troop"));
        await user.click(screen.getByRole("button", { name: "Remove filter: In introcages" }));
        expectShowing(MONKEYS.length);
        await user.click(filtersButton());
        expect(locationPill("Troop")).toHaveAttribute("aria-pressed", "true");
    });

    const troopList = () =>
        within(screen.getByRole("combobox", { name: "Filter by enclosure" }))
            .getAllByRole("option")
            .map((o) => o.textContent);
    const TOP = ["Goliath", "Gismo", "D&D", "Royal"];
    const SICKBAY = ["James", "Global"];

    test("Quick Filters: the sections, the Bandits, the care units and this season's babies, no \"All\" pill", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        const names = within(screen.getByRole("group", { name: "Quick Filters" }))
            .getAllByRole("button")
            .map((b) => b.textContent);
        expect(names).toEqual([
            "Top Section", "Middle Section", "Bottom Section", "Sickbay Section", "Bandits",
            "Baby Care", "Sickbay", "Favourites", `Babies ${currentBabySeason()}`,
        ]);
    });

    test("a section shows its troops' monkeys, and the troop list narrows to them", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(quickPill("Top Section"));
        expect(quickPill("Top Section")).toHaveAttribute("aria-pressed", "true");
        expectShowing(monkeysArr.filter((m) => TOP.includes(m.troop)).length);
        expect(troopList()).toEqual(["All Enclosures", ...TOP.map((t) => fullName(t))]); // (full names)
    });

    test("several at once; each a chip that removes just it", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(quickPill("Top Section"));
        await user.click(quickPill("Sickbay Section"));
        expectShowing(monkeysArr.filter((m) => [...TOP, ...SICKBAY].includes(m.troop)).length);
        expect(troopList().slice(1).sort()).toEqual([...TOP, ...SICKBAY].map((t) => fullName(t)).sort()); // in the usual troop order
        const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);
        expect(chips()).toEqual(["Top Section", "Sickbay Section"]);

        await user.click(screen.getByRole("button", { name: "Remove filter: Top Section" }));
        expect(chips()).toEqual(["Sickbay Section"]);
        await user.click(filtersButton()); // tapping the chip closed the panel
        expect(quickPill("Top Section")).toHaveAttribute("aria-pressed", "false");

        // Tapping the last one off: everyone again
        await user.click(quickPill("Sickbay Section"));
        expect(chips()).toEqual([]);
        expectShowing(monkeysArr.length);
    });

    test("changing sections drops a troop that isn't in them", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Skrow");
        await user.click(quickPill("Bottom Section"));
        expect(screen.getByRole("combobox", { name: "Filter by enclosure" })).toHaveValue("Skrow"); // Skrow is Bottom
        await user.click(quickPill("Bottom Section")); // off: back to everyone
        await user.click(quickPill("Sickbay Section"));
        expect(screen.getByRole("combobox", { name: "Filter by enclosure" })).toHaveValue("All Troops");
        expectShowing(monkeysArr.filter((m) => SICKBAY.includes(m.troop)).length);
    });

    test("choosing an enclosure turns the Quick Filters off (just that troop)", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(quickPill("Bottom Section"));
        await user.click(quickPill("Baby Care"));
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Skrow");
        expect(quickPill("Bottom Section")).toHaveAttribute("aria-pressed", "false");
        expect(quickPill("Baby Care")).toHaveAttribute("aria-pressed", "false");
        expectShowing(monkeysArr.filter((m) => m.troop === "Skrow" || (m.introcage && m.enclosure === "Skrow")).length);
        // (back to all of them: the Quick Filters stay off)
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "All Troops");
        expect(quickPill("Bottom Section")).toHaveAttribute("aria-pressed", "false");
    });

    test("Bandits: the wild troop (not in the Enclosures box)", async () => {
        const user = userEvent.setup();
        const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "" };
        const monkeys = [
            { ...base, id: 1, name: "Wildy", troop: "Bandits", introcage: null, enclosure: null },
            { ...base, id: 2, name: "Rocio", troop: "Goliath", introcage: null, enclosure: "Goliath" },
        ];
        render(<ShowPage monkeys={monkeys} troops={["All Troops", "Goliath", "Bandits"]} />);
        await user.click(filtersButton());
        await user.click(quickPill("Bandits"));
        expect(shownNames()).toEqual(["Wildy"]);
        expect(troopList()).toEqual(["All Enclosures"]);
    });

    test("Babies: this season's sanctuary babies from every troop, not the Bandits'", async () => {
        const user = userEvent.setup();
        const season = currentBabySeason();
        const base = { sex: "female", chip: "", img: ["x.jpg"], bio: "", desc: "" };
        const monkeys = [
            { ...base, id: 1, name: "Tiny", year: season, troop: "Goliath", introcage: null, enclosure: "Goliath" },
            { ...base, id: 2, name: "Pip", year: season, troop: null, introcage: "Baby Care", introcageType: "area", enclosure: "Baby Care" },
            { ...base, id: 3, name: "Wildling", year: season, troop: "Bandits", introcage: null, enclosure: null },
            { ...base, id: 4, name: "Older", year: season - 1, troop: "Goliath", introcage: null, enclosure: "Goliath" },
        ];
        render(<ShowPage monkeys={monkeys} />);
        await user.click(filtersButton());
        await user.click(quickPill(`Babies ${season}`));
        expect(shownNames().sort()).toEqual(["Pip", "Tiny"]);
        expect([...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent)).toEqual([`Babies ${season}`]);
    });

    test("every troop is in a section", () => {
        const troops = new Set(monkeysArr.map((m) => m.troop));
        const placed = new Set(SECTIONS.flatMap((s) => s.troops));
        expect([...troops].filter((t) => !placed.has(t))).toEqual([]);
    });
});

test("a birth year or an age category, not both: choosing one clears the other", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(filtersButton());
    const year = () => screen.getByRole("combobox", { name: "Filter by year" });

    await user.click(ageButton("Young Adults"));
    await user.selectOptions(year(), "2019");
    // The year is doing the filtering: no category, and "All Ages" off too
    expect(ageButton("Young Adults")).toHaveAttribute("aria-pressed", "false");
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "false");
    expectShowing(monkeysArr.filter((m) => Number(m.year) === 2019).length);

    // "All Ages" clears the year: every age again
    await user.click(ageButton("All Ages"));
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "true");
    expect(year()).toHaveValue("All Years");
    expectShowing(monkeysArr.length);
    await user.selectOptions(year(), "2019");

    await user.click(ageButton("Juveniles"));
    expect(year()).toHaveValue("All Years");
    expect(year()).toHaveDisplayValue("Choose a year…"); // dimmed, unused
    expect(year()).toHaveClass("is-empty");

    // "Any year" clears a chosen year
    await user.selectOptions(year(), "2019");
    expect(year()).not.toHaveClass("is-empty");
    await user.selectOptions(year(), "Any year");
    expect(year()).toHaveDisplayValue("Choose a year…");
    expectShowing(monkeysArr.length);
});

test("Clear All in the panel is greyed out until a filter is on", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(filtersButton());
    const clear = () => within(panel()).getByRole("button", { name: "Clear All" });
    expect(clear()).toBeDisabled();
    await user.click(sexPill("Male"));
    expect(clear()).toBeEnabled();
    await user.click(clear());
    expect(sexPill("Female")).toHaveAttribute("aria-pressed", "true");
    expect(sexPill("Male")).toHaveAttribute("aria-pressed", "true");
    expect(clear()).toBeDisabled();
});

test("phones: while the filter sheet is open the page behind can't scroll", async () => {
    const realMatchMedia = window.matchMedia;
    window.matchMedia = (query) => ({ matches: query === "(max-width: 624px)", media: query, addEventListener() {}, removeEventListener() {} });
    try {
        const { user } = setup();
        const root = document.documentElement;
        await user.click(filtersButton());
        expect(root.style.overflow).toBe("hidden");
        await user.keyboard("{Escape}");
        expect(root.style.overflow).toBe("");
    } finally {
        window.matchMedia = realMatchMedia;
    }
});

test("computers: the filter dropdown leaves the page scrollable", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    expect(document.documentElement.style.overflow).toBe("");
});

describe("the Enclosures box and the care units", () => {
    const optionTexts = () =>
        within(screen.getByRole("combobox", { name: "Filter by enclosure" }))
            .getAllByRole("option")
            .map((o) => o.textContent);

    test("the troop enclosures, then Quarantine (the Bandits, Baby Care and Sickbay are Quick Filters)", async () => {
        const user = userEvent.setup();
        render(<ShowPage troops={["All Troops", "Goliath", "Bandits"]} />);
        await user.click(filtersButton());
        expect(optionTexts()).toEqual(["All Enclosures", "Goliath", "Quarantine"]);
    });

    test("Baby Care, Sickbay (with the monkeys in Sickbay for now) and Favourites, none twice", async () => {
        const user = userEvent.setup();
        const base = { sex: "female", chip: "1", year: 2015, img: ["x.jpg"], bio: "", desc: "" };
        const monkeys = [
            { ...base, id: 1, name: "Ziggy", troop: null, introcage: "Sickbay", introcageType: "area", enclosure: "Sickbay" },
            { ...base, id: 2, name: "Nita", troop: "Goliath", introcage: null, enclosure: "Goliath", inSickbay: true },
            { ...base, id: 3, name: "Rocio", troop: "Goliath", introcage: null, enclosure: "Goliath", inSickbay: false },
            { ...base, id: 4, name: "Pip", troop: null, introcage: "Baby Care", introcageType: "area", enclosure: "Baby Care" },
            { ...base, id: 5, name: "Quin", troop: null, introcage: "Quarantine", introcageType: "area", enclosure: "Quarantine" },
        ];
        render(<ShowPage monkeys={monkeys} />);
        await user.click(filtersButton());
        await user.click(quickPill("Sickbay"));
        expect(shownNames().sort()).toEqual(["Nita", "Ziggy"]);
        // The enclosures box isn't narrowed (not a section)
        expect(optionTexts()).toContain("Goliath");
        await user.click(quickPill("Baby Care"));
        expect(shownNames().sort()).toEqual(["Nita", "Pip", "Ziggy"]);
        // Both places chosen (Top has Goliath): Nita is one monkey, counted once
        await user.click(quickPill("Top Section"));
        expect(shownNames().sort()).toEqual(["Nita", "Pip", "Rocio", "Ziggy"]);
        expectShowing(4);
        // Favourites: just the ★ ones (starred on their cards)
        await user.click(within(panel()).getByRole("button", { name: "Clear All" }));
        await user.click(quickPill("Favourites"));
        expect(document.querySelectorAll(".ShowPage-monkeys .MonkeyCard")).toHaveLength(0);
        await user.click(quickPill("Favourites"));
        await user.click(screen.getByRole("button", { name: "Favourite Quin" }));
        expect(screen.getByRole("button", { name: "Favourite Quin" })).toHaveAttribute("aria-pressed", "true");
        // (a tap outside put Filters away)
        await user.click(filtersButton());
        await user.click(quickPill("Favourites"));
        expect(shownNames()).toEqual(["Quin"]);
        // Quarantine: in the Enclosures box (no Quick Filter of its own), last
        await user.click(quickPill("Favourites"));
        expect(optionTexts().at(-1)).toBe("Quarantine");
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Quarantine");
        expect(shownNames()).toEqual(["Quin"]);
        // Nita in Sickbay for now is still in her troop's enclosure too
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by enclosure" }), "Goliath");
        expect(shownNames().sort()).toEqual(["Nita", "Rocio"]);
    });
});
