import { act, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
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

// Sort → pick an option from its menu
async function chooseSort(user, label) {
    await user.click(screen.getByRole("button", { name: /^Sort/ }));
    await user.click(screen.getByRole("menuitem", { name: new RegExp(`^${label}`) }));
}

test("sorting doesn't reorder the original monkey data", async () => {
    const before = monkeysArr.map((m) => m.name);
    const { user } = setup();
    await chooseSort(user, "Age");
    await chooseSort(user, "Troop");

    expect(monkeysArr.map((m) => m.name)).toEqual(before);
});

test("choosing the current sort again reverses the order", async () => {
    const { user, cardNames } = setup();
    const ascending = cardNames();
    await chooseSort(user, "Name");

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

    await user.click(screen.getByRole("button", { name: "Next monkey" }));
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
        "No Chip"
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
    await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Profile Book" }));
    expect(screen.getByRole("dialog", { name: "Create Profile Book" })).toBeInTheDocument();

    await user.click(container.querySelector(".ModalPDF-overlay"));
    await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Create Profile Book" })).toBeNull()
    );
});

test("sort by age: youngest first, then oldest first; unknown ages always last", () => {
    const { container } = setup();
    const ages = () =>
        [...container.querySelectorAll(".MonkeyCard-info-age")].map(
            (el) => (el.querySelector(".MonkeyCard-ageLong") ?? el).textContent
        );
    const ageNumber = (text) => (text === "Baby" ? 0 : parseInt(text, 10));
    // Sort → Age (a plain click on each, like the rest of this test)
    const sortByAge = () => {
        fireEvent.click(screen.getByRole("button", { name: /^Sort/ }));
        fireEvent.click(screen.getByRole("menuitem", { name: /^Age/ }));
    };
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

    sortByAge();
    showAll();
    expect(ages()).toHaveLength(monkeysArr.length);
    expect(ages().slice(-unknown).every((a) => a === "Age unknown")).toBe(true);
    expect(inOrder(known(ages()), true)).toBe(true); // youngest first

    sortByAge();
    showAll();
    expect(ages().slice(-unknown).every((a) => a === "Age unknown")).toBe(true);
    expect(inOrder(known(ages()), false)).toBe(true); // oldest first
});

test("modal shows Unknown and 'No bio yet.' for missing details", async () => {
    const { user, container } = setup();
    // Caryl has no birth year and no bio; Fuzz has no sex recorded
    await openCard(user, container, "Caryl");
    const details = () => container.querySelector(".Modal-details");
    expect(details()).toHaveTextContent("Birth year unknown");
    expect(details()).toHaveTextContent("No bio yet.");

    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.clear(screen.getByPlaceholderText("Name or chip number"));
    await openCard(user, container, "Fuzz");
    expect(details()).toHaveTextContent("Sex unknown");
});

describe("no monkeys found", () => {
    const empty = () => document.querySelector(".ShowPage-empty");

    test("a search with no matches says so, and Clear search brings everyone back", async () => {
        const { user, cardNames, search } = setup();
        expect(empty()).toBeNull();
        await user.type(search(), "zzqx");

        expect(cardNames()).toHaveLength(0);
        expect(screen.getByRole("heading", { name: "No monkeys found" })).toBeInTheDocument();
        expect(empty()).toHaveTextContent("Nothing matches \u201czzqx\u201d.");
        await user.click(within(empty()).getByRole("button", { name: "Clear Search" }));

        expect(search()).toHaveValue("");
        expect(empty()).toBeNull();
        expect(cardNames().length).toBeGreaterThan(0);
    });

    test("with filters on too, one button clears the search and the filters", async () => {
        const { user, cardTroops, search, troopSelect } = setup();
        await user.selectOptions(troopSelect(), "Goliath");
        await user.type(search(), "zzqx");

        expect(empty()).toHaveTextContent("Nothing matches \u201czzqx\u201d with these filters.");
        await user.click(within(empty()).getByRole("button", { name: "Clear Search and Filters" }));

        expect(search()).toHaveValue("");
        expect(new Set(cardTroops()).size).toBeGreaterThan(1);
    });
});


test("monkeys still on the grey placeholder show a Photo Needed badge", async () => {
    const { user, container } = setup();
    // Show everyone, so the placeholder monkeys are on the page
    while (screen.queryByRole("button", { name: "Show More" })) {
        await user.click(screen.getByRole("button", { name: "Show More" }));
    }
    const needed = monkeysArr.filter((m) => m.img[0].includes("blank-image"));
    expect(needed.length).toBeGreaterThan(0);
    expect(container.querySelectorAll(".MonkeyCard-photoNeeded")).toHaveLength(needed.length);
    const card = screen.getAllByRole("button", { name: new RegExp(`^${needed[0].name}, `) })[0];
    expect(card).toHaveAccessibleName(/, photo needed$/);
    expect(card).toHaveTextContent("Photo Needed");

    // And in its pop-up
    await user.click(card);
    expect(within(screen.getByRole("dialog")).getByText("Photo Needed")).toBeInTheDocument();
});

describe("continuous scroll", () => {
    // A pretend IntersectionObserver: reach() says the marker under the
    // list has come into view, as when scrolling near the bottom
    let watched;
    beforeEach(() => {
        watched = [];
        window.IntersectionObserver = class {
            constructor(callback) {
                this.callback = callback;
            }
            observe(element) {
                watched.push({ element, observer: this });
            }
            disconnect() {
                watched = watched.filter((w) => w.observer !== this);
            }
        };
    });
    afterEach(() => {
        delete window.IntersectionObserver;
    });
    const reach = () =>
        act(() => {
            for (const { element, observer } of [...watched]) {
                observer.callback([{ isIntersecting: true, target: element }]);
            }
        });

    test("more monkeys load when the bottom comes near, with no Show More button", async () => {
        const { cardNames } = setup();
        expect(cardNames()).toHaveLength(100);
        expect(screen.queryByRole("button", { name: "Show More" })).not.toBeInTheDocument();

        reach();
        expect(cardNames()).toHaveLength(200);
        reach();
        expect(cardNames()).toHaveLength(300);
    });

    test("stops once every monkey is shown", async () => {
        const { cardNames } = setup();
        for (let i = 0; i < 10; i++) reach();
        expect(cardNames()).toHaveLength(monkeysArr.length);
        expect(watched).toHaveLength(0);
        expect(document.querySelector(".ShowPage-loadMore")).toBeNull();
    });
});

describe("swiping the pop-up's photo (phones)", () => {
    // A monkey with 2+ photos and a name no other monkey shares
    const multiPhoto = monkeysArr.find(
        (m) => m.img.length > 1 && monkeysArr.filter((x) => x.name === m.name).length === 1
    );
    const photo = (container) => container.querySelector(".Modal-img img");
    // A finger moving sideways (dx) and/or up-down (dy) over the photo
    function swipe(container, dx, dy = 0, pointerType = "touch") {
        const frame = container.querySelector(".Modal-img");
        const at = (x, y) => ({ pointerId: 1, isPrimary: true, pointerType, clientX: x, clientY: y });
        fireEvent.pointerDown(frame, at(200, 200));
        fireEvent.pointerMove(frame, at(200 + dx / 2, 200 + dy / 2));
        fireEvent.pointerMove(frame, at(200 + dx, 200 + dy));
        fireEvent.pointerUp(frame, at(200 + dx, 200 + dy));
    }

    test("left shows the next photo, right the previous (wrapping round)", async () => {
        const { user, container } = setup();
        await openCard(user, container, multiPhoto.name);
        expect(photo(container)).toHaveAttribute("src", multiPhoto.img[0]);

        swipe(container, -120);
        expect(photo(container)).toHaveAttribute("src", multiPhoto.img[1]);
        swipe(container, 120);
        expect(photo(container)).toHaveAttribute("src", multiPhoto.img[0]);
        swipe(container, 120);
        expect(photo(container)).toHaveAttribute("src", multiPhoto.img.at(-1));
    });

    test("small moves, up-and-down scrolling and the mouse don't change the photo", async () => {
        const { user, container } = setup();
        await openCard(user, container, multiPhoto.name);
        swipe(container, -12);
        swipe(container, -40, 160);
        swipe(container, -120, 0, "mouse");
        expect(photo(container)).toHaveAttribute("src", multiPhoto.img[0]);
    });
});

test("the count pill beside Filters and Sort shows how many monkeys match", async () => {
    const { user, container, troopSelect } = setup();
    const count = () => container.querySelector(".ShowPage-count");
    expect(count()).toHaveTextContent(String(monkeysArr.length));
    expect(count()).toHaveAttribute("title", `${monkeysArr.length} monkeys`);

    await user.selectOptions(troopSelect(), "James");
    const james = monkeysArr.filter((m) => m.troop === "James").length;
    expect(count()).toHaveTextContent(String(james));
});
