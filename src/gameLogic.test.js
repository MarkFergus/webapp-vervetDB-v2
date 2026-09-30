import monkeysArr from "./monkeysArr";
import { makeQuestion, playableMonkeys, OPTIONS_PER_QUESTION } from "./gameLogic";

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
