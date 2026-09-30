import { useEffect, useRef, useState } from "react";
import {
    IconCheck,
    IconCircleCheckFilled,
    IconCircleXFilled,
    IconX,
} from "@tabler/icons-react";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import MonkeyIcon from "./MonkeyIcon";
import {
    averageSeconds,
    checkTypedAnswer,
    DIFFICULTIES,
    difficultyById,
    makeQuestion,
    playableMonkeys,
    QUESTIONS_PER_ROUND,
    resultMessage,
} from "./gameLogic";
import "./Game.css";

// Best score per troop and difficulty, remembered in this browser only.
// (Normal keeps the original key so earlier best scores aren't lost.)
function bestKey({ troop, difficulty }) {
    const base = `vervetdb-game-best:${troop}`;
    return difficulty === "normal" ? base : `${base}:${difficulty}`;
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

// The troop and difficulty last played, so returning players carry on where
// they left off (this browser only)
const SETTINGS_KEY = "vervetdb-game-settings";
const DEFAULT_SETTINGS = { troop: "All Troops", difficulty: "normal" };
function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY));
        // Ignore anything out of date, e.g. a troop that's since been renamed
        if (groupsArr.includes(saved?.troop) && difficultyById(saved?.difficulty)) {
            return { troop: saved.troop, difficulty: saved.difficulty };
        }
    } catch {
        // storage unavailable or unreadable: use the defaults
    }
    return DEFAULT_SETTINGS;
}
function saveSettings(settings) {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // storage unavailable: just don't remember
    }
}

// A short "buzz" on phones for a wrong answer or running out of time.
// (Not every phone supports it, e.g. iPhones don't: then nothing happens.)
function buzz() {
    try {
        navigator.vibrate?.([80, 60, 80]);
    } catch {
        // not supported
    }
}

// What makeQuestion needs from the game settings
function questionSettings({ troop, difficulty }) {
    return { troop, sameSex: difficultyById(difficulty).sameSexChoices };
}

function preload(question) {
    if (question) new Image().src = question.photo;
}

let nextRoundId = 1;

function Game() {
    // settings: what the current round is played with
    const [settings, setSettings] = useState(loadSettings);
    const [round, setRound] = useState(() => newRound(settings));
    const [best, setBest] = useState(() => loadBest(settings));
    // Troop and difficulty picked in the controls; they take effect at the
    // next New round, so a round in progress is never cut short
    const [chosenTroop, setChosenTroop] = useState(settings.troop);
    const [chosenDifficulty, setChosenDifficulty] = useState(settings.difficulty);
    // Paused because the page was hidden (another app, tab or a phone call)
    const [paused, setPaused] = useState(false);
    const pausedAt = useRef(null);
    // Countdown for each photo; it only starts once the photo has loaded
    const [secondsLeft, setSecondsLeft] = useState(
        () => difficultyById(settings.difficulty).seconds ?? 0
    );
    const [photoReady, setPhotoReady] = useState(false);
    // Expert mode: what's been typed
    const [typed, setTyped] = useState("");

    const nextButtonRef = useRef(null);
    const firstOptionRef = useRef(null);
    const typedInputRef = useRef(null);
    const startButtonRef = useRef(null);
    // When the current photo appeared, for timing answers
    const photoShownAt = useRef(Date.now());

    const { difficulty } = settings;
    const level = difficultyById(difficulty);

    // A round is short if a troop has fewer photos than QUESTIONS_PER_ROUND
    function newRound(s) {
        const length = Math.min(
            QUESTIONS_PER_ROUND,
            playableMonkeys(monkeysArr, s.troop).length
        );
        const question = makeQuestion(monkeysArr, questionSettings(s));
        return {
            id: nextRoundId++,
            // The first photo waits, blurred, until Start is pressed
            started: false,
            length,
            number: 1,
            score: 0,
            // Seconds taken on each photo answered
            times: [],
            // Set when the round ends, if it beat the previous best
            newBest: false,
            asked: question ? [question.answer] : [],
            question,
            // Set once answered: { kind: "correct" | "close" | "wrong" | "timeout", picked?, typed? }
            result: null,
            upcoming: null,
            finished: false,
        };
    }

    // Everything that resets for a fresh photo
    function resetForNewPhoto(levelId = difficulty) {
        setSecondsLeft(difficultyById(levelId).seconds ?? 0);
        setPhotoReady(false);
        setTyped("");
        photoShownAt.current = Date.now();
    }

    function handlePhotoShown() {
        // Before Start, the clock starts when Start is pressed instead
        if (round.started) photoShownAt.current = Date.now();
        setPhotoReady(true);
    }

    function start() {
        if (round.started || round.finished) return;
        photoShownAt.current = Date.now();
        setRound({ ...round, started: true });
    }

    function resume() {
        if (!paused) return;
        // Time spent away doesn't count towards the answer time
        photoShownAt.current += Date.now() - pausedAt.current;
        setPaused(false);
    }

    // Starts a new round with the chosen troop and difficulty
    function changeSettings(change) {
        const s = { troop: chosenTroop, difficulty: chosenDifficulty, ...change };
        setSettings(s);
        saveSettings(s);
        setRound(newRound(s));
        setBest(loadBest(s));
        setPaused(false);
        resetForNewPhoto(s.difficulty);
    }

    function finishQuestion(result) {
        if (round.result || round.finished) return;
        const scored = result.kind === "correct" || result.kind === "close";
        if (!scored) buzz();
        // Time since the photo appeared; running out counts as the full time
        const elapsed = (Date.now() - photoShownAt.current) / 1000;
        const timeTaken =
            result.kind === "timeout"
                ? level.seconds
                : Math.min(elapsed, level.seconds ?? elapsed);
        // Work out the next photo now so it can load while you read the answer
        const upcoming =
            round.number < round.length
                ? makeQuestion(monkeysArr, {
                      ...questionSettings(settings),
                      exclude: round.asked,
                  })
                : null;
        preload(upcoming);
        setRound({
            ...round,
            result,
            score: round.score + (scored ? 1 : 0),
            times: [...round.times, timeTaken],
            upcoming,
        });
    }

    function choose(name) {
        const kind = name === round.question.answer.name ? "correct" : "wrong";
        finishQuestion({ kind, picked: name });
    }

    function submitTyped(event) {
        event.preventDefault();
        if (!typed.trim()) return;
        const kind = checkTypedAnswer(typed, round.question.answer.name);
        finishQuestion({ kind, typed });
    }

    function next() {
        if (!round.result) return;
        if (!round.upcoming) {
            const newBest = round.score > best;
            if (newBest) {
                saveBest(settings, round.score);
                setBest(round.score);
            }
            setRound({ ...round, finished: true, newBest });
            return;
        }
        setRound({
            ...round,
            number: round.number + 1,
            question: round.upcoming,
            asked: [...round.asked, round.upcoming.answer],
            result: null,
            upcoming: null,
        });
        resetForNewPhoto();
    }

    // A photo is being answered right now (started, not answered yet)
    const inPlay = round.started && !round.result && !round.finished;

    // Leaving the page (switching app or tab, a phone call) pauses the photo
    useEffect(() => {
        function handleVisibility() {
            if (document.hidden && inPlay && !paused) {
                pausedAt.current = Date.now();
                setPaused(true);
            }
        }
        document.addEventListener("visibilitychange", handleVisibility);
        return () => document.removeEventListener("visibilitychange", handleVisibility);
    });

    // Count down once a second; at zero it's a miss
    const timerRunning = Boolean(level.seconds) && inPlay && photoReady && !paused;
    useEffect(() => {
        if (!timerRunning) return;
        if (secondsLeft <= 0) {
            finishQuestion({ kind: "timeout" });
            return;
        }
        const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
        return () => clearTimeout(id);
    });

    // Keyboard: Enter or Space to start or resume, 1–4 to answer (not in
    // Expert), Enter for the next photo
    useEffect(() => {
        function handleKeyDown(event) {
            if (["SELECT", "INPUT"].includes(event.target.tagName)) return;
            if (round.finished || !round.question) return;
            if (!round.started || paused) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    if (paused) resume();
                    else start();
                }
                return;
            }
            const index = Number(event.key) - 1;
            if (
                !round.result &&
                difficulty !== "expert" &&
                round.question.options[index]
            ) {
                choose(round.question.options[index]);
            } else if (round.result && event.key === "Enter") {
                event.preventDefault();
                next();
            }
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    });

    // Move focus to what you'll want next (for keyboard users)
    useEffect(() => {
        if (round.result) nextButtonRef.current?.focus();
    }, [round.result]);
    useEffect(() => {
        if (round.result || round.finished) return;
        // The Start / Resume button over the photo
        if (!round.started || paused) startButtonRef.current?.focus();
        else if (difficulty === "expert") typedInputRef.current?.focus();
        else firstOptionRef.current?.focus();
    }, [round.id, round.number, round.started, round.result, round.finished, difficulty, paused]);

    const { question, result } = round;
    const answer = question?.answer;
    // Photos answered so far this round (right, wrong or timed out)
    const answered = round.number - 1 + (result ? 1 : 0);
    const timedOut = result?.kind === "timeout";
    // "close" (one letter out in Expert) still counts as right
    const isRight = result && ["correct", "close"].includes(result.kind);
    // Added to the photo and answer line once answered: green or red
    const outcomeClass = result ? (isRight ? "is-correct" : "is-wrong") : "";
    const OutcomeIcon = isRight ? IconCircleCheckFilled : IconCircleXFilled;
    const difficultyLabel = level.label;
    const chosen = difficultyById(chosenDifficulty);
    // A different troop or difficulty has been picked but the round hasn't
    // restarted yet
    const waiting = chosenDifficulty !== difficulty || chosenTroop !== settings.troop;
    // e.g. "Hard mode: Multiple choice, 5 second timer · Goliath"
    const hint =
        chosen.description +
        (chosenTroop === "All Troops" ? "" : ` · ${chosenTroop}`) +
        (waiting ? ". Starts when you press New round." : "");
    // Photo blurred with a button over it: before Start, or when paused
    const photoCovered = !round.started || paused;

    function optionClass(name) {
        if (!result) return "Game-option";
        if (name === answer.name) return "Game-option is-correct";
        if (name === result.picked) return "Game-option is-wrong";
        return "Game-option";
    }

    function feedback() {
        if (!result) return "";
        const who = `${answer.name} from ${answer.troop}`;
        switch (result.kind) {
            case "correct":
                return `Correct! It's ${who}.`;
            case "close":
                return `Close enough! It's spelled ${answer.name}, from ${answer.troop}.`;
            case "timeout":
                return `Time's up! It's ${who}.`;
            default:
                return `Not quite. It's ${who}.`;
        }
    }

    return (
        // data-level: colours parts of the page for the difficulty being played
        <div className="Game" data-level={difficulty}>
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
                    value={chosenTroop}
                    onChange={(e) => setChosenTroop(e.target.value)}
                >
                    {groupsArr.map((g) => (
                        <option key={g} value={g}>
                            {g}
                        </option>
                    ))}
                </select>
                <div
                    className="Game-difficulty"
                    role="radiogroup"
                    aria-label="Difficulty"
                >
                    {DIFFICULTIES.map((d) => (
                        <button
                            key={d.id}
                            type="button"
                            role="radio"
                            data-level={d.id}
                            aria-checked={chosenDifficulty === d.id}
                            title={d.description}
                            onClick={() => setChosenDifficulty(d.id)}
                        >
                            {d.label}
                        </button>
                    ))}
                </div>
                <button
                    type="button"
                    className={waiting ? "Game-newRound is-waiting" : "Game-newRound"}
                    data-level={chosenDifficulty}
                    onClick={() => changeSettings({})}
                >
                    New round
                </button>
            </div>
            <p className="Game-hint" data-level={chosenDifficulty}>
                {hint}
            </p>

            {!question ? (
                <p className="Game-empty">No monkey photos for this troop yet.</p>
            ) : round.finished ? (
                <div className="Game-end">
                    <p className="Game-end-mode">
                        {difficultyLabel} mode
                        {settings.troop === "All Troops" ? "" : ` · ${settings.troop}`}
                    </p>
                    <p className="Game-end-message">
                        {resultMessage(round.score, round.length, difficulty)}
                    </p>
                    <h2
                        className="Game-end-score"
                        aria-label={`You scored ${round.score} out of ${round.length}`}
                    >
                        <span className="Game-end-score-value">{round.score}</span>
                        <span className="Game-end-score-total">/ {round.length}</span>
                    </h2>
                    {round.newBest && (
                        <p className="Game-end-newBest">New best!</p>
                    )}
                    <dl className="Game-end-stats">
                        <div>
                            <dt>Average answer time</dt>
                            <dd>{averageSeconds(round.times)} seconds</dd>
                        </div>
                        <div>
                            <dt>Your best on {difficultyLabel}</dt>
                            <dd>
                                {best} / {round.length}
                            </dd>
                        </div>
                    </dl>
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
                        {level.seconds && (
                            <p
                                className={
                                    timedOut
                                        ? "Game-timer is-timeout"
                                        : secondsLeft <= 2
                                          ? "Game-timer is-low"
                                          : "Game-timer"
                                }
                                role="timer"
                                aria-label={
                                    timedOut
                                        ? "Time's up"
                                        : `${secondsLeft} seconds left`
                                }
                            >
                                {/* key: a new element each second, so the pulse replays */}
                                <span
                                    key={timedOut ? "timeout" : secondsLeft}
                                    className={
                                        timerRunning || timedOut
                                            ? "Game-timer-value pulse"
                                            : "Game-timer-value"
                                    }
                                >
                                    {timedOut ? "Time's up!" : secondsLeft}
                                </span>
                            </p>
                        )}
                        <p
                            className="Game-score"
                            aria-label={`Score: ${round.score} out of ${answered}`}
                        >
                            <span className="Game-score-label">Score</span>
                            <span className="Game-score-row">
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
                                {/* How many photos have been answered so far */}
                                <span className="Game-score-total">
                                    / {answered}
                                </span>
                            </span>
                        </p>
                    </div>

                    <div
                        className={`Game-photo ${outcomeClass} ${
                            photoCovered ? "is-waiting" : ""
                        }`}
                    >
                        {/* Alt text mustn't give away the name */}
                        <img
                            src={question.photo}
                            alt="Mystery monkey"
                            onLoad={handlePhotoShown}
                            onError={handlePhotoShown}
                        />
                        {photoCovered && (
                            <button
                                type="button"
                                className="Game-start"
                                ref={startButtonRef}
                                onClick={paused ? resume : start}
                            >
                                {paused ? "Resume" : "Start"}
                            </button>
                        )}
                    </div>

                    {difficulty === "expert" ? (
                        <form className="Game-typed" onSubmit={submitTyped}>
                            <input
                                ref={typedInputRef}
                                type="text"
                                aria-label="Monkey's name"
                                placeholder={
                                    round.started
                                        ? "Type the monkey's name"
                                        : "Press Start when you're ready"
                                }
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                disabled={!round.started || paused || Boolean(result)}
                                className={outcomeClass}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                            <button
                                type="submit"
                                disabled={paused || Boolean(result) || !typed.trim()}
                            >
                                Guess
                            </button>
                        </form>
                    ) : (
                        <div className="Game-options">
                            {question.options.map((name, i) => (
                                <button
                                    key={name}
                                    ref={i === 0 ? firstOptionRef : null}
                                    type="button"
                                    className={optionClass(name)}
                                    onClick={() => choose(name)}
                                    disabled={!round.started || paused || Boolean(result)}
                                >
                                    <span className="Game-key" aria-hidden="true">
                                        {i + 1}
                                    </span>
                                    {/* Names stay hidden until Start, so no head start */}
                                    {round.started ? name : "?"}
                                    {result && name === answer.name && (
                                        <IconCheck
                                            className="Game-option-icon"
                                            stroke={3}
                                            aria-hidden="true"
                                        />
                                    )}
                                    {result &&
                                        name === result.picked &&
                                        name !== answer.name && (
                                            <IconX
                                                className="Game-option-icon"
                                                stroke={3}
                                                aria-hidden="true"
                                            />
                                        )}
                                </button>
                            ))}
                        </div>
                    )}

                    <p className={`Game-feedback ${outcomeClass}`} role="status">
                        {result && (
                            <OutcomeIcon className="Game-feedback-icon" aria-hidden="true" />
                        )}
                        <span>{feedback()}</span>
                        {result && (
                            <OutcomeIcon className="Game-feedback-icon" aria-hidden="true" />
                        )}
                    </p>

                    {result && (
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
