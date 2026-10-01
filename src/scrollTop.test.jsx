// The "Back to top" button on the main page.
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";

// The test browser has no real layout: pretend the page is scrolled so the
// Filters / sort row's bottom edge is at `bottom` (below 0 = scrolled away;
// the header itself stays at the top)
function scrollNavTo(bottom) {
    const toolbar = document.querySelector(".ShowPage-toolbar");
    toolbar.getBoundingClientRect = () => ({ top: bottom - 40, bottom });
    act(() => window.dispatchEvent(new Event("scroll")));
}
const toTop = () => screen.queryByRole("button", { name: "Back to top" });

afterEach(() => vi.restoreAllMocks());

test("appears once the Filters / sort row has scrolled out of view, and hides near the top", () => {
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
