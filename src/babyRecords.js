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
    // (its own page: BabyWeeklyReports.jsx)
    "weekly-reports": {
        id: "weekly-reports",
        title: "Weekly Baby Reports",
        hint: "A weekly report on each baby, ready to copy into WhatsApp.",
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
    // Sections' (their own pages: MonitoringRecordsPage.jsx, SectionsRecordsPage.jsx,
    // DewormingRecordsPage.jsx)
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
    deworming: {
        id: "deworming",
        title: "Deworming",
        hint: "Deworming lists: who's dewormed with what, ready to print and complete.",
    },
    feeding: {
        id: "feeding",
        title: "Feeding",
        hint: "See every introcage monkey's feeding on one page, and download the AM Plates List.",
    },
    // Meds & Sickbay's (their own pages: MedsRecordsPage.jsx); soon: shown
    // as "Coming soon…", not open yet
    "vet-visits": {
        id: "vet-visits",
        title: "Vet Visits",
        hint: "Record a vet visit, and see past visits by year.",
    },
    vasectomies: {
        id: "vasectomies",
        title: "Vasectomies",
        hint: "Record a vasectomy, and check each year's boys.",
    },
    microchips: { id: "microchips", title: "Microchips", soon: true },
    medications: { id: "medications", title: "Medications", soon: true },
    "food-monitoring": { id: "food-monitoring", title: "Food Monitoring", soon: true },
};

// The teams (in alphabetical order), and what each records. page: its own page, no kinds to
// choose (Maintenance: MaintenanceRecordsPage.jsx); soon: shown as
// "Coming soon…", not open yet
export const TEAMS = [
    { id: "baby-care", name: BABY_CARE, kinds: ["milk", "weights", "weekly-reports"] },
    { id: "integration", name: "Integration", kinds: ["current", "reports"] },
    { id: "maintenance", name: "Maintenance", kinds: [], page: true, sub: "Reports" },
    { id: "meds-sickbay", name: "Meds & Sickbay", kinds: ["vet-visits", "vasectomies", "microchips", "medications", "food-monitoring"] },
    { id: "sections", name: "Sections", kinds: ["monitoring", "injuries", "deworming", "feeding"] },
];

// "records" → {}; "records/baby-care" → { team }; "records/baby-care/milk"
// → { team, kind }; anything unknown: as far as it's known
export function parseRecordsRoute(route) {
    const [, teamId, kindId] = route.split("/");
    const team = TEAMS.find((t) => t.id === teamId) ?? null;
    const kind = team && team.kinds.includes(kindId) && !RECORD_KINDS[kindId].soon ? RECORD_KINDS[kindId] : null;
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

// Who was in Baby Care on a day, for entering a past day's records: it goes by
// their move records, so a baby who's left since
// is still listed for their full days, and one who came after isn't.
//   moves: every monkey's [{ monkeyId, date, kind, fromId, toId }], oldest first
export function babiesOn(monkeys, enclosures, moves, day) {
    const unit = enclosures.find((e) => isCareUnit(e) && e.name === BABY_CARE);
    if (!unit) return [];
    const areas = new Set(enclosures.filter((e) => e.parentId === unit.id).map((e) => e.id));
    const hereNow = new Set(babyCareBabies(monkeys, enclosures).map((m) => m.id));
    const wasThere = (monkey) => {
        if (monkey.arrivalDate && monkey.arrivalDate > day) return false;
        const all = moves
            .filter((m) => m.monkeyId === monkey.id)
            .map((m) => ({ date: m.date, home: m.kind === "home", out: areas.has(m.fromId), into: areas.has(m.toId) }))
            .filter((e) => e.out || e.into);
        // (moved out, but their home only changed later: it was just a stay,
        // and they counted as Baby Care's until then)
        const homeLeft = all.filter((e) => e.home && e.out && !e.into).at(-1);
        const events = all.filter((e) => !(homeLeft && !e.home && e.out && !e.into && e.date <= homeLeft.date));
        // (their home's Baby Care: a stay in an introcage doesn't count as
        // leaving, as they're on today's list too)
        if (hereNow.has(monkey.id) && !(events[0]?.into && !events[0].out && events[0].date > day)) return true;
        // (moved that day: moving in, listed; moving out, that day's total
        // would be incomplete, so the day before was their last)
        const thatDay = events.filter((e) => e.date === day).at(-1);
        if (thatDay) return thatDay.into;
        const before = events.filter((e) => e.date < day).at(-1);
        if (before) return before.into;
        // (no move before that day: the first one after shows where they were)
        return events.length ? events[0].out : hereNow.has(monkey.id);
    };
    return monkeysIn(monkeys).filter(wasThere).sort((a, b) => a.name.localeCompare(b.name));
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

// ---- Weekly Baby Reports (BabyWeeklyReports.jsx) ----

export const MAX_BABY_REPORT = 1000;

// A day so many days on ("2026-11-02", 6 → "2026-11-08")
export function addDays(date, days) {
    const [y, m, d] = date.split("-").map(Number);
    return dayText(new Date(y, m - 1, d + days));
}

// The week a new report is for: this week, but on a Monday last week (the
// report on the week just ended)
export function reportWeek(today = new Date()) {
    const day = dayText(today);
    return today.getDay() === 1 ? addDays(mondayOf(day), -7) : mondayOf(day);
}

// "W/C 02.11"
export function weekCommencing(monday) {
    const [, m, d] = monday.split("-");
    return `W/C ${d}.${m}`;
}

// The babies in Baby Care on any day of a week (Monday to Sunday, up to
// today): a baby who left during the week is still in it. By name.
//   moves: as babiesOn
export function babiesInWeek(monkeys, enclosures, moves, monday, today = dayText(new Date())) {
    const found = new Map();
    for (let i = 0; i < 7; i++) {
        const day = addDays(monday, i);
        if (day > today) break;
        for (const baby of babiesOn(monkeys, enclosures, moves, day)) found.set(baby.id, baby);
    }
    return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The next week without a report from `from`, going back (step -1) or on
// (step 1), never past thisWeek: its Monday, or null
//   reported: a Set of the reported weeks' Mondays
export function unreportedWeek(from, step, reported, thisWeek) {
    let week = from;
    for (let i = 0; i < 520; i++) {
        week = addDays(week, 7 * step);
        if (week > thisWeek) return null;
        if (!reported.has(week)) return week;
    }
    return null;
}

// The week Enter opens on: the usual one (reportWeek) if it's not been
// reported yet, else the next unreported one, else the one before
export function firstUnreportedWeek(reported, today = new Date()) {
    const start = reportWeek(today);
    if (!reported.has(start)) return start;
    const thisWeek = mondayOf(dayText(today));
    return unreportedWeek(start, 1, reported, thisWeek) ?? unreportedWeek(start, -1, reported, thisWeek);
}

// A week's reports, for pasting into WhatsApp (Not recorded ones left out):
//   "*Weekly Baby Report W/C 02.11*", a blank line, then each baby's
//   "*Masko*" and their report, a blank line between babies (by name)
//   reports: [{ monkeyId, report }]; monkeys: to find their names
export function weeklyBabyText(monday, reports, monkeys) {
    const nameOf = (id) => monkeys.find((m) => m.id === id)?.name ?? "A baby";
    const babies = reports
        .filter((r) => r.report)
        .map((r) => ({ name: nameOf(r.monkeyId), report: r.report }))
        .sort((a, b) => a.name.localeCompare(b.name));
    return [`*Weekly Baby Report ${weekCommencing(monday)}*`, ...babies.map((b) => `\n*${b.name}*\n${b.report}`)].join("\n");
}
