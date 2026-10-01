// Logic for the "Monkey Guesser" game, kept separate from the page so it's
// easy to test. `random` can be swapped for a predictable one in tests.

export const OPTIONS_PER_QUESTION = 4;
export const QUESTIONS_PER_ROUND = 10;

// seconds: time allowed per photo (null = no timer). The description is
// built from the same settings, so it always matches the real timing.
// sameSexChoices: the wrong names are all the same sex as the answer, so
// the monkey's sex doesn't give it away.
const LEVELS = [
    { id: "normal", label: "Normal", answer: "Multiple choice", seconds: 30, sameSexChoices: false },
    { id: "hard", label: "Hard", answer: "Multiple choice", seconds: 5, sameSexChoices: true },
    // Longer than Hard: typing takes a while, especially on a phone
    { id: "expert", label: "Expert", answer: "Type the name", seconds: 12, sameSexChoices: true },
];

export const DIFFICULTIES = LEVELS.map((level) => ({
    ...level,
    // e.g. "Hard mode: Multiple choice, 5 second timer"
    description: `${level.label} mode: ${level.answer}, ${
        level.seconds ? `${level.seconds} second timer` : "no timer"
    }`,
}));

export function difficultyById(id) {
    return DIFFICULTIES.find((d) => d.id === id);
}

// How long a round is: 10 photos, or every playable monkey in the chosen
// troops once (with a streak counter)
export const ROUND_LENGTHS = [
    { id: "ten", label: "10 photos", description: "A quick round" },
    { id: "all", label: "All photos", description: "Every monkey once" },
];

// The chosen troops, as a list: [] means every troop. Also accepts a single
// troop name, or "All Troops".
export function troopList(troops) {
    if (!troops || troops === "All Troops") return [];
    return Array.isArray(troops) ? troops : [troops];
}

// For headings and sharing: "Lankora + Skunkey", "5 troops", or "" for all
export function troopsLabel(troops) {
    const list = troopList(troops);
    if (list.length > 3) return `${list.length} troops`;
    return list.join(" + ");
}

// The hardest game possible: every troop, Expert, every photo
export function isUltimate({ troops, difficulty, length }) {
    return troopList(troops).length === 0 && difficulty === "expert" && length === "all";
}
export const ULTIMATE_LABEL = "🔥 Ultimate Challenge";

// e.g. "Hard mode · Lankora + Skunkey" (the troops left out when it's all of
// them), or "🔥 Ultimate Challenge" for the hardest game
export function modeLabel(difficulty, troops, length) {
    if (isUltimate({ troops, difficulty, length })) return ULTIMATE_LABEL;
    const label = `${difficultyById(difficulty).label} mode`;
    const which = troopsLabel(troops);
    return which ? `${label} · ${which}` : label;
}

// Results screen headline, by difficulty and share of photos right.
// Checked top to bottom: the first line whose `atLeast` is met is used.
const RESULT_MESSAGES = {
    normal: [
        { atLeast: 1, text: "PERFECT!" },
        { atLeast: 0.8, text: "Great work!" },
        { atLeast: 0.6, text: "Good going!" },
        { atLeast: 0.4, text: "Not bad!" },
        { atLeast: 0.2, text: "Keep practising!" },
        { atLeast: 0, text: "The monkeys win this round!" },
    ],
    hard: [
        { atLeast: 1, text: "UNSTOPPABLE!" },
        { atLeast: 0.8, text: "Sharp eyes!" },
        { atLeast: 0.6, text: "Quick thinking!" },
        { atLeast: 0.4, text: "Getting there!" },
        { atLeast: 0.2, text: "That clock is ruthless!" },
        { atLeast: 0, text: "The monkeys win this round!" },
    ],
    expert: [
        { atLeast: 1, text: "GODLIKE!" },
        { atLeast: 0.8, text: "LEGENDARY!" },
        { atLeast: 0.6, text: "Seriously impressive!" },
        { atLeast: 0.4, text: "Not bad for Expert!" },
        { atLeast: 0.2, text: "Expert is tough. Keep at it!" },
        { atLeast: 0, text: "The monkeys win this round!" },
    ],
};

export function resultMessage(score, outOf, difficulty) {
    const share = outOf ? score / outOf : 0;
    return RESULT_MESSAGES[difficulty].find((m) => share >= m.atLeast).text;
}

// The text shared from the results screen, e.g.
//   🐒 vervetDB · Monkey Guesser
//   Expert mode · Goliath
//   10/10 GODLIKE! ⏱ 3.2s average
//   ✅✅❌⏰✅…
//   Can you beat it? https://…/#game
// outcomes: "right" | "wrong" | "timeout" for each photo, in order
// (shown as emoji, so nothing gives away which monkeys they were)
const OUTCOME_EMOJI = { right: "✅", wrong: "❌", timeout: "⏰" };

export function shareText({ score, outOf, difficulty, troops, length, averageSeconds, outcomes, url }) {
    const mode = modeLabel(difficulty, troops, length);
    const time = averageSeconds ? ` ⏱ ${averageSeconds}s average` : "";
    return [
        "🐒 vervetDB · Monkey Guesser",
        mode,
        `${score}/${outOf} ${resultMessage(score, outOf, difficulty)}${time}`,
        outcomes.map((o) => OUTCOME_EMOJI[o]).join(""),
        `Can you beat it? ${url}`,
    ].join("\n");
}

// Average of the answer times, in seconds to one decimal place, e.g. "3.2"
export function averageSeconds(times) {
    if (!times.length) return null;
    const total = times.reduce((sum, t) => sum + t, 0);
    return (total / times.length).toFixed(1);
}

// For comparing typed names: ignore capitals, accents, spaces, hyphens etc.
// so "patch adams" matches "Patch-Adams"
export function simplifyName(name) {
    return name
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// Number of single-letter changes to turn one word into the other
function editDistance(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = row[0];
        row[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const current = row[j];
            row[j] = Math.min(
                row[j] + 1,
                row[j - 1] + 1,
                prev + (a[i - 1] === b[j - 1] ? 0 : 1)
            );
            prev = current;
        }
    }
    return row[b.length];
}

// Expert mode: "correct", "close" (one letter out, for names of 4+ letters,
// still scores) or "wrong"
export function checkTypedAnswer(typed, name) {
    const guess = simplifyName(typed);
    const target = simplifyName(name);
    if (!guess) return "wrong";
    if (guess === target) return "correct";
    if (target.length >= 4 && editDistance(guess, target) === 1) return "close";
    return "wrong";
}

const isRealPhoto = (url) => !url.includes("blank-image");

// Troops of samango monkeys, a different species from the vervets. In Hard
// (and Expert), a samango's wrong names are other samangos and a vervet's
// are other vervets, so the species doesn't give the answer away.
export const SAMANGO_TROOPS = ["Jalamango"];
const isSamango = (monkey) => SAMANGO_TROOPS.includes(monkey.troop);

// Monkeys that can be the answer: they need at least one real photo.
// troops: the chosen troops ([] or "All Troops" = every troop)
export function playableMonkeys(monkeys, troops = []) {
    const list = troopList(troops);
    return monkeys.filter(
        (m) => m.img.some(isRealPhoto) && (!list.length || list.includes(m.troop))
    );
}

function pick(list, random) {
    return list[Math.floor(random() * list.length)];
}

function shuffle(list, random) {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

// One question: a photo of `answer`, plus 4 different names to choose from.
// When practising chosen troops, the wrong names come from those troops too;
// otherwise from any troop. With `sameSex` (Hard and Expert), wrong names
// are the same species as the answer and its sex first; if there aren't
// enough, they're topped up with the other sex, then other species. (There
// are only 6 samangos: a samango gets its 2 same-sex troop-mates and 1 of the
// other sex.)
// `exclude` avoids repeating answers in a round.
export function makeQuestion(
    monkeys,
    { troops = [], troop, sameSex = false, exclude = [], random = Math.random } = {}
) {
    const list = troopList(troop ?? troops);
    const pool = playableMonkeys(monkeys, list);
    const fresh = pool.filter((m) => !exclude.includes(m));
    const answer = pick(fresh.length ? fresh : pool, random);
    if (!answer) return null;

    let candidates = shuffle(
        monkeys.filter(
            (m) => m.name !== answer.name && (!list.length || list.includes(m.troop))
        ),
        random
    );
    if (sameSex) {
        // 0 = same species and sex, 1 = same species, other sex,
        // 2 / 3 = the same for the other species. The sort keeps the shuffled
        // order within each group.
        const rank = (m) =>
            (isSamango(m) === isSamango(answer) ? 0 : 2) +
            (answer.sex && m.sex !== answer.sex ? 1 : 0);
        candidates.sort((a, b) => rank(a) - rank(b));
    }
    // Names must all be different (two monkeys can share a name)
    const wrongNames = [...new Set(candidates.map((m) => m.name))].slice(
        0,
        OPTIONS_PER_QUESTION - 1
    );

    return {
        answer,
        photo: pick(answer.img.filter(isRealPhoto), random),
        options: shuffle([answer.name, ...wrongNames], random),
    };
}
