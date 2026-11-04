// Weekly Reports (Admin Dashboard → Weekly Reports, admins only): each
// admin's weekly report email (supabase/weekly-reports.sql). Off until they
// turn it on.
//   weekStarts   the day their week starts (0 Sunday … 6 Saturday): 7 days,
//                midnight to midnight
//   sendDay / sendHour   when it's emailed: it covers the latest full week
//                before then
//   sections     what's in it (SECTIONS' ids)
// (A week's report itself, its lines worded for the page, the PDF and the
// email alike: weekly-report-email.sql's weekly_report_view.)
import { dayText } from "./babyRecords";

export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The checklist, in the email's order
export const SECTIONS = [
    {
        id: "monitoring",
        title: "Monitoring",
        sub: "Troops monitored, anyone not seen, alerts, new injuries, and what needs attention",
    },
    {
        id: "baby_care",
        title: "Baby Care",
        sub: "Milk totals, weights and moves",
    },
    {
        id: "integration",
        title: "Integration",
        sub: "Reports, new integrations and status changes",
    },
    {
        id: "deworming",
        title: "Deworming",
        sub: "Dewormings completed with any issues, in progress, and due in the next 2 weeks",
    },
    { id: "maintenance", title: "Maintenance", sub: "All maintenance completed" },
];

// As the database starts everyone off (turned off)
export const DEFAULT_SETTINGS = {
    enabled: false,
    weekStarts: 1,
    sendDay: 1,
    sendHour: 7,
    sections: SECTIONS.map((s) => s.id),
};

// "Monday – Sunday" for a week starting on Monday (1)
export const weekRunsText = (weekStarts) => `${DAYS[weekStarts]} – ${DAYS[(weekStarts + 6) % 7]}`;

// 7 → "07:00"
export const hourText = (hour) => `${String(hour).padStart(2, "0")}:00`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// A day as "Mon 2 Nov"
const shortDay = (date) => `${DAYS[date.getDay()].slice(0, 3)} ${date.getDate()} ${MONTHS[date.getMonth()]}`;

// The week a report sent at `sendAt` covers: the latest full week (starting
// on weekStarts) that has ended by then → { from, to } ("2026-10-26",
// "2026-11-01")
export function weekBefore(sendAt, weekStarts) {
    const end = new Date(sendAt.getFullYear(), sendAt.getMonth(), sendAt.getDate());
    end.setDate(end.getDate() - ((end.getDay() - weekStarts + 7) % 7));
    const from = new Date(end);
    from.setDate(from.getDate() - 7);
    const to = new Date(end);
    to.setDate(to.getDate() - 1);
    return { from: dayText(from), to: dayText(to), fromDate: from, toDate: to };
}

// The next email from `now` on: { sendAt, from, to, text }, text as
// "Monday 2 Nov at 07:00, covering Mon 26 Oct – Sun 1 Nov"
export function nextReport(settings, now = new Date()) {
    const sendAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), settings.sendHour);
    sendAt.setDate(sendAt.getDate() + ((settings.sendDay - sendAt.getDay() + 7) % 7));
    if (sendAt <= now) sendAt.setDate(sendAt.getDate() + 7);
    const week = weekBefore(sendAt, settings.weekStarts);
    const when = `${DAYS[sendAt.getDay()]} ${sendAt.getDate()} ${MONTHS[sendAt.getMonth()]} at ${hourText(settings.sendHour)}`;
    return {
        sendAt,
        from: week.from,
        to: week.to,
        text: `${when}, covering ${shortDay(week.fromDate)} – ${shortDay(week.toDate)}`,
    };
}

// The weeks to choose from in Past Reports, newest first: this week (not
// over yet) and the `count` before it → [{ from, to, label }], label as
// "Mon 26 Oct – Sun 1 Nov" ("(this week)" on the first)
export function pastWeeks(weekStarts, count = 26, now = new Date()) {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() - weekStarts + 7) % 7));
    return Array.from({ length: count + 1 }, (_, i) => {
        const from = new Date(start);
        from.setDate(from.getDate() - 7 * i);
        const to = new Date(from);
        to.setDate(to.getDate() + 6);
        return {
            from: dayText(from),
            to: dayText(to),
            label: `${shortDay(from)} – ${shortDay(to)}${i === 0 ? " (this week)" : ""}`,
        };
    });
}
