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
// opens a downloaded PDF in its own viewer and only reads the file after a
// moment; freeing the address sooner (it was 1 second) left a black screen.
export const DOWNLOAD_KEEP_MS = 5 * 60 * 1000;

// Downloads a Blob as a file (photos, pictures, Profile Books)
export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_KEEP_MS);
}
