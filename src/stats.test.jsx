// The Statistics page: its figures (stats.js) and the page itself
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { amPlatesFor, banditMonkeys, countsByEnclosure, monkeysIn, percent, ranked, sexByTroop, spaceByEnclosure, statsFor } from "./stats";
import { AGE_GROUPS, currentBabySeason } from "./ages";
import StatisticsPage from "./StatisticsPage";
import ShowPage from "./ShowPage";
import { BUILT_IN_DATA } from "./monkeyData";

const SEASON = currentBabySeason();
const GOLIATH = { id: 1, name: "Goliath", type: "troop", parentId: null, section: "Top", sortOrder: 1 };
const GOLIATH_A = { id: 2, name: "Goliath A", type: "introcage", parentId: 1, section: "Top", sortOrder: 2 };
const ROBERT = { id: 3, name: "Robert", type: "troop", parentId: null, section: "Top", sortOrder: 3 };
const ENCLOSURES = [GOLIATH, GOLIATH_A, ROBERT];
const monkey = (name, extra) => ({ name, sex: "female", year: SEASON - 5, troop: "Goliath", enclosure: "Goliath", introcage: null, img: [], ...extra });
const MONKEYS = [
    monkey("Ann"),
    monkey("Bob", { sex: "male", year: SEASON }), // a baby
    monkey("Cat", { year: SEASON - 2 }), // a juvenile
    monkey("Dan", { sex: "male", year: SEASON - 22, troop: null, introcage: "Goliath A" }), // an oldie, in the introcage
    monkey("Eve", { sex: "", year: "", troop: "Robert", enclosure: "Robert" }), // nothing known
    monkey("Wild", { troop: "Bandits", enclosure: null }), // not counted
];

test("the age groups (the Filters panel's): babies under 1, juveniles 1–3, adults 4–14, elderly 15+", () => {
    const groupOf = (age) => AGE_GROUPS.find((g) => g.test(age)).id;
    expect([0, 1, 3, 4, 14, 15, 35].map(groupOf)).toEqual(["babies", "juveniles", "juveniles", "adults", "adults", "elderly", "elderly"]);
});

test("the whole sanctuary's figures (not the Bandits)", () => {
    const stats = statsFor(monkeysIn(MONKEYS, null));
    expect(stats.total).toBe(5);
    expect(stats.sex).toEqual({ female: 2, male: 2, unknown: 1 });
    expect(stats.ages).toEqual({ babies: 1, juveniles: 1, adults: 1, elderly: 1, unknown: 1 });
    expect(stats.averageAge).toBe(7.3); // (0 + 2 + 5 + 22) / 4
    expect(stats).toMatchObject({ troop: 4, introcages: 1 });
    expect(percent(2, 5)).toBe(40);
    expect(percent(0, 0)).toBe(0);
});

test("one enclosure, or just its troop or introcages", () => {
    expect(monkeysIn(MONKEYS, GOLIATH).map((m) => m.name)).toEqual(["Ann", "Bob", "Cat", "Dan"]);
    expect(monkeysIn(MONKEYS, GOLIATH, "troop").map((m) => m.name)).toEqual(["Ann", "Bob", "Cat"]);
    expect(monkeysIn(MONKEYS, GOLIATH, "introcages").map((m) => m.name)).toEqual(["Dan"]);
    // (by home: one in Sickbay still counts with its troop)
    expect(monkeysIn([monkey("Sick", { inSickbay: true })], GOLIATH, "troop")).toHaveLength(1);
});

test("where they live: most first, empty enclosures left out", () => {
    expect(countsByEnclosure(MONKEYS, ENCLOSURES).map((r) => [r.enclosure.name, r.count])).toEqual([
        ["Goliath", 4],
        ["Robert", 1],
    ]);
});

test("space per monkey: the troop enclosure's size ÷ its troop, most space first, sizes not recorded last", () => {
    const sized = [{ ...GOLIATH, size: 300 }, GOLIATH_A, ROBERT];
    expect(spaceByEnclosure(MONKEYS, sized).map((r) => [r.enclosure.name, r.troop, r.perMonkey])).toEqual([
        ["Goliath", 3, 100], // (Dan's in the introcage: not counted)
        ["Robert", 1, null],
    ]);
});

test("ranked: highest or lowest first; no value always last", () => {
    const rows = [
        { enclosure: { name: "B" }, v: 2 },
        { enclosure: { name: "A" }, v: null },
        { enclosure: { name: "C" }, v: 5 },
    ];
    expect(ranked(rows, (r) => r.v).map((r) => r.enclosure.name)).toEqual(["C", "B", "A"]);
    expect(ranked(rows, (r) => r.v, false).map((r) => r.enclosure.name)).toEqual(["B", "C", "A"]);
});

test("each troop's female / male split (troop monkeys only), most female first", () => {
    expect(sexByTroop(MONKEYS, ENCLOSURES).map((r) => [r.enclosure.name, r.female, r.male, r.unknown, r.femaleShare])).toEqual([
        ["Goliath", 2, 1, 0, 67], // (Dan, in the introcage, not counted)
        ["Robert", 0, 0, 1, 0],
    ]);
});

test("AM plates, by monkey: Local Team or Sickbay, then the Local Team's by plate (and metal plates)", () => {
    const feeding = (extra) => ({ fedBy: "localTeam", amPlates: 1, amCutSmall: false, amFruit: false, amMetalPlate: false, pmBowls: 1, pmCutSmall: false, ...extra });
    const inA = (name, f, extra) => monkey(name, { troop: null, introcage: "Goliath A", introcageType: "introcage", feeding: feeding(f), ...extra });
    const fed = [
        inA("P1", {}),
        inA("P2", { amPlates: 2, amCutSmall: true }), // (2 plates: still one monkey)
        inA("P3", { amCutSmall: true, amFruit: true, amMetalPlate: true }),
        inA("P4", { amFruit: true }),
        inA("P5", { fedBy: "sickbay" }),
        inA("P6", {}, { inSickbay: true }), // (in Sickbay: Sickbay feed it)
        monkey("Troop"), // (no feeding: not counted)
    ];
    expect(amPlatesFor(fed)).toEqual({ localTeam: 4, sickbay: 2, normal: 1, cutSmall: 1, cutSmallFruit: 1, fruit: 1, metal: 1 });
});

describe("the page", () => {
    const setup = () => {
        const user = userEvent.setup();
        render(<StatisticsPage monkeys={MONKEYS} enclosures={ENCLOSURES} sections={["Top"]} />);
        return { user };
    };
    const tile = (label) => screen.getByText(label, { selector: "dt" }).closest("div");

    test("the whole sanctuary: tiles, and a card per chart", () => {
        setup();
        expect(screen.getByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
        expect(tile("Monkeys")).toHaveTextContent("5");
        expect(tile("Female")).toHaveTextContent("40%2 monkeys");
        expect(tile("Average age")).toHaveTextContent("7.3");
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
            "Female and male",
            "Troop and introcages",
            "Age groups",
            "Space per monkey",
            "Female to male by troop",
            "Where they live",
        ]);
        expect(screen.getByText("20% elderly (15+), 20% juveniles (1–3)")).toBeInTheDocument();
    });

    test("each chart has a Table view with the same numbers", async () => {
        const { user } = setup();
        const card = screen.getByRole("region", { name: "Female and male" });
        await user.click(within(card).getByRole("button", { name: "Table" }));
        const rows = within(card).getAllByRole("row").map((r) => r.textContent);
        expect(rows).toEqual(["SexMonkeys%", "Female240%", "Male240%", "Unknown120%"]);
    });

    test("picking an enclosure (from the list, or tapping it in Where they live); then its troop or introcages", async () => {
        const { user } = setup();
        await user.click(screen.getByRole("button", { name: /^Goliath: 4 monkeys/ }));
        expect(screen.getByRole("combobox", { name: "Show statistics for" })).toHaveValue("1");
        expect(tile("Monkeys")).toHaveTextContent("4");
        expect(screen.queryByRole("heading", { name: "Where they live" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Introcages" }));
        expect(tile("Monkeys")).toHaveTextContent("1");
        expect(screen.queryByRole("heading", { name: "Troop and introcages" })).toBeNull();
        // Robert has no introcages: no parts to choose
        await user.selectOptions(screen.getByRole("combobox", { name: "Show statistics for" }), "3");
        expect(screen.queryByRole("group", { name: "Which monkeys" })).toBeNull();
        expect(tile("Monkeys")).toHaveTextContent("1");
    });

    test("the Bandits: at the bottom, on their own (not in the sanctuary's figures)", async () => {
        const { user } = setup();
        const select = screen.getByRole("combobox", { name: "Show statistics for" });
        expect([...select.options].at(-1)).toHaveTextContent("Bandits");
        await user.selectOptions(select, "bandits");
        expect(tile("Monkeys")).toHaveTextContent("1");
        expect(screen.queryByRole("heading", { name: "Troop and introcages" })).toBeNull();
        expect(screen.getByText(/Figures for the Bandits/)).toBeInTheDocument();
        expect(banditMonkeys(MONKEYS).map((m) => m.name)).toEqual(["Wild"]);
    });

    test("ranked lists: High to Low to start with; the toggle turns them round", async () => {
        const { user } = setup();
        const card = screen.getByRole("region", { name: "Female to male by troop" });
        const names = () => [...card.querySelectorAll(".Stats-rankedName")].map((n) => n.textContent);
        expect(names()).toEqual(["Goliath", "Robert"]);
        await user.click(within(card).getByRole("button", { name: "High to Low" }));
        expect(within(card).getByRole("button", { name: "Low to High" })).toBeInTheDocument();
        expect(names()).toEqual(["Robert", "Goliath"]);
    });

    test("a mark shows its value on hover and focus", async () => {
        const { user } = setup();
        const female = screen.getByRole("region", { name: "Female and male" }).querySelector(".Stats-part.is-female");
        await user.hover(female);
        expect(document.querySelector(".Stats-tooltip")).toHaveTextContent("2 (40%)Female");
        await user.unhover(female);
        expect(document.querySelector(".Stats-tooltip")).toBeNull();
    });
});

test("#statistics opens it (loaded when needed), and the side rail has it", async () => {
    render(<ShowPage route="statistics" enclosures={BUILT_IN_DATA.enclosures} />);
    expect(await screen.findByRole("heading", { level: 1, name: "Statistics" })).toBeInTheDocument();
    const rail = screen.getByRole("complementary", { name: "Main menu" });
    expect(within(rail).getByRole("link", { name: "Statistics" })).toHaveAttribute("aria-current", "page");
});
