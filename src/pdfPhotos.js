// react-pdf can only embed JPG and PNG images, but most monkey photos are
// WebP. These helpers load each photo in the browser, draw it onto a canvas
// and export it as a (smaller) JPG that react-pdf can use.

const MAX_WIDTH = 600; // plenty for the PDF's photo column
const JPG_QUALITY = 0.8;
const PARALLEL_DOWNLOADS = 6;

// Resolves to a JPG data URL, or null if the photo can't be loaded
export function photoToJpg(url) {
    return new Promise((resolve) => {
        const img = new Image();
        // Lets the canvas read photos from another site (ImgBB allows this)
        img.crossOrigin = "anonymous";
        img.onload = () => {
            try {
                const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
                const canvas = document.createElement("canvas");
                canvas.width = Math.round(img.naturalWidth * scale);
                canvas.height = Math.round(img.naturalHeight * scale);
                canvas.getContext("2d").drawImage(
                    img,
                    0,
                    0,
                    canvas.width,
                    canvas.height
                );
                resolve(canvas.toDataURL("image/jpeg", JPG_QUALITY));
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// Returns copies of the monkeys with their first photo swapped for a JPG.
// onProgress(done, total) is called as each photo finishes.
export async function preparePhotosForPdf(monkeys, onProgress = () => {}) {
    const results = new Array(monkeys.length);
    let next = 0;
    let done = 0;

    // A few downloads at once: faster than one by one, gentler than all 500
    async function worker() {
        while (next < monkeys.length) {
            const i = next++;
            const monkey = monkeys[i];
            const jpg = monkey.img[0] ? await photoToJpg(monkey.img[0]) : null;
            results[i] = { ...monkey, pdfPhoto: jpg };
            onProgress(++done, monkeys.length);
        }
    }

    await Promise.all(
        Array.from({ length: PARALLEL_DOWNLOADS }, () => worker())
    );
    return results;
}
