import { supabase, SUPABASE_URL } from "./supabase";
import { photoPath, thumbPath, THUMB_WIDTH, THUMB_HEIGHT, THUMB_QUALITY } from "./photoPaths";

export { slug, photoPath, thumbPath } from "./photoPaths";

// Uploading monkey photos to Supabase Storage (the "monkey-photos" bucket,
// set up by supabase/storage.sql). Each photo is cropped to the site's
// standard shape first (see PhotoCropper), so every photo matches.

const BUCKET = "monkey-photos";

// Every monkey photo is 5:4 landscape at 960 × 768 pixels, the same as all
// the photos from before uploads existed
export const PHOTO_ASPECT = 5 / 4;
export const PHOTO_WIDTH = 960;
export const PHOTO_HEIGHT = 768;
const QUALITY = 0.85;

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () =>
            reject(new Error("That file doesn't look like a photo this browser can open."));
        img.src = src;
    });
}

// Cuts out the chosen area of a photo and scales it to 960 × 768.
//   imageSrc: the photo (e.g. an object URL of the chosen file)
//   area:     { x, y, width, height } in the photo's own pixels (from the cropper)
//   size:     another size instead, e.g. account photos: { width: 256, height: 256 }
// Returns a Blob: WebP where the browser can make one, otherwise JPEG.
export async function cropPhoto(imageSrc, area, { width = PHOTO_WIDTH, height = PHOTO_HEIGHT } = {}) {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, width, height);

    const toBlob = (type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
    const webp = await toBlob("image/webp");
    // Some browsers can't make WebP and quietly give PNG: use JPEG then
    if (webp && webp.type === "image/webp") return webp;
    const jpeg = await toBlob("image/jpeg");
    if (!jpeg) throw new Error("Couldn't process that photo.");
    return jpeg;
}

// Web addresses of photos uploaded here all start like this (ImgBB photos
// and other links don't, and are never deleted by the site)
const OUR_PHOTOS = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;

// A photo uploaded here? → its path in the bucket (e.g. "goliath/nova-1.webp"),
// otherwise null
export function storedPhotoPath(url) {
    return url.startsWith(OUR_PHOTOS) ? decodeURIComponent(url.slice(OUR_PHOTOS.length)) : null;
}

// Deletes photos (and their thumbnails) from storage. Only ones uploaded
// here; anything else (ImgBB links, the placeholder) is ignored. A tidy-up,
// so problems are only logged: they never stop a save.
export async function deletePhotos(urls) {
    const photos = [...new Set(urls.map(storedPhotoPath).filter(Boolean))];
    const paths = [...photos, ...photos.map(thumbPath)];
    if (!paths.length) return;
    const { error } = await supabase.storage.from(BUCKET).remove(paths);
    if (error) console.error("Couldn't delete old photos from storage:", error);
}

// Uploads a prepared photo (from cropPhoto); returns its public web address
export async function uploadPhoto(blob, { troop, name }) {
    const extension = blob.type === "image/webp" ? "webp" : "jpg";
    const path = photoPath(troop, name, extension);
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
        contentType: blob.type,
        cacheControl: "31536000", // photos never change at the same address
        upsert: false,
    });
    if (error) {
        console.error("Photo upload failed:", error);
        const refused = /row-level security|unauthori[sz]ed|not allowed|403/i.test(
            `${error.message} ${error.statusCode ?? ""}`
        );
        throw new Error(
            refused
                ? "The upload wasn't allowed. Are you still signed in as an editor?"
                : "Couldn't upload that photo. Please check your connection and try again."
        );
    }
    // The thumbnail is a nice-to-have: without one the site uses the full photo
    try {
        const thumb = await makeThumbnail(blob);
        const { error: thumbError } = await supabase.storage.from(BUCKET).upload(thumbPath(path), thumb, {
            contentType: "image/webp",
            cacheControl: "31536000",
            upsert: true,
        });
        if (thumbError) throw thumbError;
    } catch (thumbProblem) {
        console.warn("Couldn't save a thumbnail for", path, thumbProblem);
    }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// A small WebP copy of a prepared photo, for the cards and for offline use
export async function makeThumbnail(blob) {
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_WIDTH;
    canvas.height = THUMB_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
    bitmap.close?.();
    const thumb = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", THUMB_QUALITY));
    if (!thumb || thumb.type !== "image/webp") throw new Error("This browser can't make WebP thumbnails");
    return thumb;
}
