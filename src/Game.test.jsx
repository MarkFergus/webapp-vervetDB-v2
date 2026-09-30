import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import Game from "./Game";
import monkeysArr from "./monkeysArr";

beforeEach(() => {
    localStorage.clear();
    window.location.hash = "";
});

// The right answer is the monkey whose photos include the one on screen
function rightAnswer() {
    const src = screen.getByAltText("Mystery monkey").getAttribute("src");
    return monkeysArr.find((m) => m.img.includes(src)).name;
}
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
    const name = rightAnswer();
    await user.click(optionFor(name));

    expect(screen.getByRole("status")).toHaveTextContent(`Correct! It's ${name}`);
    expect(document.querySelector(".Game-score")).toHaveTextContent("Score1");
    expect(optionFor(name)).toHaveClass("is-correct");
});

test("a wrong answer shows the right one", async () => {
    const user = userEvent.setup();
    render(<Game />);
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
    for (let i = 0; i < 10; i++) {
        const key = optionButtons().findIndex((b) => b.textContent.endsWith(rightAnswer())) + 1;
        await user.keyboard(String(key));
        await user.keyboard("{Enter}");
    }
    expect(
        screen.getByRole("heading", { name: "You scored 10 out of 10" })
    ).toBeInTheDocument();
    expect(screen.getByText("Your best: 10 out of 10")).toBeInTheDocument();

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
    const photos = monkeysArr.filter(
        (m) => m.troop === "Jalamango" && m.img.some((u) => !u.includes("blank-image"))
    ).length;
    expect(screen.getByText(`Photo 1 of ${Math.min(10, photos)}`, { exact: false })).toBeInTheDocument();
});

test("there's no hard mode option (for now)", () => {
    render(<Game />);
    expect(screen.queryByRole("checkbox")).toBeNull();
});
