import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the vervetDB title and logo", () => {
    render(<App />);
    expect(screen.getByText("vervetDB")).toBeInTheDocument();
    expect(
        screen.getByRole("img", { name: "vervetDB monkey logo" })
    ).toBeInTheDocument();
});

test("shows the first page of monkey cards", () => {
    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(/Showing \d+ monkeys/);
    expect(screen.getByRole("button", { name: /^Aroha/ })).toBeInTheDocument();
});
