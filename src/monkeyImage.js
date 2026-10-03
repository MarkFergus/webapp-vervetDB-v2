import { canvasToPng, fitFont, loadFonts, roundedRect, TEXT_FONT, TITLE_FONT } from "./canvasHelpers";
import { ageText } from "./ages";

// A monkey's profile as a picture: name, photo, details, bio and features,
// with "© Vervet Monkey Foundation" faintly at the bottom, on a card with
// rounded corners (see-through outside them). 1000 wide and at least 1270
// tall (about the portrait shape phones show best), growing taller for a
// long bio.

const WIDTH = 1080;
const MIN_HEIGHT = 1350;
const BLUE = "#25c4f8";
// The card used to sit on a dark background with this much around it; the
// picture is now just the card, so everything is drawn this much up and left
const FRAME = 40;
const SIDE_PADDING = 20; // inside the card: its left / right edge to the content
const MARGIN = FRAME + SIDE_PADDING; // picture edge to content, before trimming
const FOOTER = "© Vervet Monkey Foundation";
const FOOTER_SPACE = 70; // kept clear above the footer, so text never runs into it
const LINE = 42; // bio / features line height
const BIO_LINES = 6;
const FEATURE_LINES = 5;

// Loads a photo so it can be drawn (ImgBB and our storage both allow this);
// null if it can't be
function loadPhoto(url) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
    });
}

// Draws the photo to fill the box (cropping any overhang), with rounded corners
function drawPhoto(ctx, img, x, y, w, h) {
    ctx.save();
    roundedRect(ctx, x, y, w, h, 24);
    ctx.clip();
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(x, y, w, h);
    if (img) {
        const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        const dw = img.naturalWidth * scale;
        const dh = img.naturalHeight * scale;
        ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    ctx.restore();
}

// Wraps text into at most `maxLines` lines of `maxWidth`, ending "…" if cut
function wrap(ctx, text, maxWidth, maxLines) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (let i = 0; i < words.length; i++) {
        const next = line ? `${line} ${words[i]}` : words[i];
        if (ctx.measureText(next).width <= maxWidth) {
            line = next;
            continue;
        }
        lines.push(line);
        line = words[i];
        if (lines.length === maxLines) {
            let last = lines[maxLines - 1];
            while (last && ctx.measureText(`${last}…`).width > maxWidth) {
                last = last.replace(/\s*\S+$/, "");
            }
            lines[maxLines - 1] = `${last}…`;
            return lines;
        }
    }
    if (line) lines.push(line);
    return lines;
}

// A labelled paragraph ("Bio", "Features"), already wrapped into lines
function drawParagraph(ctx, label, lines, { x, y }) {
    ctx.textAlign = "left";
    ctx.font = `800 26px ${TEXT_FONT}`;
    ctx.fillStyle = "#b6b2a5";
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.font = `400 32px ${TEXT_FONT}`;
    ctx.fillStyle = "#e4e2dc";
    lines.forEach((l, i) => ctx.fillText(l, x, y + 44 + i * LINE));
}
const paragraphHeight = (lines) => 44 + lines.length * LINE + 22;

// Lays the details out as pills: troop (blue), sex, birth year, age, chip.
// Returns each pill's text and position, and the height they take.
function layOutPills(ctx, monkey, top) {
    const pills = [
        { text: `${monkey.troop} troop`, fill: BLUE, color: "#1f1f1f" },
        monkey.sex && { text: monkey.sex[0].toUpperCase() + monkey.sex.slice(1) },
        { text: monkey.year ? `Born ${monkey.year}` : "Birth year unknown" },
        // "10 years old", without the brackets used in the pop-up
        monkey.year && { text: ageText(monkey.year).slice(1, -1) },
        monkey.chip && { text: `Chip ${monkey.chip}` },
    ].filter(Boolean);
    ctx.font = `700 28px ${TEXT_FONT}`;
    let x = MARGIN;
    let y = top;
    for (const pill of pills) {
        pill.width = ctx.measureText(pill.text).width + 40;
        if (x + pill.width > WIDTH - MARGIN) {
            x = MARGIN;
            y += 60;
        }
        pill.x = x;
        pill.y = y;
        x += pill.width + 12;
    }
    return { pills, height: y + 48 - top };
}

// Returns a PNG Blob. `photo`: which photo to use (the one showing)
export async function drawMonkeyImage(monkey, { photo = monkey.img[0] } = {}) {
    const [img] = await Promise.all([loadPhoto(photo), loadFonts()]);
    const textWidth = WIDTH - MARGIN * 2;
    const photoHeight = textWidth * 0.8; // 5:4, like every monkey photo

    // Work out the layout first, so the picture can be as tall as it needs
    const measure = document.createElement("canvas").getContext("2d");
    const nameY = 120; // the name, top left, above the photo
    const photoTop = nameY + 26;
    const pillsTop = photoTop + photoHeight + 30;
    const { pills, height: pillsHeight } = layOutPills(measure, monkey, pillsTop);
    measure.font = `400 32px ${TEXT_FONT}`;
    const bio = wrap(measure, monkey.bio || "No bio yet.", textWidth, BIO_LINES);
    const features = monkey.desc ? wrap(measure, monkey.desc, textWidth, FEATURE_LINES) : [];
    const bioTop = pillsTop + pillsHeight + 58;
    const featuresTop = bioTop + paragraphHeight(bio);
    const end = features.length ? featuresTop + paragraphHeight(features) : featuresTop;
    const height = Math.max(MIN_HEIGHT, end + FOOTER_SPACE + 40);

    const canvas = document.createElement("canvas");
    canvas.width = WIDTH - FRAME * 2;
    canvas.height = height - FRAME * 2;
    const ctx = canvas.getContext("2d");
    ctx.translate(-FRAME, -FRAME);

    // The card (outside its rounded corners stays see-through)
    ctx.fillStyle = "#2a282a";
    roundedRect(ctx, FRAME, FRAME, WIDTH - FRAME * 2, height - FRAME * 2, 36);
    ctx.fill();

    // Name, top left
    ctx.textAlign = "left";
    fitFont(ctx, monkey.name, { size: 64, family: TITLE_FONT, maxWidth: textWidth });
    ctx.fillStyle = "white";
    ctx.fillText(monkey.name, MARGIN, nameY);

    drawPhoto(ctx, img, MARGIN, photoTop, textWidth, photoHeight);

    // Details
    ctx.font = `700 28px ${TEXT_FONT}`;
    for (const pill of pills) {
        roundedRect(ctx, pill.x, pill.y, pill.width, 48, 999);
        if (pill.fill) {
            ctx.fillStyle = pill.fill;
            ctx.fill();
        } else {
            ctx.lineWidth = 2;
            ctx.strokeStyle = "#5a5856";
            ctx.stroke();
        }
        ctx.fillStyle = pill.color ?? "#d1cfc7";
        ctx.fillText(pill.text, pill.x + 20, pill.y + 34);
    }

    drawParagraph(ctx, "Bio", bio, { x: MARGIN, y: bioTop });
    if (features.length) {
        drawParagraph(ctx, "Distinctive features", features, { x: MARGIN, y: featuresTop });
    }

    // Footer: faint, centred along the bottom of the card
    ctx.textAlign = "center";
    ctx.font = `600 24px ${TEXT_FONT}`;
    ctx.fillStyle = "#6b6862";
    ctx.fillText(FOOTER, WIDTH / 2, height - FRAME - 36);

    return canvasToPng(canvas);
}
