// The About pop-up: version and latest changes, opened from the top bar,
// the ☰ menu (phones) or the line at the bottom of the page; and the
// Updates page (every version) from its See All Updates.
import fs from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import { APP_VERSION, CHANGELOG, CHANGE_TYPES, releaseDate, seriesGroups } from "./changelog";

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

test("grouped by series (same major.minor), newest first", () => {
    const log = ["1.12.0", "1.5.1", "1.5.0", "1.0.1", "1.0.0"].map((version) => ({ version }));
    expect(seriesGroups(log).map((g) => [g.series, g.releases.map((e) => e.version)])).toEqual([
        ["1.12", ["1.12.0"]],
        ["1.5", ["1.5.1", "1.5.0"]],
        ["1.0", ["1.0.1", "1.0.0"]],
    ]);
});

test("dates read as words", () => {
    expect(releaseDate("2026-10-02")).toBe("2 October 2026");
});

// Computers: the side rail, opened out, has About
async function openAbout(user) {
    await user.click(screen.getByRole("button", { name: "Open the side menu" }));
    await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "About" }));
}
afterEach(() => localStorage.removeItem("vervetdb-rail"));

test("the side rail's About opens it: version, date and latest changes", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAbout(user);
    expect(within(dialog()).getByRole("button", { name: "Close" })).toHaveFocus();

    expect(within(dialog()).getByText(`Version ${APP_VERSION} · ${releaseDate(CHANGELOG[0].date)}`)).toBeInTheDocument();
    expect(within(dialog()).getByText(/web app for the Vervet Monkey Foundation's staff and volunteers/)).toBeInTheDocument();
    expect(within(dialog()).getByText(/not intended for public use\./)).toBeInTheDocument();
    expect(within(dialog()).getByText("– Built by Mark Fergus Ashcroft –")).toBeInTheDocument();
    expect(within(dialog()).getByText(/^© \d{4} Vervet Monkey Foundation\.\s*All photos and records belong to the Foundation/)).toBeInTheDocument();
    // Just the latest version and its changes, and the way to all of them
    const headings = within(dialog()).getAllByRole("heading", { level: 3 }).map((h) => h.textContent.replace("Major Update", ""));
    expect(headings).toEqual([`Version ${APP_VERSION}`]);
    const changes = within(dialog()).getAllByRole("listitem").map((li) => li.textContent);
    expect(changes).toEqual(CHANGELOG[0].changes);
    expect(within(dialog()).getByRole("link", { name: "See All Updates" })).toHaveAttribute("href", "#updates");
    expect(within(dialog()).queryByRole("button", { name: "Earlier versions" })).toBeNull();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); // after its closing animation
});

test("phones: ☰ (the drawer) → About", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await user.click(screen.getByRole("button", { name: "Menu" }));
    await user.click(within(screen.getByRole("dialog", { name: "Menu" })).getByRole("button", { name: "About" }));
    expect(screen.queryByRole("dialog", { name: "Menu" })).toBeNull();
    expect(dialog()).toBeInTheDocument();
});

test("while About is open the page behind can't scroll", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    const root = document.documentElement;
    expect(root.style.overflow).toBe("");
    await openAbout(user);
    expect(root.style.overflow).toBe("hidden");
    await user.click(within(dialog()).getByRole("button", { name: "Close" }));
    expect(root.style.overflow).toBe("");
});

test("Open-Source Licences folds open: each project with a link, and the full texts", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAbout(user);
    const toggle = within(dialog()).getByRole("button", { name: "Open-Source Licences" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(dialog()).queryByRole("link", { name: "React" })).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog()).getByRole("link", { name: "React" })).toHaveAttribute("href", "https://react.dev");
    expect(within(dialog()).getByRole("link", { name: "Open Sans" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("link", { name: "Caladea" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("link", { name: "Full Licence Texts" })).toHaveAttribute("href", "/licences.txt");
});

describe("the Updates page", () => {
    afterEach(() => {
        window.location.hash = "";
    });

    test("See All Updates: About closes and the Updates page opens", async () => {
        const user = userEvent.setup();
        render(<ShowPage />);
        await openAbout(user);
        await user.click(within(dialog()).getByRole("link", { name: "See All Updates" }));
        await waitFor(() => expect(screen.queryByRole("dialog", { name: "About vervetDB" })).toBeNull());
        expect(window.location.hash).toBe("#updates");
    });

    test("every series, newest first; the newest open, each opens on its own", async () => {
        const user = userEvent.setup();
        render(<ShowPage route="updates" />);
        expect(screen.getByRole("heading", { level: 1, name: "Updates" })).toBeInTheDocument();
        const groups = seriesGroups(CHANGELOG);
        const toggles = screen.getAllByRole("button", { name: /^Version \d+\.\d+/ });
        expect(toggles.map((t) => t.textContent.match(/^Version (\d+\.\d+)/)[1])).toEqual(groups.map((g) => g.series));
        expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
        expect(toggles.slice(1).every((t) => t.getAttribute("aria-expanded") === "false")).toBe(true);
        // The newest's versions and changes show
        for (const change of groups[0].releases[0].changes) expect(screen.getByText(change)).toBeInTheDocument();
        // Another opens on its own (the newest stays open)
        const older = groups[groups.length - 1];
        await user.click(toggles[toggles.length - 1]);
        expect(toggles[toggles.length - 1]).toHaveAttribute("aria-expanded", "true");
        expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
        for (const entry of older.releases) {
            expect(screen.getByRole("heading", { level: 3, name: new RegExp(`^Version ${entry.version.replace(/\./g, "\\.")}`) })).toBeInTheDocument();
        }
        // Closes again
        await user.click(toggles[0]);
        expect(toggles[0]).toHaveAttribute("aria-expanded", "false");
    });

    test("a major release: Major Update on its series and its version", async () => {
        const user = userEvent.setup();
        render(<ShowPage route="updates" />);
        expect(screen.getByRole("heading", { level: 1, name: "Updates" })).toBeInTheDocument();
        const major = CHANGELOG.find((e) => e.major);
        const series = major.version.split(".").slice(0, 2).join(".");
        const toggle = screen.getByRole("button", { name: new RegExp(`^Version ${series.replace(".", "\\.")}\\b`) });
        expect(toggle).toHaveTextContent("Major Update");
        if (toggle.getAttribute("aria-expanded") === "false") await user.click(toggle);
        expect(screen.getByRole("heading", { level: 3, name: new RegExp(`^Version ${major.version.replace(/\./g, "\\.")}`) })).toHaveTextContent("Major Update");
        // Ordinary series have none
        const plain = seriesGroups(CHANGELOG).find((g) => !g.releases.some((e) => e.major));
        expect(screen.getByRole("button", { name: new RegExp(`^Version ${plain.series.replace(".", "\\.")}\\b`) })).not.toHaveTextContent("Major Update");
    });
});
