// Photo uploads: naming, the upload request, the crop screen and the edit
// form's behaviour around them. The test browser can't really crop images,
// so the form tests use a stand-in crop screen.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { photoPath, slug, PHOTO_ASPECT, PHOTO_WIDTH, PHOTO_HEIGHT } from "./photoUpload";
import * as photoUpload from "./photoUpload";
import MonkeyForm from "./MonkeyForm";

// The form's uploads use a stand-in; the "uploading" tests use the real one
vi.mock("./photoUpload", async (importOriginal) => {
    const original = await importOriginal();
    return { ...original, uploadPhoto: vi.fn(), deletePhotos: vi.fn() };
});
const {
    uploadPhoto: realUploadPhoto,
    deletePhotos: realDeletePhotos,
    storedPhotoPath,
} = await vi.importActual("./photoUpload");

// Saving / deleting a monkey: stand-ins that just succeed
vi.mock("./monkeyData", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        saveMonkey: vi.fn(async (values, _ids, id) => ({ ...values, id: id ?? 99 })),
        deleteMonkey: vi.fn(async () => {}),
    };
});

// Stand-in crop screen: "Use photo" hands back a pretend cropped photo
vi.mock("./PhotoCropper", () => ({
    default: ({ file, position, onUse, onCancel }) => (
        <div role="dialog" aria-label="Crop photo">
            <span>{position}</span>
            <span>{file.name}</span>
            <button type="button" onClick={() => onUse(new Blob(["cropped"], { type: "image/webp" }))}>
                Use photo
            </button>
            <button type="button" onClick={onCancel}>Cancel</button>
        </div>
    ),
}));

// Each test starts with the stand-ins' call records empty
beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

test("every photo is the site's standard 5:4 shape, 960 × 768", () => {
    expect(PHOTO_ASPECT).toBe(5 / 4);
    expect([PHOTO_WIDTH, PHOTO_HEIGHT]).toEqual([960, 768]);
    expect(PHOTO_WIDTH / PHOTO_HEIGHT).toBe(PHOTO_ASPECT);
});

describe("naming uploaded photos", () => {
    test.each([
        ["Maggie Mae", "maggie-mae"],
        ["D&D", "d-d"],
        ["Chloé", "chloe"],
        ["  ", "monkey"],
        ["Mr. Miyagi", "mr-miyagi"],
    ])("%j → %j", (text, expected) => {
        expect(slug(text)).toBe(expected);
    });

    test("filed under the troop, named after the monkey, never overwriting", () => {
        expect(photoPath("Goliath", "Maggie Mae", "webp", 1759240000000)).toBe(
            "goliath/maggie-mae-1759240000000.webp"
        );
        expect(photoPath("", "", "jpg", 1)).toBe("unsorted/monkey-1.jpg");
    });
});

describe("uploading", () => {
    function fakeStorage(result) {
        const upload = vi.fn(async () => result);
        vi.spyOn(supabase.storage, "from").mockReturnValue({
            upload,
            getPublicUrl: (path) => ({
                data: { publicUrl: `https://demlwtsrnlkiskcntbcc.supabase.co/storage/v1/object/public/monkey-photos/${path}` },
            }),
        });
        return upload;
    }

    test("uploads to the monkey-photos bucket and returns the photo's web address", async () => {
        const upload = fakeStorage({ error: null });
        const photo = new Blob(["cropped"], { type: "image/webp" });
        const url = await realUploadPhoto(photo, { troop: "Goliath", name: "Nova" });

        expect(supabase.storage.from).toHaveBeenCalledWith("monkey-photos");
        const [path, blob, options] = upload.mock.calls[0];
        expect(path).toMatch(/^goliath\/nova-\d+\.webp$/);
        expect(blob).toBe(photo);
        expect(options).toMatchObject({ contentType: "image/webp", upsert: false });
        expect(url).toMatch(/^https:\/\/.*\/monkey-photos\/goliath\/nova-\d+\.webp$/);
    });

    test("a JPEG (from browsers that can't make WebP) is saved as .jpg", async () => {
        const upload = fakeStorage({ error: null });
        await realUploadPhoto(new Blob(["x"], { type: "image/jpeg" }), { troop: "Koko", name: "Joli" });
        expect(upload.mock.calls[0][0]).toMatch(/^koko\/joli-\d+\.jpg$/);
        expect(upload.mock.calls[0][2].contentType).toBe("image/jpeg");
    });

    test("a refusal gives a clear message", async () => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        fakeStorage({ error: { message: "new row violates row-level security policy", statusCode: "403" } });
        await expect(
            realUploadPhoto(new Blob(["x"], { type: "image/webp" }), { troop: "Koko", name: "Joli" })
        ).rejects.toThrow("Are you still signed in as an editor?");
    });
});

describe("Upload photo in the edit form", () => {
    const uploadPhoto = vi.mocked(photoUpload.uploadPhoto);
    const monkey = {
        id: 1, name: "Nova", troop: "Goliath", sex: "female", year: 2024, chip: "",
        img: ["https://i.ibb.co/2YvYtBJ/blank-image-min.jpg"], bio: "", desc: "",
    };
    const photo = (name) => new File(["x"], name, { type: "image/jpeg" });
    const cropScreen = () => screen.queryByRole("dialog", { name: "Crop photo" });
    const photoLinks = () => screen.queryAllByLabelText(/^Photo link \d/).map((input) => input.value);
    const fileInput = () => screen.getByLabelText("Upload photo");

    function setup() {
        const user = userEvent.setup();
        render(
            <MonkeyForm
                monkey={monkey}
                troops={["Goliath"]}
                troopIds={{ Goliath: 1 }}
                onClose={() => {}}
                onSaved={() => {}}
                onDeleted={() => {}}
            />
        );
        return { user };
    }

    test("each chosen photo is framed in the crop screen, then uploaded and listed", async () => {
        let finishUpload;
        uploadPhoto
            .mockImplementationOnce(() => new Promise((resolve) => (finishUpload = resolve)))
            .mockResolvedValueOnce("https://x.supabase.co/monkey-photos/goliath/nova-2.webp");
        const { user } = setup();

        await user.upload(fileInput(), [photo("one.jpg"), photo("two.jpg")]);
        expect(within(cropScreen()).getByText("Photo 1 of 2")).toBeInTheDocument();
        expect(within(cropScreen()).getByText("one.jpg")).toBeInTheDocument();

        await user.click(within(cropScreen()).getByRole("button", { name: "Use photo" }));
        // The cropped photo (not the original file) is uploaded
        expect(uploadPhoto).toHaveBeenCalledWith(expect.any(Blob), { troop: "Goliath", name: "Nova" });
        expect(uploadPhoto.mock.calls[0][0]).not.toBeInstanceOf(File);
        expect(screen.getByRole("status")).toHaveTextContent("Uploading photo…");
        expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();

        finishUpload("https://x.supabase.co/monkey-photos/goliath/nova-1.webp");
        // Then the second photo's turn
        expect(await within(await screen.findByRole("dialog", { name: "Crop photo" })).findByText("Photo 2 of 2")).toBeInTheDocument();
        await user.click(within(cropScreen()).getByRole("button", { name: "Use photo" }));

        await waitFor(() => expect(photoLinks()).toHaveLength(2));
        expect(photoLinks()).toEqual([
            "https://x.supabase.co/monkey-photos/goliath/nova-1.webp",
            "https://x.supabase.co/monkey-photos/goliath/nova-2.webp",
        ]);
        expect(cropScreen()).toBeNull();
        expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
    });

    test("Cancel skips a photo without uploading it", async () => {
        uploadPhoto.mockResolvedValue("https://x.supabase.co/monkey-photos/goliath/nova-2.webp");
        const { user } = setup();
        await user.upload(fileInput(), [photo("one.jpg"), photo("two.jpg")]);
        await user.click(within(cropScreen()).getByRole("button", { name: "Cancel" }));
        expect(within(cropScreen()).getByText("Photo 2 of 2")).toBeInTheDocument();
        await user.click(within(cropScreen()).getByRole("button", { name: "Use photo" }));

        await waitFor(() => expect(photoLinks()).toEqual(["https://x.supabase.co/monkey-photos/goliath/nova-2.webp"]));
        expect(uploadPhoto).toHaveBeenCalledTimes(1);
    });

    test("Escape closes the crop screen but not the form", async () => {
        const { user } = setup();
        await user.upload(fileInput(), photo("one.jpg"));
        await user.keyboard("{Escape}");
        expect(cropScreen()).toBeNull();
        expect(screen.getByRole("dialog", { name: "Edit Nova" })).toBeInTheDocument();
        expect(uploadPhoto).not.toHaveBeenCalled();
    });

    test("a failed upload shows why and leaves the list as it was", async () => {
        uploadPhoto.mockRejectedValueOnce(new Error("Couldn't upload that photo. Please check your connection and try again."));
        const { user } = setup();
        await user.upload(fileInput(), photo("one.jpg"));
        await user.click(within(cropScreen()).getByRole("button", { name: "Use photo" }));
        expect(await screen.findByText(/Couldn't upload that photo/)).toBeInTheDocument();
        expect(photoLinks()).toEqual([]);
    });

    test("only photos can be chosen, several at once", () => {
        setup();
        expect(fileInput()).toHaveAttribute("accept", "image/*");
        expect(fileInput()).toHaveAttribute("multiple");
    });
});

describe("the real crop screen", () => {
    test("shows the photo in a 5:4 frame with a zoom slider", async () => {
        const { default: PhotoCropper } = await vi.importActual("./PhotoCropper");
        vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:photo");
        vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
        render(<PhotoCropper file={new File(["x"], "a.jpg")} position="Photo 1 of 3" onUse={() => {}} onCancel={() => {}} />);

        const dialog = screen.getByRole("dialog", { name: "Crop photo" });
        expect(within(dialog).getByText("Photo 1 of 3")).toBeInTheDocument();
        expect(within(dialog).getByRole("slider", { name: "Zoom" })).toHaveValue("1");
        expect(dialog.querySelector("img")).toHaveAttribute("src", "blob:photo");
        // Not until the cropper has worked out the area
        expect(within(dialog).getByRole("button", { name: "Use photo" })).toBeDisabled();
    });
});

describe("tidying up photos in storage", () => {
    const OURS = "https://demlwtsrnlkiskcntbcc.supabase.co/storage/v1/object/public/monkey-photos/";
    const IMGBB = "https://i.ibb.co/smzxJ28/aroha-james-oct2023-min.webp";
    const PLACEHOLDER = "https://i.ibb.co/2YvYtBJ/blank-image-min.jpg";

    test("only photos uploaded here are recognised", () => {
        expect(storedPhotoPath(`${OURS}goliath/nova-1.webp`)).toBe("goliath/nova-1.webp");
        expect(storedPhotoPath(`${OURS}d-d/mr-x%201.webp`)).toBe("d-d/mr-x 1.webp");
        expect(storedPhotoPath(IMGBB)).toBeNull();
        expect(storedPhotoPath(PLACEHOLDER)).toBeNull();
    });

    test("deleting ignores ImgBB links and the placeholder, and never repeats", async () => {
        const remove = vi.fn(async () => ({ error: null }));
        vi.spyOn(supabase.storage, "from").mockReturnValue({ remove });
        await realDeletePhotos([`${OURS}goliath/a.webp`, IMGBB, PLACEHOLDER, `${OURS}goliath/a.webp`, `${OURS}koko/b.webp`]);
        expect(supabase.storage.from).toHaveBeenCalledWith("monkey-photos");
        expect(remove).toHaveBeenCalledWith(["goliath/a.webp", "koko/b.webp"]);
    });

    test("nothing of ours to delete: storage isn't contacted", async () => {
        const spy = vi.spyOn(supabase.storage, "from");
        await realDeletePhotos([IMGBB, PLACEHOLDER]);
        expect(spy).not.toHaveBeenCalled();
    });

    describe("from the edit form", () => {
        const deletePhotos = vi.mocked(photoUpload.deletePhotos);
        const uploadPhoto = vi.mocked(photoUpload.uploadPhoto);
        const kept = `${OURS}goliath/nova-old-kept.webp`;
        const dropped = `${OURS}goliath/nova-old-dropped.webp`;
        const monkey = {
            id: 7, name: "Nova", troop: "Goliath", sex: "female", year: 2024, chip: "",
            img: [kept, dropped, IMGBB], bio: "", desc: "",
        };
        let onClose;

        function setup() {
            const user = userEvent.setup();
            onClose = vi.fn();
            render(
                <MonkeyForm monkey={monkey} troops={["Goliath"]} troopIds={{ Goliath: 1 }}
                    onClose={onClose} onSaved={() => {}} onDeleted={() => {}} />
            );
            return { user };
        }
        async function uploadOne(user, url) {
            uploadPhoto.mockResolvedValueOnce(url);
            await user.upload(screen.getByLabelText("Upload photo"), new File(["x"], "p.jpg", { type: "image/jpeg" }));
            await user.click(within(screen.getByRole("dialog", { name: "Crop photo" })).getByRole("button", { name: "Use photo" }));
            await waitFor(() => expect(screen.queryAllByLabelText(/^Photo link/).map((i) => i.value)).toContain(url));
        }

        test("saving deletes photos that were removed (and keeps the rest)", async () => {
            const { user } = setup();
            await user.click(screen.getByRole("button", { name: "Remove photo 2" })); // dropped
            await user.click(screen.getByRole("button", { name: "Remove photo 2" })); // the ImgBB one
            await user.click(screen.getByRole("button", { name: "Save" }));

            await waitFor(() => expect(deletePhotos).toHaveBeenCalled());
            // The ImgBB link is passed along too, but deletePhotos ignores it (tested above)
            expect(deletePhotos).toHaveBeenCalledWith([dropped, IMGBB]);
            expect(deletePhotos.mock.calls[0][0]).not.toContain(kept);
        });

        test("uploaded then removed before saving: deleted on save", async () => {
            const fresh = `${OURS}goliath/nova-fresh.webp`;
            const { user } = setup();
            await uploadOne(user, fresh);
            await user.click(screen.getByRole("button", { name: "Remove photo 4" }));
            await user.click(screen.getByRole("button", { name: "Save" }));
            await waitFor(() => expect(deletePhotos).toHaveBeenCalledWith([fresh]));
        });

        test("uploaded but the form closed without saving: the upload is deleted", async () => {
            vi.spyOn(window, "confirm").mockReturnValue(true);
            const fresh = `${OURS}goliath/nova-unsaved.webp`;
            const { user } = setup();
            await uploadOne(user, fresh);
            await user.click(screen.getByRole("button", { name: "Cancel" }));
            expect(deletePhotos).toHaveBeenCalledWith([fresh]);
            expect(onClose).toHaveBeenCalled();
        });

        test("deleting the monkey deletes its photos", async () => {
            const { user } = setup();
            await user.click(screen.getByRole("button", { name: "Delete" }));
            await user.click(screen.getByRole("button", { name: "Delete" }));
            await waitFor(() => expect(deletePhotos).toHaveBeenCalledWith([kept, dropped, IMGBB]));
        });
    });
});

describe("photo limit in the edit form", () => {
    const OURS = "https://demlwtsrnlkiskcntbcc.supabase.co/storage/v1/object/public/monkey-photos/goliath/";
    const withPhotos = (n) => ({
        id: 3, name: "Nova", troop: "Goliath", sex: "female", year: 2024, chip: "",
        img: Array.from({ length: n }, (_, i) => `${OURS}nova-${i}.webp`), bio: "", desc: "",
    });
    function setup(monkey) {
        const user = userEvent.setup();
        render(
            <MonkeyForm monkey={monkey} troops={["Goliath"]} troopIds={{ Goliath: 1 }}
                onClose={() => {}} onSaved={() => {}} onDeleted={() => {}} />
        );
        return { user };
    }
    const photo = (name) => new File(["x"], name, { type: "image/jpeg" });

    test("at 5 photos, adding is switched off until one is removed", async () => {
        const { user } = setup(withPhotos(5));
        expect(screen.getByText(/5 photos is the most a monkey can have/)).toBeInTheDocument();
        expect(screen.getByLabelText("Upload photo")).toBeDisabled();
        expect(screen.getByRole("button", { name: /Add photo link/ })).toBeDisabled();

        await user.click(screen.getByRole("button", { name: "Remove photo 1" }));
        expect(screen.queryByText(/5 photos is the most/)).toBeNull();
        expect(screen.getByLabelText("Upload photo")).not.toBeDisabled();
        expect(screen.getByRole("button", { name: /Add photo link/ })).not.toBeDisabled();
    });

    test("choosing more than fit: only the ones that fit go to the crop screen", async () => {
        const { user } = setup(withPhotos(3));
        await user.upload(screen.getByLabelText("Upload photo"), [photo("a.jpg"), photo("b.jpg"), photo("c.jpg"), photo("d.jpg")]);
        expect(screen.getByText("Only 2 more photos fit (5 is the most), so the first 2 will be used.")).toBeInTheDocument();
        const crop = screen.getByRole("dialog", { name: "Crop photo" });
        expect(within(crop).getByText("Photo 1 of 2")).toBeInTheDocument();
        expect(within(crop).getByText("a.jpg")).toBeInTheDocument();
    });

    test("with one space left, it says so in words", async () => {
        const { user } = setup(withPhotos(4));
        await user.upload(screen.getByLabelText("Upload photo"), [photo("a.jpg"), photo("b.jpg")]);
        expect(screen.getByText("Only 1 more photo fit (5 is the most), so the first one will be used.")).toBeInTheDocument();
    });
});
