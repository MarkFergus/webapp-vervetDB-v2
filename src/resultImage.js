import { MONKEY_ICON_PATH } from "./monkeyIconPath";
import { canvasToPng, fitFont, loadFonts, roundedRect, TEXT_FONT, TITLE_FONT } from "./canvasHelpers";

// The results screen as a square picture (1080 × 1080 PNG) for sharing:
// logo, mode, headline, big score, average time, a tile per photo
// (green right / red wrong / orange time's up) and the site's address.
// Drawn on a canvas in the site's colours, so it needs no extra libraries.

const SIZE = 1080;
const LEVEL_COLOURS = { normal: "#25c4f8", hard: "#ffb454", expert: "#ff6b1a" };
const TILE_COLOURS = { right: "#47b028", wrong: "#ff4d4f", timeout: "#ff9f1a" };

// The tiles: one per photo, as big as fits the area (a row for 10 photos,
// a grid for "All photos")
function drawTiles(ctx, outcomes, { top, height, width }) {
    const n = outcomes.length;
    if (!n) return;
    const gapRatio = 0.25;
    let best = { size: 0, cols: n };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const size = Math.min(
            width / (cols + (cols - 1) * gapRatio),
            height / (rows + (rows - 1) * gapRatio),
            64
        );
        // Ties go to more columns: one row of 10 rather than two of 5
        if (size >= best.size) best = { size, cols };
    }
    const { size, cols } = best;
    const gap = size * gapRatio;
    const rows = Math.ceil(n / cols);
    const blockHeight = rows * size + (rows - 1) * gap;
    const startY = top + (height - blockHeight) / 2;
    outcomes.forEach((outcome, i) => {
        const row = Math.floor(i / cols);
        const inRow = Math.min(cols, n - row * cols);
        const rowWidth = inRow * size + (inRow - 1) * gap;
        const x = (SIZE - rowWidth) / 2 + (i % cols) * (size + gap);
        const y = startY + row * (size + gap);
        ctx.fillStyle = TILE_COLOURS[outcome];
        roundedRect(ctx, x, y, size, size, size * 0.2);
        ctx.fill();
    });
}

// Returns a PNG Blob. `details`:
//   mode ("Hard mode · Lankora + Skunkey"), difficulty (for the colour),
//   message ("GODLIKE!"), score, outOf, averageSeconds ("3.2" or null),
//   bestStreak (All photos only, else null), outcomes, site ("vervetdb.com")
export async function drawResultImage({
    mode,
    difficulty,
    message,
    score,
    outOf,
    averageSeconds,
    bestStreak,
    outcomes,
    site,
}) {
    await loadFonts();
    const level = LEVEL_COLOURS[difficulty] ?? LEVEL_COLOURS.normal;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    // Background, and a card with a glowing border in the level's colour
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 0, SIZE, SIZE);
    ctx.save();
    ctx.shadowColor = level;
    ctx.shadowBlur = 48;
    ctx.fillStyle = "#2a282a";
    roundedRect(ctx, 60, 60, SIZE - 120, SIZE - 120, 40);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = 6;
    ctx.strokeStyle = level;
    roundedRect(ctx, 60, 60, SIZE - 120, SIZE - 120, 40);
    ctx.stroke();

    // Logo and name
    ctx.font = `64px ${TITLE_FONT}`;
    const brand = "vervetDB";
    const brandWidth = ctx.measureText(brand).width;
    const logoWidth = 76;
    const brandLeft = (SIZE - (logoWidth + 18 + brandWidth)) / 2;
    ctx.save();
    ctx.translate(brandLeft, 128);
    ctx.scale(logoWidth / 54, logoWidth / 54);
    ctx.fillStyle = "#d1cfc7";
    ctx.fill(new Path2D(MONKEY_ICON_PATH), "evenodd");
    ctx.restore();
    ctx.fillStyle = "#d1cfc7";
    ctx.textAlign = "left";
    ctx.fillText(brand, brandLeft + logoWidth + 18, 186);
    ctx.textAlign = "center";
    ctx.font = `36px ${TITLE_FONT}`;
    ctx.fillStyle = "#b6b2a5";
    ctx.fillText("Monkey Guesser", SIZE / 2, 250);

    // Mode badge
    const badge = mode.toUpperCase();
    const badgeSize = fitFont(ctx, badge, { size: 30, weight: "800", family: TEXT_FONT, maxWidth: 760 });
    const badgeWidth = ctx.measureText(badge).width + 56;
    ctx.fillStyle = level;
    roundedRect(ctx, (SIZE - badgeWidth) / 2, 292, badgeWidth, badgeSize + 30, 999);
    ctx.fill();
    ctx.fillStyle = "#1f1f1f";
    ctx.fillText(badge, SIZE / 2, 292 + badgeSize + 7);

    // Headline, in the level's colour
    fitFont(ctx, message, { size: 76, family: TITLE_FONT, maxWidth: 860 });
    ctx.save();
    ctx.shadowColor = level;
    ctx.shadowBlur = 24;
    ctx.fillStyle = level;
    ctx.fillText(message, SIZE / 2, 450);
    ctx.restore();

    // Big score: "9 / 10"
    ctx.font = `180px ${TITLE_FONT}`;
    const scoreText = String(score);
    const scoreWidth = ctx.measureText(scoreText).width;
    ctx.font = `72px ${TITLE_FONT}`;
    const outOfText = `/ ${outOf}`;
    const outOfWidth = ctx.measureText(outOfText).width;
    const scoreLeft = (SIZE - (scoreWidth + 20 + outOfWidth)) / 2;
    ctx.textAlign = "left";
    ctx.font = `180px ${TITLE_FONT}`;
    ctx.fillStyle = "white";
    ctx.fillText(scoreText, scoreLeft, 640);
    ctx.font = `72px ${TITLE_FONT}`;
    ctx.fillStyle = "#8a877e";
    ctx.fillText(outOfText, scoreLeft + scoreWidth + 20, 640);
    ctx.textAlign = "center";

    // Average time, and the streak for All photos
    const stats = [
        averageSeconds && `${averageSeconds}s average`,
        bestStreak != null && `Longest streak: ${bestStreak}`,
    ].filter(Boolean);
    if (stats.length) {
        ctx.font = `700 34px ${TEXT_FONT}`;
        ctx.fillStyle = "#d1cfc7";
        ctx.fillText(stats.join("  ·  "), SIZE / 2, 712);
    }

    // A tile per photo
    drawTiles(ctx, outcomes, { top: 750, height: 150, width: 860 });

    // Challenge line
    ctx.font = `700 34px ${TEXT_FONT}`;
    ctx.fillStyle = "#b6b2a5";
    const challenge = "Can you beat it?  ";
    const siteText = site;
    const challengeWidth = ctx.measureText(challenge).width;
    ctx.font = `800 34px ${TEXT_FONT}`;
    const siteWidth = ctx.measureText(siteText).width;
    const lineLeft = (SIZE - (challengeWidth + siteWidth)) / 2;
    ctx.textAlign = "left";
    ctx.font = `700 34px ${TEXT_FONT}`;
    ctx.fillText(challenge, lineLeft, 968);
    ctx.font = `800 34px ${TEXT_FONT}`;
    ctx.fillStyle = "#25c4f8";
    ctx.fillText(siteText, lineLeft + challengeWidth, 968);

    return canvasToPng(canvas);
}
