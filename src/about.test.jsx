// The About pop-up: version and latest changes, opened from the top bar,
// the ☰ menu (phones) or the line at the bottom of the page.
import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import { APP_VERSION, CHANGELOG, CHANGE_TYPES, currentSeries, releaseDate } from "./changelog";

const dialog = () => screen.getByRole("dialog", { name: "About vervetDB" });

test("the changelog: newest first, each with a version, date and changes", () => {
    expect(APP_VERSION).toBe(CHANGELOG[0].version);
    for (const entry of CHANGELOG) {
        expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
        expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(entry.changes.length).toBeGreaterThan(0);
        for (const change of entry.changes) {
            // Each starts with what kind of change it is
            expect(CHANGE_TYPES).toContain(change.split(" ")[0]);
        }
    }
    const dates = CHANGELOG.map((e) => e.date);
    expect([...dates].sort().reverse()).toEqual(dates);
});

test("package.json has the same version as the changelog", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(process.cwd(), "package.json"), "utf8"));
    expect(pkg.version).toBe(APP_VERSION);
});

test("the current series: same major.minor as the latest; the rest is earlier", () => {
    const log = ["1.2.0", "1.1.2", "1.1.1", "1.0.0"].map((version) => ({ version }));
    expect(currentSeries(log).current.map((e) => e.version)).toEqual(["1.2.0"]);
    expect(currentSeries(log).earlier.map((e) => e.version)).toEqual(["1.1.2", "1.1.1", "1.0.0"]);
    const patch = ["1.1.2", "1.1.1", "1.1.0", "1.0.1"].map((version) => ({ version }));
    expect(currentSeries(patch).current.map((e) => e.version)).toEqual(["1.1.2", "1.1.1", "1.1.0"]);
});

test("dates read as words", () => {
    expect(releaseDate("2026-10-02")).toBe("2 October 2026");
});

test("ⓘ in the top bar opens About: version, date and latest changes", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(screen.getByRole("button", { name: "About vervetDB" }));
    expect(within(dialog()).getByRole("button", { name: "Close" })).toHaveFocus();

    expect(within(dialog()).getByText(`Version ${APP_VERSION} · ${releaseDate(CHANGELOG[0].date)}`)).toBeInTheDocument();
    expect(within(dialog()).getByText(/web app for the Vervet Monkey Foundation's monkey records/)).toBeInTheDocument();
    // A running changelog: every version in the current series (e.g. 1.1.x)
    // and its changes; "Earlier versions" opens the rest, newest first
    const { current } = currentSeries(CHANGELOG);
    const headings = () => within(dialog()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    const changes = () => within(dialog()).getAllByRole("listitem").map((li) => li.textContent);
    expect(headings()).toEqual(current.map((entry) => `Version ${entry.version}`));
    expect(changes()).toEqual(current.flatMap((entry) => entry.changes));
    const earlier = within(dialog()).getByRole("button", { name: "Earlier versions" });
    expect(earlier).toHaveAttribute("aria-expanded", "false");
    await user.click(earlier);
    expect(earlier).toHaveAttribute("aria-expanded", "true");
    expect(headings()).toEqual(CHANGELOG.map((entry) => `Version ${entry.version}`));
    expect(changes()).toEqual(CHANGELOG.flatMap((entry) => entry.changes));
    await user.click(earlier); // folds them away again
    expect(headings()).toHaveLength(current.length);
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
