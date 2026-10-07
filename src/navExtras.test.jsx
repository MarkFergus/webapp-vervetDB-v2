// Nav extras: the logo takes you home, "/" jumps to search, a line under the
// header once scrolled, and hover labels on the icons.
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";

const search = () => screen.getByRole("textbox", { name: "Search by name or chip number" });

afterEach(() => vi.restoreAllMocks());

test("the logo goes home: search and filters cleared, back to the top", async () => {
    window.scrollTo = vi.fn();
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.type(search(), "ab");
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.click(within(screen.getByRole("group", { name: "Sex" })).getByRole("button", { name: "Male" })); // females only
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("link", { name: "vervetDB home" }));
    expect(search()).toHaveValue("");
    expect(screen.getByRole("button", { name: /^Filters/ })).toHaveAccessibleName("Filters");
    expect(screen.getByText(/^Showing \d+ monkeys$/)).toHaveTextContent(`Showing ${monkeysArr.length} monkeys`);
    expect(window.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
});

test('"/" jumps into the search box, but not while typing somewhere else', async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.keyboard("/");
    expect(search()).toHaveFocus();
    expect(search()).toHaveValue(""); // the "/" itself isn't typed

    await user.type(search(), "a/b");
    expect(search()).toHaveValue("a/b"); // inside the box, "/" is just a character
});

test("a faint line appears under the header once the page has scrolled", () => {
    render(<ShowPage />);
    const header = () => document.querySelector(".ShowPage-nav");
    expect(header()).not.toHaveClass("is-scrolled");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 120 });
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(header()).toHaveClass("is-scrolled");
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    act(() => window.dispatchEvent(new Event("scroll")));
    expect(header()).not.toHaveClass("is-scrolled");
});

test("the icons have hover labels (and the last one lines up to its right edge)", () => {
    render(<ShowPage />);
    const labels = [...document.querySelectorAll(".Nav-buttons [data-tooltip]")].map((el) => el.dataset.tooltip);
    expect(labels).toEqual(["Enclosures", "Monkey Guesser Game", "Create Profile Book", "Install & Use Offline", "About", "Sign in"]);
    expect(document.querySelector(".Nav-account")).toHaveAttribute("data-tooltip-align", "end");
    // No browser tooltips as well
    expect(document.querySelectorAll(".Nav-buttons [title]")).toHaveLength(0);
    fireEvent.mouseOver(document.querySelector(".Nav-gameLink"));
});
