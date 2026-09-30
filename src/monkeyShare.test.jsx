// Sharing one monkey: its link (#monkey/aroha-h-b), Back closing the
// pop-up, the Share and Save image buttons, and the age shown in the pop-up.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import { ageText, drawMonkeyImage } from "./monkeyImage";
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
    expect(ageText(2016, 2026)).toBe("(10 years old)");
    expect(ageText(2025, 2026)).toBe("(1 year old)");
    expect(ageText(2026, 2026)).toBe("(under 1 year old)");
    expect(ageText("", 2026)).toBe("");
});

test("the pop-up shows the age after the birth year", async () => {
    const user = userEvent.setup();
    render(<ShowPage />);
    await openAroha(user);
    expect(within(popUp()).getByText(/^Born:/)).toHaveTextContent(
        `Born: ${aroha.year} ${ageText(aroha.year)}`
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
