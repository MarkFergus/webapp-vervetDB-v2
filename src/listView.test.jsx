// The list view: a table-style row per monkey, switched with the grid /
// list buttons beside Sort, and remembered on this device.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";

afterEach(() => localStorage.removeItem("vervetdb-view"));

const gridButton = () => screen.getByRole("button", { name: "Grid view" });
const listButton = () => screen.getByRole("button", { name: "List view" });

test("cards to start with; List view shows a row per monkey with its details", async () => {
    const user = userEvent.setup();
    const { container } = render(<ShowPage />);
    expect(gridButton()).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".MonkeyCard")).not.toBeNull();

    await user.click(listButton());
    expect(listButton()).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".MonkeyCard")).toBeNull();

    const abby = monkeysArr.find((m) => m.name === "Abby");
    const row = screen.getByRole("button", { name: /^Abby,/ });
    expect(row).toHaveClass("MonkeyRow");
    // Born: in its column, and in the phone details line ("Global · ♀ · 2018 · …")
    expect(within(row).getAllByText(String(abby.year))).toHaveLength(2);
    if (abby.chip) expect(within(row).getByText(String(abby.chip))).toBeInTheDocument();
});

test("a row opens the monkey's pop-up", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(listButton());
    await user.click(screen.getByRole("button", { name: /^Abby,/ }));
    expect(screen.getByRole("dialog", { name: "Abby" })).toBeInTheDocument();
});

test("the choice is remembered on this device", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ShowPage />);
    await user.click(listButton());
    unmount();
    const { container } = render(<ShowPage />);
    expect(listButton()).toHaveAttribute("aria-pressed", "true");
    expect(container.querySelector(".MonkeyRow")).not.toBeNull();
});
