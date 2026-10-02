// The About pop-up: version and latest changes, opened from the top bar,
// the ☰ menu (phones) or the line at the bottom of the page.
import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import { APP_VERSION, CHANGELOG, LATEST_CHANGES, releaseDate } from "./changelog";

const dialog = () => screen.getByRole("dialog", { name: "About vervetDB" });

test("the changelog: newest first, each with a version, date and changes", () => {
    expect(APP_VERSION).toBe(CHANGELOG[0].version);
    for (const entry of CHANGELOG) {
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.changes.length).toBeGreaterThan(0);
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
});

test("package.json has the same version as the changelog", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.version).toBe(APP_VERSION);
});

test("latest changes: the newest first, across versions, up to 8", () => {
    expect(LATEST_CHANGES.length).toBeLessThanOrEqual(8);
    expect(LATEST_CHANGES.slice(0, CHANGELOG[0].changes.length)).toEqual(CHANGELOG[0].changes);
    if (CHANGELOG.length > 1 && CHANGELOG[0].changes.length < 8) {
        expect(LATEST_CHANGES).toContain(CHANGELOG[1].changes[0]); // older versions fill the rest
    }
});

test("dates read as words", () => {
    expect(releaseDate("2026-10-02")).toBe("2 October 2026");
});

test("ⓘ in the top bar opens About: version, date and latest changes", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(screen.getByRole("button", { name: "About vervetDB" }));

    expect(within(dialog()).getByText(`Version ${APP_VERSION} · ${releaseDate(CHANGELOG[0].date)}`)).toBeInTheDocument();
    expect(within(dialog()).getByText(/web app for the Vervet Monkey Foundation's monkey records/)).toBeInTheDocument();
    const changes = within(dialog()).getAllByRole("listitem").map((li) => li.textContent);
    expect(changes).toEqual(LATEST_CHANGES);
    expect(within(dialog()).getByRole("button", { name: "Close" })).toHaveFocus();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); // after its closing animation
});

test("the line at the bottom of the page shows the version and opens About", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(screen.getByRole("button", { name: `vervetDB ${APP_VERSION} · About` }));
    expect(dialog()).toBeInTheDocument();
    await user.click(within(dialog()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); // after its closing animation
});

test("phones: ☰ menu → About", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(screen.getByRole("button", { name: /^Menu/ }));
    await user.click(within(document.getElementById("Nav-menu")).getByRole("button", { name: "About" }));
    expect(document.getElementById("Nav-menu")).toBeNull();
    expect(dialog()).toBeInTheDocument();
});
