import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import Game from "./Game";
import monkeysArr from "./monkeysArr";

// The simulated browser never downloads images, and the game locks the
// answers until the photo has loaded. So each game photo "finishes loading"
// as soon as it appears. Tests using fake timers are left alone: they load
// photos by hand (fireEvent.load) to control exactly when it happens.
let photoLoader;
beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
    photoLoader = new MutationObserver((changes) => {
        if (vi.isFakeTimers()) return;
        for (const change of changes) {
            for (const node of change.addedNodes) {
                const imgs = node.querySelectorAll?.("img[alt='Mystery monkey']") ?? [];
                const all = node.matches?.("img[alt='Mystery monkey']") ? [node] : [...imgs];
                all.forEach((img) => act(() => img.dispatchEvent(new Event("load"))));
            }
        }
    });
    photoLoader.observe(document.body, { childList: true, subtree: true });
});
afterEach(() => photoLoader.disconnect());

// The right answer is the monkey whose photos include the one on screen
function rightAnswer() {
    const src = screen.getByAltText("Mystery monkey").getAttribute("src");
    return monkeysArr.find((m) => m.img.includes(src)).name;
}
// The "Your best on …" figure on the results screen
const bestStat = (level) =>
    screen.getByText(`Your best on ${level}`).nextElementSibling;
const applyButton = () => screen.getByRole("button", { name: "Apply" });
const startButton = () => screen.getByRole("button", { name: "Start" });

function optionButtons() {
    return within(document.querySelector(".Game-options")).getAllByRole("button");
}
function optionFor(name) {
    return optionButtons().find((b) => b.textContent.endsWith(name));
}

test("the Game button in the nav opens the game, and Back returns", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("link", { name: "Guess the monkey game" }));
    expect(
        await screen.findByRole("heading", { name: "Guess the Monkey" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "← Back to monkeys" }));
    expect(
        await screen.findByRole("textbox", { name: "Search by name or chip number" })
    ).toBeInTheDocument();
});

test("the photo's alt text doesn't give the answer away", () => {
    render(<Game />);
    expect(screen.getByAltText("Mystery monkey")).toBeInTheDocument();
    expect(optionButtons()).toHaveLength(4);
});

test("a right answer scores a point and says so", async () => {
    const user = userEvent.setup();
    render(<Game />);
    await user.click(startButton());
    const name = rightAnswer();
    await user.click(optionFor(name));

    expect(screen.getByRole("status")).toHaveTextContent(`Correct! It's ${name}`);
    expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");
    expect(optionFor(name)).toHaveClass("is-correct");
});

test("a wrong answer shows the right one", async () => {
    const user = userEvent.setup();
    render(<Game />);
    await user.click(startButton());
    const name = rightAnswer();
    const wrong = optionButtons().find((b) => !b.textContent.endsWith(name));
    await user.click(wrong);

    expect(screen.getByRole("status")).toHaveTextContent(`Not quite. It's ${name}`);
    expect(wrong).toHaveClass("is-wrong");
    expect(optionFor(name)).toHaveClass("is-correct");
    expect(document.querySelector(".Game-score")).toHaveTextContent("Score0");
});

test("a full round with the keyboard: 10/10 is saved as the best score", async () => {
    const user = userEvent.setup();
    render(<Game />);
    expect(startButton()).toHaveFocus();
    await user.keyboard("{Enter}"); // Start
    for (let i = 0; i < 10; i++) {
        const key = optionButtons().findIndex((b) => b.textContent.endsWith(rightAnswer())) + 1;
        await user.keyboard(String(key));
        await user.keyboard("{Enter}");
    }
    expect(
        screen.getByRole("heading", { name: "You scored 10 out of 10" })
    ).toBeInTheDocument();
    expect(bestStat("Normal")).toHaveTextContent("10 / 10");

    await user.click(screen.getByRole("button", { name: "Play again" }));
    expect(screen.getByText(/Photo 1 of 10/)).toBeInTheDocument();
});

test("practising a small troop gives a shorter round", async () => {
    const user = userEvent.setup();
    render(<Game />);
    await user.selectOptions(
        screen.getByRole("combobox", { name: "Troop to play" }),
        "Jalamango"
    );
    await user.click(applyButton());
    const photos = monkeysArr.filter(
        (m) => m.troop === "Jalamango" && m.img.some((u) => !u.includes("blank-image"))
    ).length;
    expect(screen.getByText(`Photo 1 of ${Math.min(10, photos)}`, { exact: false })).toBeInTheDocument();
});

describe("difficulty", () => {
    const difficulty = (name) => screen.getByRole("radio", { name });
    const photo = () => screen.getByAltText("Mystery monkey");
    const timer = () => screen.queryByRole("timer");
    const tick = (seconds = 1) => {
        for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
    };
    afterEach(() => vi.useRealTimers());

    test("Normal is chosen to start with, with a generous 30 second timer", () => {
        render(<Game />);
        expect(difficulty("Normal")).toHaveAttribute("aria-checked", "true");
        expect(timer()).toHaveTextContent("30");
        expect(optionButtons()).toHaveLength(4);
    });

    test("Hard: the 5 second timer only starts once the photo has loaded", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(difficulty("Hard"));
        fireEvent.click(applyButton());
        fireEvent.click(startButton());
        expect(timer()).toHaveTextContent("5");

        tick(3); // photo still loading: no countdown yet
        expect(timer()).toHaveTextContent("5");

        fireEvent.load(photo());
        tick();
        expect(timer()).toHaveTextContent("4");
        expect(timer()).toHaveAccessibleName("4 seconds left");
    });

    test("Hard: when time runs out it's a miss and the answer is shown", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(difficulty("Hard"));
        fireEvent.click(applyButton());
        fireEvent.click(startButton());
        const name = rightAnswer();
        fireEvent.load(photo());
        tick(5);

        expect(screen.getByRole("status")).toHaveTextContent(`Time's up! It's ${name}`);
        // The timer itself turns into a red "Time's up!"
        expect(timer()).toHaveTextContent("Time's up!");
        expect(timer()).toHaveClass("is-timeout");
        expect(timer()).toHaveAccessibleName("Time's up");
        expect(optionFor(name)).toHaveClass("is-correct");
        expect(optionButtons().every((b) => b.disabled)).toBe(true);
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score0");
    });

    test("Hard: answering stops the timer, and the next photo starts at 5 again", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(difficulty("Hard"));
        fireEvent.click(applyButton());
        fireEvent.click(startButton());
        fireEvent.load(photo());
        tick(2);
        fireEvent.click(optionFor(rightAnswer()));
        tick(5);
        expect(timer()).toHaveTextContent("3");
        expect(screen.getByRole("status")).toHaveTextContent("Correct!");

        fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
        expect(timer()).toHaveTextContent("5");
    });

    test("Expert: type the name instead of choosing, spelling is forgiving", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(difficulty("Expert"));
        await user.click(applyButton());
        await user.click(startButton());
        expect(document.querySelector(".Game-options")).toBeNull();
        const input = screen.getByRole("textbox", { name: "Monkey's name" });
        expect(input).toHaveFocus();

        // Lower case and a stray space still count
        const name = rightAnswer();
        await user.type(input, ` ${name.toLowerCase()}{Enter}`);
        expect(screen.getByRole("status")).toHaveTextContent(`Correct! It's ${name}`);
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");

        await user.keyboard("{Enter}"); // next photo
        const input2 = screen.getByRole("textbox", { name: "Monkey's name" });
        expect(input2).toHaveValue("");
        expect(input2).toHaveFocus();
        await user.type(input2, "Definitely not a monkey{Enter}");
        expect(screen.getByRole("status")).toHaveTextContent(`Not quite. It's ${rightAnswer()}`);
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");
    });

    test("Expert: number keys type into the box rather than answering", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(difficulty("Expert"));
        await user.click(applyButton());
        await user.click(startButton());
        await user.keyboard("1");
        expect(screen.getByRole("textbox", { name: "Monkey's name" })).toHaveValue("1");
        expect(screen.getByRole("status")).toHaveTextContent("");
    });

    test("best scores are kept separately for each difficulty", async () => {
        localStorage.setItem("vervetdb-game-best:All Troops", "7");
        localStorage.setItem("vervetdb-game-best:All Troops:hard", "4");
        const user = userEvent.setup();
        render(<Game />);
        await user.click(difficulty("Hard"));
        await user.click(applyButton());
        await user.click(startButton());
        // Play a round quickly by always choosing the right answer
        for (let i = 0; i < 10; i++) {
            await user.click(optionFor(rightAnswer()));
            await user.keyboard("{Enter}");
        }
        expect(bestStat("Hard")).toHaveTextContent("10 / 10");
        expect(localStorage.getItem("vervetdb-game-best:All Troops")).toBe("7");
    });
});

describe("right / wrong indicators", () => {
    const photoBox = () => document.querySelector(".Game-photo");
    const icons = (el) => el.querySelectorAll("svg").length;

    test("a right answer: green banner with ticks, green photo border, tick on the button", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(startButton());
        const name = rightAnswer();
        expect(screen.getByRole("status")).not.toHaveClass("is-correct");
        expect(photoBox()).not.toHaveClass("is-correct");

        await user.click(optionFor(name));
        expect(screen.getByRole("status")).toHaveClass("is-correct");
        expect(icons(screen.getByRole("status"))).toBe(2);
        expect(photoBox()).toHaveClass("is-correct");
        expect(icons(optionFor(name))).toBe(1);
        // Only the right answer gets an icon
        expect(optionButtons().filter((b) => icons(b) > 0)).toHaveLength(1);
    });

    test("a wrong answer: red banner and border, cross on your pick, tick on the right one", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(startButton());
        const name = rightAnswer();
        const wrong = optionButtons().find((b) => !b.textContent.endsWith(name));
        await user.click(wrong);

        expect(screen.getByRole("status")).toHaveClass("is-wrong");
        expect(photoBox()).toHaveClass("is-wrong");
        expect(icons(wrong)).toBe(1);
        expect(icons(optionFor(name))).toBe(1);
        expect(optionButtons().filter((b) => icons(b) > 0)).toHaveLength(2);
    });

    test("Expert: 'close enough' shows as right (green)", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(screen.getByRole("radio", { name: "Expert" }));
        await user.click(applyButton());
        await user.click(startButton());
        // Skip ahead to a name long enough for a one-letter slip to count
        let name = rightAnswer();
        while (name.replace(/[^a-z]/gi, "").length < 4) {
            await user.type(screen.getByRole("textbox"), "x{Enter}");
            await user.keyboard("{Enter}");
            name = rightAnswer();
        }
        await user.type(screen.getByRole("textbox"), `${name.slice(0, -1)}{Enter}`);
        expect(screen.getByRole("status")).toHaveTextContent("Close enough!");
        expect(screen.getByRole("status")).toHaveClass("is-correct");
        expect(photoBox()).toHaveClass("is-correct");
    });
});

describe("changing difficulty waits for Apply", () => {
    test("the round in progress carries on until Apply is pressed", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(startButton());
        const name = rightAnswer();
        await user.click(optionFor(name)); // score a point in Normal

        await user.click(screen.getByRole("radio", { name: "Expert" }));
        // Still the same Normal round: choices, the score and the answer stay
        expect(screen.getByRole("radio", { name: "Expert" })).toHaveAttribute("aria-checked", "true");
        expect(document.querySelector(".Game-options")).not.toBeNull();
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");
        expect(screen.getByRole("status")).toHaveTextContent(`Correct! It's ${name}`);
        // ...and it's clear what to press
        expect(document.querySelector(".Game-hint")).toHaveTextContent(
            "Press Apply to use these settings"
        );
        expect(applyButton()).toHaveClass("is-waiting");

        await user.click(applyButton());
        expect(screen.getByRole("textbox", { name: "Monkey's name" })).toBeInTheDocument();
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score0");
        expect(applyButton()).not.toHaveClass("is-waiting");
        expect(document.querySelector(".Game-hint")).toHaveTextContent("Type the name");
    });

    test("each level has its own colour", async () => {
        const user = userEvent.setup();
        render(<Game />);
        expect(document.querySelector(".Game")).toHaveAttribute("data-level", "normal");
        await user.click(screen.getByRole("radio", { name: "Hard" }));
        await user.click(applyButton());
        expect(document.querySelector(".Game")).toHaveAttribute("data-level", "hard");
        expect(screen.getByRole("radio", { name: "Hard" })).toHaveAttribute("data-level", "hard");
    });
});

describe("Expert timer", () => {
    afterEach(() => vi.useRealTimers());
    const tick = (seconds = 1) => {
        for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
    };

    test("Expert gives 14 seconds to type, then it's a miss", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(screen.getByRole("radio", { name: "Expert" }));
        fireEvent.click(applyButton());
        fireEvent.click(startButton());
        const timer = () => screen.getByRole("timer");
        expect(timer()).toHaveTextContent("14");

        fireEvent.load(screen.getByAltText("Mystery monkey"));
        const input = screen.getByRole("textbox", { name: "Monkey's name" });
        fireEvent.change(input, { target: { value: "still thinking" } });
        tick(13);
        expect(timer()).toHaveTextContent("1");
        expect(input).not.toBeDisabled();

        tick();
        expect(screen.getByRole("status")).toHaveTextContent(`Time's up! It's ${rightAnswer()}`);
        expect(input).toBeDisabled();
        expect(input).toHaveClass("is-wrong");
    });

    test("the hint uses the same wording for every level", async () => {
        const user = userEvent.setup();
        render(<Game />);
        const hint = () => document.querySelector(".Game-hint");
        expect(hint()).toHaveTextContent("Normal mode: Multiple choice, 30 second timer");
        await user.click(screen.getByRole("radio", { name: "Hard" }));
        expect(hint()).toHaveTextContent(
            "Hard mode: Multiple choice, 5 second timer. Press Apply to use these settings."
        );
        await user.click(applyButton());
        expect(hint()).toHaveTextContent("Hard mode: Multiple choice, 5 second timer");
        expect(hint()).not.toHaveTextContent("Press Apply");
        expect(hint()).toHaveTextContent("Press Start to begin.");
    });
});

test("the score shows how many photos have been answered so far", async () => {
    const user = userEvent.setup();
    render(<Game />);
    const score = () => document.querySelector(".Game-score");
    const total = () => document.querySelector(".Game-score-total");
    expect(total()).toHaveTextContent("/ 0");
    await user.click(startButton());

    await user.click(optionFor(rightAnswer())); // right
    expect(total()).toHaveTextContent("/ 1");
    await user.keyboard("{Enter}");
    expect(total()).toHaveTextContent("/ 1"); // next photo, not answered yet

    const name = rightAnswer();
    await user.click(optionButtons().find((b) => !b.textContent.endsWith(name))); // wrong
    expect(total()).toHaveTextContent("/ 2");
    expect(score()).toHaveAccessibleName("Score: 1 out of 2");
});

describe("results screen", () => {
    afterEach(() => vi.useRealTimers());

    // Plays a full round with fake time: each photo "loads", then `secondsEach`
    // pass before answering (right or wrong)
    function playRound({ level, secondsEach, right = () => true, typed = false }) {
        vi.useFakeTimers();
        render(<Game />);
        if (level) {
            fireEvent.click(screen.getByRole("radio", { name: level }));
            fireEvent.click(applyButton());
        }
        // Waiting on the Start screen doesn't count towards answer times
        fireEvent.load(screen.getByAltText("Mystery monkey"));
        act(() => vi.advanceTimersByTime(20000));
        fireEvent.click(startButton());
        for (let i = 0; i < 10; i++) {
            fireEvent.load(screen.getByAltText("Mystery monkey"));
            act(() => vi.advanceTimersByTime(secondsEach * 1000));
            const name = rightAnswer();
            if (typed) {
                const input = screen.getByRole("textbox", { name: "Monkey's name" });
                fireEvent.change(input, { target: { value: right(i) ? name : "zzz" } });
                fireEvent.submit(input.closest("form"));
            } else {
                const wrong = optionButtons().find((b) => !b.textContent.endsWith(name));
                fireEvent.click(right(i) ? optionFor(name) : wrong);
            }
            fireEvent.click(
                screen.getByRole("button", { name: /Next photo|See your score/ })
            );
        }
    }

    test("10/10 on Expert: GODLIKE!, the big score, mode, average time and a new best", () => {
        playRound({ level: "Expert", secondsEach: 3, typed: true });

        expect(document.querySelector(".Game-end-mode")).toHaveTextContent("Expert mode");
        expect(document.querySelector(".Game-end-message")).toHaveTextContent("GODLIKE!");
        expect(
            screen.getByRole("heading", { name: "You scored 10 out of 10" })
        ).toHaveTextContent("10/ 10");
        expect(screen.getByText("New best!")).toBeInTheDocument();
        expect(screen.getByText("Average answer time").nextElementSibling).toHaveTextContent(
            "3.0 seconds"
        );
        expect(bestStat("Expert")).toHaveTextContent("10 / 10");
    });

    test("a lower score gets a different message and no 'New best!' if it's not a record", () => {
        localStorage.setItem("vervetdb-game-best:All Troops", "9");
        playRound({ secondsEach: 2, right: (i) => i < 6 }); // 6 right on Normal

        expect(document.querySelector(".Game-end-message")).toHaveTextContent("Good going!");
        expect(screen.getByRole("heading", { name: "You scored 6 out of 10" })).toBeInTheDocument();
        expect(screen.queryByText("New best!")).toBeNull();
        expect(bestStat("Normal")).toHaveTextContent("9 / 10");
        expect(screen.getByText("Average answer time").nextElementSibling).toHaveTextContent(
            "2.0 seconds"
        );
    });

    test("running out of time counts as the full time in the average", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(screen.getByRole("radio", { name: "Hard" }));
        fireEvent.click(applyButton());
        fireEvent.click(startButton());
        for (let i = 0; i < 10; i++) {
            fireEvent.load(screen.getByAltText("Mystery monkey"));
            for (let s = 0; s < 5; s++) act(() => vi.advanceTimersByTime(1000));
            fireEvent.click(
                screen.getByRole("button", { name: /Next photo|See your score/ })
            );
        }
        expect(document.querySelector(".Game-end-message")).toHaveTextContent(
            "The monkeys win this round!"
        );
        expect(screen.getByText("Average answer time").nextElementSibling).toHaveTextContent(
            "5.0 seconds"
        );
    });
});

describe("Start", () => {
    afterEach(() => vi.useRealTimers());

    test("before Start: photo blurred, names hidden, timer waits at full time", () => {
        vi.useFakeTimers();
        render(<Game />);
        const photoBox = document.querySelector(".Game-photo");
        expect(photoBox).toHaveClass("is-waiting");
        expect(startButton()).toBeInTheDocument();
        // No names to read yet, and nothing can be answered
        expect(optionButtons().map((b) => b.textContent)).toEqual(["1?", "2?", "3?", "4?"]);
        expect(optionButtons().every((b) => b.disabled)).toBe(true);

        fireEvent.load(screen.getByAltText("Mystery monkey"));
        act(() => vi.advanceTimersByTime(5000));
        expect(screen.getByRole("timer")).toHaveTextContent("30");

        fireEvent.click(startButton());
        expect(photoBox).not.toHaveClass("is-waiting");
        expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
        expect(optionButtons().some((b) => b.textContent === "1?")).toBe(false);
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("timer")).toHaveTextContent("29");
    });

    test("Space starts too, and only the first photo of a round needs Start", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.keyboard(" ");
        await user.click(optionFor(rightAnswer()));
        await user.keyboard("{Enter}"); // next photo
        expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
        expect(optionButtons()[0]).not.toBeDisabled();

        // Applying new settings brings back Start, ready to press
        await user.click(screen.getByRole("radio", { name: "Hard" }));
        await user.click(applyButton());
        expect(startButton()).toHaveFocus();
    });

    test("Apply is only available when the troop or difficulty has changed", async () => {
        const user = userEvent.setup();
        render(<Game />);
        const hint = () => document.querySelector(".Game-hint");
        expect(applyButton()).toBeDisabled();
        expect(hint()).toHaveTextContent("Normal mode: Multiple choice, 30 second timer. Press Start to begin.");

        await user.click(screen.getByRole("radio", { name: "Expert" }));
        expect(applyButton()).not.toBeDisabled();
        expect(hint()).toHaveTextContent(
            "Expert mode: Type the name, 14 second timer. Press Apply to use these settings."
        );

        // Changing back to what's being played: nothing to apply again
        await user.click(screen.getByRole("radio", { name: "Normal" }));
        expect(applyButton()).toBeDisabled();

        // Mid-round, with nothing changed, the hint is just the description
        await user.click(startButton());
        expect(hint()).toHaveTextContent(/^Normal mode: Multiple choice, 30 second timer$/);
    });

    test("Expert: the text box waits for Start", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(screen.getByRole("radio", { name: "Expert" }));
        await user.click(applyButton());
        const input = screen.getByRole("textbox", { name: "Monkey's name" });
        expect(input).toBeDisabled();
        expect(input).toHaveAttribute("placeholder", "Press Start when you're ready");

        await user.click(startButton());
        expect(input).not.toBeDisabled();
        expect(input).toHaveFocus();
    });
});

test("Hard shows only names of the same sex as the monkey in the photo", async () => {
    const user = userEvent.setup();
    render(<Game />);
    await user.click(screen.getByRole("radio", { name: "Hard" }));
    await user.click(applyButton());
    await user.click(startButton());
    const sexesOf = (name) => new Set(monkeysArr.filter((m) => m.name === name).map((m) => m.sex));
    // Check every photo in the round
    for (let i = 0; i < 10; i++) {
        const answer = monkeysArr.find((m) =>
            m.img.includes(screen.getByAltText("Mystery monkey").getAttribute("src"))
        );
        if (answer.sex) {
            for (const b of optionButtons()) {
                expect(sexesOf(b.textContent.slice(1)).has(answer.sex)).toBe(true);
            }
        }
        await user.click(optionFor(answer.name));
        await user.keyboard("{Enter}");
    }
});

describe("quality of life", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Pretend the page was hidden (switched app/tab) or shown again
    function setPageHidden(hidden) {
        Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
        act(() => document.dispatchEvent(new Event("visibilitychange")));
    }
    afterEach(() => {
        delete document.hidden;
    });

    test("leaving the page pauses the photo; Resume carries on where you were", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.load(screen.getByAltText("Mystery monkey"));
        fireEvent.click(startButton());
        act(() => vi.advanceTimersByTime(1000));
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("timer")).toHaveTextContent("28");

        setPageHidden(true);
        for (let i = 0; i < 20; i++) act(() => vi.advanceTimersByTime(1000));
        setPageHidden(false);

        // Frozen at 28, photo covered, answers locked, Resume ready
        expect(screen.getByRole("timer")).toHaveTextContent("28");
        expect(document.querySelector(".Game-photo")).toHaveClass("is-waiting");
        expect(optionButtons().every((b) => b.disabled)).toBe(true);
        const resumeButton = screen.getByRole("button", { name: "Resume" });
        expect(resumeButton).toHaveFocus();

        fireEvent.click(resumeButton);
        expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
        act(() => vi.advanceTimersByTime(1000));
        expect(screen.getByRole("timer")).toHaveTextContent("27");
    });

    test("leaving the page before Start or after answering doesn't pause", async () => {
        const user = userEvent.setup();
        render(<Game />);
        setPageHidden(true);
        setPageHidden(false);
        expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();

        await user.click(startButton());
        await user.click(optionFor(rightAnswer()));
        setPageHidden(true);
        setPageHidden(false);
        expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    });

    test("the last troop and difficulty played are remembered", async () => {
        const user = userEvent.setup();
        const { unmount } = render(<Game />);
        await user.selectOptions(screen.getByRole("combobox", { name: "Troop to play" }), "Goliath");
        await user.click(screen.getByRole("radio", { name: "Hard" }));
        await user.click(applyButton());
        unmount();

        render(<Game />); // e.g. coming back tomorrow
        expect(screen.getByRole("combobox", { name: "Troop to play" })).toHaveValue("Goliath");
        expect(screen.getByRole("radio", { name: "Hard" })).toHaveAttribute("aria-checked", "true");
        expect(document.querySelector(".Game")).toHaveAttribute("data-level", "hard");
        expect(screen.getByRole("timer")).toHaveTextContent("5");
    });

    test("an out-of-date remembered troop falls back to All Troops", () => {
        localStorage.setItem(
            "vervetdb-game-settings",
            JSON.stringify({ troop: "SAAV", difficulty: "hard" })
        );
        render(<Game />);
        expect(screen.getByRole("combobox", { name: "Troop to play" })).toHaveValue("All Troops");
        expect(screen.getByRole("radio", { name: "Normal" })).toHaveAttribute("aria-checked", "true");
    });

    test("changing troop waits for Apply, like difficulty", async () => {
        const user = userEvent.setup();
        render(<Game />);
        await user.click(startButton());
        const name = rightAnswer();
        await user.click(optionFor(name));

        await user.selectOptions(screen.getByRole("combobox", { name: "Troop to play" }), "Goliath");
        // Same round carries on
        expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");
        expect(screen.getByRole("status")).toHaveTextContent(`Correct! It's ${name}`);
        expect(document.querySelector(".Game-hint")).toHaveTextContent(
            "Normal mode: Multiple choice, 30 second timer · Goliath. Press Apply to use these settings."
        );
        expect(applyButton()).toHaveClass("is-waiting");

        await user.click(applyButton());
        const answer = monkeysArr.find((m) =>
            m.img.includes(screen.getByAltText("Mystery monkey").getAttribute("src"))
        );
        expect(answer.troop).toBe("Goliath");
        expect(applyButton()).not.toHaveClass("is-waiting");
    });

    test("phones buzz for a wrong answer or time up, not a right one", async () => {
        const vibrate = vi.fn();
        Object.defineProperty(navigator, "vibrate", { configurable: true, value: vibrate });
        const user = userEvent.setup();
        render(<Game />);
        await user.click(startButton());

        await user.click(optionFor(rightAnswer()));
        expect(vibrate).not.toHaveBeenCalled();

        await user.keyboard("{Enter}");
        const name = rightAnswer();
        await user.click(optionButtons().find((b) => !b.textContent.endsWith(name)));
        expect(vibrate).toHaveBeenCalledTimes(1);
        delete navigator.vibrate;
    });
});

describe("sharing results", () => {
    afterEach(() => {
        delete navigator.share;
        delete navigator.clipboard;
    });

    // Plays a Normal round, getting everything right except photo 3
    async function finishRound(user) {
        render(<Game />);
        await user.click(startButton());
        for (let i = 0; i < 10; i++) {
            const name = rightAnswer();
            const pick = i === 2
                ? optionButtons().find((b) => !b.textContent.endsWith(name))
                : optionFor(name);
            await user.click(pick);
            await user.keyboard("{Enter}");
        }
    }

    test("on phones, Share opens the share menu with the result text", async () => {
        const share = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "share", { configurable: true, value: share });
        const user = userEvent.setup();
        await finishRound(user);

        await user.click(screen.getByRole("button", { name: "Share" }));
        expect(share).toHaveBeenCalledTimes(1);
        const { text } = share.mock.calls[0][0];
        expect(text).toContain("Normal mode");
        expect(text).toContain("9/10 Great work!");
        expect(text).toContain("✅✅❌✅✅✅✅✅✅✅");
        expect(text).toMatch(/Can you beat it\? http.*#game$/);
    });

    test("without a share menu, the text is copied instead", async () => {
        // After userEvent.setup(), which installs its own pretend clipboard
        const user = userEvent.setup();
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        await finishRound(user);

        await user.click(screen.getByRole("button", { name: "Share" }));
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining("9/10 Great work!"));
        expect(await screen.findByRole("button", { name: "Copied!" })).toBeInTheDocument();
        expect(screen.getByText(/Paste it into a message/)).toBeInTheDocument();
    });

    test("closing the share menu without sharing does nothing else", async () => {
        const user = userEvent.setup();
        const share = vi.fn().mockRejectedValue(Object.assign(new Error(), { name: "AbortError" }));
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "share", { configurable: true, value: share });
        Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
        await finishRound(user);

        await user.click(screen.getByRole("button", { name: "Share" }));
        expect(writeText).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();
    });
});

describe("waiting for each photo to load", () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    // Fake timers: photos only "load" when the test says so
    function answerFirstPhoto() {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.load(screen.getByAltText("Mystery monkey"));
        fireEvent.click(startButton());
        fireEvent.click(optionFor(rightAnswer()));
        const oldPhoto = screen.getByAltText("Mystery monkey");
        fireEvent.click(screen.getByRole("button", { name: "Next photo" }));
        return oldPhoto;
    }

    test("the previous photo is removed straight away, and answers wait for the new one", () => {
        const oldPhoto = answerFirstPhoto();
        const newPhoto = screen.getByAltText("Mystery monkey");
        expect(newPhoto).not.toBe(oldPhoto); // a fresh image, not the old one lingering
        expect(oldPhoto).not.toBeInTheDocument();

        // Still loading: names hidden, answers and number keys locked
        expect(document.querySelector(".Game-photo")).toHaveClass("is-loading");
        expect(screen.getByText("Loading photo…")).toBeInTheDocument();
        expect(optionButtons().map((b) => b.textContent)).toEqual(["1?", "2?", "3?", "4?"]);
        expect(optionButtons().every((b) => b.disabled)).toBe(true);
        fireEvent.keyDown(document, { key: "1" });
        expect(screen.getByRole("status")).toHaveTextContent("");

        fireEvent.load(newPhoto);
        expect(screen.queryByText("Loading photo…")).toBeNull();
        expect(optionFor(rightAnswer())).not.toBeDisabled();
        expect(optionButtons()[0]).toHaveFocus();
    });

    test("Expert: the text box waits for the photo too", () => {
        vi.useFakeTimers();
        render(<Game />);
        fireEvent.click(screen.getByRole("radio", { name: "Expert" }));
        fireEvent.click(applyButton());
        fireEvent.click(startButton()); // started before the photo arrived
        const input = screen.getByRole("textbox", { name: "Monkey's name" });
        expect(input).toBeDisabled();
        expect(screen.getByText("Loading photo…")).toBeInTheDocument();

        fireEvent.load(screen.getByAltText("Mystery monkey"));
        expect(input).not.toBeDisabled();
        expect(input).toHaveFocus();
    });

    test("moving focus never scrolls the page (keeps the photo in view on phones)", () => {
        const focus = vi.spyOn(HTMLElement.prototype, "focus");
        answerFirstPhoto();
        fireEvent.load(screen.getByAltText("Mystery monkey"));
        expect(focus).toHaveBeenCalled();
        for (const [options] of focus.mock.calls) {
            expect(options).toEqual({ preventScroll: true });
        }
    });
});
