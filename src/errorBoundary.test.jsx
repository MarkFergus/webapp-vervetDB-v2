import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import ErrorBoundary from "./ErrorBoundary";
import { logAppError } from "./appErrors";

vi.mock("./appErrors", () => ({ logAppError: vi.fn() }));

function Broken() {
    throw new Error("Page fell over");
}

beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));

test("a crash: Something went wrong with Reload, and the error noted", () => {
    render(
        <ErrorBoundary>
            <Broken />
        </ErrorBoundary>
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(logAppError).toHaveBeenCalledWith(expect.objectContaining({ message: "Page fell over" }), expect.any(String));
});

test("nothing wrong: just the page", () => {
    render(
        <ErrorBoundary>
            <p>All fine</p>
        </ErrorBoundary>
    );
    expect(screen.getByText("All fine")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
});

test("a page's crash clears when going to another page", async () => {
    function Pages() {
        const [route, setRoute] = useState("broken");
        return (
            <>
                <button type="button" onClick={() => setRoute("fine")}>
                    Go
                </button>
                <ErrorBoundary page resetOn={route}>
                    {route === "broken" ? <Broken /> : <p>Another page</p>}
                </ErrorBoundary>
            </>
        );
    }
    render(<Pages />);
    expect(screen.getByRole("alert")).toHaveTextContent("This page couldn't be shown");
    await userEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(screen.getByText("Another page")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
});
