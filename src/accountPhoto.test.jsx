// Account photos: staff add, change and remove their own, shown in place of
// the person icon. Supabase is replaced with a pretend version that records
// what would be saved.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase, SUPABASE_URL } from "./supabase";
import { AuthProvider } from "./auth";
import ShowPage from "./ShowPage";

const STAFF = { id: "staff-1", email: "sam@example.com" };
const PHOTOS = `${SUPABASE_URL}/storage/v1/object/public/avatars/`;
const OLD_PHOTO = `${PHOTOS}staff-1/1000.webp`;

// Stand-in crop screen: "Use photo" hands back a pretend cropped photo
vi.mock("./PhotoCropper", () => ({
    default: ({ round, onUse, onCancel }) => (
        <div role="dialog" aria-label="Crop photo" data-round={round}>
            <button type="button" onClick={() => onUse(new Blob(["cropped"], { type: "image/webp" }))}>
                Use photo
            </button>
            <button type="button" onClick={onCancel}>Cancel</button>
        </div>
    ),
}));

let stored; // what the pretend database and storage were asked to do
function fakeSupabase({ role = "editor", photo = null, uploadError = null } = {}) {
    stored = { uploads: [], removed: [], upserts: [], deletes: 0 };
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({ data: { session: { user: STAFF } } });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockReturnValue({
        data: { subscription: { unsubscribe: () => {} } },
    });
    vi.spyOn(supabase, "from").mockImplementation((table) => {
        if (table === "avatars") {
            return {
                select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: photo && { url: photo }, error: null }) }) }),
                upsert: async (row) => {
                    stored.upserts.push(row);
                    return { error: null };
                },
                delete: () => ({
                    eq: async () => {
                        stored.deletes++;
                        return { error: null };
                    },
                }),
            };
        }
        if (table === "editors") {
            return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: role && { user_id: STAFF.id, role }, error: null }) }) }) };
        }
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) };
    });
    vi.spyOn(supabase.storage, "from").mockReturnValue({
        upload: async (path, blob) => {
            stored.uploads.push({ path, type: blob.type });
            return { error: uploadError };
        },
        remove: async (paths) => {
            stored.removed.push(...paths);
            return { error: null };
        },
    });
}

afterEach(() => vi.restoreAllMocks());

async function openAccount(options) {
    fakeSupabase(options);
    const user = userEvent.setup();
    render(
        <AuthProvider>
            <ShowPage />
        </AuthProvider>
    );
    await user.click(await screen.findByRole("button", { name: "Account (signed in)" }));
    await user.click(screen.getByRole("menuitem", { name: "Account" }));
    const dialog = screen.getByRole("dialog", { name: "Account" });
    return { user, dialog };
}

const choosePhoto = (user) =>
    user.upload(screen.getByTestId("AccountModal-photoInput"), new File(["me"], "me.jpg", { type: "image/jpeg" }));

test("no photo yet: the person icon; tapping it lets staff add one, cropped round", async () => {
    const { user, dialog } = await openAccount();
    expect(within(dialog).getByRole("button", { name: "Add Photo" })).toBeInTheDocument();

    await choosePhoto(user);
    expect(screen.getByRole("dialog", { name: "Crop photo" })).toHaveAttribute("data-round", "true");
    await user.click(screen.getByRole("button", { name: "Use photo" }));

    await waitFor(() => expect(stored.upserts).toHaveLength(1));
    expect(stored.uploads).toEqual([{ path: expect.stringMatching(/^staff-1\/\d+\.webp$/), type: "image/webp" }]);
    expect(stored.upserts[0]).toMatchObject({ user_id: STAFF.id, url: PHOTOS + stored.uploads[0].path });
    expect(await within(dialog).findByText("Photo saved.")).toBeInTheDocument();
    // Shown in the pop-up, the top bar and the bottom bar, still ringed green
    const photos = document.querySelectorAll(`img[src="${PHOTOS + stored.uploads[0].path}"]`);
    expect(photos).toHaveLength(3);
    expect(document.querySelector(".Nav-account")).toHaveClass("is-signed-in");
    expect(within(dialog).getByRole("button", { name: "Change Photo" })).toBeInTheDocument();
});

test("a photo already: shown everywhere; changing it removes the old file", async () => {
    const { user, dialog } = await openAccount({ photo: OLD_PHOTO });
    expect(document.querySelectorAll(`img[src="${OLD_PHOTO}"]`)).toHaveLength(3);

    await user.click(within(dialog).getByRole("button", { name: "Change Photo" }));
    await choosePhoto(user);
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    await waitFor(() => expect(stored.removed).toEqual(["staff-1/1000.webp"]));
    expect(document.querySelectorAll(`img[src="${OLD_PHOTO}"]`)).toHaveLength(0);
});

test("Cancel on the crop screen: nothing uploaded", async () => {
    const { user } = await openAccount();
    await choosePhoto(user);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Crop photo" })).toBeNull();
    expect(stored.uploads).toHaveLength(0);
});

test("an upload that fails is explained, and nothing changes", async () => {
    const { user, dialog } = await openAccount({ uploadError: { message: "nope" } });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await choosePhoto(user);
    await user.click(screen.getByRole("button", { name: "Use photo" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Couldn't upload your photo");
    expect(stored.upserts).toHaveLength(0);
    expect(within(dialog).getByRole("button", { name: "Add Photo" })).toBeInTheDocument();
});

test("accounts without a role (viewers) can't add a photo", async () => {
    const { dialog } = await openAccount({ role: null });
    expect(within(dialog).queryByRole("button", { name: /Add Photo|Change Photo/ })).toBeNull();
    expect(screen.queryByTestId("AccountModal-photoInput")).toBeNull();
});
