import { fireEvent, render, screen, within, waitFor } from "@testing-library/react";
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

test("year filter shows only monkeys born that year", async () => {
    const { user, cardNames, yearSelect } = setup();
    await user.selectOptions(yearSelect(), "2010");

    const expected = monkeysArr.filter((m) => m.year === 2010).length;
    expect(cardNames()).toContain("Gremlin");
    expect(cardNames()).toHaveLength(expected);
});

test("sorting doesn't reorder the original monkey data", async () => {
    const before = monkeysArr.map((m) => m.name);
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: /^Age/ }));
    await user.click(screen.getByRole("button", { name: /^Troop/ }));

    expect(monkeysArr.map((m) => m.name)).toEqual(before);
});

test("clicking a sort button twice reverses the order", async () => {
    const { user, cardNames } = setup();
    const ascending = cardNames();
    await user.click(screen.getByRole("button", { name: /^Name/ }));

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

async function openCard(user, container, name) {
    await user.type(screen.getByPlaceholderText("Name or chip number"), name);
    await user.click(
        within(container.querySelector(".ShowPage-monkeys")).getByText(name)
    );
}

test("modal shows 'No Chip' when a monkey has no chip number", async () => {
    const { user, container } = setup();
    await openCard(user, container, "Bloem");

    expect(container.querySelector(".Modal-details")).toHaveTextContent(
        "Chip: No Chip"
    );
});

test("closing the modal by clicking outside resets the photo", async () => {
    const { user, container } = setup();
    const aroha = monkeysArr.find((m) => m.name === "Aroha");
    // Any monkey with 2+ photos (and a name no other monkey shares)
    const multiPhoto = monkeysArr.find(
        (m) =>
            m.img.length > 1 &&
            monkeysArr.filter((x) => x.name === m.name).length === 1
    );

    // Move to its second photo, then close via the backdrop
    await openCard(user, container, multiPhoto.name);
    await user.click(container.querySelectorAll(".Modal-imageButton")[1]);
    await user.click(container.querySelector(".Modal-overlay"));
    await waitFor(() =>
        expect(container.querySelector(".Modal-title")).toBeNull()
    );

    // Aroha has only 1 photo, so it must show photo 1, not photo 2
    await user.clear(screen.getByPlaceholderText("Name or chip number"));
    await openCard(user, container, "Aroha");
    expect(screen.getByAltText("Aroha")).toHaveAttribute("src", aroha.img[0]);
});

test("clicking outside the PDF modal closes it", async () => {
    const { user, container } = setup();
    await user.click(container.querySelector(".Nav-buttons button"));
    expect(screen.getByText("Create Profile Book")).toBeInTheDocument();

    await user.click(container.querySelector(".ModalPDF-overlay"));
    await waitFor(() =>
        expect(screen.queryByText("Create Profile Book")).toBeNull()
    );
});

test("sort by age: youngest first, then oldest first; unknown ages always last", () => {
    const { container } = setup();
    const ages = () =>
        [...container.querySelectorAll(".MonkeyCard-info-age")].map((el) => el.textContent);
    const ageNumber = (text) => (text.startsWith("Under") ? 0 : parseInt(text, 10));
    const ageButton = () => screen.getByRole("button", { name: /^Age/ });
    // Sorting resets to page 1, so expand to every monkey after each sort.
    // fireEvent (a plain click) rather than the simulated user: much faster
    // with 500+ cards on screen, which matters on GitHub's slower machines
    const showAll = () => {
        let more;
        while ((more = screen.queryByRole("button", { name: "Show More" }))) {
            fireEvent.click(more);
        }
    };
    const unknown = monkeysArr.filter((m) => m.year === "").length;
    const known = (list) => list.slice(0, -unknown).map(ageNumber);
    const inOrder = (list, up) => list.every((n, i) => i === 0 || (up ? list[i - 1] <= n : list[i - 1] >= n));

    fireEvent.click(ageButton());
    showAll();
    expect(ages()).toHaveLength(monkeysArr.length);
    expect(ages().slice(-unknown).every((a) => a === "Age unknown")).toBe(true);
    expect(inOrder(known(ages()), true)).toBe(true); // youngest first

    fireEvent.click(ageButton());
    showAll();
    expect(ages().slice(-unknown).every((a) => a === "Age unknown")).toBe(true);
    expect(inOrder(known(ages()), false)).toBe(true); // oldest first
});

test("modal shows Unknown and 'No bio yet.' for missing details", async () => {
    const { user, container } = setup();
    // Caryl has no birth year and no bio; Fuzz has no sex recorded
    await openCard(user, container, "Caryl");
    const details = () => container.querySelector(".Modal-details");
    expect(details()).toHaveTextContent("Born: Unknown");
    expect(details()).toHaveTextContent("Bio: No bio yet.");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.clear(screen.getByPlaceholderText("Name or chip number"));
    await openCard(user, container, "Fuzz");
    expect(details()).toHaveTextContent("Sex: Unknown");
});
