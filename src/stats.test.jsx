// The Statistics page: its figures (stats.js) and the page itself
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { STAT_AGE_GROUPS, ageInWeeks, babyAgeText, heaviestBaby, highestMilk, largestWeeklyGain, milkByAge, seasonBabies, milkAmount, totalMilk, youngestArrival, weightByAge, youngestOldest, amPlatesFor, countsBySection, sectionLabel, banditMonkeys, countsByEnclosure, monkeysIn, percent, ranked, sexByTroop, spaceByEnclosure, statsFor } from "./stats";
import { currentBabySeason } from "./ages";
import StatisticsPage, { BabyCareStats } from "./StatisticsPage";
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
    const feeding = (extra) => ({ fedBy: "localTeam", amPlates: 1, amCutSmall: false, amFruit: false, amMetalPlate: false, pmBowls: 1, ...extra });
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
        // (days up to 6, weeks until 3 months, months until a year, then years)
        expect(babyAgeText("2026-10-24", today)).toBe("Born today");
        expect(babyAgeText("2026-10-23", today)).toBe("1 day old");
        expect(babyAgeText("2026-10-18", today)).toBe("6 days old");
        expect(babyAgeText("2026-10-17", today)).toBe("1 week old");
        expect(babyAgeText("2026-08-07", today)).toBe("11 weeks old");
        // (weeks until it's 3 months old by its birth date: the 24th)
        expect(babyAgeText("2026-07-25", today)).toBe("13 weeks old");
        expect(babyAgeText("2026-07-24", today)).toBe("3 months old");
        expect(babyAgeText("2025-10-25", today)).toBe("11 months old");
        expect(babyAgeText("2025-10-24", today)).toBe("1 year old");
        expect(babyAgeText("2019-03-02", today)).toBe("7 years old");
        expect(babyAgeText(null, today)).toBeNull();
        const { youngest, oldest } = youngestOldest(BABIES);
        expect([youngest.name, oldest.name]).toEqual(["Muse", "Pip"]);
    });

    const open = async (records) => {
        const user = userEvent.setup();
        render(<StatisticsPage monkeys={[...MONKEYS, ...BABIES]} enclosures={PLACES} sections={["Top", "Care Units"]} babyRecords={records} />);
        const select = screen.getByRole("combobox", { name: "Show statistics for" });
        await user.selectOptions(select, "9");
        return { user, select };
    };
    const tile = (label) => screen.getByText(label, { selector: "dt" }).closest("div");

    test("this season's Baby Care babies, wherever they are now; not those born on site or arriving elsewhere", () => {
        const places = [BABY_CARE_UNIT, { id: 90, name: "Dreamland", type: "area", parentId: 9 }, { id: 80, name: "Quarantine", type: "care_unit", parentId: null }];
        const list = [
            { id: 1, year: SEASON, enclosure: "Baby Care", troop: null }, // there now, arrival not recorded
            { id: 2, year: SEASON, enclosure: "Koko", troop: "Koko", arrivalPlaceId: 90 }, // moved on
            { id: 3, year: SEASON, enclosure: "Koko", troop: "Koko" }, // born on site
            { id: 4, year: SEASON, enclosure: "Royal", troop: "Royal", arrivalPlaceId: 80 }, // to Quarantine
            { id: 5, year: SEASON - 1, enclosure: "Baby Care", troop: null, arrivalPlaceId: 90 }, // last season
            { id: 6, year: SEASON, troop: "Bandits" },
        ];
        expect(seasonBabies(list, places).map((m) => m.id)).toEqual([1, 2]);
    });

    test("the selector: Baby Care second, but not Quarantine or Sickbay (for now)", async () => {
        const { select } = await open(undefined);
        const names = [...select.options].map((o) => o.textContent);
        // (Baby Care second, under no section heading)
        expect(names.slice(0, 2)).toEqual(["Whole Sanctuary", `Baby Care ${SEASON}`]);
        expect(select.options[1].parentElement).toBe(select);
        expect(names).not.toContain("Quarantine");
        expect([...select.querySelectorAll("optgroup")].map((g) => g.label)).not.toContain("Care Units");
    });

    test("its own tiles, no sections, introcages or age groups; the charts wait for records", async () => {
        await open(undefined);
        expect(tile("Babies")).toHaveTextContent("3");
        expect(screen.getByText("67% female, 33% male")).toBeInTheDocument();
        expect(tile("Highest milk total")).toHaveTextContent("no milk records yet");
        expect(tile("Heaviest weight")).toHaveTextContent("no weights yet");
        expect(tile("Largest weekly gain")).toHaveTextContent("needs two weighings");
        expect(tile("Youngest baby")).toHaveTextContent(/Muse$/);
        expect(tile("Oldest baby")).toHaveTextContent(/Pip$/);
        expect(tile("Youngest arrival")).toHaveTextContent("arrival dates not recorded");
        expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Female and male", "Milk by age", "Weight by age"]);
        expect(screen.getByText("No milk records yet for babies with a birth date.")).toBeInTheDocument();
        expect(screen.getByText("No weights recorded yet for babies with a birth date.")).toBeInTheDocument();
    });

    test("total milk: these babies' only, in ml until 5 figures, then litres", () => {
        const babies = [{ id: 1 }, { id: 2 }];
        const feeds = [{ monkeyId: 1, ml: 600 }, { monkeyId: 2, ml: 650 }, { monkeyId: 9, ml: 999 }];
        expect(totalMilk(feeds, babies)).toBe(1250);
        expect(milkAmount(850)).toBe("850 ml");
        expect(milkAmount(9999)).toBe("9,999 ml");
        expect(milkAmount(10000)).toBe("10.0 L");
        expect(milkAmount(12400)).toBe("12.4 L");
    });

    test("youngest arrival: the least age on arriving, with their dates", () => {
        const babies = [
            { id: 1, name: "Muse", birthDate: "2026-09-21", arrivalDate: "2026-10-18" },
            { id: 2, name: "Masko", birthDate: "2026-10-25", arrivalDate: "2026-10-27" },
            { id: 3, name: "No Dates" },
            { id: 4, name: "Mistyped", birthDate: "2026-10-25", arrivalDate: "2026-10-01" },
        ];
        expect(youngestArrival(babies)).toMatchObject({ baby: babies[1], days: 2, age: "2 days old", date: "2026-10-27" });
        expect(youngestArrival([{ birthDate: "2026-10-25", arrivalDate: "2026-10-25" }])).toMatchObject({ age: "Same day" });
        expect(youngestArrival(babies.slice(2, 3))).toBeNull();
    });

    test("by age: pick a baby on one graph, their line against the average; the other's left as it is", async () => {
        const monkeys = [...MONKEYS, ...BABIES];
        const user = userEvent.setup();
        render(
            <BabyCareStats
                babies={BABIES}
                monkeys={monkeys}
                records={{ feeds: FEEDS.filter((f) => f.monkeyId === 21 || f.monkeyId === 22), weights: WEIGHTS }}
            />
        );
        const pick = screen.getByRole("combobox", { name: "Compare a baby on Milk by age" });
        expect(screen.queryByRole("list", { name: "Lines" })).not.toBeInTheDocument();
        await user.selectOptions(pick, "21");
        expect(within(screen.getByRole("list", { name: "Lines" })).getByText("Muse")).toBeInTheDocument();
        expect(screen.getByRole("combobox", { name: "Compare a baby on Weight by age" })).toHaveValue("");
    });

    test("largest weekly gain: between a weighing and the next; not across a long gap, or a loss", () => {
        const babies = [{ id: 1, name: "Muse" }, { id: 2, name: "Masko" }];
        const weights = [
            { monkeyId: 1, date: "2026-10-01", grams: 500 },
            { monkeyId: 1, date: "2026-10-08", grams: 560 },
            // (a month later: not a week's gain)
            { monkeyId: 1, date: "2026-11-08", grams: 900 },
            { monkeyId: 2, date: "2026-10-01", grams: 400 },
            { monkeyId: 2, date: "2026-10-09", grams: 485 },
            { monkeyId: 2, date: "2026-10-16", grams: 450 },
            // (not one of these babies)
            { monkeyId: 9, date: "2026-10-01", grams: 100 },
            { monkeyId: 9, date: "2026-10-08", grams: 900 },
        ];
        expect(largestWeeklyGain(weights, babies)).toEqual({ baby: babies[1], gain: 85, date: "2026-10-09" });
        expect(largestWeeklyGain(weights.slice(0, 1), babies)).toBeNull();
        expect(largestWeeklyGain([{ monkeyId: 1, date: "2026-10-01", grams: 500 }, { monkeyId: 1, date: "2026-10-08", grams: 480 }], babies)).toBeNull();
    });

    test("trophies: the highest single day's milk, and the heaviest by their latest weighing; only these babies", () => {
        const babies = [{ id: 1, name: "Muse" }, { id: 2, name: "Masko" }];
        const feeds = [
            { monkeyId: 1, date: "2026-10-02", ml: 300 },
            { monkeyId: 2, date: "2026-10-01", ml: 300 },
            { monkeyId: 2, date: "2026-10-03", ml: 100 },
            { monkeyId: 9, date: "2026-10-03", ml: 999 },
        ];
        expect(highestMilk(feeds, babies)).toEqual({ baby: babies[1], ml: 300, date: "2026-10-01" });
        const weights = [
            { monkeyId: 1, date: "2026-10-01", grams: 900 },
            { monkeyId: 1, date: "2026-10-08", grams: 500 },
            { monkeyId: 2, date: "2026-10-08", grams: 600 },
            { monkeyId: 9, date: "2026-10-08", grams: 9000 },
        ];
        expect(heaviestBaby(weights, babies)).toEqual({ baby: babies[1], grams: 600, date: "2026-10-08" });
        expect(highestMilk([], babies)).toBeNull();
        expect(heaviestBaby([], babies)).toBeNull();
    });

    test("by age: a baby's first week is week 0; none without a birth date, or before it", () => {
        expect(ageInWeeks("2026-01-01", "2026-01-01")).toBe(0);
        expect(ageInWeeks("2026-01-01", "2026-01-07")).toBe(0);
        expect(ageInWeeks("2026-01-01", "2026-01-08")).toBe(1);
        expect(ageInWeeks("2026-01-01", "2025-12-31")).toBeNull();
        expect(ageInWeeks(null, "2026-01-01")).toBeNull();
    });

    test("milk by age: each baby's average that week, then the average across them, past babies too", () => {
        const monkeys = [{ id: 1, birthDate: "2026-01-01" }, { id: 2, birthDate: "2025-06-01" }, { id: 3 }];
        const feeds = [
            { monkeyId: 1, date: "2026-01-01", ml: 100 },
            { monkeyId: 1, date: "2026-01-02", ml: 200 },
            { monkeyId: 2, date: "2025-06-03", ml: 50 },
            { monkeyId: 1, date: "2026-01-09", ml: 300 },
            // (no birth date: left out)
            { monkeyId: 3, date: "2026-01-01", ml: 999 },
        ];
        expect(milkByAge(feeds, monkeys, 1)).toEqual({
            babies: 2,
            points: [
                { x: 0, y: 100, babies: 2, own: 150 },
                { x: 1, y: 300, babies: 1, own: 300 },
            ],
        });
        expect(milkByAge(feeds, monkeys).points[0].own).toBeNull();
        expect(milkByAge(feeds, monkeys, 2).points[1].own).toBeNull();
    });

    test("weight by age: each baby's last weighing that week", () => {
        const monkeys = [{ id: 1, birthDate: "2026-01-01" }];
        const weights = [
            { monkeyId: 1, date: "2026-01-05", grams: 500 },
            { monkeyId: 1, date: "2026-01-03", grams: 400 },
        ];
        expect(weightByAge(weights, monkeys).points).toEqual([{ x: 0, y: 500, babies: 1, own: null }]);
    });

    test("with records: the by-age charts; the arrow keys step along a line; the trophies", async () => {
        await open({ feeds: FEEDS, weights: WEIGHTS });
        const milk = screen.getByRole("img", { name: /^Milk by age:/ });
        fireEvent.focus(milk);
        expect(screen.getByRole("status")).toHaveTextContent(/^Week \d+Average: /);
        const shown = screen.getByRole("status").textContent;
        fireEvent.keyDown(milk, { key: "ArrowLeft" });
        expect(screen.getByRole("status").textContent).not.toBe(shown);
        // No day-by-day charts: the by-age ones say it
        expect(screen.queryByRole("heading", { name: "Milk intake per day" })).not.toBeInTheDocument();
        // The trophies: the figure first, then whose and when
        expect(tile("Highest milk total")).toHaveTextContent("150 mlPip20 Oct");
        expect(tile("Heaviest weight")).toHaveTextContent("650 gPip21 Oct");
    });

});
