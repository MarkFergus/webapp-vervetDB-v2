import { checkForm, emptyForm, formFromMonkey, PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

// The Enclosure + Location choices (see placeChoices)
const CHOICES = [
    { key: "Goliath", troop: "Goliath", enclosure: "Goliath", noTroop: false, introcages: [{ id: 21, name: "Goliath A" }] },
    { key: "H&B", troop: "H&B", enclosure: "H&B", noTroop: false, introcages: [{ id: 30, name: "H&B C1" }] },
    { key: "Bandits", troop: "Bandits", enclosure: "Bandits", noTroop: false, introcages: [] },
    // A care unit: no troop, just its areas
    { key: "enclosure:90", troop: null, enclosure: "Baby Care", noTroop: true, introcages: [{ id: 91, name: "Dreamland" }] },
];
const THIS_YEAR = 2026;
const valid = {
    name: "Nova",
    troop: "Goliath",
    location: "troop",
    sex: "female",
    year: "2024",
    chip: "",
    photos: [],
    bio: "Arrived as an orphan.",
    desc: "",
};
const check = (changes) => checkForm({ ...valid, ...changes }, CHOICES, THIS_YEAR);

describe("filling the form from a monkey", () => {
    test("uses the monkey's details, with the year as text", () => {
        const form = formFromMonkey({
            name: "Aroha", troop: "H&B", sex: "male", year: 2016, chip: 19806,
            img: ["https://i.ibb.co/a.webp"], bio: "Bio.", desc: undefined,
        });
        expect(form).toEqual({
            name: "Aroha", troop: "H&B", location: "troop", sex: "male", year: "2016", chip: "19806",
            chipUnknown: false, introcageId: undefined,
            photos: ["https://i.ibb.co/a.webp"], bio: "Bio.", desc: "",
        });
    });

    test("unknown year stays blank, and the placeholder photo isn't listed", () => {
        const form = formFromMonkey({
            name: "Caryl", troop: "Camelot", sex: "", year: "", chip: "",
            img: [PLACEHOLDER_PHOTO], bio: "", desc: "",
        });
        expect(form.year).toBe("");
        expect(form.photos).toEqual([]);
    });

    test("a chip of null means unknown; an empty chip means no chip", () => {
        const base = { name: "Kai", troop: "Goliath", sex: "", year: "", img: [], bio: "", desc: "" };
        expect(formFromMonkey({ ...base, chip: null })).toMatchObject({ chip: "", chipUnknown: true });
        expect(formFromMonkey({ ...base, chip: "" })).toMatchObject({ chip: "", chipUnknown: false });
    });

    test("a new monkey starts empty, in the chosen troop", () => {
        expect(emptyForm("Goliath")).toMatchObject({ name: "", troop: "Goliath", location: "troop", photos: [] });
        expect(emptyForm()).toMatchObject({ troop: "", location: "" });
    });

    test("an introcage monkey: its enclosure's troop, and the introcage as its location", () => {
        const form = formFromMonkey(
            { name: "Aroha", troop: null, introcage: "H&B C1", introcageId: 30, enclosure: "H&B",
              sex: "male", year: 2016, chip: "", img: [], bio: "", desc: "" },
            CHOICES
        );
        expect(form).toMatchObject({ troop: "H&B", location: "30", introcageId: 30 });
    });
});

describe("checking the form", () => {
    test("a valid form has no problems", () => {
        const { errors, values } = check({});
        expect(errors).toEqual({});
        expect(values).toMatchObject({ name: "Nova", troop: "Goliath", year: 2024 });
    });

    test("name, enclosure and location are required", () => {
        expect(check({ name: "   " }).errors.name).toBe("Please enter a name.");
        expect(check({ troop: "" }).errors.troop).toBe("Please choose an enclosure.");
        expect(check({ troop: "Skunkey" }).errors.troop).toBe("Please choose an enclosure.");
        expect(check({ location: "" }).errors.location).toBe("Please choose a location.");
        // An introcage of another enclosure
        expect(check({ location: "30" }).errors.location).toBe("Please choose a location.");
    });

    test("stray spaces are tidied away", () => {
        const { values } = check({ name: "  Nova  Jnr ", bio: " Two  spaces.  ", desc: " x " });
        expect(values.name).toBe("Nova Jnr");
        expect(values.bio).toBe("Two spaces.");
        expect(values.desc).toBe("x");
    });

    test.each([
        ["", ""],
        ["2024", 2024],
        ["1980", 1980],
    ])("birth year %j is fine", (year, saved) => {
        const { errors, values } = check({ year });
        expect(errors.year).toBeUndefined();
        expect(values.year).toBe(saved);
    });

    test.each(["1979", "2027", "20", "twenty", "2024.5"])("birth year %j is refused", (year) => {
        expect(check({ year }).errors.year).toMatch(/between 1980 and 2026/);
    });

    test.each([
        ["", ""],
        ["19806", "19806"],
        [" 19806 ", "19806"],
        ["1011 & 1604", "1011 & 1604"],
        ["1011 1604", "1011 & 1604"],
        ["1011,1604", "1011 & 1604"],
        ["1011 and 1604", "1011 & 1604"],
        ["1011/1604", "1011 & 1604"],
        ["1011.1604", "1011 & 1604"],
        ["1011-1604", "1011 & 1604"],
    ])("chip %j is saved as %j", (chip, saved) => {
        const { errors, values } = check({ chip });
        expect(errors.chip).toBeUndefined();
        expect(values.chip).toBe(saved);
    });

    test("an unknown chip is saved as null", () => {
        const { errors, values } = check({ chip: "", chipUnknown: true });
        expect(errors.chip).toBeUndefined();
        expect(values.chip).toBeNull();
    });

    test("chips with letters, or more than two, are refused", () => {
        expect(check({ chip: "12a4" }).errors.chip).toMatch(/digits/);
        expect(check({ chip: "1 2 3" }).errors.chip).toMatch(/two/);
    });

    test("no photos: the placeholder is used", () => {
        expect(check({ photos: [] }).values.img).toEqual([PLACEHOLDER_PHOTO]);
        expect(check({ photos: ["  ", ""] }).values.img).toEqual([PLACEHOLDER_PHOTO]);
    });

    test("photo links are trimmed and must start with https://", () => {
        expect(check({ photos: [" https://i.ibb.co/a.webp "] }).values.img).toEqual(["https://i.ibb.co/a.webp"]);
        expect(check({ photos: ["https://i.ibb.co/a.webp", "i.ibb.co/b.webp"] }).errors.photos).toBe(
            "Photo link 2 should be a web address starting with https://"
        );
        expect(check({ photos: ["http://i.ibb.co/a.webp"] }).errors.photos).toMatch(/https/);
    });

    test("sex must be male, female or not recorded", () => {
        expect(check({ sex: "male" }).values.sex).toBe("male");
        expect(check({ sex: "Male" }).values.sex).toBe("");
    });
});

test("up to 5 photos; more are refused with a clear message", () => {
    const links = (n) => Array.from({ length: n }, (_, i) => `https://i.ibb.co/p${i}.webp`);
    expect(check({ photos: links(5) }).errors.photos).toBeUndefined();
    expect(check({ photos: links(6) }).errors.photos).toBe(
        "5 photos is the most a monkey can have. Please remove one."
    );
    expect(check({ photos: links(8) }).errors.photos).toMatch(/Please remove 3/);
    // Empty boxes don't count
    expect(check({ photos: [...links(5), "", " "] }).errors.photos).toBeUndefined();
});

describe("where the monkey lives", () => {
    test("with the troop: no introcage", () => {
        expect(check({}).values).toMatchObject({ troop: "Goliath", introcage: null, introcageId: undefined });
    });

    test("in an introcage: no troop", () => {
        expect(check({ location: "21" }).values).toMatchObject({ troop: null, introcage: "Goliath A", introcageId: 21 });
    });

    test("back from an introcage to the troop clears the introcage", () => {
        expect(check({ introcageId: 21, location: "troop" }).values).toMatchObject({
            troop: "Goliath", introcage: null, introcageId: null,
        });
    });

    test("the Bandits (no enclosure) stay a troop", () => {
        expect(check({ troop: "Bandits" }).values).toMatchObject({ troop: "Bandits", introcage: null });
    });

    test("a care unit (Baby Care): in one of its areas, never a troop", () => {
        expect(check({ troop: "enclosure:90", location: "91" }).values).toMatchObject({
            troop: null, introcage: "Dreamland", introcageId: 91,
        });
        // No area chosen: asked for one
        expect(check({ troop: "enclosure:90", location: "troop" }).errors.location).toBe("Please choose a location.");
        expect(check({ troop: "enclosure:90", location: "" }).errors.location).toBe("Please choose a location.");
    });

    test("a monkey in a care unit's area fills the form with that unit", () => {
        const monkey = { name: "Nova", troop: null, introcage: "Dreamland", introcageId: 91, enclosure: "Baby Care",
            sex: "female", year: "", chip: "", img: [PLACEHOLDER_PHOTO], bio: "", desc: "" };
        expect(formFromMonkey(monkey, CHOICES)).toMatchObject({ troop: "enclosure:90", location: "91" });
    });
});
