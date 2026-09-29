import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";

function setup() {
    const user = userEvent.setup();
    const utils = render(<ShowPage />);
    const cardNames = () =>
        [...utils.container.querySelectorAll(".MonkeyCard-info-name")].map(
            (el) => el.textContent
        );
    const cardTroops = () =>
        [...utils.container.querySelectorAll(".MonkeyCard-info-troop")].map(
            (el) => el.textContent
        );
    const search = () => screen.getByPlaceholderText("Name or chip number");
    const troopSelect = () => utils.container.querySelector("#troops");
    const yearSelect = () => utils.container.querySelector("#year");
    return { user, cardNames, cardTroops, search, troopSelect, yearSelect, ...utils };
}

test("search only looks within the selected troop", async () => {
    const { user, cardNames, cardTroops, search, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "Goliath");
    await user.type(search(), "a");

    expect(cardNames().length).toBeGreaterThan(0);
    expect(cardTroops().every((t) => t === "Goliath")).toBe(true);
    expect(cardNames().every((n) => n.toLowerCase().includes("a"))).toBe(true);
});

test("clearing the search keeps the troop filter", async () => {
    const { user, cardTroops, search, troopSelect, container } = setup();
    await user.selectOptions(troopSelect(), "James");
    await user.type(search(), "zzz");
    await user.click(container.querySelector(".Nav-iconX"));

    const jamesCount = monkeysArr.filter((m) => m.troop === "James").length;
    expect(troopSelect()).toHaveValue("James");
    expect(cardTroops()).toHaveLength(jamesCount);
    expect(cardTroops().every((t) => t === "James")).toBe(true);
});

test("changing a filter keeps the search text", async () => {
    const { user, search, troopSelect } = setup();
    await user.type(search(), "be");
    await user.selectOptions(troopSelect(), "James");

    expect(search()).toHaveValue("be");
});

test("searching by chip number finds that monkey", async () => {
    const { user, cardNames, search } = setup();
    await user.type(search(), "19806");

    expect(cardNames()).toEqual(["Aroha"]);
});

test("year filter includes monkeys whose year is stored as text", async () => {
    const { user, cardNames, yearSelect } = setup();
    await user.selectOptions(yearSelect(), "2010");

    // Gremlin's year is "2010" (a string) in monkeysArr
    expect(cardNames()).toContain("Gremlin");
});

test("sorting doesn't reorder the original monkey data", async () => {
    const before = monkeysArr.map((m) => m.name);
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /year/i }));
    await user.click(screen.getByRole("button", { name: /troop/i }));

    expect(monkeysArr.map((m) => m.name)).toEqual(before);
});

test("clicking a sort button twice reverses the order", async () => {
    const { user, cardNames } = setup();
    const ascending = cardNames();
    await user.click(screen.getByRole("button", { name: /name/i }));

    expect(cardNames()[0]).not.toBe(ascending[0]);
    expect(
        cardNames()[0].localeCompare(cardNames()[1])
    ).toBeGreaterThanOrEqual(0);
});

test("Show More resets to the first page when the filter changes", async () => {
    const { user, cardNames, troopSelect } = setup();
    await user.click(screen.getByRole("button", { name: "Show More" }));
    expect(cardNames().length).toBeGreaterThan(100);

    await user.selectOptions(troopSelect(), "All Troops");
    expect(cardNames()).toHaveLength(100);
});

test("modal next arrow follows the filtered list", async () => {
    const { user, cardNames, troopSelect, container } = setup();
    await user.selectOptions(troopSelect(), "James");
    const [first, second] = cardNames();

    await user.click(within(container.querySelector(".ShowPage-monkeys")).getByText(first));
    expect(container.querySelector(".Modal-title")).toHaveTextContent(first);

    await user.click(container.querySelector(".Modal-arrowright"));
    expect(container.querySelector(".Modal-title")).toHaveTextContent(second);
});
