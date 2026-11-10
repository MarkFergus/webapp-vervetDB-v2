// The Kindle dashboard's Monitoring and Deworming pages (public/kindle.html),
// worked out with the website's own rules, bundled into the Morning Brief's
// function (npm run brief:build). Each → { updated, groups: [{ title, lines:
// [{ text, alert? }] }] }, as plain text for the Kindle to show.
import { loadDewormingCalendar, loadDewormingSheets, loadMonitoringSessions, loadMonkeyData } from "../src/monkeyData";
import { OVERDUE_DAYS, troopStages } from "../src/monitoringRules";
import { MONITORED_SECTIONS } from "../src/monitoring";
import { hasTroop } from "../src/enclosures";
import { fullName } from "../src/places";
import { sanctuaryToday } from "../src/morningBriefRules";
import { SESSIONS, dewormingGroups, sheetTitle } from "../src/dewormingRules";
import { relativeDay, scheduleBuckets, scheduleOf } from "../src/dewormingSchedule";

const ZONE = "Africa/Johannesburg";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-11-09" → "Mon 9 Nov"
function shortDay(date) {
    const [y, m, d] = date.split("-").map(Number);
    return `${DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}
// A moment → "07:45", the sanctuary's time
const clock = (at) => new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: ZONE });
const firstName = (name) => (name ?? "Staff").trim().split(/\s+/)[0];
const line = (text, alert = false) => (alert ? { text, alert: true } : { text });
const ago = (days) => (days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`);

// ---- Monitoring: as the Monitoring page's Troops box ----
// In Progress, Overdue, then the rest by when they're due (soonest first), then
// those done in the last 48 hours
export function monitoringPage(troops, sessions, today, now = Date.now()) {
    const stages = troopStages(troops, sessions, MONITORED_SECTIONS, today, now);
    const name = (t) => fullName(t.name);
    const of = (stage) => stages.filter((s) => s.stage === stage);
    const groups = [
        {
            title: "In Progress",
            lines: of("progress").map(({ troop, session }) =>
                line(`${name(troop)} · started ${shortDay(session.date)} ${clock(session.startedAt)} · ${firstName(session.startedByName)}`)
            ),
        },
        {
            title: "Overdue",
            lines: of("overdue").map(({ troop, days }) =>
                line(`${name(troop)} · ${days === null ? "no sessions yet" : `${days} days since monitored`}`, true)
            ),
        },
        {
            title: "Coming Up",
            lines: of("rest").map(({ troop, days }) => {
                const left = OVERDUE_DAYS - (days ?? 0);
                return line(`${name(troop)} · ${ago(days)} · due ${left <= 1 ? "tomorrow" : `in ${left} days`}`);
            }),
        },
        {
            title: "Recently Done",
            lines: of("recent").map(({ troop, session }) =>
                line(`${name(troop)} · ${shortDay(session.date)} · ${firstName(session.startedByName)}`)
            ),
        },
    ].filter((g) => g.lines.length);
    return { updated: new Date(now).toISOString(), groups };
}

// ---- Deworming: lists in progress, then the schedule ----
// A list under way: In Progress (which day), or Awaiting Approval
function underWay(sheet) {
    if (sheet.status === "submitted") return "Awaiting Approval";
    if (sheet.status !== "ready") return null;
    const done = sheet.daysDone ?? [];
    const started = done.length || sheet.lines.some((l) => Object.keys(l.doses ?? {}).length || (l.kind && l.kind !== "list"));
    if (!started) return null;
    const days = [1, 2, 3, ...(sheet.lines.some((l) => l.day4 === true) ? [4] : [])];
    const next = days.find((d) => !done.includes(d));
    return next ? `In Progress · Day ${next}` : "Ready to Submit";
}

export function dewormingPage(sheets, events, groups, today, now = Date.now()) {
    const label = (name) => (name ?? "").replace(/^(D&D|H&B)\b/, (short) => fullName(short));
    const going = sheets
        .map((sheet) => ({ sheet, stage: underWay(sheet) }))
        .filter((s) => s.stage)
        .map(({ sheet, stage }) => line(`${label(sheetTitle(sheet))} · ${stage}`));
    const { due, overdue, unscheduled } = scheduleOf(events, groups, sheets, today);
    const buckets = scheduleBuckets({ due, overdue, unscheduled }, today);
    const out = [{ title: "In Progress", lines: going }];
    for (const bucket of buckets) {
        out.push({
            title: bucket.label,
            lines: bucket.items
                // (a list already under way: shown above)
                .filter((item) => !(item.sheet && underWay(item.sheet)))
                .map((item) => {
                    const what = `${label(item.groupName)} ${item.extra ? "Extra " : ""}${SESSIONS[item.session]}`;
                    const when = item.date ? `${shortDay(item.date)} (${relativeDay(item.date, today).toLowerCase()})` : "no date yet";
                    const note = item.kind === "estimate" ? " · not in calendar" : item.late ? " · date TBC" : "";
                    return line(`${what} · ${when}${note}`, Boolean(item.late));
                }),
        });
    }
    return { updated: new Date(now).toISOString(), groups: out.filter((g) => g.lines.length) };
}

// The data for each, loaded with the function's own connection
export async function loadMonitoringPage() {
    const [{ enclosures }, sessions] = await Promise.all([loadMonkeyData(), loadMonitoringSessions()]);
    return monitoringPage(enclosures.filter(hasTroop), sessions, sanctuaryToday());
}

export async function loadDewormingPage() {
    const [{ monkeys, enclosures }, sheets, calendar] = await Promise.all([
        loadMonkeyData(),
        loadDewormingSheets(),
        loadDewormingCalendar(),
    ]);
    return dewormingPage(sheets, calendar?.events ?? [], dewormingGroups(enclosures, monkeys), sanctuaryToday());
}
