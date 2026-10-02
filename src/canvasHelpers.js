import { isInstalledApp } from "./installApp";

// Shared by the pictures made for sharing (game results, monkey profiles):
// the site's fonts and a few drawing helpers for a canvas.

export const TITLE_FONT = '"Russo One", Impact, sans-serif';
export const TEXT_FONT = '"Nunito Sans", Arial, sans-serif';

// The page's fonts, so pictures match the site (quietly skipped if they
// can't load: the canvas then uses similar standard fonts)
export async function loadFonts() {
    try {
        await Promise.all([
            document.fonts.load(`80px ${TITLE_FONT}`),
            document.fonts.load(`700 40px ${TEXT_FONT}`),
            document.fonts.load(`400 40px ${TEXT_FONT}`),
        ]);
    } catch {
        // fonts unavailable
    }
}

export function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
}

// Largest font size (up to `size`) at which the text fits `maxWidth`
export function fitFont(ctx, text, { size, weight = "", family, maxWidth }) {
    let s = size;
    do {
        ctx.font = `${weight} ${s}px ${family}`.trim();
        if (ctx.measureText(text).width <= maxWidth) break;
        s -= 2;
    } while (s > 12);
    return s;
}

// A canvas as a PNG Blob
export function canvasToPng(canvas) {
    return new Promise((resolve, reject) =>
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("No image"))), "image/png")
    );
}

// How long a download's temporary address stays usable. Firefox on Android
// reads the file a moment after the tap, so it mustn't be freed straight away.
export const DOWNLOAD_KEEP_MS = 5 * 60 * 1000;

// Firefox's home-screen app on Android can't download from a link (it shows
// about:blank), but opening the file in a new window works (tested 2026-10-03)
export function isFirefoxAndroidApp() {
    const ua = navigator.userAgent;
    return /Android/.test(ua) && /Firefox\//.test(ua) && isInstalledApp();
}

// Downloads a Blob as a file (photos, pictures, Profile Books). Must be
// called straight from a tap: browsers block downloads that aren't.
export function downloadBlob(blob, filename) {
    // A File (rather than a Blob) carries its name, for browsers that use it
    const file = new File([blob], filename, { type: blob.type });
    const url = URL.createObjectURL(file);
    if (isFirefoxAndroidApp()) {
        window.open(url, "_blank");
    } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
    }
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_KEEP_MS);
}
