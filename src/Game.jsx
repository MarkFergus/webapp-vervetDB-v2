import { useEffect, useRef, useState } from "react";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import MonkeyIcon from "./MonkeyIcon";
import {
    makeQuestion,
    playableMonkeys,
    QUESTIONS_PER_ROUND,
} from "./gameLogic";
import "./Game.css";

// Best score per troop setting, remembered in this browser only
function bestKey({ troop }) {
    return `vervetdb-game-best:${troop}`;
}
function loadBest(settings) {
    try {
        return Number(localStorage.getItem(bestKey(settings))) || 0;
    } catch {
        return 0;
    }
}
function saveBest(settings, score) {
    try {
        localStorage.setItem(bestKey(settings), String(score));
    } catch {
        // storage unavailable (e.g. private browsing): just don't remember it
    }
}

function preload(question) {
    if (question) new Image().src = question.photo;
}

function Game() {
    const [settings, setSettings] = useState({ troop: "All Troops" });
    const [round, setRound] = useState(() => newRound(settings));
    const [best, setBest] = useState(() => loadBest(settings));
    const nextButtonRef = useRef(null);
    const firstOptionRef = useRef(null);

    // A round is short if a troop has fewer photos than QUESTIONS_PER_ROUND
    function newRound(s) {
        const length = Math.min(
            QUESTIONS_PER_ROUND,
            playableMonkeys(monkeysArr, s.troop).length
        );
        const question = makeQuestion(monkeysArr, s);
        return {
            length,
            number: 1,
            score: 0,
            asked: question ? [question.answer] : [],
            question,
            picked: null,
            upcoming: null,
            finished: false,
        };
    }

    function changeSettings(change) {
        const s = { ...settings, ...change };
        setSettings(s);
        setRound(newRound(s));
        setBest(loadBest(s));
    }

    function choose(name) {
        if (round.picked || round.finished) return;
        const correct = name === round.question.answer.name;
        // Work out the next photo now so it can load while you read the answer
        const upcoming =
            round.number < round.length
                ? makeQuestion(monkeysArr, { ...settings, exclude: round.asked })
                : null;
        preload(upcoming);
        setRound({
            ...round,
            picked: name,
            score: round.score + (correct ? 1 : 0),
            upcoming,
        });
    }

    function next() {
        if (!round.picked) return;
        if (!round.upcoming) {
            if (round.score > best) {
                saveBest(settings, round.score);
                setBest(round.score);
            }
            setRound({ ...round, finished: true });
            return;
        }
        setRound({
            ...round,
            number: round.number + 1,
            question: round.upcoming,
            asked: [...round.asked, round.upcoming.answer],
            picked: null,
            upcoming: null,
        });
    }

    // Keyboard: 1–4 to answer, Enter for the next photo
    useEffect(() => {
        function handleKeyDown(event) {
            if (["SELECT", "INPUT"].includes(event.target.tagName)) return;
            if (round.finished || !round.question) return;
            const index = Number(event.key) - 1;
            if (!round.picked && round.question.options[index]) {
                choose(round.question.options[index]);
            } else if (round.picked && event.key === "Enter") {
                event.preventDefault();
                next();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    });

    // Move focus to what you'll want next (for keyboard users)
    useEffect(() => {
        if (round.picked) nextButtonRef.current?.focus();
    }, [round.picked]);
    useEffect(() => {
        if (round.number > 1 && !round.picked) firstOptionRef.current?.focus();
    }, [round.number, round.picked]);

    const { question, picked } = round;
    const answer = question?.answer;
    const isCorrect = picked && picked === answer.name;

    function optionClass(name) {
        if (!picked) return "Game-option";
        if (name === answer.name) return "Game-option is-correct";
        if (name === picked) return "Game-option is-wrong";
        return "Game-option";
    }

    return (
        <div className="Game">
            <header className="Game-header">
                <a href="#" className="Game-home">
                    <MonkeyIcon />
                    <span className="Game-home-title">vervetDB</span>
                </a>
                <a href="#" className="Game-back">
                    ← Back to monkeys
                </a>
            </header>

            <h1 className="Game-title">Guess the Monkey</h1>

            <div className="Game-settings">
                <select
                    aria-label="Troop to play"
                    value={settings.troop}
                    onChange={(e) => changeSettings({ troop: e.target.value })}
                >
                    {groupsArr.map((g) => (
                        <option key={g} value={g}>
                            {g}
                        </option>
                    ))}
                </select>
                <button type="button" onClick={() => changeSettings({})}>
                    New round
                </button>
            </div>

            {!question ? (
                <p className="Game-empty">No monkey photos for this troop yet.</p>
            ) : round.finished ? (
                <div className="Game-end">
                    <h2>
                        You scored {round.score} out of {round.length}
                    </h2>
                    <p>
                        Your best
                        {settings.troop === "All Troops" ? "" : ` for ${settings.troop}`}:{" "}
                        {best} out of {round.length}
                    </p>
                    <button
                        type="button"
                        className="Game-next"
                        onClick={() => changeSettings({})}
                        autoFocus
                    >
                        Play again
                    </button>
                </div>
            ) : (
                <>
                    <div className="Game-scoreboard">
                        <p className="Game-progress">
                            Photo {round.number} of {round.length}
                        </p>
                        <p className="Game-score">
                            <span className="Game-score-label">Score</span>
                            {/* key: a new element each time the score changes, so the pop replays */}
                            <span
                                key={round.score}
                                className={
                                    round.score > 0
                                        ? "Game-score-value pop"
                                        : "Game-score-value"
                                }
                            >
                                {round.score}
                            </span>
                        </p>
                    </div>

                    <div className="Game-photo">
                        {/* Alt text mustn't give away the name */}
                        <img src={question.photo} alt="Mystery monkey" />
                    </div>

                    <div className="Game-options">
                        {question.options.map((name, i) => (
                            <button
                                key={name}
                                ref={i === 0 ? firstOptionRef : null}
                                type="button"
                                className={optionClass(name)}
                                onClick={() => choose(name)}
                                disabled={Boolean(picked)}
                            >
                                <span className="Game-key" aria-hidden="true">
                                    {i + 1}
                                </span>
                                {name}
                            </button>
                        ))}
                    </div>

                    <p className="Game-feedback" role="status">
                        {picked &&
                            (isCorrect
                                ? `Correct! It's ${answer.name} from ${answer.troop}.`
                                : `Not quite. It's ${answer.name} from ${answer.troop}.`)}
                    </p>

                    {picked && (
                        <button
                            type="button"
                            className="Game-next"
                            ref={nextButtonRef}
                            onClick={next}
                        >
                            {round.upcoming ? "Next photo" : "See your score"}
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

export default Game;
