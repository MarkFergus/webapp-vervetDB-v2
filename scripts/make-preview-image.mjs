// Makes public/preview.png: the picture shown when a vervetDB link is shared
// (WhatsApp, Teams, email…). 1200×630, the site's dark background, the
// neon-blue monkey logo and "vervetDB" in the logo font. The tags that point
// to it are in index.html (og:image).
//   node scripts/make-preview-image.mjs
// Only needed again if the logo or wording changes.

import fs from "node:fs";
import sharp from "sharp";

const WIDTH = 1200;
const HEIGHT = 630;
const BACKGROUND = "#1f1f1f";
const GREY = "#b6b2a5";

const font = (name) => new URL(`../src/fonts/${name}`, import.meta.url).pathname.replace(/^\/(\w:)/, "$1");

// The logo, drawn large (the same picture as the browser-tab icon)
const logo = await sharp(fs.readFileSync(new URL("../public/favicon.svg", import.meta.url)), { density: 900 })
    .resize({ height: 250 })
    .png()
    .toBuffer();

// Text in the site's fonts (from the files, so the computer needn't have them)
const text = (markup, file, family, dpi) =>
    sharp({ text: { text: markup, fontfile: font(file), font: family, dpi, rgba: true, align: "centre" } })
        .png()
        .toBuffer();
const name = await text(`<span foreground="white">vervetDB</span>`, "RussoOne-Regular.ttf", "Russo One", 380);
const line = await text(`<span foreground="${GREY}">Vervet Monkey Foundation</span>`, "OpenSans-Regular.ttf", "Open Sans", 150);

// Stacked and centred: logo, name, line
const parts = [logo, name, line];
const sizes = await Promise.all(parts.map((p) => sharp(p).metadata()));
const GAPS = [28, 18];
const total = sizes.reduce((sum, s) => sum + s.height, 0) + GAPS[0] + GAPS[1];
let top = Math.round((HEIGHT - total) / 2);
const layers = parts.map((input, i) => {
    const layer = { input, top, left: Math.round((WIDTH - sizes[i].width) / 2) };
    top += sizes[i].height + (GAPS[i] ?? 0);
    return layer;
});

await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: BACKGROUND } })
    .composite(layers)
    .png({ compressionLevel: 9 })
    .toFile(new URL("../public/preview.png", import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));

console.log("Made public/preview.png");
