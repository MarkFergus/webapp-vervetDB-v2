import { useEffect, useMemo, useRef, useState } from "react";
import {
    IconCheck,
    IconCircleCheckFilled,
    IconCircleXFilled,
    IconDownload,
    IconShare,
    IconX,
} from "@tabler/icons-react";
import { BUILT_IN_DATA } from "./monkeyData";
import MonkeyIcon from "./MonkeyIcon";
import { drawResultImage } from "./resultImage";
import { downloadBlob } from "./canvasHelpers";
import {
    averageSeconds,
    checkTypedAnswer,
    DIFFICULTIES,
    difficultyById,
    makeQuestion,
    modeLabel,
    playableMonkeys,
    QUESTIONS_PER_ROUND,
    resultMessage,
    ROUND_LENGTHS,
    shareText,
} from "./gameLogic";
import "./Game.css";

// Best score for each set-up (troops, difficulty and round length),
// remembered in this browser only. Keys match the ones used before the setup
// screen, so earlier best scores aren't lost: one troop or all troops, and
// Normal has no difficulty on the end.
function bestKey({ troops, difficulty, length }) {
    const which = troops.length ? [...troops].sort().join("+") : "All Troops";
    const base = `vervetdb-game-best:${which}`;
    const key = difficulty === "normal" ? base : `${base}:${difficulty}`;
    return length === "all" ? `${key}:all` : key;
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

// The set-up last played, so returning players carry on where they left off
// (this browser only).
//   troops:     chosen troop names ([] = all troops)
//   difficulty: "normal" | "hard" | "expert"
//   length:     "ten" | "all"
const SETTINGS_KEY = "vervetdb-game-settings";
const DEFAULT_SETTINGS = { troops: [], difficulty: "normal", length: "ten" };
function loadSettings(troopNames) {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) ?? {};
        // Saved before the setup screen: one troop, as "troop"
        const troops = Array.isArray(saved.troops) ? saved.troops : [saved.troop];
        return {
            // Anything out of date is dropped, e.g. a troop since renamed
            troops: troops.filter((t) => troopNames.includes(t)),
            difficulty: difficultyById(saved.difficulty) ? saved.difficulty : "normal",
            length: ROUND_LENGTHS.some((l) => l.id === saved.length) ? saved.length : "ten",
        };
    } catch {
        // storage unavailable or unreadable: use the defaults
        return DEFAULT_SETTINGS;
    }
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
function questionSettings({ troops, difficulty }) {
    return { troops, sameSex: difficultyById(difficulty).sameSexChoices };
}

// Photos in a round with these settings
function roundLength(monkeys, { troops, length }) {
    const available = playableMonkeys(monkeys, troops).length;
    return length === "all" ? available : Math.min(QUESTIONS_PER_ROUND, available);
}

function preload(question) {
    if (question) new Image().src = question.photo;
}

let nextRoundId = 1;

// monkeys / troops: the data to play with (from the database, via App).
// Defaults to the built-in copy, e.g. in tests.
function Game({ monkeys = BUILT_IN_DATA.monkeys, troops = BUILT_IN_DATA.troops }) {
    const troopNames = troops.filter((t) => t !== "All Troops");
    // "setup" (choosing troops, difficulty and round length) or "playing"
    const [stage, setStage] = useState("setup");
    // settings: what the current round is played with; draft: what's being
    // chosen on the setup screen (used when Start is pressed)
    const [settings, setSettings] = useState(() => loadSettings(troopNames));
    const [draft, setDraft] = useState(settings);
    // The round being played (null until the first Start)
    const [round, setRound] = useState(null);
    const [best, setBest] = useState(0);
    // Paused because the page was hidden (another app, tab or a phone call)
    const [paused, setPaused] = useState(false);
    const pausedAt = useRef(null);
    // After pressing Share on a computer: "copied" or "failed"
    const [shareStatus, setShareStatus] = useState(null);
    // The results as a picture (a PNG File), made when the round ends so
    // Share and Save image respond straight away
    const [resultImage, setResultImage] = useState(null);
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
    const setupStartRef = useRef(null);
    const scoreboardRef = useRef(null);
    // When the current photo appeared, for timing answers
    const photoShownAt = useRef(Date.now());

    const { difficulty } = settings;
    const level = difficultyById(difficulty);

    // A 10-photo round is shorter if the troops have fewer photos than that
    function newRound(s) {
        const question = makeQuestion(monkeys, questionSettings(s));
        return {
            id: nextRoundId++,
            length: roundLength(monkeys, s),
            number: 1,
            score: 0,
            // Right answers in a row, and the most this round
            streak: 0,
            bestStreak: 0,
            // Seconds taken on each photo answered
            times: [],
            // "right" | "wrong" | "timeout" for each photo, for sharing
            outcomes: [],
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

    // The clock starts once the photo has loaded
    function handlePhotoShown() {
        photoShownAt.current = Date.now();
        setPhotoReady(true);
    }

    function resume() {
        if (!paused) return;
        // Time spent away doesn't count towards the answer time
        photoShownAt.current += Date.now() - pausedAt.current;
        setPaused(false);
    }

    // Starts a round: from the setup screen, or Play again with the same settings
    function startRound(s) {
        setSettings(s);
        saveSettings(s);
        setRound(newRound(s));
        setBest(loadBest(s));
        setPaused(false);
        setShareStatus(null);
        resetForNewPhoto(s.difficulty);
        setStage("playing");
    }

    // Back to the setup screen, with the current settings chosen
    function changeSetup() {
        setDraft(settings);
        setPaused(false);
        setStage("setup");
    }

    // Setup screen: tapping a troop adds or removes it; "All troops" clears
    // the choice (no troops chosen = all of them)
    function toggleTroop(name) {
        const chosen = draft.troops.includes(name)
            ? draft.troops.filter((t) => t !== name)
            : [...draft.troops, name];
        // Kept in the troop list's order, so labels read the same way each time
        setDraft({ ...draft, troops: troopNames.filter((t) => chosen.includes(t)) });
    }

    // Phones open their share menu with the picture and the text (or just the
    // text if they can't share pictures); computers copy the text, ready to
    // paste into a message
    async function shareResult() {
        const text = shareText({
            score: round.score,
            outOf: round.length,
            difficulty,
            troops: settings.troops,
            averageSeconds: averageSeconds(round.times),
            outcomes: round.outcomes,
            url: `${window.location.origin}${window.location.pathname}#game`,
        });
        const files = resultImage ? [resultImage] : [];
        if (files.length && navigator.canShare?.({ files })) {
            try {
                await navigator.share({ files, text });
                return;
            } catch (err) {
                if (err.name === "AbortError") return; // closed the share menu
                // Couldn't share the picture: try the text on its own
            }
        }
        if (navigator.share) {
            try {
                await navigator.share({ text });
                return;
            } catch (err) {
                if (err.name === "AbortError") return; // closed the share menu
                // Share menu unavailable: fall back to copying
            }
        }
        try {
            await navigator.clipboard.writeText(text);
            setShareStatus("copied");
        } catch {
            setShareStatus("failed");
        }
    }

    // Downloads the results picture
    function saveImage() {
        if (resultImage) downloadBlob(resultImage, resultImage.name);
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
                ? makeQuestion(monkeys, {
                      ...questionSettings(settings),
                      exclude: round.asked,
                  })
                : null;
        preload(upcoming);
        const streak = scored ? round.streak + 1 : 0;
        setRound({
            ...round,
            result,
            score: round.score + (scored ? 1 : 0),
            streak,
            bestStreak: Math.max(round.bestStreak, streak),
            times: [...round.times, timeTaken],
            outcomes: [
                ...round.outcomes,
                scored ? "right" : result.kind === "timeout" ? "timeout" : "wrong",
            ],
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

    const playing = stage === "playing" && round !== null;
    // A photo is being answered right now (not answered yet)
    const inPlay = playing && !round.result && !round.finished;
    // Answers can be given: in play, not paused, and the photo has loaded (so
    // nobody answers while still looking at the previous photo)
    const answerable = inPlay && !paused && photoReady;

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

    // Keyboard: Enter or Space to resume, 1–4 to answer (not in Expert),
    // Enter for the next photo
    useEffect(() => {
        function handleKeyDown(event) {
            if (["SELECT", "INPUT"].includes(event.target.tagName)) return;
            if (!playing || round.finished || !round.question) return;
            if (paused) {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    resume();
                }
                return;
            }
            const index = Number(event.key) - 1;
            if (
                answerable &&
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

    // Move focus to what you'll want next (for keyboard users).
    // preventScroll: moving focus mustn't scroll the photo out of view on phones
    const focusOn = (ref) => ref.current?.focus({ preventScroll: true });
    useEffect(() => {
        if (!playing || !round.result) return;
        focusOn(nextButtonRef);
        // Safety net for very short windows: if Next is below the bottom
        // edge, scroll just enough to show it
        const button = nextButtonRef.current;
        if (button && button.getBoundingClientRect().bottom > window.innerHeight) {
            button.scrollIntoView?.({ block: "nearest" });
        }
    }, [round?.result]);
    useEffect(() => {
        if (!playing || round.result || round.finished) return;
        // The Resume button over the photo
        if (paused) focusOn(startButtonRef);
        else if (!photoReady) return; // answers are locked until the photo shows
        else if (difficulty === "expert") focusOn(typedInputRef);
        else focusOn(firstOptionRef);
    }, [stage, round?.id, round?.number, round?.result, round?.finished, difficulty, paused, photoReady]);
    // Setup screen: Start is ready to press
    useEffect(() => {
        if (stage === "setup") focusOn(setupStartRef);
    }, [stage]);

    // New photo: if the top of the game has scrolled out of view (on a phone
    // the browser bar can cover it), bring it back so the whole photo shows
    useEffect(() => {
        const board = scoreboardRef.current;
        if (!board || !round || round.number === 1) return;
        if (board.getBoundingClientRect().top < 0) {
            const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            board.scrollIntoView?.({ block: "start", behavior: reduceMotion ? "auto" : "smooth" });
        }
    }, [round?.number]);

    // The round has ended: draw the results picture, ready to share or save
    const finished = playing && round.finished;
    useEffect(() => {
        setResultImage(null);
        if (!finished) return;
        let cancelled = false;
        drawResultImage({
            mode: modeLabel(settings.difficulty, settings.troops),
            difficulty: settings.difficulty,
            message: resultMessage(round.score, round.length, settings.difficulty),
            score: round.score,
            outOf: round.length,
            averageSeconds: averageSeconds(round.times),
            bestStreak: settings.length === "all" ? round.bestStreak : null,
            outcomes: round.outcomes,
            site: window.location.host,
        })
            .then((blob) => {
                if (cancelled) return;
                setResultImage(new File([blob], "vervetdb-monkey-guesser.png", { type: "image/png" }));
            })
            // No picture (e.g. a very old browser): Share still sends the text
            .catch((err) => console.error("Couldn't make the results picture:", err));
        return () => {
            cancelled = true;
        };
    }, [finished, round?.id]);

    // Photos with monkeys to guess, per troop, for the setup screen
    const photosPerTroop = useMemo(() => {
        const counts = {};
        for (const m of playableMonkeys(monkeys)) counts[m.troop] = (counts[m.troop] ?? 0) + 1;
        return counts;
    }, [monkeys]);

    const header = (
        <header className="Game-header">
            <a href="#" className="Game-home">
                <MonkeyIcon color="currentColor" />
                <span className="Game-home-title">vervetDB</span>
            </a>
            <a href="#" className="Game-back">
                ← Back to monkeys
            </a>
        </header>
    );

    if (stage === "setup" || !round) {
        const draftLevel = difficultyById(draft.difficulty);
        const draftPhotos = roundLength(monkeys, draft);
        const draftBest = loadBest(draft);
        const available = playableMonkeys(monkeys, draft.troops).length;
        return (
            <div className="Game" data-level={draft.difficulty}>
                {header}
                <h1 className="Game-title">Monkey Guesser</h1>
                <p className="Game-intro">
                    Choose your troops and difficulty below, then press Start.
                </p>

                <div className="Game-setup">
                    <fieldset className="Game-setup-section">
                        <legend>
                            Troops
                            <span className="Game-setup-count">
                                {draft.troops.length ? "" : "All · "}
                                {available} {available === 1 ? "monkey" : "monkeys"}
                            </span>
                        </legend>
                        <div className="Game-chips">
                            <button
                                type="button"
                                className="Game-chip is-all"
                                aria-pressed={draft.troops.length === 0}
                                onClick={() => setDraft({ ...draft, troops: [] })}
                            >
                                All troops
                            </button>
                            {troopNames.map((name) => (
                                <button
                                    key={name}
                                    type="button"
                                    className="Game-chip"
                                    aria-pressed={draft.troops.includes(name)}
                                    onClick={() => toggleTroop(name)}
                                    // No photos yet: nothing to guess
                                    disabled={!photosPerTroop[name]}
                                >
                                    {name}
                                    <small aria-hidden="true">{photosPerTroop[name] ?? 0}</small>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="Game-setup-section">
                        <legend>Difficulty</legend>
                        <div className="Game-cards is-three" role="radiogroup" aria-label="Difficulty">
                            {DIFFICULTIES.map((d) => (
                                <button
                                    key={d.id}
                                    type="button"
                                    role="radio"
                                    className="Game-card"
                                    data-level={d.id}
                                    aria-checked={draft.difficulty === d.id}
                                    aria-label={d.label}
                                    aria-describedby={`Game-level-${d.id}`}
                                    onClick={() => setDraft({ ...draft, difficulty: d.id })}
                                >
                                    <b>{d.label}</b>
                                    <span id={`Game-level-${d.id}`}>
                                        {d.answer}
                                        <br />
                                        {d.seconds} second timer
                                    </span>
                                </button>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset className="Game-setup-section">
                        <legend>Round</legend>
                        <div className="Game-cards" role="radiogroup" aria-label="Round">
                            {ROUND_LENGTHS.map((l) => {
                                // "All 44 photos": how many the chosen troops have
                                const label = l.id === "all" ? `All ${available} photos` : l.label;
                                return (
                                    <button
                                        key={l.id}
                                        type="button"
                                        role="radio"
                                        className="Game-card is-round"
                                        aria-checked={draft.length === l.id}
                                        aria-label={label}
                                        aria-describedby={`Game-length-${l.id}`}
                                        onClick={() => setDraft({ ...draft, length: l.id })}
                                    >
                                        <b>{label}</b>
                                        <span id={`Game-length-${l.id}`}>{l.description}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    {available === 0 && (
                        <p className="Game-empty">No monkey photos for these troops yet.</p>
                    )}
                    <button
                        type="button"
                        className="Game-setup-start"
                        data-level={draftLevel.id}
                        ref={setupStartRef}
                        onClick={() => startRound(draft)}
                        disabled={available === 0}
                    >
                        Start
                    </button>
                    {draftBest > 0 && (
                        <p className="Game-setup-best">
                            Your best here: <b>{draftBest} / {draftPhotos}</b>
                        </p>
                    )}
                </div>
            </div>
        );
    }

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
    // e.g. "Hard mode · Lankora + Skunkey"
    const mode = modeLabel(difficulty, settings.troops);
    const allPhotos = settings.length === "all";
    // Photo blurred with Resume over it while paused
    const photoCovered = paused;
    // The photo is still downloading: show "Loading photo…"
    const photoLoading = !paused && !photoReady && !result;

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
            {header}

            {/* What's being played, like the results screen's heading */}
            {!round.finished && (
                <div className="Game-summary">
                    <p className="Game-mode">{mode}</p>
                    <button type="button" className="Game-change" onClick={changeSetup}>
                        Change settings
                    </button>
                </div>
            )}

            {!question ? (
                <p className="Game-empty">No monkey photos for this troop yet.</p>
            ) : round.finished ? (
                <div className="Game-end">
                    <p className="Game-mode">{mode}</p>
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
                        {allPhotos && (
                            <div>
                                <dt>Longest streak</dt>
                                <dd>{round.bestStreak} in a row</dd>
                            </div>
                        )}
                    </dl>
                    <div className="Game-end-actions">
                        <button
                            type="button"
                            className="Game-next"
                            onClick={() => startRound(settings)}
                            autoFocus
                        >
                            Play again
                        </button>
                        <button type="button" className="Game-next" onClick={changeSetup}>
                            Change settings
                        </button>
                        <button
                            type="button"
                            className="Game-share"
                            onClick={shareResult}
                        >
                            <IconShare aria-hidden="true" />
                            {shareStatus === "copied" ? "Copied!" : "Share"}
                        </button>
                        <button
                            type="button"
                            className="Game-share is-quiet"
                            onClick={saveImage}
                            disabled={!resultImage}
                        >
                            <IconDownload aria-hidden="true" />
                            Save image
                        </button>
                    </div>
                    <p className="Game-share-status" role="status">
                        {shareStatus === "copied" &&
                            "Copied! Paste it into a message to challenge your friends."}
                        {shareStatus === "failed" &&
                            "Sorry, your browser wouldn't let us copy it."}
                    </p>
                </div>
            ) : (
                <>
                    <div className="Game-scoreboard" ref={scoreboardRef}>
                        <p className="Game-progress">
                            Photo {round.number} of {round.length}
                            {/* All photos: right answers in a row */}
                            {allPhotos && round.streak >= 2 && (
                                <span className="Game-streak">🔥 {round.streak} in a row</span>
                            )}
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
                        } ${photoLoading ? "is-loading" : ""}`}
                    >
                        {/* Alt text mustn't give away the name.
                            key: a fresh <img> for each photo, so the previous
                            photo disappears straight away instead of lingering
                            while the next one downloads */}
                        <img
                            key={question.photo}
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
                                onClick={resume}
                            >
                                Resume
                            </button>
                        )}
                        {photoLoading && (
                            <p className="Game-loading" aria-live="polite">
                                Loading photo…
                            </p>
                        )}
                    </div>

                    {difficulty === "expert" ? (
                        <form className="Game-typed" onSubmit={submitTyped}>
                            <input
                                ref={typedInputRef}
                                type="text"
                                aria-label="Monkey's name"
                                placeholder="Type the monkey's name"
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                disabled={!answerable}
                                className={outcomeClass}
                                autoComplete="off"
                                autoCorrect="off"
                                autoCapitalize="off"
                                spellCheck={false}
                            />
                            <button
                                type="submit"
                                disabled={!answerable || !typed.trim()}
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
                                    disabled={!answerable}
                                >
                                    <span className="Game-key" aria-hidden="true">
                                        {i + 1}
                                    </span>
                                    {/* Names stay hidden until the photo has loaded:
                                        no head start */}
                                    {answerable || result ? name : "?"}
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
