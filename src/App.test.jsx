import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders the vervetDB title", () => {
    render(<App />);
    expect(screen.getByText("vervetDB")).toBeInTheDocument();
});

test("shows the first page of monkey cards", () => {
    render(<App />);
    const names = screen.getAllByRole("heading", { level: 3 });
    expect(names.length).toBeGreaterThan(0);
});
