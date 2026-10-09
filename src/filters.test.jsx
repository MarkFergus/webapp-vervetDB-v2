// The Filters panel (troop, birth year, age group, sex), the filter chips,
// and sorting by sex.
import { render, screen, within } from "@testing-library/react";
import { fullName } from "./places";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { ageInYears } from "./ages";
import { SECTIONS } from "./sections";

const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
const panel = () => screen.getByRole("dialog", { name: "Filters" });
// Location: Troop and Introcage pills, both on to start with
const locationPill = (name) => within(screen.getByRole("group", { name: "Living in" })).getByRole("button", { name });
// The monkeys' cards, in order (their names are "Aroha, …")
const shownNames = () =>
    within(document.querySelector(".ShowPage-monkeys"))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label").split(",")[0]);
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
    expect(locationPill("Troop")).toHaveFocus(); // the first choice

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();
    expect(filtersButton()).toHaveFocus();
});

test("birth years: this year back to 2000", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    const years = within(screen.getByRole("combobox", { name: "Filter by year" }))
        .getAllByRole("option")
        .map((o) => o.textContent);
    const thisYear = new Date().getFullYear();
    // ("Choose a year…" only shows in the box, not in the list)
    expect(years[0]).toBe("Any year");
    expect(years[1]).toBe(String(thisYear));
    expect(years.at(-1)).toBe("2000");
    expect(years).toHaveLength(thisYear - 2000 + 2);
});

test.each([
    ["Babies", (age) => age === 0],
    ["Juveniles", (age) => age !== null && age >= 1 && age <= 3],
    ["Adults", (age) => age === null || (age >= 4 && age <= 14)], // no birth year = adult
    ["Elderly", (age) => age !== null && age >= 15],
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

test("several age categories together, e.g. Adults + Juveniles; All turns them off", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(ageButton("Adults"));
    await user.click(ageButton("Juveniles"));
    const fits = (age) => age === null || (age >= 1 && age <= 14);
    expectShowing(monkeysArr.filter((m) => fits(ageInYears(m.year))).length);
    // A chip for each
    expect([...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent)).toEqual([
        "Juveniles",
        "Adults",
    ]);
    expect(filtersButton()).toHaveAccessibleName("Filters (2 on)");

    // Tapping one again turns just that one off
    await user.click(ageButton("Juveniles"));
    expect(ageButton("Adults")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("Juveniles")).toHaveAttribute("aria-pressed", "false");

    await user.click(ageButton("All Ages"));
    expect(ageButton("All Ages")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("Adults")).toHaveAttribute("aria-pressed", "false");
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

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
    expectShowing(monkeysArr.filter((m) => m.sex === "female" && m.troop === "Goliath").length);
});

test("filters in use show as chips: remove one, or Clear All", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
    await user.click(ageButton("Adults"));
    await user.click(sexPill("Female")); // Female off: males only
    await user.click(within(panel()).getByRole("button", { name: /^Show / }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();

    expect(filtersButton()).toHaveAccessibleName("Filters (3 on)");
    const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);
    expect(chips()).toEqual(["Goliath", "Adults", "Male"]);

    await user.click(screen.getByRole("button", { name: "Remove filter: Adults" }));
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
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "H&B");
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
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
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

    // Section pills: "All Sections" to start with; tapping others adds them
    const sectionPill = (name) =>
        within(screen.getByRole("group", { name: "Section" })).getByRole("button", { name });
    const troopList = () =>
        within(screen.getByRole("combobox", { name: "Filter by troop" }))
            .getAllByRole("option")
            .map((o) => o.textContent);
    const TOP = ["Goliath", "Gismo", "D&D", "Royal"];
    const SICKBAY = ["James", "Global"];

    test("choosing a troop turns \"All Sections\" off (dashed), and All Troops turns it back on", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        const troop = screen.getByRole("combobox", { name: "Filter by troop" });
        await user.selectOptions(troop, "Goliath");
        expect(sectionPill("All Sections")).toHaveAttribute("aria-pressed", "false");
        await user.selectOptions(troop, "All Troops");
        expect(sectionPill("All Sections")).toHaveAttribute("aria-pressed", "true");
    });

    test("a section shows its troops' monkeys, and the troop list narrows to them", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        expect(sectionPill("All Sections")).toHaveAttribute("aria-pressed", "true");
        await user.click(sectionPill("Top"));
        expect(sectionPill("All Sections")).toHaveAttribute("aria-pressed", "false");
        expectShowing(monkeysArr.filter((m) => TOP.includes(m.troop)).length);
        expect(troopList()).toEqual(["All Troops", ...TOP.map((t) => fullName(t))]); // (full names)
    });

    test("several sections at once; each a chip that removes just it", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(sectionPill("Top"));
        await user.click(sectionPill("Sickbay"));
        expectShowing(monkeysArr.filter((m) => [...TOP, ...SICKBAY].includes(m.troop)).length);
        expect(troopList().slice(1).sort()).toEqual([...TOP, ...SICKBAY].map((t) => fullName(t)).sort()); // in the usual troop order
        const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);
        expect(chips()).toEqual(["Top section", "Sickbay section"]);

        await user.click(screen.getByRole("button", { name: "Remove filter: Top section" }));
        expect(chips()).toEqual(["Sickbay section"]);
        await user.click(filtersButton()); // tapping the chip closed the panel
        expect(sectionPill("Top")).toHaveAttribute("aria-pressed", "false");

        // "All Sections" turns them all off again
        await user.click(sectionPill("All Sections"));
        expect(chips()).toEqual([]);
        expectShowing(monkeysArr.length);
    });

    test("changing sections drops a troop that isn't in them", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Skrow");
        await user.click(sectionPill("Bottom"));
        expect(screen.getByRole("combobox", { name: "Filter by troop" })).toHaveValue("Skrow"); // Skrow is Bottom
        await user.click(sectionPill("Bottom")); // off: back to all sections
        await user.click(sectionPill("Sickbay"));
        expect(screen.getByRole("combobox", { name: "Filter by troop" })).toHaveValue("All Troops");
        expectShowing(monkeysArr.filter((m) => SICKBAY.includes(m.troop)).length);
    });

    test("the Bandits (the wild troop) are a section of their own", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(sectionPill("Bandits"));
        expect(troopList()).toEqual(["All Troops"]); // none in the built-in copy of the data
        expect([...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent)).toEqual(["Bandits"]);
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

    await user.click(ageButton("Adults"));
    await user.selectOptions(year(), "2019");
    // The year is doing the filtering: no category, and "All Ages" off too
    expect(ageButton("Adults")).toHaveAttribute("aria-pressed", "false");
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
    expect(screen.getByText("Pick a birth year or a category")).toBeInTheDocument();
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
