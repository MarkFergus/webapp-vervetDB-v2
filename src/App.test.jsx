import { render, screen } from "@testing-library/react";
import App from "./App";
import { loadMonkeyData, BUILT_IN_DATA } from "./monkeyData";

// loadMonkeyData is replaced in setupTests.js (returns the built-in copy)
afterEach(() => vi.mocked(loadMonkeyData).mockReset().mockImplementation(async () => BUILT_IN_DATA));

test("shows 'Loading monkeys…' until the data arrives", async () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading monkeys…");
    expect(await screen.findByText("vervetDB")).toBeInTheDocument();
    expect(screen.queryByText("Loading monkeys…")).toBeNull();
});

test("renders the vervetDB title and logo", async () => {
    render(<App />);
    expect(await screen.findByText("vervetDB")).toBeInTheDocument();
    // The logo and name together are a link back home
    const home = screen.getByRole("link", { name: "vervetDB home" });
    expect(home.querySelector("svg")).not.toBeNull();
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

test("if the database can't be reached, shows the built-in copy with a notice", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(loadMonkeyData).mockRejectedValue(new Error("offline"));
    render(<App />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "Couldn't reach the database, so this is a saved copy"
    );
    expect(screen.getByRole("button", { name: /^Aroha/ })).toBeInTheDocument();
});
