// A Microchip record's words (chipRules.js)
import { chipNumberProblem, microchipText, parseMicrochip } from "./chipRules";

test("the record reads Microchipped, then the note if there is one", () => {
    expect(microchipText({ number: " 12345 ", note: "  " })).toBe("Microchipped 12345");
    expect(microchipText({ number: "12345", note: " Left shoulder " })).toBe("Microchipped 12345: Left shoulder");
});

test("...and back again", () => {
    expect(parseMicrochip("Microchipped 12345")).toEqual({ number: "12345", note: "" });
    expect(parseMicrochip("Microchipped 12345: Two\nlines: ok")).toEqual({ number: "12345", note: "Two\nlines: ok" });
    expect(parseMicrochip("Something else")).toBeNull();
});

test("one number, digits only", () => {
    expect(chipNumberProblem("")).toMatch(/enter/);
    expect(chipNumberProblem("12a")).toMatch(/digits/);
    expect(chipNumberProblem("1011 1604")).toMatch(/digits/);
    expect(chipNumberProblem(" 1011 ")).toBeNull();
});
