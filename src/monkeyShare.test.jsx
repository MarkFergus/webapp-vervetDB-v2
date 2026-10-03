// Sharing one monkey: its link (#monkey/aroha-h-b), Back closing the
// pop-up, the Share and Save image buttons, and the age shown in the pop-up.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import { drawMonkeyImage } from "./monkeyImage";
import { ageLabel, ageText } from "./ages";
import { monkeyFromHash, monkeyHash } from "./monkeyLink";
import monkeysArr from "./monkeysArr";

// The test browser can't draw pictures: a stand-in for the profile picture
vi.mock("./monkeyImage", async (importOriginal) => ({
    ...(await importOriginal()),
    drawMonkeyImage: vi.fn(async () => new Blob(["png"], { type: "image/png" })),
}));

const aroha = monkeysArr.find((m) => m.name === "Aroha"); // in H&B troop
const arohaHash = "#monkey/aroha-h-b";
const popUp = () => screen.getByRole("dialog");
const openAroha = async (user) =>
    user.click(await screen.findByRole("button", { name: /^Aroha,/ }));

afterEach(() => {
    delete navigator.share;
    delete navigator.clipboard;
    vi.restoreAllMocks();
});

test("links: name and troop, unique for every monkey", () => {
    expect(aroha.troop).toBe("H&B");
    expect(monkeyHash(aroha)).toBe(arohaHash);
    const hashes = monkeysArr.map(monkeyHash);
    expect(new Set(hashes).size).toBe(hashes.length);
    expect(monkeyFromHash(arohaHash, monkeysArr)).toBe(aroha);
    expect(monkeyFromHash("#monkey/nobody-here", monkeysArr)).toBeNull();
    expect(monkeyFromHash("#game", monkeysArr)).toBeNull();
});

test("age from the birth year", () => {
    // Everyone is a year older from 1 November
    const oct2026 = new Date(2026, 9, 1);
    const nov2026 = new Date(2026, 10, 1);
    expect(ageText(2016, oct2026)).toBe("(9 years old)");
    expect(ageText(2016, nov2026)).toBe("(10 years old)");
    expect(ageText(2024, oct2026)).toBe("(1 year old)");
    expect(ageText(2025, oct2026)).toBe("(Baby)");
    expect(ageText(2025, nov2026)).toBe("(1 year old)");
    expect(ageText(2026, oct2026)).toBe("(Baby)"); // a July 2026 baby
    expect(ageText("", oct2026)).toBe("");
});

test("the pop-up shows the age after the birth year", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    expect(within(popUp()).getByText(`Born ${aroha.year}`)).toBeInTheDocument();
    expect(within(popUp()).getByText(ageLabel(aroha.year))).toBeInTheDocument(
        // e.g. "9 yrs old", next to "Born 2016"
    );
});

test("opening a monkey puts its link in the address; Back closes the pop-up", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    expect(window.location.hash).toBe(arohaHash);

    // Next monkey: the address follows (without adding more Back steps)
    await user.click(within(popUp()).getByRole("button", { name: "Next monkey" }));
    const next = within(popUp()).getByRole("heading", { level: 1 }).textContent;
    expect(window.location.hash).toBe(monkeyHash(monkeysArr.find((m) => m.name === next)));

    // Back (e.g. on a phone): the pop-up closes, back on the plain page
    window.history.back();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(window.location.hash).toBe("");
});

test("closing the pop-up takes the monkey out of the address", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    await user.click(within(popUp()).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(window.location.hash).toBe(""));
});

test("a monkey's link opens its pop-up straight away", async () => {
    window.history.replaceState(null, "", `/${arohaHash}`);
    render(<ShowPage />);
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Aroha");

    // Closing it leaves the plain page (nothing to go Back to)
    await userEvent.setup().click(within(popUp()).getByRole("button", { name: "Close" }));
    expect(window.location.hash).toBe("");
});

test("a link to a monkey that's gone just shows the page", () => {
    window.history.replaceState(null, "", "/#monkey/nobody-here");
    render(<ShowPage />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.hash).toBe("");
});

test("Share on a phone: the share menu gets the monkey's link", async () => {
    const share = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "share", { configurable: true, value: share });
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    await user.click(within(popUp()).getByRole("button", { name: "Share" }));

    expect(share).toHaveBeenCalledWith({
        title: "Aroha · vervetDB",
        text: "Aroha (H&B troop) on vervetDB",
        url: expect.stringMatching(/#monkey\/aroha-h-b$/),
    });
});

test("Share on a computer copies the link", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<ShowPage />);
    await openAroha(user);
    await user.click(within(popUp()).getByRole("button", { name: "Share" }));

    expect(writeText).toHaveBeenCalledWith(expect.stringMatching(/#monkey\/aroha-h-b$/));
    expect(await within(popUp()).findByRole("button", { name: "Link copied!" })).toBeInTheDocument();
    expect(within(popUp()).getByText(/Paste it into a message/)).toBeInTheDocument();
});

test("Save image downloads a picture of the profile", async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => "blob:aroha");
    URL.revokeObjectURL = vi.fn();
    let downloaded;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
        downloaded = this.download;
    });
    render(<ShowPage />);
    await openAroha(user);
    await user.click(within(popUp()).getByRole("button", { name: "Save image" }));

    await waitFor(() => expect(downloaded).toBe("vervetdb-aroha-h-b.png"));
    const [monkey, options] = drawMonkeyImage.mock.lastCall;
    expect(monkey).toBe(aroha);
    expect(options.photo).toBe(aroha.img[0]); // the photo showing
});

// Firefox's home-screen app on Android can't download or save an opened
// picture, but pressing and holding a picture on the page offers Save image
test("Firefox's home-screen app: Save image shows the picture to press and hold", async () => {
    const realAgent = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
        configurable: true,
        get: () => "Mozilla/5.0 (Android 15; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0",
    });
    window.matchMedia = (query) => ({ matches: query === "(display-mode: standalone)" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    const open = vi.spyOn(window, "open");
    try {
        const user = userEvent.setup();
        render(<ShowPage />);
        await openAroha(user);
        await user.click(within(popUp()).getByRole("button", { name: "Save image" }));

        const preview = await screen.findByRole("dialog", { name: "Save image" });
        expect(within(preview).getByText(/Press and hold the picture/)).toBeInTheDocument();
        const picture = await within(preview).findByRole("img", { name: "Picture to save" });
        expect(picture.getAttribute("src")).toMatch(/^data:image\/png;base64,/);
        expect(click).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();

        // Escape closes just the picture, not the monkey's pop-up
        await user.keyboard("{Escape}");
        expect(screen.queryByRole("dialog", { name: "Save image" })).toBeNull();
        expect(popUp()).toBeInTheDocument();

        await user.click(within(popUp()).getByRole("button", { name: "Save image" }));
        await user.click(await screen.findByRole("button", { name: "Done" }));
        expect(screen.queryByRole("dialog", { name: "Save image" })).toBeNull();
    } finally {
        Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => realAgent });
        delete window.matchMedia;
        click.mockRestore();
        open.mockRestore();
    }
});

test("the pop-up shows where the monkey is in the list", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    const where = () => within(popUp()).getByText(/^\d+ of \d+$/).textContent;
    const [number, total] = where().split(" of ").map(Number);
    expect(total).toBe(monkeysArr.length);
    await user.click(within(popUp()).getByRole("button", { name: "Next monkey" }));
    expect(where()).toBe(`${number + 1} of ${total}`);
});

test("at the start of the list, Previous is hidden but keeps its place", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    const cards = within(document.querySelector(".ShowPage-monkeys")).getAllByRole("button");
    await user.click(cards[0]);
    expect(within(popUp()).getByText(/^1 of \d+$/)).toBeInTheDocument();
    expect(within(popUp()).getByRole("button", { name: "Previous monkey", hidden: true })).toBeDisabled();
});
