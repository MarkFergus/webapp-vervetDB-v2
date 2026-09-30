import { checkForm, emptyForm, formFromMonkey, PLACEHOLDER_PHOTO } from "./monkeyFormChecks";

const TROOPS = ["Goliath", "Skunkey"];
const THIS_YEAR = 2026;
const valid = {
    name: "Nova",
    troop: "Goliath",
    sex: "female",
    year: "2024",
    chip: "",
    photos: [],
    bio: "Arrived as an orphan.",
    desc: "",
};
const check = (changes) => checkForm({ ...valid, ...changes }, TROOPS, THIS_YEAR);

describe("filling the form from a monkey", () => {
    test("uses the monkey's details, with the year as text", () => {
        const form = formFromMonkey({
            name: "Aroha", troop: "H&B", sex: "male", year: 2016, chip: 19806,
            img: ["https://i.ibb.co/a.webp"], bio: "Bio.", desc: undefined,
        });
        expect(form).toEqual({
            name: "Aroha", troop: "H&B", sex: "male", year: "2016", chip: "19806",
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

    test("a new monkey starts empty, in the chosen troop", () => {
        expect(emptyForm("Goliath")).toMatchObject({ name: "", troop: "Goliath", photos: [] });
    });
});

describe("checking the form", () => {
    test("a valid form has no problems", () => {
        const { errors, values } = check({});
        expect(errors).toEqual({});
        expect(values).toMatchObject({ name: "Nova", troop: "Goliath", year: 2024 });
    });

    test("name and troop are required", () => {
        expect(check({ name: "   " }).errors.name).toBe("Please enter a name.");
        expect(check({ troop: "" }).errors.troop).toBe("Please choose a troop.");
        expect(check({ troop: "Bandits" }).errors.troop).toBe("Please choose a troop.");
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
    ])("chip %j is saved as %j", (chip, saved) => {
        const { errors, values } = check({ chip });
        expect(errors.chip).toBeUndefined();
        expect(values.chip).toBe(saved);
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
