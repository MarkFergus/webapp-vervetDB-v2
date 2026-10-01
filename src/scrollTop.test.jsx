// The "Back to top" button on the main page.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";

// The test browser has no real layout: pretend the page is scrolled so the
// nav bar's bottom edge is at `bottom` (below 0 = scrolled out of view)
function scrollNavTo(bottom) {
    const nav = document.querySelector(".ShowPage-nav");
    nav.getBoundingClientRect = () => ({ top: bottom - 100, bottom });
    act(() => window.dispatchEvent(new Event("scroll")));
}
const toTop = () => screen.queryByRole("button", { name: "Back to top" });

afterEach(() => vi.restoreAllMocks());

test("appears once the nav bar has scrolled out of view, and hides near the top", () => {
    render(<ShowPage />);
    expect(toTop()).toBeNull();

    scrollNavTo(-20);
    expect(toTop()).toBeInTheDocument();

    scrollNavTo(60);
    expect(toTop()).toBeNull();
});

test("takes you back to the top, ready to search", async () => {
    const scrollTo = vi.fn();
    window.scrollTo = scrollTo;
    const user = userEvent.setup();
    render(<ShowPage />);
    scrollNavTo(-500);

    await user.click(toTop());
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(screen.getByRole("textbox", { name: "Search by name or chip number" })).toHaveFocus();
});

test("hidden while a monkey's pop-up is open", async () => {
    render(<ShowPage />);
    scrollNavTo(-500);
    expect(toTop()).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: /^Aroha,/ }));
    expect(toTop()).toBeNull();
});
