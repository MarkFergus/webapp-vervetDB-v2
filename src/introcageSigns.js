// Introcage Signs (Documents): a sign for each introcage chosen, to print
// and put up on the cage. Each is 12 × 16 cm (portrait), two to a landscape
// A4 page, with a thin border to cut along. A cage with more than three
// monkeys (or too much to fit) gets a whole portrait A4 page instead.
// On a sign: the introcage's name and section, then each monkey (oldest
// first, Age Unknown before them: most are older monkeys) with sex, age and
// bio. The enclosure's name goes before the
// section ("Koko – Middle Section"), so a cage with its own name
// (Groomingdales) still says where it is. An empty introcage: its features
// instead (e.g. "Usually opened for Koko D group"), as on its page.
import { ageInYears } from "./ages";
import { bySection, introcagesOf, residents } from "./enclosures";
import { fullName } from "./places";
import { REPORT_FONT, textWidth } from "./pdfTextWidth";

// More monkeys than this: a whole page
export const HALF_SIGN_MOST = 3;

// Sizes in points (1 mm = 72 / 25.4 pt)
const MM = 72 / 25.4;
export const HALF_SIGN = { width: 120 * MM, height: 160 * MM, padding: 8 * MM };
// A whole page's sign: A4 portrait less a 12 mm margin
export const FULL_SIGN = { width: 186 * MM, height: 273.6 * MM, padding: 11 * MM };

// The text sizes on a half sign (a whole page's: FULL_SCALE times bigger),
// and how far a crowded sign can shrink (a half sign: before it takes a
// whole page)
// (the user's pick, 2026-10-16: big enough to read on a cage, not shouting)
export const TEXT = {
    title: 24,
    section: 10.5,
    name: 17,
    details: 11,
    bio: 11,
    updated: 6,
};
export const LINE = 1.3;
export const FULL_SCALE = 1.25;
const SMALLEST = 0.8;

// The introcages to choose from (Bachelor Block's too; not the care units'
// areas), in section and enclosure order:
// [{ id, name ("H&B C1"), label ("Holt & Barrington C1"), count }]
export function signChoices(enclosures, sections, monkeys) {
    return bySection(enclosures, sections)
        .flatMap((group) => group.enclosures)
        .flatMap((e) => introcagesOf(e, enclosures))
        .filter((place) => place.type === "introcage")
        .map((place) => ({
            id: place.id,
            name: place.name,
            label: fullName(place.name),
            count: residents(place, monkeys).length,
        }));
}

// What the search box finds: every choice whose name (short or full)
// contains what's typed, ignoring case and spaces at the ends
export function matchChoices(choices, typed) {
    const words = typed.trim().toLowerCase();
    if (!words) return [];
    return choices.filter((c) => c.label.toLowerCase().includes(words) || c.name.toLowerCase().includes(words));
}

// For ordering a sign's monkeys, oldest first: age in years (no birth
// year: older than anyone). Same age: A–Z, as residents() gives them.
const oldness = (monkey, today) => ageInYears(monkey.year, today) ?? Infinity;

// "Female · 7 years old" (sex only if known; "Age Unknown" with no birth year)
function details(monkey, today) {
    const sex = monkey.sex === "female" ? "Female" : monkey.sex === "male" ? "Male" : null;
    const age = ageInYears(monkey.year, today);
    const ageWords = age === null ? "Age Unknown" : age === 0 ? "Baby" : age === 1 ? "1 year old" : `${age} years old`;
    return [sex, ageWords].filter(Boolean).join(" · ");
}

// One introcage's sign (enclosures: to find the one it's in): { id, title,
// section ("Koko – Middle Section"), monkeys: [{ name, details,
// bio }], info (an empty introcage's features, or ""), full (a whole
// page), scale (its text size, 1 = as in TEXT) }
export function signFor(introcage, monkeys, enclosures = [], today = new Date()) {
    const parent = enclosures.find((e) => e.id === introcage.parentId);
    const living = [...residents(introcage, monkeys)].sort((a, b) => {
        const [older, younger] = [oldness(b, today), oldness(a, today)];
        return older === younger ? 0 : older > younger ? 1 : -1;
    });
    const sign = {
        id: introcage.id,
        title: fullName(introcage.name),
        section: [parent && fullName(parent.name), introcage.section && `${introcage.section} Section`]
            .filter(Boolean)
            .join(" – "),
        monkeys: living.map((m) => ({ name: m.name, details: details(m, today), bio: (m.bio ?? "").trim() })),
        info: living.length ? "" : [introcage.features, introcage.description].filter(Boolean).join("\n\n").trim(),
    };
    const half = living.length <= HALF_SIGN_MOST && fit(sign, HALF_SIGN, 1);
    if (half) return { ...sign, full: false, scale: half };
    // (a whole page: its own bigger text, smaller if that's too much too)
    return { ...sign, full: true, scale: fit(sign, FULL_SIGN, FULL_SCALE) || SMALLEST };
}

// The biggest text size (from largest down, a little at a time, no
// smaller than SMALLEST) that fits the sign's box, or 0 if none does
function fit(sign, box, largest) {
    for (let scale = largest; scale >= SMALLEST - 0.001; scale -= 0.05) {
        if (signHeight(sign, scale, box) <= box.height - 2 * box.padding) return scale;
    }
    return 0;
}

// How many lines text takes in this width (words kept whole, as in the PDF)
export function lineCount(text, size, width, bold = false) {
    let lines = 0;
    for (const paragraph of String(text).split("\n")) {
        let line = 0;
        lines += 1;
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
            const w = textWidth(word, size, bold, REPORT_FONT);
            const space = line ? textWidth(" ", size, bold, REPORT_FONT) : 0;
            if (line && line + space + w > width) {
                lines += 1;
                line = w;
            } else {
                line += space + w;
            }
        }
    }
    return lines;
}

// How tall a sign's contents print (roughly, a little over), in points.
// The gaps match IntrocageSignPDF.jsx.
export function signHeight(sign, scale, box) {
    const width = box.width - 2 * box.padding;
    const size = (key) => TEXT[key] * scale;
    const lines = (text, key, bold) => lineCount(text, size(key), width, bold) * size(key) * LINE;
    let height = lines(sign.title, "title", true) + size("section") * LINE + gaps(scale).rule;
    sign.monkeys.forEach((m, i) => {
        if (i > 0) height += gaps(scale).monkey;
        height += lines(m.name, "name", true);
        if (m.details) height += lines(m.details, "details");
        if (m.bio) height += gaps(scale).bio + lines(m.bio, "bio");
    });
    if (!sign.monkeys.length) height += lines(sign.info || EMPTY_TEXT, "bio");
    return height + size("updated") * LINE + gaps(scale).updated;
}

// The space under the section (with its line), between monkeys, above a
// bio, and above "Updated …"
export const gaps = (scale) => ({ rule: 18 * scale, monkey: 14 * scale, bio: 3 * scale, updated: 8 * scale });

// An empty introcage with nothing written about it
export const EMPTY_TEXT = "No monkeys in this introcage right now.";

// The pages, in the list's order: [{ full: true, signs: [sign] }, or
// { full: false, signs: [sign, sign?] }] (half signs two to a page, a whole
// page's sign on its own as it comes)
export function signPages(signs) {
    const pages = [];
    let open = null;
    for (const sign of signs) {
        if (sign.full) {
            pages.push({ full: true, signs: [sign] });
        } else if (open) {
            open.signs.push(sign);
            open = null;
        } else {
            open = { full: false, signs: [sign] };
            pages.push(open);
        }
    }
    return pages;
}
