import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";

function setup() {
    const user = userEvent.setup();
    render(<ShowPage />);
    return { user };
}

// First two monkeys alphabetically, i.e. the first two cards
const [first, second] = [...monkeysArr]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((m) => m.name);

const card = (name) =>
    screen.getByRole("button", { name: new RegExp(`^${name}\\b`) });
const dialogClosed = () =>
    waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

test("a monkey card opens with the keyboard and focus moves into the dialog", async () => {
    const { user } = setup();
    card(first).focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("dialog", { name: first })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
});

test("Escape closes the monkey dialog and focus returns to the card", async () => {
    const { user } = setup();
    await user.click(card(first));
    await user.keyboard("{Escape}");

    await dialogClosed();
    expect(card(first)).toHaveFocus();
});

test("arrow keys move between monkeys in the dialog", async () => {
    const { user } = setup();
    await user.click(card(first));
    expect(screen.getByRole("button", { name: "Previous monkey" })).toBeDisabled();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("dialog", { name: second })).toBeInTheDocument();

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("dialog", { name: first })).toBeInTheDocument();
});

test("search, filters and icon buttons have accessible names", async () => {
    const { user } = setup();
    const search = screen.getByRole("textbox", {
        name: "Search by name or chip number",
    });
    expect(screen.getByRole("button", { name: "Create Profile Book" })).toBeInTheDocument();
    // The filters are in the Filters panel
    await user.click(screen.getByRole("button", { name: "Filters" }));
    expect(screen.getByRole("combobox", { name: "Filter by troop" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Filter by year" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Age" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Sex" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Show \d+ monkeys$/ }));

    await user.type(search, "ab");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
});

test("sort buttons say which sort is active and its direction", async () => {
    const { user } = setup();
    const nameSort = () => screen.getByRole("button", { name: /^Name/ });
    expect(nameSort()).toHaveAttribute("aria-pressed", "true");
    expect(nameSort()).toHaveAccessibleName(/ascending/);

    await user.click(nameSort());
    expect(nameSort()).toHaveAccessibleName(/descending/);
    expect(screen.getByRole("button", { name: /^Year/ })).toHaveAttribute(
        "aria-pressed",
        "false"
    );
});

test("the number of results is announced when filters change", async () => {
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(
        screen.getByRole("combobox", { name: "Filter by troop" }),
        "Goliath"
    );
    const count = monkeysArr.filter((m) => m.troop === "Goliath").length;
    expect(screen.getByRole("status")).toHaveTextContent(`Showing ${count} monkeys`);
});

test("the PDF dialog closes with Escape and focus returns to the PDF button", async () => {
    const { user } = setup();
    const pdfButton = screen.getByRole("button", { name: "Create Profile Book" });
    await user.click(pdfButton);
    expect(screen.getByRole("dialog", { name: "Create Profile Book" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await dialogClosed();
    expect(pdfButton).toHaveFocus();
});

test("cards are announced as name, sex, birth year and troop", () => {
    setup();
    const m = monkeysArr.find((x) => x.name === first);
    expect(card(first)).toHaveAccessibleName(
        `${m.name}, ${m.sex}, born ${m.year}, ${m.troop} troop`
    );
});
