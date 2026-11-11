import { render, screen } from "@testing-library/react";
import App from "./App";
import { loadMonkeyData, BUILT_IN_DATA } from "./monkeyData";

// loadMonkeyData is replaced in setupTests.js (returns the built-in copy)
afterEach(() => vi.mocked(loadMonkeyData).mockReset().mockImplementation(async () => BUILT_IN_DATA));

test("shows 'Loading monkeys…' until the data arrives", async () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading monkeys…");
    expect(await screen.findByRole("link", { name: "vervetDB home" })).toBeInTheDocument();
    expect(screen.queryByText("Loading monkeys…")).toBeNull();
});

test("renders the vervetDB title and logo", async () => {
    render(<App />);
    // The name ("DB" in its own colour) is a link back home
    const home = await screen.findByRole("link", { name: "vervetDB home" });
    expect(home).toHaveTextContent("vervetDB");
    // The monkey logo sits in the search bar, in place of a magnifying glass
    expect(document.querySelector(".Nav-searchbar .Nav-iconSearch svg")).not.toBeNull();
});

test("shows the first page of monkey cards", async () => {
    render(<App />);
    expect(await screen.findByRole("button", { name: /^Aroha/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Showing \d+ monkeys/);
});

test("shows the monkeys from the database", async () => {
    vi.mocked(loadMonkeyData).mockResolvedValue({
        troops: ["All Troops", "Goliath"],
        monkeys: [
            {
                id: 1,
                name: "Brand New",
                sex: "female",
                chip: "",
                troop: "Goliath",
                year: 2026,
                img: ["https://i.ibb.co/2YvYtBJ/blank-image-min.jpg"],
                bio: "Added in the database.",
                desc: "",
            },
        ],
    });
    render(<App />);
    expect(await screen.findByRole("button", { name: /^Brand New/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 monkey");
    expect(screen.queryByRole("alert")).toBeNull();
});

test("if the database can't be reached and nothing's saved: says so, with Try Again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadMonkeyData).mockRejectedValue(new Error("offline"));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<App />);
    // (after trying again a couple of times, on the loading screen)
    await vi.advanceTimersByTimeAsync(6100);
    vi.useRealTimers();
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't reach the database. Check your connection and try again.");
    expect(screen.getByRole("button", { name: "Try Again" })).toBeInTheDocument();
    // (no out-of-date monkeys)
    expect(screen.queryByRole("button", { name: /^Aroha/ })).toBeNull();
});

test("while loading, grey placeholder shapes show where the monkeys will be", async () => {
    const { container } = render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading monkeys…");
    expect(container.querySelectorAll(".LoadingSkeleton-card").length).toBeGreaterThan(0);
    await screen.findByRole("link", { name: "vervetDB home" });
    expect(container.querySelector(".LoadingSkeleton")).toBeNull();
});
