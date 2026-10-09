import { supabase, SUPABASE_URL } from "./supabase";

// Account photos (supabase/avatars.sql): one per account, in the public
// "avatars" bucket, in a folder named after the account. Each new photo
// gets a new name, so browsers never show an old one from their cache.

const BUCKET = "avatars";
// Square, and sharp at the account pop-up's 80px on high-resolution screens
export const AVATAR_SIZE = { width: 256, height: 256 };

const OUR_PHOTOS = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

// The account's photo address, or null: none yet, or the database hasn't
// got photos (avatars.sql not run). A nice-to-have: never stops signing in.
export async function loadAvatar(user) {
    try {
        const { data, error } = await supabase.from("avatars").select("url").eq("user_id", user.id).maybeSingle();
        return error ? null : data?.url ?? null;
    } catch {
        return null;
    }
}

// Removes an old photo file (a tidy-up: problems are only logged)
async function deleteFile(url) {
    if (!url?.startsWith(OUR_PHOTOS)) return;
    const { error } = await supabase.storage.from(BUCKET).remove([decodeURIComponent(url.slice(OUR_PHOTOS.length))]);
    if (error) console.error("Couldn't delete the old account photo:", error);
}

// Uploads a new photo (from the cropper) in place of the old one (oldUrl,
// or null). Returns its address; throws with a message to show.
export async function saveAvatar(user, blob, oldUrl) {
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const path = `${user.id}/${Date.now()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type,
        cacheControl: "31536000", // never changes at the same address
        upsert: false,
    });
    if (uploadError) {
        console.error("Account photo upload failed:", uploadError);
        throw new Error("Couldn't upload your photo. Please try again in a moment.");
    }
    const url = OUR_PHOTOS + path;
    const { error } = await supabase
        .from("avatars")
        .upsert({ user_id: user.id, url, updated_at: new Date().toISOString() });
    if (error) {
        console.error("Couldn't save the account photo:", error);
        await deleteFile(url);
        throw new Error("Couldn't save your photo. Please try again in a moment.");
    }
    await deleteFile(oldUrl);
    return url;
}
