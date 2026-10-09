// Add Photos: photos already taken, matched to their monkeys and uploaded
// together. The test browser can't open or crop images, so uploads, cropping
// and saving use stand-ins.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BUILT_IN_DATA, saveMonkeyPhotos } from "./monkeyData";
import { cropPhoto, deletePhotos, uploadPhoto } from "./photoUpload";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";
import {
    centreCrop,
    photoSlots,
    photosAfter,
    photoSuggestions,
    readyToUpload,
    realPhotos,
    searchMonkeys,
} from "./addPhotos";
import QuickPhotos, { MAX_BATCH } from "./QuickPhotos";
import ShowPage from "./ShowPage";

vi.mock("./photoUpload", async (importOriginal) => ({
    ...(await importOriginal()),
    uploadPhoto: vi.fn(),
    deletePhotos: vi.fn(),
    cropPhoto: vi.fn(async () => new Blob(["middle"], { type: "image/webp" })),
}));
vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    saveMonkeyPhotos: vi.fn(),
}));
// Stand-in crop screen: "Use photo" hands back a pretend cropped photo
vi.mock("./PhotoCropper", () => ({
    default: ({ onUse, onCancel }) => (
        <div role="dialog" aria-label="Crop photo">
            <button type="button" onClick={() => onUse(new Blob(["framed"], { type: "image/webp" }))}>
                Use photo
            </button>
            <button type="button" onClick={onCancel}>Cancel</button>
        </div>
    ),
}));
// Signed in as an editor (for the pop-up's Photos button)
vi.mock("./auth", async (importOriginal) => ({
    ...(await importOriginal()),
    useAuth: () => ({ user: { id: "u1", email: "editor@example.com" }, isEditor: true, isAdmin: false }),
}));

// Live data has ids; give the built-in copy some
const MONKEYS = BUILT_IN_DATA.monkeys.map((m, i) => ({ ...m, id: i + 1 }));
const byName = (name) => MONKEYS.find((m) => m.name === name);
const PHOTO = (n) => `https://example.com/p${n}.webp`;

// Photos open as 2000 × 1000 (the stand-in browser can't open them)
class FakeImage {
    set src(_) {
        setTimeout(() => {
            this.naturalWidth = 2000;
            this.naturalHeight = 1000;
            this.onload();
        });
    }
}
let uploads;
beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("Image", FakeImage);
    URL.createObjectURL = vi.fn(() => "blob:photo");
    URL.revokeObjectURL = vi.fn();
    uploads = 0;
    uploadPhoto.mockImplementation(async () => `https://example.com/new-${++uploads}.webp`);
    saveMonkeyPhotos.mockImplementation(async (id, photos) => ({ ...MONKEYS.find((m) => m.id === id), img: photos }));
});
afterEach(() => vi.unstubAllGlobals());

const file = (name) => new File(["x"], name, { type: "image/jpeg" });

describe("the working-out", () => {
    test("the middle of a photo, in the 5:4 shape", () => {
        expect(centreCrop(2000, 1000)).toEqual({ x: 375, y: 0, width: 1250, height: 1000 });
        expect(centreCrop(1000, 2000)).toEqual({ x: 0, y: 600, width: 1000, height: 800 });
        expect(centreCrop(1250, 1000)).toEqual({ x: 0, y: 0, width: 1250, height: 1000 });
    });

    test("search: by name, or chip number", () => {
        expect(searchMonkeys(MONKEYS, "aro").map((m) => m.name)).toContain("Aroha");
        expect(searchMonkeys(MONKEYS, "19806").map((m) => m.name)).toEqual(["Aroha"]);
        expect(searchMonkeys(MONKEYS, "  ")).toEqual([]);
    });

    test("suggestions: the photo before, the open monkey, the page's, recent, then Photo Needed; each once", () => {
        const [a, b, c, d] = MONKEYS;
        const groups = photoSuggestions(MONKEYS, {
            previous: a,
            current: b,
            place: { name: "H&B C1", monkeys: [a, c] },
            recent: [d, b],
        });
        expect(groups.map((g) => g.title)).toEqual([
            "Same as the photo before",
            "Opened",
            "At Holt & Barrington C1",
            "Recently opened",
            "Photo Needed",
        ]);
        expect(groups[2].monkeys).toEqual([c]);
        expect(groups[3].monkeys).toEqual([d]);
        expect(groups[4].monkeys.every((m) => realPhotos(m).length === 0)).toBe(true);
    });

    test("room for 5 photos each: the ones that don't fit need a photo to replace", () => {
        const full = { ...MONKEYS[0], img: [1, 2, 3, 4, 5].map(PHOTO) };
        const four = { ...MONKEYS[1], img: [1, 2, 3, 4].map(PHOTO) };
        const byId = { [full.id]: full, [four.id]: four };
        const items = [
            { key: 1, monkeyId: four.id, replace: null },
            { key: 2, monkeyId: four.id, replace: null },
            { key: 3, monkeyId: full.id, replace: PHOTO(2) },
            { key: 4, monkeyId: full.id, replace: null },
        ];
        const slots = photoSlots(items, byId);
        expect(slots[1].full).toBe(false);
        expect(slots[2].full).toBe(true);
        // (one photo can't be replaced twice)
        expect(slots[4].choices).not.toContain(PHOTO(2));
        expect(readyToUpload(items, slots)).toBe(false);
        items[1].replace = PHOTO(1);
        items[3].replace = PHOTO(5);
        expect(readyToUpload(items, slots)).toBe(true);
        expect(readyToUpload([{ key: 9, monkeyId: null, replace: null }], {})).toBe(false);
    });

    test("photos after: replaced in place, others added; no photo before: the first new one is the primary", () => {
        const monkey = { img: [PHOTO(1), PHOTO(2)] };
        expect(photosAfter(monkey, [{ url: "new", replace: PHOTO(1) }, { url: "new2", replace: null }])).toEqual([
            "new",
            PHOTO(2),
            "new2",
        ]);
        expect(photosAfter({ img: [PLACEHOLDER_PHOTO] }, [{ url: "a" }, { url: "b" }])).toEqual(["a", "b"]);
    });
});

function showQuickPhotos(props = {}) {
    const user = userEvent.setup();
    const onSaved = vi.fn();
    const onClose = vi.fn();
    const onOpenMonkey = vi.fn();
    render(
        <QuickPhotos
            files={[file("a.jpg"), file("b.jpg"), file("c.jpg")]}
            monkeys={MONKEYS}
            onSaved={onSaved}
            onClose={onClose}
            onOpenMonkey={onOpenMonkey}
            {...props}
        />
    );
    return { user, onSaved, onClose, onOpenMonkey };
}
const uploadButton = () => screen.getByRole("button", { name: /^Upload/ });
async function choose(user, photoNumber, search, name = search) {
    await user.click(screen.getByRole("button", { name: new RegExp(`^Photo ${photoNumber}: `) }));
    await user.type(screen.getByLabelText("Search for the monkey"), search);
    await user.click(screen.getByRole("button", { name: new RegExp(`^${name}`) }));
}

describe("Add Photos", () => {
    test("a batch: choose who's in each (Same as the photo before: one tap), upload, each monkey saved once", async () => {
        const { user, onSaved } = showQuickPhotos();
        expect(screen.getByRole("heading", { name: "Add Photos" })).toBeInTheDocument();
        expect(uploadButton()).toHaveTextContent("Upload 3 Photos");
        expect(uploadButton()).toBeDisabled();

        await choose(user, 1, "Aroha");
        // Photo 2: the same monkey is the first suggestion
        await user.click(screen.getByRole("button", { name: "Photo 2: Who is this?" }));
        const same = screen.getByRole("region", { name: "Same as the photo before" });
        await user.click(within(same).getByRole("button", { name: /^Aroha/ }));
        await choose(user, 3, "Ayeshe");
        expect(uploadButton()).toBeEnabled();

        await user.click(uploadButton());
        expect(await screen.findByRole("heading", { name: "Photos Added" })).toBeInTheDocument();
        // Cropped to the middle (none were cropped by hand)
        expect(cropPhoto).toHaveBeenCalledWith("blob:photo", { x: 375, y: 0, width: 1250, height: 1000 });
        // Filed under where they live
        expect(uploadPhoto).toHaveBeenCalledWith(expect.any(Blob), { troop: "H&B", name: "Aroha" });
        expect(saveMonkeyPhotos).toHaveBeenCalledTimes(2);
        expect(saveMonkeyPhotos).toHaveBeenCalledWith(byName("Aroha").id, [...realPhotos(byName("Aroha")), "https://example.com/new-1.webp", "https://example.com/new-2.webp"]);
        expect(onSaved).toHaveBeenCalledTimes(2);
        expect(screen.getByText(/2 photos added to/)).toHaveTextContent("2 photos added to Aroha");
        expect(screen.getByText(/1 photo added to/)).toHaveTextContent("1 photo added to Ayeshe");
    });

    test("opened for a monkey: every photo starts as theirs; Remove takes one out; Crop uses the framed photo", async () => {
        const aroha = byName("Aroha");
        const { user } = showQuickPhotos({ current: aroha });
        expect(screen.getAllByRole("button", { name: /: Aroha \(change\)$/ })).toHaveLength(3);
        await user.click(screen.getByRole("button", { name: "Remove photo 3" }));
        expect(uploadButton()).toHaveTextContent("Upload 2 Photos");
        await user.click(within(screen.getByRole("listitem", { name: "Photo 1" })).getByRole("button", { name: "Crop" }));
        await user.click(screen.getByRole("button", { name: "Use photo" }));
        expect(within(screen.getByRole("listitem", { name: "Photo 1" })).getByRole("button", { name: "Cropped" })).toBeInTheDocument();
        await user.click(uploadButton());
        await screen.findByRole("heading", { name: "Photos Added" });
        // Only the photo not framed by hand was cropped to its middle
        expect(cropPhoto).toHaveBeenCalledTimes(1);
        expect(saveMonkeyPhotos).toHaveBeenCalledTimes(1);
    });

    test("a monkey with 5 photos: Upload waits for one to replace; it's swapped in place and the old one deleted", async () => {
        const full = { ...byName("Aroha"), img: [1, 2, 3, 4, 5].map(PHOTO) };
        const monkeys = MONKEYS.map((m) => (m.id === full.id ? full : m));
        saveMonkeyPhotos.mockImplementation(async (id, photos) => ({ ...full, img: photos }));
        const { user } = showQuickPhotos({ files: [file("a.jpg")], monkeys, current: full });
        expect(screen.getByText("Aroha has 5 photos already. Replace:")).toBeInTheDocument();
        expect(uploadButton()).toBeDisabled();
        await user.click(screen.getByRole("radio", { name: "Replace Aroha's photo 3" }));
        await user.click(uploadButton());
        await screen.findByRole("heading", { name: "Photos Added" });
        expect(saveMonkeyPhotos).toHaveBeenCalledWith(full.id, [PHOTO(1), PHOTO(2), "https://example.com/new-1.webp", PHOTO(4), PHOTO(5)]);
        expect(deletePhotos).toHaveBeenCalledWith([PHOTO(3)]);
    });

    test("a failed save: that monkey's uploads are tidied away, and the photos stay to try again", async () => {
        saveMonkeyPhotos.mockRejectedValueOnce(new Error("Couldn't save right now."));
        const { user, onSaved } = showQuickPhotos({ files: [file("a.jpg")], current: byName("Aroha") });
        await user.click(uploadButton());
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save right now.");
        expect(deletePhotos).toHaveBeenCalledWith(["https://example.com/new-1.webp"]);
        expect(onSaved).not.toHaveBeenCalled();
        expect(uploadButton()).toBeEnabled();
    });

    test("Open at the end opens the monkey; leaving before uploading asks first", async () => {
        const { user, onOpenMonkey, onClose } = showQuickPhotos({ files: [file("a.jpg")], current: byName("Aroha") });
        const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
        await user.click(screen.getByRole("button", { name: "Close" }));
        expect(confirm).toHaveBeenCalled();
        expect(onClose).not.toHaveBeenCalled();
        await user.click(uploadButton());
        await user.click(await screen.findByRole("button", { name: "Open Aroha" }));
        expect(onOpenMonkey).toHaveBeenCalledWith(expect.objectContaining({ name: "Aroha" }));
        await user.click(screen.getByRole("button", { name: "Done" }));
        expect(onClose).toHaveBeenCalled();
    });

    test(`at most ${MAX_BATCH} photos at a time`, () => {
        showQuickPhotos({ files: Array.from({ length: MAX_BATCH + 3 }, (_, i) => file(`${i}.jpg`)) });
        expect(screen.getAllByRole("listitem")).toHaveLength(MAX_BATCH);
        expect(screen.getByText(`Only ${MAX_BATCH} photos at a time, so the first ${MAX_BATCH} are here.`)).toBeInTheDocument();
    });
});

test("a monkey's pop-up: Photos opens the photo picker, then Add Photos with that monkey for every photo", async () => {
    const user = userEvent.setup();
    render(<ShowPage monkeys={MONKEYS} editable />);
    await user.click(screen.getByRole("button", { name: /^Aroha,/ }));
    const picker = screen.getByTestId("add-photos-picker");
    const click = vi.spyOn(picker, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: "Add photos of Aroha" }));
    expect(click).toHaveBeenCalled();
    await user.upload(picker, [file("a.jpg"), file("b.jpg")]);
    const dialog = await screen.findByRole("dialog", { name: "Add Photos" });
    expect(within(dialog).getAllByRole("button", { name: /: Aroha \(change\)$/ })).toHaveLength(2);
    // The pop-up has closed behind it (once it's faded away)
    await waitFor(() => expect(document.querySelector(".Modal")).toBeNull());
});

test("phones: the bottom bar's Add Photos opens the photo picker straight away (no menu)", async () => {
    const user = userEvent.setup();
    render(<ShowPage monkeys={MONKEYS} editable />);
    const picker = screen.getByTestId("add-photos-picker");
    const click = vi.spyOn(picker, "click").mockImplementation(() => {});
    const bar = screen.getByRole("navigation", { name: "Main" });
    await user.click(within(bar).getByRole("button", { name: "Add Photos" }));
    expect(click).toHaveBeenCalledTimes(1);
    expect(within(bar).queryByRole("button", { name: /Interactive Map/ })).toBeNull();
});
