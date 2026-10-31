// The Records page's workings (RecordsPage.jsx): the teams and what they
// record, the dates, checking what's typed, what's already saved, and each
// baby's history with the change since the one before.
import { monkeysIn, BABY_CARE } from "./stats";
import { isCareUnit } from "./enclosures";

export const RECORDS_HASH = "#records";

// What can be recorded (supabase/baby-care-records.sql):
//   unit / min / max: whole numbers only
//   defaultDay: the date the form starts on: "yesterday" (a milk total runs
//   midnight to midnight, so it's entered the morning after) or "today"
export const RECORD_KINDS = {
    milk: {
        id: "milk",
        title: "Milk Totals",
        what: "milk total",
        whats: "milk totals",
        unit: "ml",
        min: 0,
        max: 500,
        defaultDay: "yesterday",
        // (the history shows this many days at first: See More for the rest)
        historyDays: 7,
        hint: "Each baby's milk for the day, midnight to midnight.",
    },
    weights: {
        id: "weights",
        title: "Weights",
        what: "weight",
        whats: "weights",
        unit: "g",
        min: 1,
        max: 20000,
        defaultDay: "today",
        historyDays: 7 * 7,
        hint: "Choose a date and enter the baby weights for that day.",
    },
    // Integration's (their own page: IntegrationRecordsPage.jsx)
    reports: {
        id: "reports",
        title: "Reports",
        hint: "Integration reports for the monkeys being integrated.",
    },
    current: {
        id: "current",
        title: "Current Integrations",
        hint: "Who's being integrated, and starting a new one.",
    },
    // Sections' (their own pages: MonitoringRecordsPage.jsx, SectionsRecordsPage.jsx)
    monitoring: {
        id: "monitoring",
        title: "Monitoring",
        hint: "Start a monitoring session, record the results, and copy the summary.",
    },
    injuries: {
        id: "injuries",
        title: "Injuries",
        hint: "View each troop's current injuries, and those healed in the last 6 months.",
    },
};

// The teams (in alphabetical order), and what each records. page: its own page, no kinds to
// choose (Maintenance: MaintenanceRecordsPage.jsx); soon: shown as
// "Coming soon…", not open yet
export const TEAMS = [
    { id: "baby-care", name: BABY_CARE, kinds: ["milk", "weights"] },
    { id: "integration", name: "Integration", kinds: ["current", "reports"] },
    { id: "maintenance", name: "Maintenance", kinds: [], page: true, sub: "Reports" },
    { id: "meds-sickbay", name: "Meds & Sickbay", kinds: [], soon: true },
    { id: "sections", name: "Sections", kinds: ["monitoring", "injuries"] },
];

// "records" → {}; "records/baby-care" → { team }; "records/baby-care/milk"
// → { team, kind }; anything unknown: as far as it's known
export function parseRecordsRoute(route) {
    const [, teamId, kindId] = route.split("/");
    const team = TEAMS.find((t) => t.id === teamId) ?? null;
    const kind = team && team.kinds.includes(kindId) ? RECORD_KINDS[kindId] : null;
    return { team, kind };
}

export const isRecordsRoute = (route) => route === "records" || route.startsWith("records/");

// A day as "2026-10-24", on this device's clock
export function dayText(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function startDay(kind, now = new Date()) {
    const d = new Date(now);
    if (kind.defaultDay === "yesterday") d.setDate(d.getDate() - 1);
    return dayText(d);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-10-24" → "Sat 24 Oct"
export function dayLabel(date) {
    const [y, m, d] = date.split("-").map(Number);
    return `${WEEKDAYS[new Date(y, m - 1, d).getDay()]} ${d} ${MONTHS[m - 1]}`;
}

// A change: "+18 g", "−5 g", "±0 g"
export const changeText = (n, unit) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toLocaleString("en-GB")} ${unit}`;

// Baby Care's babies (its introcages too), by name
export function babyCareBabies(monkeys, enclosures) {
    const unit = enclosures.find((e) => isCareUnit(e) && e.name === BABY_CARE);
    return unit ? [...monkeysIn(monkeys, unit)].sort((a, b) => a.name.localeCompare(b.name)) : [];
}

// What's typed in a box: null (empty: skipped), { value }, or { error }
export function checkValue(text, kind) {
    const typed = String(text ?? "").trim();
    if (!typed) return null;
    if (!/^\d+$/.test(typed)) return { error: `Whole ${kind.unit} only` };
    const value = Number(typed);
    if (value < kind.min || value > kind.max) return { error: `${kind.min}–${kind.max.toLocaleString("en-GB")} ${kind.unit}` };
    return { value };
}

// The form's rows → what to save, or the problems
//   rows: [{ monkey, text, notes }]
//   → { entries: [{ monkeyId, date, value, notes }], errors: { monkeyId: message } }
export function batchFrom(rows, date, kind) {
    const entries = [];
    const errors = {};
    for (const row of rows) {
        const checked = checkValue(row.text, kind);
        if (!checked) continue;
        if (checked.error) errors[row.monkey.id] = checked.error;
        else entries.push({ monkeyId: row.monkey.id, date, value: checked.value, notes: row.notes?.trim() || null });
    }
    return { entries, errors };
}

// The entries that already have one saved (same baby, same day)
//   saved: [{ monkeyId, date, value, loggedByName }]
//   → [{ entry, saved }]
export function alreadySaved(entries, saved) {
    return entries.flatMap((entry) => {
        const found = saved.find((s) => s.monkeyId === entry.monkeyId && s.date === entry.date);
        return found ? [{ entry, saved: found }] : [];
    });
}

// One baby's records, newest first, each with the change since the one
// before it (and that one's date and value); none before: change null
//   records: [{ monkeyId, date, value, notes, loggedByName }]
export function historyFor(records, monkeyId) {
    const mine = records.filter((r) => r.monkeyId === monkeyId).sort((a, b) => a.date.localeCompare(b.date));
    return mine
        .map((r, i) => {
            const before = mine[i - 1] ?? null;
            return {
                ...r,
                change: before ? r.value - before.value : null,
                previous: before ? { date: before.date, value: before.value } : null,
            };
        })
        .reverse();
}

// A history's first look (newest first, as historyFor): the entries in the
// `days` days up to its latest one (milk: 7 days; weights: 7 weeks). From
// the latest, not today, so a baby with nothing lately still shows some.
export function recentHistory(history, days) {
    if (!history.length) return history;
    const [y, m, d] = history[0].date.split("-").map(Number);
    const from = dayText(new Date(y, m - 1, d - (days - 1)));
    return history.filter((r) => r.date >= from);
}

// The Monday a day's week starts on ("2026-10-25" → "2026-10-19")
export function mondayOf(date) {
    const [y, m, d] = date.split("-").map(Number);
    const day = new Date(y, m - 1, d);
    day.setDate(day.getDate() - ((day.getDay() + 6) % 7));
    return dayText(day);
}

// The weekly weights report, for pasting into WhatsApp: each baby weighed
// that week (Monday to Sunday), by name, with its latest weighing that week
// and the change since the one before (any time before)
//   "⚖️ *Baby Weights 25.10.26* ⚖️", a blank line, then
//   "*Muse* 512g (+38g)" (a first weighing: "(first weight)")
//   records: [{ monkeyId, date, value }]; monkeys: to find their names
//   → { title, lines: [{ name, value, change }], text } (no weighings that
//   week: lines empty)
export function weightReport(records, monkeys, anyDay) {
    const monday = mondayOf(anyDay);
    const [y, m, d] = monday.split("-").map(Number);
    const sunday = dayText(new Date(y, m - 1, d + 6));
    const inWeek = (r) => r.date >= monday && r.date <= sunday;
    const ids = [...new Set(records.filter(inWeek).map((r) => r.monkeyId))];
    const lines = ids
        .map((id) => {
            const latest = historyFor(records, id).find(inWeek);
            return { name: monkeys.find((mk) => mk.id === id)?.name ?? "A baby", date: latest.date, value: latest.value, change: latest.change };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    // (dated by the last weighing that week: "25.10.26")
    const last = lines.reduce((day, l) => (l.date > day ? l.date : day), "") || monday;
    const [ly, lm, ld] = last.split("-");
    const title = `Baby Weights ${ld}.${lm}.${ly.slice(2)}`;
    const changeOf = (n) => (n === null ? "(first weight)" : `(${n > 0 ? "+" : n < 0 ? "-" : ""}${Math.abs(n)}g)`);
    const text = [`⚖️ *${title}* ⚖️`, "", ...lines.map((l) => `*${l.name}* ${l.value}g ${changeOf(l.change)}`)].join("\n");
    return { title, monday, sunday, lines, text };
}
