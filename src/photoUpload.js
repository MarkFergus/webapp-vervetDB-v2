import { supabase, SUPABASE_URL } from "./supabase";

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

// "Maggie Mae" → "maggie-mae", "D&D" → "d-d"
export function slug(text) {
    const s = text
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return s || "monkey";
}

// Where a photo is stored, e.g. "goliath/maggie-mae-1759240000000.webp"
export function photoPath(troop, name, extension, time = Date.now()) {
    return `${slug(troop || "unsorted")}/${slug(name)}-${time}.${extension}`;
}

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
// Returns a Blob: WebP where the browser can make one, otherwise JPEG.
export async function cropPhoto(imageSrc, area) {
    const img = await loadImage(imageSrc);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_WIDTH;
    canvas.height = PHOTO_HEIGHT;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT);

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

// Deletes photos from storage. Only ones uploaded here; anything else (ImgBB
// links, the placeholder) is ignored. A tidy-up, so problems are only
// logged: they never stop a save.
export async function deletePhotos(urls) {
    const paths = [...new Set(urls.map(storedPhotoPath).filter(Boolean))];
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
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}
