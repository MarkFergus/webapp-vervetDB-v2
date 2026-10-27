// The Statistics page: its figures (stats.js) and the page itself
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STAT_AGE_GROUPS, babyAgeText, milkPerDay, weekStart, weightPerWeek, weightsByDate, youngestOldest, amPlatesFor, countsBySection, sectionLabel, banditMonkeys, countsByEnclosure, monkeysIn, percent, ranked, sexByTroop, spaceByEnclosure, statsFor } from "./stats";
import { currentBabySeason } from "./ages";
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

test("the page's age groups: babies <1, juveniles 1–3, young adults 4–10, senior adults 11–19, golden oldies 20+", () => {
    const groupOf = (age) => STAT_AGE_GROUPS.find((g) => g.test(age)).id;
    expect([0, 1, 3, 4, 10, 11, 19, 20, 35].map(groupOf)).toEqual([
        "babies", "juveniles", "juveniles", "youngAdults", "youngAdults", "seniorAdults", "seniorAdults", "goldenOldies", "goldenOldies",
    ]);
});

test("the whole sanctuary's figures (not the Bandits)", () => {
    const stats = statsFor(monkeysIn(MONKEYS, null));
    expect(stats.total).toBe(5);
    expect(stats.sex).toEqual({ female: 2, male: 2, unknown: 1 });
    expect(stats.ages).toEqual({ babies: 1, juveniles: 1, youngAdults: 1, seniorAdults: 0, goldenOldies: 1, unknown: 1 });
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

test("monkeys per enclosure: most first, empty enclosures left out, with the troop / introcage split", () => {
    expect(countsByEnclosure(MONKEYS, ENCLOSURES).map((r) => [r.enclosure.name, r.count, r.troop, r.introcages])).toEqual([
        ["Goliath", 4, 3, 1],
        ["Robert", 1, 1, 0],
    ]);
});

test("monkeys by section: by their home enclosure's section, in the sections' order", () => {
    const sectioned = [GOLIATH, GOLIATH_A, { ...ROBERT, section: "Bottom" }];
    expect(countsBySection(MONKEYS, sectioned, ["Top", "Bottom", "Care Units"])).toEqual([
        { section: "Top", count: 4 },
        { section: "Bottom", count: 1 },
        { section: "Care Units", count: 0 },
    ]);
    expect(sectionLabel("Top")).toBe("Top Section");
    expect(sectionLabel("Care Units")).toBe("Care Units");
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

test("AM plates, by monkey: Mainfeed or Sickbay, then Mainfeed's by plate (and metal plates)", () => {
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
        expect(tile("Babies")).toHaveTextContent("1under 1 year old");
        expect(tile("Golden Oldies")).toHaveTextContent("120+ years old");
        expect(tile("Average age")).toHaveTextContent("7.3");
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
            "Female and male",
            "Troop and introcages",
            "Age groups",
            "Monkeys per section",
            "Space per monkey",
            "Female-to-male by troop",
            "Monkeys per enclosure",
        ]);
        expect(screen.getByText("20% golden oldies (20+ years old), 20% juveniles (1–3 years old)")).toBeInTheDocument();
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
        expect(screen.queryByRole("heading", { name: "Monkeys per enclosure" })).toBeNull();
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
        const card = screen.getByRole("region", { name: "Female-to-male by troop" });
        const names = () => [...card.querySelectorAll(".Stats-rankedName")].map((n) => n.textContent);
        expect(names()).toEqual(["Goliath", "Robert"]);
        await user.click(within(card).getByRole("button", { name: "High to Low" }));
        expect(within(card).getByRole("button", { name: "Low to High" })).toBeInTheDocument();
        expect(names()).toEqual(["Robert", "Goliath"]);
    });

    test("bar lengths: each bar's share of the biggest (so the numbers never squash them)", () => {
        setup();
        const card = screen.getByRole("region", { name: "Monkeys per enclosure" });
        // (Goliath's bar: its troop and its introcage)
        expect([...card.querySelector(".Stats-rankedBar").children].map((p) => [p.className, p.style.flexGrow])).toEqual([
            ["Stats-part is-troop", "3"],
            ["Stats-part is-introcages", "1"],
        ]);
        const shares = [...card.querySelectorAll(".Stats-rankedBar")].map((b) => Number(b.style.getPropertyValue("--share")));
        expect(shares).toEqual([1, 0.25]); // Goliath 4, Robert 1
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

describe("Baby Care", () => {
    const BABY_CARE_UNIT = { id: 9, name: "Baby Care", type: "care_unit", parentId: null, section: "Care Units", sortOrder: 9 };
    const DREAMLAND = { id: 10, name: "Dreamland", type: "area", parentId: 9, section: "Care Units", sortOrder: 10 };
    const QUARANTINE = { id: 11, name: "Quarantine", type: "care_unit", parentId: null, section: "Care Units", sortOrder: 11 };
    const PLACES = [...ENCLOSURES, BABY_CARE_UNIT, DREAMLAND, QUARANTINE];
    const baby = (id, name, sex, birthDate) => ({
        id, name, sex, year: SEASON, birthDate, troop: null, introcage: "Dreamland", introcageType: "area", enclosure: "Baby Care", img: [],
    });
    const BABIES = [baby(21, "Muse", "female", "2026-10-01"), baby(22, "Pip", "male", "2026-08-20"), baby(23, "Kit", "female", null)];
    const FEEDS = [
        { monkeyId: 21, date: "2026-10-20", ml: 100 },
        { monkeyId: 22, date: "2026-10-20", ml: 150 },
        { monkeyId: 21, date: "2026-10-21", ml: 120, notes: "Skipped the 2am feed" },
    ];
    const WEIGHTS = [
        { monkeyId: 21, date: "2026-10-13", grams: 400 },
        { monkeyId: 21, date: "2026-10-20", grams: 430 },
        { monkeyId: 21, date: "2026-10-22", grams: 450 }, // (the same week: the last counts)
        { monkeyId: 22, date: "2026-10-21", grams: 650 },
    ];

    test("a baby's age, youngest and oldest (by birth date)", () => {
        const today = new Date(2026, 9, 24);
        expect(babyAgeText("2026-10-20", today)).toBe("4 days old");
        expect(babyAgeText("2026-10-01", today)).toBe("3 weeks old");
        expect(babyAgeText("2026-06-01", today)).toBe("4 months old");
        expect(babyAgeText(null, today)).toBeNull();
        const { youngest, oldest } = youngestOldest(BABIES);
        expect([youngest.name, oldest.name]).toEqual(["Muse", "Pip"]);
    });

    test("milk per day (all together, or one baby) and weight per week (each one's last weighing; all: their average)", () => {
        expect(weekStart("2026-10-22")).toBe("2026-10-19");
        expect(milkPerDay(FEEDS)).toEqual([
            { x: "2026-10-20", y: 250, notes: [] },
            { x: "2026-10-21", y: 120, notes: ["Skipped the 2am feed"] },
        ]);
        expect(milkPerDay(FEEDS, 22)).toEqual([{ x: "2026-10-20", y: 150, notes: [] }]);
        expect(weightPerWeek(WEIGHTS, 21)).toEqual([{ x: "2026-10-12", y: 400 }, { x: "2026-10-19", y: 450 }]);
        expect(weightPerWeek(WEIGHTS)).toEqual([{ x: "2026-10-12", y: 400 }, { x: "2026-10-19", y: 550 }]);
    });

    const open = async (records) => {
        const user = userEvent.setup();
        render(<StatisticsPage monkeys={[...MONKEYS, ...BABIES]} enclosures={PLACES} sections={["Top", "Care Units"]} babyRecords={records} />);
        const select = screen.getByRole("combobox", { name: "Show statistics for" });
        await user.selectOptions(select, "9");
        return { user, select };
    };
    const tile = (label) => screen.getByText(label, { selector: "dt" }).closest("div");

    test("the selector: Baby Care second, but not Quarantine or Sickbay (for now)", async () => {
        const { select } = await open(undefined);
        const names = [...select.options].map((o) => o.textContent);
        // (Baby Care second, under no section heading)
        expect(names.slice(0, 2)).toEqual(["Whole Sanctuary", "Baby Care"]);
        expect(select.options[1].parentElement).toBe(select);
        expect(names).not.toContain("Quarantine");
        expect([...select.querySelectorAll("optgroup")].map((g) => g.label)).not.toContain("Care Units");
    });

    test("its own tiles, no sections, introcages or age groups; the charts wait for records", async () => {
        await open(undefined);
        expect(tile("Babies")).toHaveTextContent("3");
        expect(tile("Female : male")).toHaveTextContent("2 : 1");
        expect(tile("Youngest baby")).toHaveTextContent("Muse");
        expect(tile("Oldest baby")).toHaveTextContent("Pip");
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Milk intake per day", "Weight per week"]);
        expect(screen.getByText(/No milk records yet/)).toBeInTheDocument();
        expect(screen.getByText(/No weights recorded yet/)).toBeInTheDocument();
    });

    test("with records: line charts, all babies or one; the arrow keys step along a line", async () => {
        const { user } = await open({ feeds: FEEDS, weights: WEIGHTS });
        const milk = screen.getByRole("img", { name: /^Milk intake per day: 2 points, the latest 120 ml/ });
        fireEvent.focus(milk);
        // (with that day's note)
        expect(screen.getByRole("status")).toHaveTextContent("120 ml21 Oct−130 ml since the one beforeSkipped the 2am feed");
        // Each point labelled: its value, and the change since the one before
        const svg = milk;
        expect([...svg.querySelectorAll(".Stats-lineValue")].map((t) => t.textContent)).toEqual(["250 ml", "120 ml"]);
        expect([...svg.querySelectorAll(".Stats-lineChange")].map((t) => t.textContent)).toEqual(["−130 ml"]);
        fireEvent.keyDown(milk, { key: "ArrowLeft" });
        expect(screen.getByRole("status")).toHaveTextContent("250 ml20 Oct");
        await user.selectOptions(screen.getByRole("combobox", { name: "Show milk and weight for" }), "22");
        expect(screen.getByRole("img", { name: /^Milk intake per day: 1 point, the latest 150 ml/ })).toBeInTheDocument();
        // (one baby: every weighing, on its day)
        expect(screen.getByRole("img", { name: /^Weight: 1 point, the latest 650 g \(21 Oct\)/ })).toBeInTheDocument();
        await user.selectOptions(screen.getByRole("combobox", { name: "Show milk and weight for" }), "21");
        expect(screen.getByRole("img", { name: /^Weight: 3 points, the latest 450 g \(22 Oct\)/ })).toBeInTheDocument();
    });

    test("one baby's weighings: every one, on its day, oldest first", () => {
        expect(weightsByDate(WEIGHTS, 21)).toEqual([
            { x: "2026-10-13", y: 400 },
            { x: "2026-10-20", y: 430 },
            { x: "2026-10-22", y: 450 },
        ]);
        expect(weightsByDate(WEIGHTS, 99)).toEqual([]);
    });
});
