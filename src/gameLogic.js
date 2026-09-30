// Logic for the "Guess the monkey" game, kept separate from the page so it's
// easy to test. `random` can be swapped for a predictable one in tests.

export const OPTIONS_PER_QUESTION = 4;
export const QUESTIONS_PER_ROUND = 10;

const isRealPhoto = (url) => !url.includes("blank-image");

// Monkeys that can be the answer: they need at least one real photo
export function playableMonkeys(monkeys, troop = "All Troops") {
    return monkeys.filter(
        (m) =>
            m.img.some(isRealPhoto) &&
            (troop === "All Troops" || m.troop === troop)
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
// When practising one troop, the wrong names come from that troop too;
// otherwise from any troop. `exclude` avoids repeating answers in a round.
export function makeQuestion(
    monkeys,
    { troop = "All Troops", exclude = [], random = Math.random } = {}
) {
    const pool = playableMonkeys(monkeys, troop);
    const fresh = pool.filter((m) => !exclude.includes(m));
    const answer = pick(fresh.length ? fresh : pool, random);
    if (!answer) return null;

    const sameTroop = troop !== "All Troops";
    const candidates = shuffle(
        monkeys.filter(
            (m) =>
                m.name !== answer.name &&
                (!sameTroop || m.troop === answer.troop)
        ),
        random
    );
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
