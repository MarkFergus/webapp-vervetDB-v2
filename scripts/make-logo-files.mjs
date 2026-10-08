// Makes every picture of the vervetDB logo from the monkey outline
// (src/monkeyIconPath.js) and the site's font files:
//   logos/          the stacked logo (monkey, "vervetDB", "Vervet Monkey
//                   Foundation") as SVG and PNG, in three versions:
//                     …-dark-bg    on the site's dark background
//                     …-for-dark   see-through, white text, for dark backgrounds
//                     …-for-light  see-through, dark text, for light backgrounds
//   src/logoShapes.js  the stacked logo's shapes, for the Profile Book cover
//   public/preview.png  the picture shown when a link is shared (1200×630)
//   public/favicon.svg, favicon.ico, apple-touch-icon.png, icon-192.png,
//   icon-512.png, icon-maskable-512.png  browser, home-screen and app icons
// The words are drawn as shapes, so nothing needs the fonts installed.
//   node scripts/make-logo-files.mjs
// Only needed again if the logo or wording changes. (fontkit comes with
// @react-pdf/renderer.) After changing the icons, bump ?v= in index.html so
// browsers fetch them again.

import fs from "node:fs";
import * as fontkit from "fontkit";
import sharp from "sharp";
import { MONKEY_ICON_HEIGHT, MONKEY_ICON_PATH, MONKEY_ICON_WIDTH } from "../src/monkeyIconPath.js";

const root = (path) => new URL(`../${path}`, import.meta.url).pathname.replace(/^\/(\w:)/, "$1");
const BLUE = "#25c4f8";
const BACKGROUND = "#1f1f1f";
const VERSIONS = {
    "dark-bg": { name: "white", line: "#b6b2a5", background: BACKGROUND },
    "for-dark": { name: "white", line: "#b6b2a5" },
    "for-light": { name: "#1f1f1f", line: "#5f5c55" },
};

// A path (absolute M, L, C, A and Z only, like the monkey's) scaled by s and
// moved by (dx, dy), so the SVGs need no transforms
function movePath(d, s, dx, dy) {
    const n = (v) => String(Math.round(v * 100) / 100);
    return d.replace(/([MLCAZ])([^MLCAZ]*)/g, (_, command, args) => {
        const v = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : [];
        if (command === "A") {
            // rx ry rotation large-arc sweep x y
            return `A${n(v[0] * s)} ${n(v[1] * s)} ${v[2]} ${v[3]} ${v[4]} ${n(v[5] * s + dx)} ${n(v[6] * s + dy)}`;
        }
        return command + v.map((value, i) => n(i % 2 === 0 ? value * s + dx : value * s + dy)).join(" ");
    });
}

// A line of text as one path, sized to be `width` wide; at(x, y) gives the
// path with its left end at x and its baseline at y. Also: its cap height,
// how far it reaches below the baseline, and its font size.
function textShape(fontFile, text, width) {
    const font = fontkit.openSync(root(`src/fonts/${fontFile}`));
    const run = font.layout(text);
    const scale = width / run.advanceWidth;
    return {
        width,
        top: font.capHeight * scale,
        bottom: -run.bbox.minY * scale,
        fontSize: font.unitsPerEm * scale,
        at(x, y) {
            let advance = 0;
            return run.glyphs
                .map((glyph, i) => {
                    // font units have y going up; SVG's goes down
                    const d = glyph.path.scale(scale, -scale).translate(x + advance, y).toSVG();
                    advance += run.positions[i].xAdvance * scale;
                    return d;
                })
                .join("");
        },
    };
}

// ---- The stacked logo, in px at 1×: the monkey 250 tall, then the name,
// then the line under it ----
const MONKEY_HEIGHT = 250;
const GAP_UNDER_MONKEY = 20;
const GAP_UNDER_NAME = 22;
const monkeyScale = MONKEY_HEIGHT / MONKEY_ICON_HEIGHT;
const monkeyWidth = MONKEY_ICON_WIDTH * monkeyScale;
const name = textShape("RussoOne-Regular.ttf", "vervetDB", monkeyWidth * 1.18);
const line = textShape("OpenSans-Regular.ttf", "Vervet Monkey Foundation", monkeyWidth * 1.24);
const nameBaseline = MONKEY_HEIGHT + GAP_UNDER_MONKEY + name.top;
const lineBaseline = nameBaseline + GAP_UNDER_NAME + line.top;
const LOGO = {
    width: Math.ceil(Math.max(monkeyWidth, name.width, line.width)),
    height: Math.ceil(lineBaseline + line.bottom),
};
const centre = (w) => (LOGO.width - w) / 2;
LOGO.monkey = movePath(MONKEY_ICON_PATH, monkeyScale, centre(monkeyWidth), 0);
LOGO.name = name.at(centre(name.width), nameBaseline);
LOGO.line = line.at(centre(line.width), lineBaseline);

// The logo as an SVG, with `pad` px of space round it
function logoSvg({ name: nameColour, line: lineColour, background }, pad) {
    const width = LOGO.width + pad * 2;
    const height = LOGO.height + pad * 2;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${width} ${height}" width="${width}" height="${height}">`,
        `<title>vervetDB · Vervet Monkey Foundation</title>`,
        background && `<rect x="${-pad}" y="${-pad}" width="${width}" height="${height}" fill="${background}"/>`,
        `<path fill="${BLUE}" fill-rule="evenodd" d="${LOGO.monkey}"/>`,
        `<path fill="${nameColour}" d="${LOGO.name}"/>`,
        `<path fill="${lineColour}" d="${LOGO.line}"/>`,
        `</svg>`,
    ]
        .filter(Boolean)
        .join("\n");
}
// An SVG as a PNG `width` px wide (drawn at that size, so it's sharp)
function png(svg, width) {
    const drawnWidth = Number(/width="([\d.]+)"/.exec(svg)[1]);
    return sharp(Buffer.from(svg), { density: Math.max(72, (72 * width) / drawnWidth) })
        .resize({ width })
        .png({ compressionLevel: 9 });
}

fs.mkdirSync(root("logos"), { recursive: true });
for (const [version, colours] of Object.entries(VERSIONS)) {
    const svg = logoSvg(colours, 60);
    const base = `logos/vervetDB-logo-stacked-${version}`;
    fs.writeFileSync(root(`${base}.svg`), svg + "\n");
    // large (print, documents) and small (emails, chats)
    await png(svg, 2000).toFile(root(`${base}.png`));
    await png(svg, 600).toFile(root(`${base}-small.png`));
}

// ---- The Profile Book cover's copy (react-pdf draws the shapes) ----
fs.writeFileSync(
    root("src/logoShapes.js"),
    `// The stacked vervetDB logo as shapes, in a ${LOGO.width} × ${LOGO.height} box: made by
// scripts/make-logo-files.mjs (don't edit by hand). LOGO_LINE_FONT_SIZE: how
// big "Vervet Monkey Foundation" is as text, in the same units (to size the
// logo so it's readable).
export const LOGO_WIDTH = ${LOGO.width};
export const LOGO_HEIGHT = ${LOGO.height};
export const LOGO_LINE_FONT_SIZE = ${line.fontSize.toFixed(2)};
export const LOGO_BLUE = "${BLUE}";
export const LOGO_MONKEY = "${LOGO.monkey}";
export const LOGO_NAME = "${LOGO.name}";
export const LOGO_LINE = "${LOGO.line}";
`
);

// ---- The shared link picture: the logo on the dark background ----
const previewLogo = await png(logoSvg(VERSIONS["for-dark"], 0), LOGO.width).toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: BACKGROUND } })
    .composite([
        { input: previewLogo, left: Math.round((1200 - LOGO.width) / 2), top: Math.round((630 - LOGO.height) / 2) },
    ])
    .png({ compressionLevel: 9 })
    .toFile(root("public/preview.png"));

// ---- Icons: the monkey on its own, in the middle of a square ----
//   share: how much of the square's width the monkey takes up
function monkeySvg(background, size, share) {
    const box = MONKEY_ICON_WIDTH / share;
    const x = -(box - MONKEY_ICON_WIDTH) / 2;
    const y = -(box - MONKEY_ICON_HEIGHT) / 2;
    const square = `${x.toFixed(2)} ${y.toFixed(2)} ${box.toFixed(2)} ${box.toFixed(2)}`;
    return [
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${square}"${size ? ` width="${size}" height="${size}"` : ""}>`,
        background && `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${box.toFixed(2)}" height="${box.toFixed(2)}" fill="${background}"/>`,
        `<path fill="${BLUE}" fill-rule="evenodd" d="${MONKEY_ICON_PATH}"/>`,
        `</svg>`,
    ]
        .filter(Boolean)
        .join("");
}
const icon = (background, size, share) =>
    sharp(Buffer.from(monkeySvg(background, size, share)), { density: 72 * 8 })
        .resize(size, size)
        .png({ compressionLevel: 9 });

fs.writeFileSync(root("public/favicon.svg"), monkeySvg(null, null, 1) + "\n");
await icon(null, 192, 1).toFile(root("public/icon-192.png"));
await icon(null, 512, 1).toFile(root("public/icon-512.png"));
// Android crops to a circle: room to spare
await icon(BACKGROUND, 512, 0.6).toFile(root("public/icon-maskable-512.png"));
// iPhone home screens: on the dark background
await icon(BACKGROUND, 180, 0.78).toFile(root("public/apple-touch-icon.png"));

// favicon.ico: 16, 24, 32 and 48 px pictures in one file (PNGs inside)
const sizes = [16, 24, 32, 48];
const images = await Promise.all(sizes.map((size) => icon(null, size, 1).toBuffer()));
const header = Buffer.alloc(6 + 16 * sizes.length);
header.writeUInt16LE(1, 2); // an icon
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
sizes.forEach((size, i) => {
    const entry = 6 + i * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt16LE(1, entry + 4); // colour planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(images[i].length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += images[i].length;
});
fs.writeFileSync(root("public/favicon.ico"), Buffer.concat([header, ...images]));

console.log(`Made logos/, src/logoShapes.js, public/preview.png and the icons (logo ${LOGO.width} × ${LOGO.height})`);
