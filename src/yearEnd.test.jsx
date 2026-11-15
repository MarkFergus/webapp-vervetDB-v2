import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { byMonth, funFacts, lineOf, troopBabiesIn, yearEndSlides, yearGroups } from "./yearEndRules";
import { photosAddedIn, realPhoto } from "./yearEndData";
import YearEndPresentation from "./YearEndPresentation";
import * as data from "./yearEndData";

const PHOTO = "https://example.org/monkey-photos/masko-1793198960054.jpg";
const BLANK = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";
const m = (id, name, more = {}) => ({
    id,
    name,
    sex: "female",
    year: null,
    birthDate: null,
    arrivalDate: null,
    arrivalReason: null,
    status: null,
    statusOn: null,
    troop: null,
    photos: [],
    photo: null,
    ...more,
});

const MONKEYS = [
    m(1, "Masko", { arrivalDate: "2026-10-03", arrivalReason: "orphaned", photo: PHOTO, photos: [PHOTO] }),
    m(2, "Muse", { arrivalDate: "2026-10-20", arrivalReason: "orphaned" }),
    m(3, "Mabel", { arrivalDate: "2026-03-01", arrivalReason: "injured", year: 2012 }),
    m(4, "Pip", { arrivalReason: "born_here", birthDate: "2026-11-02", troop: "Goliath" }),
    m(5, "Old Born", { arrivalReason: "born_here", birthDate: "2025-11-02", troop: "Goliath" }),
    m(6, "Rex", { status: "released", statusOn: "2026-06-10", troop: "H&B", photo: PHOTO }),
    m(7, "Fern", { arrivalDate: "2025-12-30", arrivalReason: "orphaned" }),
    m(8, "Juno", {}),
];
const FACTS = {
    monkeys: MONKEYS,
    namedBy: { 1: "Sam", 2: "Sam", 3: "Jo" },
    integrations: [
        { id: 1, monkeyId: 1, startedOn: "2026-11-01", kind: "foster_mum", status: "active", place: "Dreamland B" },
        { id: 2, monkeyId: 8, startedOn: "2026-05-01", kind: "adult", status: "completed", place: null },
        { id: 3, monkeyId: 3, startedOn: "2026-05-01", kind: "group", status: "cancelled", place: null },
    ],
    vetVisits: [
        { monkeyId: 3, date: "2026-03-02", practice: "serala", practiceOther: "", reason: "assessment" },
        { monkeyId: 3, date: "2026-03-20", practice: "serala", practiceOther: "", reason: "check_up" },
    ],
    vasectomies: [{ monkeyId: 8, date: "2026-07-01", vet: "on_site", vetOther: "" }],
    milk: [
        { monkeyId: 1, date: "2026-11-12", ml: 640 },
        { monkeyId: 2, date: "2026-11-12", ml: 500 },
    ],
    weights: [
        { monkeyId: 1, date: "2026-10-04", grams: 450 },
        { monkeyId: 1, date: "2026-11-10", grams: 1650 },
        { monkeyId: 2, date: "2026-10-21", grams: 400 },
    ],
    counts: { deworming: 1240, microchips: 0, sessions: 412, sightings: 2930, maintenance: 88, weeklyReports: 12, photos: 300 },
};

describe("the workings", () => {
    test("groups: arrivals from outside, orphans only for babies, troop babies born this year, releases, integrations (not cancelled)", () => {
        const g = yearGroups(FACTS, 2026);
        expect(g.arrivals.map((x) => x.name)).toEqual(["Mabel", "Masko", "Muse"]);
        expect(g.orphans.map((x) => x.name)).toEqual(["Masko", "Muse"]);
        expect(g.troopBabies.map((x) => x.name)).toEqual(["Pip"]);
        expect(g.released.map((x) => x.name)).toEqual(["Rex"]);
        expect(g.foster.map((i) => i.monkey.name)).toEqual(["Masko"]);
        expect(g.adult.map((i) => i.monkey.name)).toEqual(["Juno"]);
        expect(g.cancelled).toBe(1);
    });

    test("troop babies with no birth date: by birth year", () => {
        expect(troopBabiesIn([m(1, "A", { arrivalReason: "born_here", year: 2026 })], 2026).map((x) => x.name)).toEqual(["A"]);
    });

    test("months and the busiest", () => {
        expect(byMonth(["2026-10-01", "2026-10-09", "2026-03-01"]).busiest).toEqual({ month: 9, count: 2 });
        expect(byMonth([]).busiest).toBeNull();
    });

    test("fun facts: most milk, biggest gain, oldest arrival, top letter and namer, busiest month", () => {
        const g = yearGroups(FACTS, 2026);
        const fun = funFacts(FACTS, 2026, g.arrivals, (id) => MONKEYS.find((x) => x.id === id).name);
        expect(fun.milk).toEqual({ name: "Masko", ml: 640, date: "2026-11-12" });
        expect(fun.weight).toMatchObject({ name: "Masko", gain: 1200 });
        expect(fun.oldest).toMatchObject({ name: "Mabel", years: 14, month: "March" });
        expect(fun.letter).toMatchObject({ letter: "M", count: 3 });
        expect(fun.namer).toEqual({ name: "Sam", count: 2, of: 3 });
        expect(fun.month).toEqual({ month: "October", count: 2 });
    });

    test("the slides, in order; empty ones left out", () => {
        const slides = yearEndSlides(FACTS, 2026);
        expect(slides.map((s) => s.id)).toEqual([
            "title",
            "numbers",
            "arrivals",
            "orphans",
            "troop-babies",
            "foster",
            "adults",
            "releases",
            "vet-visits",
            "vasectomies",
            "facts",
            "busy",
            "thanks",
        ]);
        const numbers = slides[1].tiles.map((t) => [t.what, t.n]);
        expect(numbers).toContainEqual(["Baby Arrivals", 2]);
        expect(numbers).toContainEqual(["Troop Babies Born", 1]);
        expect(numbers).toContainEqual(["Integrations", 2]);
        // (none added: not shown)
        expect(slides.find((s) => s.id === "busy").cards.map((c) => c.label)).not.toContain("Microchips added");
        // (title photos: real photos only)
        expect(slides[0].monkeys.map((x) => x.name)).toEqual(["Masko", "Rex"]);
    });

    test("more than 12 babies: more slides", () => {
        const many = Array.from({ length: 14 }, (_, i) => m(100 + i, `Baby ${i}`, { arrivalDate: "2026-09-01", arrivalReason: "orphaned" }));
        const slides = yearEndSlides({ ...FACTS, monkeys: many, integrations: [] }, 2026);
        expect(slides.filter((s) => s.id.startsWith("orphans")).map((s) => s.kicker)).toEqual(["Baby Arrivals · 1 of 2", "Baby Arrivals · 2 of 2"]);
    });

    test("lines: the year's own, else the app's; empty hides it", () => {
        expect(lineOf({}, "numbers.vasectomies")).toBe("Sorry, boys");
        expect(lineOf({ "numbers.vasectomies": "Snip snip" }, "numbers.vasectomies")).toBe("Snip snip");
        expect(lineOf({ "numbers.vasectomies": "" }, "numbers.vasectomies")).toBe("");
    });

    test("photos: real ones only; added in the year by the time in their names", () => {
        expect(realPhoto([BLANK, PHOTO])).toBe(PHOTO);
        expect(realPhoto([BLANK])).toBeNull();
        expect(photosAddedIn([{ photos: [PHOTO, BLANK, "x-1700000000000.jpg"] }], 2026)).toBe(1);
    });
});

describe("the page", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(data, "loadYearEnd").mockResolvedValue(FACTS);
        vi.spyOn(data, "loadYearEndSettings").mockResolvedValue({ lines: {}, titlePhotos: null, ready: true });
    });

    test("the title first; Next moves on; Edit Lines changes the slide and saves", async () => {
        const user = userEvent.setup();
        const save = vi.spyOn(data, "saveYearEndSettings").mockResolvedValue();
        render(<YearEndPresentation />);
        expect(await screen.findByText("Our Year at the Sanctuary")).toBeInTheDocument();
        expect(screen.getByText(/Slide 1 of 13/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Next Slide" }));
        expect(screen.getByText("The Year in Numbers")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: "Edit Lines" }));
        const box = screen.getByLabelText("Vasectomies tile");
        await user.clear(box);
        await user.type(box, "Snip snip");
        expect(screen.getByText("Snip snip")).toBeInTheDocument();
        expect(screen.getByText("Not saved yet")).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(save).toHaveBeenCalledWith(new Date().getFullYear(), expect.objectContaining({ lines: expect.objectContaining({ "numbers.vasectomies": "Snip snip" }) })));
        expect(await screen.findByText("Saved.")).toBeInTheDocument();
    });

    test("Change Photos: the year's monkeys with photos, up to five", async () => {
        const user = userEvent.setup();
        render(<YearEndPresentation />);
        await screen.findByText("Our Year at the Sanctuary");
        await user.click(screen.getByRole("button", { name: "Change Photos" }));
        const panel = screen.getByRole("region", { name: "Change Photos" });
        const masko = within(panel).getByRole("button", { name: /Masko/ });
        expect(masko).toHaveAttribute("aria-pressed", "true");
        await user.click(masko);
        expect(masko).toHaveAttribute("aria-pressed", "false");
        expect(within(panel).getByText(/1 of 5 chosen/)).toBeInTheDocument();
    });

    test("before the SQL's been run: changes show, Save is off", async () => {
        data.loadYearEndSettings.mockResolvedValue({ lines: {}, titlePhotos: null, ready: false });
        const user = userEvent.setup();
        render(<YearEndPresentation />);
        await screen.findByText("Our Year at the Sanctuary");
        await user.click(screen.getByRole("button", { name: "Edit Lines" }));
        expect(screen.getByText(/can't be saved until supabase\/year-end.sql/)).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    });
});
