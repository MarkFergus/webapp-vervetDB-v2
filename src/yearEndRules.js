// The Year End Presentation's workings (YearEndPresentation.jsx): a year's
// records (yearEndData.js) → its slides, in order. Calendar year, Jan–Dec.
//   Arrivals         everyone who came in from outside (not Born Here)
//   Baby Arrivals    orphans only
//   Troop Babies     born at the sanctuary (Born Here)
//   Integrations     started in the year (not cancelled): Foster-Mum, and
//                    Adult (with Group)
//   Releases         released in the year (their current status)
// Then the year's records (fun facts), the year in numbers, and thank you.
// The light-hearted lines are the app's own (DEFAULT_LINES) until an admin
// changes them (saved for that year).
import { ARRIVAL_REASONS } from "./arrival";
import { VET_REASONS, vetName } from "./medsRules";
import { fullName } from "./places";

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// How many monkeys on a slide (more: another slide)
export const PER_SLIDE = 12;
// Title slide photos
export const MAX_TITLE_PHOTOS = 5;

// Each line: the app's own words, and what it's for (Edit Lines). A line
// left empty isn't shown.
export const LINES = {
    "title.subtitle": { label: "Title", text: "Our Year at the Sanctuary", max: 60 },
    "title.tag": { label: "Under the title", text: "A look back at the monkeys, the milestones and the mischief 🌿", max: 120 },
    "numbers.arrivals": { label: "Arrivals tile", text: "New faces, every one with a story", max: 60 },
    "numbers.orphans": { label: "Baby Arrivals tile", text: "That's a lot of night feeds", max: 60 },
    "numbers.troopBabies": { label: "Troop Babies tile", text: "Born and raised in the troops", max: 60 },
    "numbers.integrations": { label: "Integrations tile", text: "New families, new friendships", max: 60 },
    "numbers.releases": { label: "Releases tile", text: "Back where they belong", max: 60 },
    "numbers.vetVisits": { label: "Vet Visits tile", text: "Serala knows us by name", max: 60 },
    "numbers.vasectomies": { label: "Vasectomies tile", text: "Sorry, boys", max: 60 },
    "numbers.sessions": { label: "Monitoring tile", text: "Clipboards at the ready", max: 60 },
    "arrivals.line": { label: "Arrivals slide", text: "Every one of them needed us", max: 120 },
    "orphans.line": { label: "Baby Arrivals slide", text: "Tiny hands, big personalities", max: 120 },
    "troopBabies.line": { label: "Troop Babies slide", text: "Born at the sanctuary, to troop mums", max: 120 },
    "foster.line": { label: "Foster-Mum slide", text: "Every baby needs a mum, and these mums stepped up", max: 120 },
    "adults.line": { label: "Adult Integrations slide", text: "New troops, new friends, a few squabbles", max: 120 },
    "releases.line": { label: "Releases slide", text: "Go well, and stay out of trouble", max: 120 },
    "vet.line": { label: "Vet Visits slide", text: "Check-ups, patch-ups and a lot of car trips", max: 120 },
    "vasectomies.line": { label: "Vasectomies slide", text: "Keeping the troops a manageable size", max: 120 },
    "facts.stamp": { label: "Fun Facts sticker", text: "Did you know? 🤓", max: 30 },
    "facts.milk": { label: "Most milk in one day", text: "Bottomless.", max: 80 },
    "facts.weight": { label: "Biggest weight gain", text: "Growing like a weed", max: 80 },
    "facts.oldest": { label: "Oldest arrival", text: "Never too old for a fresh start", max: 80 },
    "facts.letter": { label: "Most popular first letter", text: "", max: 80 },
    "facts.namer": { label: "Most babies named", text: "Chief namer of the year", max: 80 },
    "facts.month": { label: "Busiest month", text: "All hands on deck", max: 80 },
    "busy.line": { label: "Busy Year slide", text: "Behind every number, a lot of early mornings", max: 120 },
    "thanks.title": { label: "Thank You title", text: "Thank You", max: 40 },
    "thanks.message": {
        label: "Thank You message",
        text: "To every staff member and volunteer who fed, cleaned, monitored, mended and cuddled this year: none of this happens without you. 💚",
        max: 300,
    },
};

// A line's words: the year's own, else the app's
export const lineOf = (lines, key) => (key in (lines ?? {}) ? lines[key] : (LINES[key]?.text ?? ""));

const inYear = (date, year) => Boolean(date) && date.startsWith(`${year}-`);
const monthOf = (date) => Number(date.slice(5, 7)) - 1;
const byDate = (dateOf) => (a, b) => (dateOf(a) ?? "").localeCompare(dateOf(b) ?? "") || a.name.localeCompare(b.name);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const grouped = (n) => n.toLocaleString("en-GB");

// Each month's count, and the busiest (the first, if tied; none if none)
export function byMonth(dates) {
    const months = Array(12).fill(0);
    for (const d of dates) if (d) months[monthOf(d)] += 1;
    const top = Math.max(...months);
    return { months, busiest: top ? { month: months.indexOf(top), count: top } : null };
}

// Counts by a key, biggest first: [{ label, count }]
function tally(items, labelOf) {
    const counts = new Map();
    for (const item of items) {
        const label = labelOf(item);
        counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].map(([label, n]) => ({ label, count: n })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// The year's troop babies: Born Here, born (or, with no date, their birth
// year) in the year
export function troopBabiesIn(monkeys, year) {
    return monkeys
        .filter((m) => m.arrivalReason === "born_here")
        .filter((m) => {
            const born = m.birthDate ?? m.arrivalDate;
            return born ? inYear(born, year) : Number(m.year) === year;
        })
        .sort(byDate((m) => m.birthDate ?? m.arrivalDate));
}

// Their age in years when they arrived (birth date, else birth year), or null
function yearsAt(monkey, date) {
    if (monkey.birthDate) {
        const [by, bm, bd] = monkey.birthDate.split("-").map(Number);
        const [y, m, d] = date.split("-").map(Number);
        return y - by - (m < bm || (m === bm && d < bd) ? 1 : 0);
    }
    if (monkey.year === null || monkey.year === "" || Number.isNaN(Number(monkey.year))) return null;
    return Number(date.slice(0, 4)) - Number(monkey.year);
}

// "+1.2 kg" / "+450 g"
export const weightText = (grams) => (Math.abs(grams) >= 1000 ? `${(grams / 1000).toFixed(1)} kg` : `${grams} g`);

// The year's records: the fun facts (each null when there's nothing to say)
//   arrivals: from outside (oldest, busiest month); newcomers: the troop
//   babies too (first letters, who named them)
export function funFacts(facts, year, arrivals, nameOf, newcomers = arrivals) {
    const { milk = [], weights = [], namedBy = {} } = facts;
    const milkTop = milk.reduce((best, r) => (!best || r.ml > best.ml ? r : best), null);
    // (each baby's first and last weights in the year)
    const perBaby = new Map();
    for (const w of [...weights].sort((a, b) => a.date.localeCompare(b.date))) {
        const seen = perBaby.get(w.monkeyId);
        perBaby.set(w.monkeyId, seen ? { ...seen, last: w } : { first: w, last: w });
    }
    const gain = [...perBaby.entries()]
        .map(([monkeyId, { first, last }]) => ({ monkeyId, from: first.grams, to: last.grams, gain: last.grams - first.grams }))
        .filter((g) => g.gain > 0)
        .sort((a, b) => b.gain - a.gain)[0];
    const aged = arrivals
        .map((m) => ({ monkey: m, years: yearsAt(m, m.arrivalDate) }))
        .filter((a) => a.years !== null && a.years >= 1)
        .sort((a, b) => b.years - a.years)[0];
    const letters = tally(
        newcomers.filter((m) => /^[a-z]/i.test(m.name)),
        (m) => m.name[0].toUpperCase()
    );
    const letter = letters[0]?.count >= 2 ? letters[0] : null;
    const namers = tally(
        newcomers.filter((m) => namedBy[m.id]),
        (m) => namedBy[m.id]
    );
    const namer = namers[0]?.count >= 2 ? namers[0] : null;
    const busy = byMonth(arrivals.map((m) => m.arrivalDate)).busiest;
    return {
        milk: milkTop && { name: nameOf(milkTop.monkeyId), ml: milkTop.ml, date: milkTop.date },
        weight: gain && { name: nameOf(gain.monkeyId), from: gain.from, to: gain.to, gain: gain.gain },
        oldest: aged && { name: aged.monkey.name, years: aged.years, month: MONTHS[monthOf(aged.monkey.arrivalDate)] },
        letter: letter && {
            letter: letter.label,
            count: letter.count,
            names: newcomers.filter((m) => m.name[0]?.toUpperCase() === letter.label).map((m) => m.name),
        },
        namer: namer && { name: namer.label, count: namer.count, of: newcomers.length },
        month: busy && { month: MONTHS[busy.month], count: busy.count },
    };
}

// Monkeys on slides, PER_SLIDE at a time: [[…], […]]
const pages = (items) => {
    const out = [];
    for (let i = 0; i < items.length; i += PER_SLIDE) out.push(items.slice(i, i + PER_SLIDE));
    return out;
};

// A monkey's tile: { id, name, photo, top (a line under the name), sub }
const tile = (monkey, top = "", sub = "") => ({ id: monkey.id, name: monkey.name, photo: monkey.photo ?? null, top, sub });

// The title slide's monkeys: the ones chosen, else the year's first five
// with real photos (orphans, troop babies, releases, then integrations)
export function titleChoices(facts, year) {
    const { orphans, troopBabies, released, integrated } = yearGroups(facts, year);
    const seen = new Set();
    return [...orphans, ...troopBabies, ...released, ...integrated].filter((m) => m.photo && !seen.has(m.id) && seen.add(m.id));
}
export function titleMonkeys(facts, year, chosen) {
    const byId = new Map(facts.monkeys.map((m) => [m.id, m]));
    if (chosen?.length) return chosen.map((id) => byId.get(id)).filter((m) => m?.photo);
    return titleChoices(facts, year).slice(0, MAX_TITLE_PHOTOS);
}

// The year's monkeys, by what happened to them
export function yearGroups(facts, year) {
    const { monkeys, integrations = [] } = facts;
    const byId = new Map(monkeys.map((m) => [m.id, m]));
    const arrivals = monkeys.filter((m) => inYear(m.arrivalDate, year) && m.arrivalReason !== "born_here").sort(byDate((m) => m.arrivalDate));
    const orphans = arrivals.filter((m) => m.arrivalReason === "orphaned");
    const troopBabies = troopBabiesIn(monkeys, year);
    const released = monkeys.filter((m) => m.status === "released" && inYear(m.statusOn, year)).sort(byDate((m) => m.statusOn));
    const kept = integrations.filter((i) => i.status !== "cancelled" && byId.has(i.monkeyId));
    const withMonkey = (list) => list.map((i) => ({ ...i, monkey: byId.get(i.monkeyId) }));
    const foster = withMonkey(kept.filter((i) => i.kind === "foster_mum"));
    const adult = withMonkey(kept.filter((i) => i.kind !== "foster_mum"));
    return {
        arrivals,
        orphans,
        troopBabies,
        released,
        foster,
        adult,
        cancelled: integrations.filter((i) => i.status === "cancelled").length,
        integrated: [...foster, ...adult].map((i) => i.monkey),
    };
}

const STATUS_TAGS = { completed: "Completed ✓", active: "Ongoing", on_hold: "On Hold" };

// The slides: [{ id, kind, …, lines: [keys] }]
//   facts: loadYearEnd's; settings: { lines, titlePhotos }
export function yearEndSlides(facts, year, settings = {}) {
    const groups = yearGroups(facts, year);
    const { arrivals, orphans, troopBabies, released, foster, adult } = groups;
    const byId = new Map(facts.monkeys.map((m) => [m.id, m]));
    const nameOf = (id) => byId.get(id)?.name ?? "A monkey";
    const { vetVisits, vasectomies, counts = {} } = facts;
    const slides = [];

    slides.push({ id: "title", kind: "title", year, monkeys: titleMonkeys(facts, year, settings.titlePhotos), lines: ["title.subtitle", "title.tag"] });

    const tiles = [
        { key: "arrivals", n: arrivals.length, what: "Arrivals", emoji: "🚪" },
        { key: "orphans", n: orphans.length, what: "Baby Arrivals", emoji: "🍼" },
        { key: "troopBabies", n: troopBabies.length, what: "Troop Babies Born", emoji: "🐣" },
        { key: "integrations", n: foster.length + adult.length, what: "Integrations", emoji: "🤝", note: `${foster.length} with foster mums · ${adult.length} adults` },
        { key: "releases", n: released.length, what: "Releases", emoji: "🌳" },
        vetVisits && { key: "vetVisits", n: vetVisits.length, what: "Vet Visits", emoji: "🩺" },
        vasectomies && { key: "vasectomies", n: vasectomies.length, what: "Vasectomies", emoji: "✂️" },
        counts.sessions !== null && counts.sessions !== undefined && { key: "sessions", n: counts.sessions, what: "Monitoring Sessions", emoji: "📋" },
    ].filter(Boolean);
    slides.push({ id: "numbers", kind: "numbers", year, tiles, lines: tiles.map((t) => `numbers.${t.key}`) });

    if (arrivals.length) {
        const { months, busiest } = byMonth(arrivals.map((m) => m.arrivalDate));
        slides.push({
            id: "arrivals",
            kind: "chart",
            kicker: "Arrivals",
            title: `${plural(arrivals.length, "monkey")} came to us`,
            total: arrivals.length,
            bars: tally(arrivals, (m) => ARRIVAL_REASONS[m.arrivalReason] ?? "Not recorded"),
            barsTitle: "Why they came",
            months,
            busiest,
            lines: ["arrivals.line"],
        });
    }

    const monkeySlides = (id, list, kicker, title, toTile, line, note) =>
        pages(list).forEach((page, i, all) =>
            slides.push({
                id: all.length > 1 ? `${id}-${i + 1}` : id,
                kind: "monkeys",
                kicker: all.length > 1 ? `${kicker} · ${i + 1} of ${all.length}` : kicker,
                title,
                tiles: page.map(toTile),
                note,
                lines: [line],
            })
        );
    const month = (date) => (date ? SHORT_MONTHS[monthOf(date)] : "");
    const named = (m) => (facts.namedBy?.[m.id] ? `Named by ${facts.namedBy[m.id]}` : "");

    if (orphans.length) {
        const busy = byMonth(orphans.map((m) => m.arrivalDate)).busiest;
        monkeySlides(
            "orphans",
            orphans,
            "Baby Arrivals",
            `${plural(orphans.length, "little one", "little ones")} arrived 🍼`,
            (m) => tile(m, month(m.arrivalDate), named(m)),
            "orphans.line",
            busy && orphans.length > 1 ? `Busiest month: ${MONTHS[busy.month]} (${busy.count})` : ""
        );
    }
    if (troopBabies.length) {
        monkeySlides(
            "troop-babies",
            troopBabies,
            "Troop Babies",
            `${plural(troopBabies.length, "baby", "babies")} born in the troops 🐣`,
            (m) => tile(m, month(m.birthDate ?? m.arrivalDate), m.troop ? `${fullName(m.troop)} Troop` : ""),
            "troopBabies.line"
        );
    }
    const placeLine = (i) => (i.place ? fullName(i.place) : "");
    if (foster.length) {
        monkeySlides(
            "foster",
            foster,
            "Foster-Mum Integrations",
            `${plural(foster.length, "baby", "babies")} found a foster mum 🤱`,
            (i) => tile(i.monkey, placeLine(i) || month(i.startedOn), STATUS_TAGS[i.status] ?? ""),
            "foster.line"
        );
    }
    if (adult.length) {
        monkeySlides(
            "adults",
            adult,
            "Adult Integrations",
            `${plural(adult.length, "monkey")} joined a troop 🤝`,
            (i) => tile(i.monkey, placeLine(i) || month(i.startedOn), STATUS_TAGS[i.status] ?? ""),
            "adults.line",
            groups.cancelled ? `Not counting ${plural(groups.cancelled, "cancelled integration")}` : ""
        );
    }
    if (released.length) {
        monkeySlides(
            "releases",
            released,
            "Releases",
            `${plural(released.length, "monkey")} went back to the wild 🌳`,
            (m) => tile(m, month(m.statusOn), m.troop ? `From ${fullName(m.troop)} Troop` : ""),
            "releases.line"
        );
    }
    if (vetVisits?.length) {
        const { busiest } = byMonth(vetVisits.map((v) => v.date));
        slides.push({
            id: "vet-visits",
            kind: "stats",
            kicker: "Vet Visits",
            title: `${plural(vetVisits.length, "trip")} to the vet 🩺`,
            total: vetVisits.length,
            groups: [
                { title: "Why", bars: tally(vetVisits, (v) => VET_REASONS[v.reason] ?? "Other") },
                { title: "Where", bars: tally(vetVisits, (v) => vetName(v.practice, v.practiceOther)) },
            ],
            facts: [
                busiest && { label: "Busiest month", value: `${MONTHS[busiest.month]} (${busiest.count})` },
                { label: "Monkeys treated", value: String(new Set(vetVisits.map((v) => v.monkeyId)).size) },
            ].filter(Boolean),
            lines: ["vet.line"],
        });
    }
    if (vasectomies?.length) {
        const onSite = vasectomies.filter((v) => v.vet === "on_site").length;
        const { busiest } = byMonth(vasectomies.map((v) => v.date));
        slides.push({
            id: "vasectomies",
            kind: "stats",
            kicker: "Vasectomies",
            title: `${plural(vasectomies.length, "vasectomy", "vasectomies")} ✂️`,
            total: vasectomies.length,
            groups: [{ title: "Where", bars: tally(vasectomies, (v) => (v.vet === "on_site" ? "On Site" : vetName(v.vet, v.vetOther))) }],
            facts: [
                { label: "Done on site", value: `${onSite} of ${vasectomies.length}` },
                busiest && { label: "Busiest month", value: `${MONTHS[busiest.month]} (${busiest.count})` },
            ].filter(Boolean),
            lines: ["vasectomies.line"],
        });
    }

    const fun = funFacts(facts, year, arrivals, nameOf, arrivals.concat(troopBabies));
    const cards = [
        fun.milk && {
            key: "milk",
            emoji: "🍼",
            big: grouped(fun.milk.ml),
            unit: " ml",
            label: "Most milk in one day",
            who: `${fun.milk.name}, on ${Number(fun.milk.date.slice(8))} ${SHORT_MONTHS[monthOf(fun.milk.date)]}.`,
            name: fun.milk.name,
        },
        fun.weight && {
            key: "weight",
            emoji: "⚖️",
            big: `+${weightText(fun.weight.gain)}`,
            label: "Biggest weight gain",
            who: `${fun.weight.name}: ${weightText(fun.weight.from)} → ${weightText(fun.weight.to)}.`,
            name: fun.weight.name,
        },
        fun.oldest && {
            key: "oldest",
            emoji: "👴",
            big: `~${fun.oldest.years}`,
            unit: " yrs",
            label: "Oldest arrival",
            who: `${fun.oldest.name}, who came in ${fun.oldest.month}.`,
            name: fun.oldest.name,
        },
        fun.letter && {
            key: "letter",
            emoji: "🔤",
            big: fun.letter.letter,
            label: "Most popular first letter",
            who: `${fun.letter.count} names: ${fun.letter.names.slice(0, 3).join(", ")}${fun.letter.count > 3 ? "…" : ""}`,
        },
        fun.namer && {
            key: "namer",
            emoji: "🏷️",
            big: String(fun.namer.count),
            label: "Most monkeys named",
            who: `${fun.namer.name} named ${fun.namer.count} of the year's ${fun.namer.of} newcomers.`,
            name: fun.namer.name,
        },
        fun.month && {
            key: "month",
            emoji: "📅",
            big: SHORT_MONTHS[MONTHS.indexOf(fun.month.month)],
            label: "Busiest month for arrivals",
            who: `${plural(fun.month.count, "arrival")} in ${fun.month.month}.`,
        },
    ].filter(Boolean);
    if (cards.length) slides.push({ id: "facts", kind: "facts", kicker: "Fun Facts", title: "The Year's Records", cards, lines: ["facts.stamp", ...cards.map((c) => `facts.${c.key}`)] });

    const busy = [
        counts.sightings != null && { emoji: "👀", big: grouped(counts.sightings), label: "Monkeys spotted on monitoring" },
        counts.photos != null && { emoji: "📸", big: grouped(counts.photos), label: "Photos added" },
        counts.deworming != null && { emoji: "💊", big: grouped(counts.deworming), label: "Deworming doses given" },
        counts.maintenance != null && { emoji: "🔧", big: grouped(counts.maintenance), label: "Maintenance jobs logged" },
        counts.weeklyReports != null && { emoji: "📝", big: grouped(counts.weeklyReports), label: "Weekly Baby Reports written" },
        counts.microchips != null && { emoji: "📟", big: grouped(counts.microchips), label: "Microchips added" },
    ].filter((c) => c && c.big !== "0");
    if (busy.length) slides.push({ id: "busy", kind: "busy", kicker: "By the Numbers", title: "A Busy Year", cards: busy, lines: ["busy.line"] });

    slides.push({ id: "thanks", kind: "thanks", year, monkeys: titleMonkeys(facts, year, settings.titlePhotos), lines: ["thanks.title", "thanks.message"] });
    return slides;
}
