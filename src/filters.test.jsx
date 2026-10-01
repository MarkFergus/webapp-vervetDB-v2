// The Filters panel (troop, birth year, age group, sex), the filter chips,
// and sorting by sex.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { ageInYears } from "./ages";
import { SECTIONS } from "./sections";

const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });
const panel = () => screen.getByRole("dialog", { name: "Filters" });
const choice = (group, name) =>
    within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: new RegExp(`^${name}`) });
// The monkeys' cards, in order (their names are "Aroha, …")
const shownNames = () =>
    within(document.querySelector(".ShowPage-monkeys"))
        .getAllByRole("button")
        .map((b) => b.getAttribute("aria-label").split(",")[0]);
// Age categories: toggle buttons (several can be on)
const ageButton = (name) =>
    within(screen.getByRole("group", { name: "Category" })).getByRole("button", { name: new RegExp(`^${name}`) });
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
    expect(choice("Enclosure", "Troop")).toHaveFocus(); // the first choice

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
    expect(ageButton("All")).toHaveAttribute("aria-pressed", "false");
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

    await user.click(ageButton("All"));
    expect(ageButton("All")).toHaveAttribute("aria-pressed", "true");
    expect(ageButton("Adults")).toHaveAttribute("aria-pressed", "false");
    expectShowing(monkeysArr.length);
});

test("Sex, and filters combine", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(choice("Sex", "Female"));
    expectShowing(monkeysArr.filter((m) => m.sex === "female").length);

    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
    expectShowing(monkeysArr.filter((m) => m.sex === "female" && m.troop === "Goliath").length);
});

test("filters in use show as chips: remove one, or Clear all", async () => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Goliath");
    await user.click(ageButton("Adults"));
    await user.click(choice("Sex", "Male"));
    await user.click(within(panel()).getByRole("button", { name: /^Show / }));
    expect(screen.queryByRole("dialog", { name: "Filters" })).toBeNull();

    expect(filtersButton()).toHaveAccessibleName("Filters (3 on)");
    const chips = () => [...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent);
    expect(chips()).toEqual(["Goliath", "Adults", "Male"]);

    await user.click(screen.getByRole("button", { name: "Remove filter: Adults" }));
    expect(chips()).toEqual(["Goliath", "Male"]);
    expectShowing(monkeysArr.filter((m) => m.sex === "male" && m.troop === "Goliath").length);

    await user.click(screen.getByRole("button", { name: "Clear all" }));
    expect(chips()).toEqual([]);
    expect(filtersButton()).toHaveAccessibleName("Filters");
    expectShowing(monkeysArr.length);
});

test("sort by sex: females first, then males (and back)", async () => {
    const { user } = setup();
    // (Only the first 100 are on screen, so check the order rather than the ends)
    const rank = { female: 0, male: 1, "": 2 };
    const sexOf = (name) => monkeysArr.find((m) => m.name === name).sex;
    const inOrder = (ranks) => ranks.every((r, i) => i === 0 || ranks[i - 1] <= r);

    await user.click(screen.getByRole("button", { name: /^Sex/ }));
    const firstWay = shownNames().map((n) => rank[sexOf(n)]);
    expect(firstWay[0]).toBe(0); // a female first
    expect(inOrder(firstWay)).toBe(true);

    await user.click(screen.getByRole("button", { name: /^Sex/ }));
    const otherWay = shownNames().map((n) => rank[sexOf(n)]);
    expect(otherWay[0]).toBe(1); // now a male first
    expect(inOrder(otherWay.map((r) => (r === 2 ? 2 : 1 - r)))).toBe(true);
});

describe("Location", () => {
    test("Troops are chosen; Introcage is greyed out until those monkeys are added", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        expect(choice("Enclosure", "Troop")).toHaveAttribute("aria-checked", "true");
        expect(choice("Enclosure", "Introcage")).toBeDisabled();
    });

    test("a section shows its troops' monkeys, and the troop list narrows to them", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.click(choice("Section", "Top"));
        const top = ["Goliath", "Gismo", "D&D", "Royal"];
        expectShowing(monkeysArr.filter((m) => top.includes(m.troop)).length);
        const troopOptions = within(screen.getByRole("combobox", { name: "Filter by troop" }))
            .getAllByRole("option")
            .map((o) => o.textContent);
        expect(troopOptions).toEqual(["All Troops", ...top]);
    });

    test("changing section drops a troop that isn't in it", async () => {
        const { user } = setup();
        await user.click(filtersButton());
        await user.selectOptions(screen.getByRole("combobox", { name: "Filter by troop" }), "Skrow");
        await user.click(choice("Section", "Bottom"));
        expect(screen.getByRole("combobox", { name: "Filter by troop" })).toHaveValue("Skrow"); // Skrow is Bottom
        await user.click(choice("Section", "Sickbay"));
        expect(screen.getByRole("combobox", { name: "Filter by troop" })).toHaveValue("All Troops");
        expectShowing(monkeysArr.filter((m) => ["James", "Global"].includes(m.troop)).length);
        expect([...document.querySelectorAll(".ShowPage-chip")].map((c) => c.textContent)).toEqual([
            "Sickbay section",
        ]);
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
    expect(ageButton("All")).toHaveAttribute("aria-pressed", "true");
    expectShowing(monkeysArr.filter((m) => Number(m.year) === 2019).length);

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

test("Clear all in the panel is greyed out until a filter is on", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(filtersButton());
    const clear = () => within(panel()).getByRole("button", { name: "Clear all" });
    expect(clear()).toBeDisabled();
    await user.click(choice("Sex", "Female"));
    expect(clear()).toBeEnabled();
    await user.click(clear());
    expect(choice("Sex", "All")).toHaveAttribute("aria-checked", "true");
    expect(clear()).toBeDisabled();
});
