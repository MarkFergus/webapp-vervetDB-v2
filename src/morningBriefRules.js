// The Morning Brief (Admin Dashboard → Morning Brief, and the 06:50 email):
// what needs doing today, worked out with the website's own rules. Plain
// JavaScript with no browser needs, as it also runs on Supabase for the email
// (supabase/functions/morning-brief).
//   buildMorningBrief(data)   the brief: { title, allClear, sections: [{ id,
//       title, groups: [{ title, lines: [{ text, alert? (red), toDo? (amber) }] }] }] }
//   briefEmail(brief)         its email: { subject, html, text }
import { MONITORED_SECTIONS } from "./monitoring";
import { babyCareBabies, changeText, historyFor } from "./babyRecords";
import { hasTroop, introcageMonkeys, isSickbayUnit } from "./enclosures";
import { dewormingGroups, SESSIONS } from "./dewormingRules";
import { relativeDay, scheduleOf } from "./dewormingSchedule";
import { updateNeeded, UPDATE_DUE_DAYS } from "./injuryRules";
import { MUST_SEE_AFTER, OVERDUE_DAYS, FENCE, FOOD_LEVELS, ALL_GOOD, daysBetween, seenDaily, sightingRecord, troopSessions } from "./monitoringRules";
import { fullName } from "./places";
import { monkeysIn } from "./stats";

// Dewormings coming up: those in the next this many days
export const DUE_SOON_DAYS = 7;
// Groups missing from the calendar: those due within this many days
export const NOT_IN_CALENDAR_DAYS = 30;
// A baby's weighed at least once a week: longer than this, it's missing
export const WEIGHT_DUE_DAYS = 7;

// So large there are always some not seen: listed apart at the bottom of
// Monitoring, not in To Do or in red, so they don't crowd out the others
export const LARGE_TROOP = "Camelot";

const SITE = "https://vervetdb.com/";
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Today at the sanctuary, wherever this is running: "2026-11-05"
export const sanctuaryToday = (now = new Date()) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(now);

// "2026-11-05" → "Thu 5 Nov"
export function briefDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTH_NAMES[m - 1]}`;
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const line = (text, alert = false) => (alert ? { text, alert: true } : { text });
const lastMonitored = (days) => `last monitored ${plural(days, "day")} ago`;
// "D&D Troop" → "Dino & Daniel Troop"
const groupLabel = (name) => (name ?? "").replace(/^(D&D|H&B)\b/, (short) => fullName(short));
const dewormingLabel = (item) => `${groupLabel(item.groupName)} ${SESSIONS[item.session]}`;

// "Not seen in 2 sessions: Holly, Jasper", the most sessions first
function byMissed(monkeys) {
    const counts = [...new Set(monkeys.map((m) => m.missed))].sort((a, b) => b - a);
    return counts.map((missed) => {
        const names = monkeys.filter((m) => m.missed === missed).map((m) => m.name).sort((a, b) => a.localeCompare(b));
        return line(`Not seen in ${plural(missed, "session")}: ${names.join(", ")}`);
    });
}

function monitoringPart({ monkeys, enclosures, sessions, spots, lastMoves, monitoring, today }) {
    const mustSee = [];
    const checkOn = [];
    const monitor = [];
    const largeTroop = [];
    const notSeen = [];
    const overdue = [];
    // (each problem from a troop's latest session → its troops)
    const problems = new Map();
    // (not the Bandits: a wild troop, not monitored)
    for (const troop of enclosures.filter((e) => hasTroop(e) && MONITORED_SECTIONS.includes(e.section))) {
        const name = fullName(troop.name);
        const history = troopSessions(sessions, troop.id);
        for (const m of monkeysIn(monkeys, troop)) {
            if (monitoring[m.id]?.alertsMuted) continue;
            const { missed, lastSeen } = sightingRecord(history, m.id, spots, {
                daily: seenDaily(m),
                back: lastMoves[m.id],
                today,
            });
            const seen = lastSeen ? `last seen ${briefDay(lastSeen)}` : "not seen before";
            if (missed > 0 && troop.name === LARGE_TROOP) {
                largeTroop.push({ missed, name: m.name });
            } else if (missed >= MUST_SEE_AFTER) {
                mustSee.push(line(`${m.name} (${name}): not seen in ${missed} sessions, ${seen}`, true));
                checkOn.push({
                    missed,
                    text: `${m.name} (${name}): not seen in ${missed} sessions, ${lastSeen ? `last seen ${briefDay(lastSeen)} (${plural(daysBetween(lastSeen, today), "day")} ago)` : "not seen before"}`,
                });
            } else if (missed > 0) {
                notSeen.push(line(`${m.name} (${name}): not seen in 1 session, ${seen}`));
            }
        }
        const latest = history[0];
        const days = latest ? daysBetween(latest.date, today) : null;
        if (!latest) monitor.push({ days: Infinity, text: `${name}: no sessions yet` });
        else if (days >= OVERDUE_DAYS) monitor.push({ days, text: `${name}: ${plural(days, "day")} since last session` });
        if (!latest) overdue.push(line(`${name}: no sessions yet`, true));
        else if (days >= OVERDUE_DAYS) overdue.push(line(`${name}: ${lastMonitored(days)}`, true));
        if (latest) {
            // (waters: only useful at the time of reporting)
            const note = (label) => problems.get(label)?.push(name) ?? problems.set(label, [name]);
            if (latest.fence && latest.fence !== ALL_GOOD.fence) note(`Fence ${FENCE[latest.fence]}`);
            if (latest.food && latest.food !== ALL_GOOD.food) note(`Food ${FOOD_LEVELS[latest.food]}`);
        }
    }
    const placeOf = (id) => enclosures.find((e) => e.id === id)?.name;
    const stillOpen = sessions
        .filter((s) => s.status !== "finished" && s.date < today)
        .map((s) => line(`${fullName(placeOf(s.enclosureId))}: session from ${briefDay(s.date)}`));
    const groups = [
        { title: "Must See", lines: mustSee },
        { title: "Not Seen Last Session", lines: notSeen },
        { title: "Overdue", lines: overdue },
        {
            title: "Problems",
            lines: [...problems].sort(([a], [b]) => a.localeCompare(b)).map(([problem, troops]) => line(`${problem}: ${troops.join(", ")}`)),
        },
        { title: "Still In Progress", lines: stillOpen },
        {
            title: `${LARGE_TROOP}: Not Seen`,
            lines: byMissed(largeTroop),
        },
    ];
    return { groups, checkOn, monitor };
}

function medicalPart({ monkeys, enclosures, injuries, today }) {
    const nameOf = new Map(monkeys.map((m) => [m.id, m.name]));
    const stale = injuries
        .filter((i) => nameOf.has(i.monkeyId) && updateNeeded(i, today))
        .map((i) => line(`${nameOf.get(i.monkeyId)}: ${i.description}`));
    // Who's there now: its own (injured rescues) and anyone in it for now
    const unit = enclosures.find(isSickbayUnit);
    const residents = unit
        ? introcageMonkeys(unit, monkeys).filter((m) => !m.stay || m.stay.enclosure === unit.name)
        : monkeys.filter((m) => m.inSickbay);
    const sickbay = residents.map((m) => {
        const since = m.inSickbay ? m.sickbaySince : m.arrivalDate;
        const rescue = m.inSickbay ? "" : " (Injured Rescue)";
        return line(`${m.name}${rescue}${since ? `: ${plural(daysBetween(since, today), "day")}` : ""}`);
    });
    // Staying in an introcage for now, away from home
    const staying = monkeys
        .filter((m) => m.stay?.introcage)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((m) => line(`${m.name}: ${fullName(m.stay.introcage)}`));
    return [
        { title: `No Update for ${UPDATE_DUE_DAYS}+ Days`, lines: stale },
        { title: "In Sickbay", lines: sickbay },
        { title: "In Introcages", lines: staying },
    ];
}

function dewormingPart({ monkeys, enclosures, calendarEvents, sheets, today }) {
    const { due, overdue, unscheduled } = scheduleOf(calendarEvents, dewormingGroups(enclosures, monkeys), sheets, today);
    const daysTo = (date) => daysBetween(today, date);
    const late = [
        ...overdue.map((e) => line(dewormingLabel(e), true)),
        ...unscheduled.filter((u) => u.late).map((u) => line(`${dewormingLabel(u)} (not in calendar)`, true)),
    ];
    const notInCalendar = unscheduled
        .filter((u) => !u.late && u.date && daysTo(u.date) <= NOT_IN_CALENDAR_DAYS)
        .map((u) => line(`${dewormingLabel(u)}: around ${briefDay(u.date)}`));
    const awaiting = sheets
        .filter((s) => s.status === "submitted")
        .map((s) => line(`${groupLabel(s.groupName)} ${SESSIONS[s.session]}`));
    const soon = due
        .filter((e) => daysTo(e.date) >= 0 && daysTo(e.date) <= DUE_SOON_DAYS)
        // (already done: nothing to do)
        .filter((e) => !e.sheet || e.sheet.status === "ready")
        .map((e) => {
            const when = `${briefDay(e.date)} · ${dewormingLabel(e)}`;
            if (!e.sheet) return line(`${when} · Needs List`);
            return line(`${when} · ${e.sheet.daysDone?.length ? "In Progress" : "List Ready"}`);
        });
    const prep = due
        .filter((e) => !e.sheet && daysTo(e.date) >= 0 && daysTo(e.date) <= DUE_SOON_DAYS)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((e) => `${dewormingLabel(e)}: ${briefDay(e.date)} (${relativeDay(e.date, today).toLowerCase()})`);
    const groups = [
        { title: "Overdue", lines: late },
        { title: "Not in Calendar", lines: notInCalendar },
        { title: "Awaiting Approval", lines: awaiting },
        { title: `Next ${DUE_SOON_DAYS} Days`, lines: soon },
    ];
    return { groups, prep };
}

// A baby's milk or weight on a day, with the change since the one before
//   (none that day: null)
function babyRecord(records, monkeyId, day, unit) {
    const entry = historyFor(records, monkeyId).find((r) => r.date === day);
    if (!entry) return null;
    const amount = `${entry.value.toLocaleString("en-GB")} ${unit}`;
    return entry.change === null ? `${amount} (first entry)` : `${amount} (${changeText(entry.change, unit)})`;
}

// The date of a baby's newest entry (or null)
const lastEntry = (records, monkeyId) => historyFor(records, monkeyId)[0]?.date ?? null;

function babyPart({ monkeys, enclosures, milk, weights, today }) {
    const [y, m, d] = today.split("-").map(Number);
    const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
    const entered = (last) => (last ? `last entered ${briefDay(last)}` : "none entered yet");
    const milkRecords = milk.map((r) => ({ monkeyId: r.monkeyId, date: r.date, value: r.ml }));
    const weightRecords = weights.map((r) => ({ monkeyId: r.monkeyId, date: r.date, value: r.grams }));
    const milkLines = [];
    const weightLines = [];
    for (const baby of babyCareBabies(monkeys, enclosures)) {
        const total = babyRecord(milkRecords, baby.id, yesterday, "ml");
        milkLines.push(
            total
                ? line(`${baby.name}: ${total}`)
                : // (not in red: often entered in batches)
                  line(`${baby.name}: no total for yesterday, ${entered(lastEntry(milkRecords, baby.id))}`)
        );
        const weight = babyRecord(weightRecords, baby.id, yesterday, "g");
        const last = lastEntry(weightRecords, baby.id);
        if (weight) weightLines.push(line(`${baby.name}: ${weight}`));
        else if (!last || daysBetween(last, today) > WEIGHT_DUE_DAYS) {
            weightLines.push(line(`${baby.name}: no weight for over ${WEIGHT_DUE_DAYS} days, ${entered(last)}`, true));
        }
    }
    return [
        { title: `Milk Totals (${briefDay(yesterday)})`, lines: milkLines },
        { title: "Weights", lines: weightLines },
    ];
}

const alertCount = (sections) =>
    sections.reduce((total, s) => total + s.groups.reduce((n, g) => n + g.lines.filter((l) => l.alert).length, 0), 0);

// data: { monkeys, enclosures, sessions, spots, lastMoves, monitoring,
//   injuries, calendarEvents, sheets, milk, weights, news: [{ kind ("arrival", "movement",
//   "status"), name, details }], today }
export function buildMorningBrief(data) {
    const section = (id, title, groups) => ({ id, title, groups: groups.filter((g) => g.lines.length) });
    const monitoring = monitoringPart(data);
    const deworming = dewormingPart(data);
    // (most urgent first)
    const todoLines = (texts) => texts.map((text) => ({ text, toDo: true }));
    const toDo = section("to_do", "To Do", [
        {
            title: "Check On",
            lines: todoLines(monitoring.checkOn.sort((a, b) => b.missed - a.missed).map((c) => c.text)),
        },
        {
            title: "Monitor",
            lines: todoLines(monitoring.monitor.sort((a, b) => b.days - a.days).map((m) => m.text)),
        },
        { title: "Prep Deworming Sheets", lines: todoLines(deworming.prep) },
    ]);
    const parts = [
        toDo,
        section("monitoring", "Monitoring", monitoring.groups),
        section("medical", "Medical", medicalPart(data)),
        section("baby_care", "Baby Care", babyPart(data)),
        section("deworming", "Deworming", deworming.groups),
    ].filter((s) => s.groups.length);
    const news = (kind) => data.news.filter((n) => n.kind === kind);
    const good = section("good_to_know", "Good To Know (Last 24 Hours)", [
        { title: "Arrived", lines: news("arrival").map((n) => line(n.name)) },
        { title: "Moved", lines: news("movement").map((n) => line(`${n.name}: ${n.details}`)) },
        { title: "Status Changes", lines: news("status").map((n) => line(`${n.name}: ${n.details}`)) },
    ]);
    return {
        title: `Morning Brief · ${briefDay(data.today)}`,
        // (nothing to do, and nothing in red)
        allClear: !toDo.groups.length && alertCount(parts) === 0,
        sections: good.groups.length ? [...parts, good] : parts,
    };
}

const esc = (text) =>
    String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function briefEmail(brief) {
    const toDo = (brief.sections.find((s) => s.id === "to_do")?.groups ?? []).reduce((n, g) => n + g.lines.length, 0);
    const alerts = alertCount(brief.sections);
    const headline = brief.allClear ? " · All clear" : toDo ? ` · ${toDo} To Do` : alerts ? ` · ${plural(alerts, "alert")}` : "";
    let html = brief.allClear ? '<p style="margin:0 0 12px;font-weight:700;color:#1b7a3d">All clear ✓</p>' : "";
    let text = brief.allClear ? "All clear ✓\n\n" : "";
    for (const section of brief.sections) {
        html += `<h2 style="margin:28px 0 8px;padding:8px 12px;font-size:17px;color:#ffffff;background-color:#2b3a33;border-radius:4px">${esc(section.title)}</h2>`;
        text += `${section.title.toUpperCase()}\n`;
        for (const group of section.groups) {
            html += `<h3 style="margin:16px 0 4px;font-size:15px;font-weight:700;color:#111111">${esc(group.title)}</h3><ul style="margin:0;padding-left:18px">`;
            text += `\n${group.title}\n`;
            for (const l of group.lines) {
                html += `<li style="margin:2px 0;${l.alert ? "color:#b3261e" : l.toDo ? "color:#b26a00;font-weight:700" : ""}">${esc(l.text)}</li>`;
                text += `  - ${l.text}\n`;
            }
            html += "</ul>";
        }
        text += "\n";
    }
    const link = `${SITE}#admin/brief`;
    return {
        subject: `vervetDB ${brief.title}${headline}`,
        html:
            `<div style="font-family:Arial,sans-serif;font-size:15px;color:#222;max-width:640px"><h1 style="margin:0 0 8px;font-size:22px">${esc(brief.title)}</h1>${html}` +
            `<p style="margin-top:24px;font-size:13px;color:#666"><a href="${link}">Open the Morning Brief in vervetDB</a></p></div>`,
        text: `${brief.title}\n\n${text}${link}`,
    };
}
