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
    expect(years[0]).toBe("All Years");
    expect(years[1]).toBe(String(thisYear));
    expect(years.at(-1)).toBe("2000");
    expect(years).toHaveLength(thisYear - 2000 + 2);
});

test.each([
    ["Adults", (age) => age === null || age >= 4],
    ["Juveniles", (age) => age !== null && age >= 1 && age <= 3],
    ["Babies", (age) => age === 0],
])("Age: %s", async (group, fits) => {
    const { user } = setup();
    await user.click(filtersButton());
    await user.click(choice("Age", group));
    expect(choice("Age", group)).toHaveAttribute("aria-checked", "true");
    const expected = monkeysArr.filter((m) => fits(ageInYears(m.year))).length;
    expectShowing(expected);
    expect(within(panel()).getByRole("button", { name: /^Show / })).toHaveTextContent(
        `Show ${expected} monkey`
    );
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
    await user.click(choice("Age", "Adults"));
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
