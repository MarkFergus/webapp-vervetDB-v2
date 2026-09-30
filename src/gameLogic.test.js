import monkeysArr from "./monkeysArr";
import {
    averageSeconds,
    resultMessage,
    checkTypedAnswer,
    DIFFICULTIES,
    makeQuestion,
    playableMonkeys,
    OPTIONS_PER_QUESTION,
} from "./gameLogic";

describe("Expert mode: checking a typed name", () => {
    test.each([
        ["Missie", "Missie", "correct"],
        ["missie", "Missie", "correct"],
        ["  MISSIE ", "Missie", "correct"],
        ["patch adams", "Patch-Adams", "correct"],
        ["patchadams", "Patch-Adams", "correct"],
        ["Chloé", "Chloe", "correct"],
        ["Misie", "Missie", "close"], // one letter missing
        ["Mossie", "Missie", "close"], // one letter wrong
        ["Missiee", "Missie", "close"], // one letter extra
        ["Mosie", "Missie", "wrong"], // two letters out
        ["Jo", "Je", "wrong"], // short names must be exact
        ["Abu", "Abi", "wrong"],
        ["", "Missie", "wrong"],
        ["   ", "Missie", "wrong"],
    ])("%j for %s is %s", (typed, name, expected) => {
        expect(checkTypedAnswer(typed, name)).toBe(expected);
    });
});

const isBlank = (url) => url.includes("blank-image");
const namesInTroop = (troop) =>
    new Set(monkeysArr.filter((m) => m.troop === troop).map((m) => m.name));

// Randomness: check lots of questions rather than one
const many = (options, n = 300) =>
    Array.from({ length: n }, () => makeQuestion(monkeysArr, options));

test("only monkeys with a real photo can be the answer", () => {
    const pool = playableMonkeys(monkeysArr);
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((m) => m.img.some((u) => !isBlank(u)))).toBe(true);
});

test("each question has 4 different names, one of them right", () => {
    for (const q of many()) {
        expect(q.options).toHaveLength(OPTIONS_PER_QUESTION);
        expect(new Set(q.options).size).toBe(OPTIONS_PER_QUESTION);
        expect(q.options).toContain(q.answer.name);
    }
});

test("the photo is one of the answer's real photos", () => {
    for (const q of many()) {
        expect(q.answer.img).toContain(q.photo);
        expect(isBlank(q.photo)).toBe(false);
    }
});

test("practising one troop only asks about that troop", () => {
    for (const q of many({ troop: "Jalamango" }, 50)) {
        expect(q.answer.troop).toBe("Jalamango");
        const troopNames = namesInTroop("Jalamango");
        expect(q.options.every((n) => troopNames.has(n))).toBe(true);
    }
});

test("a round doesn't repeat a monkey while others are left", () => {
    const pool = playableMonkeys(monkeysArr, "Jalamango");
    const asked = [];
    for (let i = 0; i < pool.length; i++) {
        asked.push(makeQuestion(monkeysArr, { troop: "Jalamango", exclude: asked }).answer);
    }
    expect(new Set(asked).size).toBe(pool.length);
});

test("predictable when given a fixed random function (for testing)", () => {
    const fixed = () => 0;
    const a = makeQuestion(monkeysArr, { random: fixed });
    const b = makeQuestion(monkeysArr, { random: fixed });
    expect(a).toEqual(b);
});

test("difficulty descriptions all follow the same pattern", () => {
    expect(DIFFICULTIES.map((d) => d.description)).toEqual([
        "Normal mode: Multiple choice, 30 second timer",
        "Hard mode: Multiple choice, 5 second timer",
        "Expert mode: Type the name, 14 second timer",
    ]);
});

describe("results messages", () => {
    test.each([
        [10, 10, "expert", "GODLIKE!"],
        [10, 10, "hard", "UNSTOPPABLE!"],
        [10, 10, "normal", "PERFECT!"],
        [8, 10, "expert", "LEGENDARY!"],
        [9, 10, "normal", "Great work!"],
        [6, 10, "hard", "Quick thinking!"],
        [0, 10, "normal", "The monkeys win this round!"],
        [6, 6, "expert", "GODLIKE!"], // short round (small troop): all right is still perfect
        [3, 6, "normal", "Not bad!"],
    ])("%i out of %i on %s says %j", (score, outOf, level, text) => {
        expect(resultMessage(score, outOf, level)).toBe(text);
    });

    test("every level has a message for every possible score", () => {
        for (const level of ["normal", "hard", "expert"]) {
            for (let score = 0; score <= 10; score++) {
                expect(resultMessage(score, 10, level)).toEqual(expect.any(String));
            }
        }
    });
});

test("average answer time is in seconds to one decimal place", () => {
    expect(averageSeconds([2, 3, 4])).toBe("3.0");
    expect(averageSeconds([1.25, 2.5])).toBe("1.9");
    expect(averageSeconds([])).toBeNull();
});

describe("same-sex choices (Hard)", () => {
    // The sexes a name could belong to (two monkeys can share a name)
    const sexesOf = (name) => new Set(monkeysArr.filter((m) => m.name === name).map((m) => m.sex));

    test("with sameSex, every wrong name is the answer's sex (when there are enough)", () => {
        for (const q of many({ sameSex: true })) {
            if (!q.answer.sex) continue; // sex not recorded: nothing to match
            for (const name of q.options) {
                expect(sexesOf(name).has(q.answer.sex)).toBe(true);
            }
        }
    });

    test("without sameSex (Normal), choices are a random mix of sexes", () => {
        const mixed = many().some((q) => {
            const sexes = new Set(q.options.flatMap((n) => [...sexesOf(n)]));
            return sexes.has("male") && sexes.has("female");
        });
        expect(mixed).toBe(true);
    });

    test("a small troop without enough of one sex still gets 4 choices", () => {
        for (const q of many({ troop: "Jalamango", sameSex: true }, 50)) {
            expect(new Set(q.options).size).toBe(OPTIONS_PER_QUESTION);
            expect(q.options.every((n) => namesInTroop("Jalamango").has(n))).toBe(true);
        }
    });

    test("only Hard and Expert use same-sex choices", () => {
        expect(DIFFICULTIES.map((d) => [d.id, d.sameSexChoices])).toEqual([
            ["normal", false],
            ["hard", true],
            ["expert", true],
        ]);
    });
});
