// Pairs each introcage letter in the sanctuary map with its gate box and
// enclosure, for src/mapIntrocages.js. Measures everything in a real browser
// (Edge, headless), then matches by distance. Only needed if the map is
// redrawn. Needs puppeteer-core (not part of the site):
//   npm install --no-save puppeteer-core
//   node scripts/match-introcages.mjs   → prints the pairs and writes match.json
import puppeteer from "puppeteer-core";
import fs from "node:fs";

const MAP = "C:/Users/micro/Documents/webDev/webapp-vervetDB-v2/public/VMF Sanctuary Map.svg";
const svgText = fs.readFileSync(MAP, "utf8");
const browser = await puppeteer.launch({
    executablePath: "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    headless: true,
});
const page = await browser.newPage();
await page.setContent(`<!doctype html><body style="margin:0">${svgText.replace(/<\?xml[^>]*>/, "")}</body>`);
const data = await page.evaluate(() => {
    const LABEL = "http://www.inkscape.org/namespaces/inkscape";
    const svg = document.querySelector("svg");
    svg.setAttribute("width", "595.3");
    svg.setAttribute("height", "841.9");
    const label = (el) => el.getAttributeNS(LABEL, "label") ?? el.getAttribute("inkscape:label");
    const layer = (name) => [...svg.querySelectorAll("g")].find((g) => label(g) === name);
    // Bounding box in the map's coordinates
    function box(el) {
        const b = el.getBBox();
        const m = el.getCTM();
        const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(
            ([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
        );
        const xs = pts.map((p) => p[0]);
        const ys = pts.map((p) => p[1]);
        return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    // Gates: the direct children of the gates layer (a group counts as one gate)
    const gates = [...layer("Enclosure gates").children].map((el) => ({ id: el.id, ...box(el) }));
    const letters = [...layer("Gate letters").querySelectorAll("text")].map((el) => ({
        text: el.textContent.trim(),
        id: el.id,
        ...box(el),
    }));
    const troops = [...layer("Enclosures").querySelectorAll("*")]
        .filter((el) => / troop$/.test(label(el) || ""))
        .map((el) => {
            // Points along the outline, for distances
            const shapes = el.tagName === "g" ? [...el.querySelectorAll("polygon,path,rect")] : [el];
            const pts = [];
            for (const s of shapes) {
                const m = s.getCTM();
                const len = s.getTotalLength ? s.getTotalLength() : 0;
                for (let i = 0; i <= 200; i++) {
                    const p = s.getPointAtLength((len * i) / 200);
                    pts.push([m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f]);
                }
            }
            return { label: label(el), id: el.id, pts };
        });
    return { gates, letters, troops };
});
await browser.close();

const centre = (b) => [b.x + b.w / 2, b.y + b.h / 2];
const dist = ([ax, ay], [bx, by]) => Math.hypot(ax - bx, ay - by);
// Distance from a point to a box (0 inside)
const toBox = ([x, y], b) => Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h)));

const NAMES = { "Dino & Daniel troop": "D&D" };
const rows = [];
for (const letter of data.letters) {
    const c = centre(letter);
    const gate = data.gates.map((g) => ({ g, d: toBox(c, g) })).sort((a, b) => a.d - b.d)[0];
    const gc = centre(gate.g);
    const troop = data.troops
        .map((t) => ({ t, d: Math.min(...t.pts.map((p) => dist(p, gc))) }))
        .sort((a, b) => a.d - b.d);
    const enclosure = NAMES[troop[0].t.label] ?? troop[0].t.label.replace(/ troop$/, "");
    rows.push({
        name: `${enclosure} ${letter.text}`,
        gateId: gate.g.id,
        letterId: letter.id,
        letterToGate: +gate.d.toFixed(1),
        gateToEnclosure: +troop[0].d.toFixed(1),
        runnerUp: `${troop[1].t.label} (${troop[1].d.toFixed(1)})`,
        gate: gate.g,
    });
}
fs.writeFileSync("match.json", JSON.stringify({ rows, gates: data.gates, letters: data.letters }, null, 1));
for (const r of rows.sort((a, b) => a.name.localeCompare(b.name)))
    console.log(r.name.padEnd(14), r.gateId.padEnd(14), "letter→gate", String(r.letterToGate).padEnd(5), "gate→encl", String(r.gateToEnclosure).padEnd(5), "next:", r.runnerUp);
console.log(rows.length, "letters,", data.gates.length, "gates");
