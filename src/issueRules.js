// Maintenance Issues: something that needs doing (a Maintenance report is work
// that's been done). The workings, for Records → Maintenance, the Interactive
// Map, enclosure pages and the Morning Brief.
//   issue: { id, enclosureId, mapX, mapY, details, urgent, photoPaths, status
//   ("open", "fixed", "closed"), closeReason, reportId, closedAt, closedByName,
//   reportedBy (their name), reportedById, reportedAt }
import { isSoleArea } from "./enclosures";
import { fullName } from "./places";

export const isOpen = (issue) => issue.status === "open";

// Photos on an issue, at most
export const MAX_ISSUE_PHOTOS = 4;

// Photos picked, as many as there's room for: → { files, tooMany }
export function photosWithRoom(files, already) {
    const room = Math.max(MAX_ISSUE_PHOTOS - already, 0);
    return { files: [...files].slice(0, room), tooMany: files.length > room };
}

// Open ones: urgent first; within each, in the order admins have put them
// (jobOrder), then those not moved yet, the longest waiting first
const orderOf = (i) => (i.jobOrder == null ? Infinity : i.jobOrder);
export const openIssues = (issues) =>
    issues
        .filter(isOpen)
        .sort(
            (a, b) =>
                Number(b.urgent) - Number(a.urgent) ||
                orderOf(a) - orderOf(b) ||
                a.reportedAt.localeCompare(b.reportedAt)
        );

// Moving an open job up (-1) or down (1) the Job List, within its own part
// (urgent, or the rest) → its part in the new order, numbered from 0:
// [{ id, jobOrder }] (only the ones that change), or [] (it can't move)
export function moveJob(issues, id, step) {
    const list = openIssues(issues);
    const job = list.find((i) => i.id === id);
    if (!job) return [];
    const part = list.filter((i) => i.urgent === job.urgent);
    const at = part.indexOf(job);
    const to = at + step;
    if (to < 0 || to >= part.length) return [];
    const moved = [...part];
    [moved[at], moved[to]] = [moved[to], moved[at]];
    return moved.map((i, n) => ({ id: i.id, jobOrder: n })).filter((c) => c.jobOrder !== part.find((i) => i.id === c.id).jobOrder);
}

// Fixed or closed ones: the latest first
export const pastIssues = (issues) =>
    issues.filter((i) => !isOpen(i)).sort((a, b) => (b.closedAt ?? b.reportedAt).localeCompare(a.closedAt ?? a.reportedAt));

// An enclosure's: its own and its introcages'
export const issuesAt = (issues, place, enclosures) =>
    issues.filter((i) => i.enclosureId === place.id || enclosures.find((e) => e.id === i.enclosureId)?.parentId === place.id);

// The place an issue goes under (a one-area care unit: the unit)
export const issuePlace = (place, enclosures) =>
    place && isSoleArea(place, enclosures) ? (enclosures.find((e) => e.id === place.parentId) ?? place) : place;

// How long ago, in whole days of the phone's calendar
export function daysAgo(when, now = new Date()) {
    const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const days = Math.round((day(now) - day(new Date(when))) / 86400000);
    if (days <= 0) return "Today";
    return days === 1 ? "Yesterday" : `${days} days ago`;
}

// The pin nearest a tap, close enough to be the one meant (a finger's width
// round its head): pins have their tip on the spot, the head above it, and
// are the same size on screen at any zoom.
//   (px, py): the tap in pixels, within a view of this size showing this part
//   of the map
export const PIN_HEAD = 21;
export const PIN_REACH = 22;
export function pinAt(issues, px, py, view, size) {
    let best = null;
    let bestDistance = PIN_REACH;
    for (const issue of issues) {
        if (issue.mapX == null) continue;
        const x = ((issue.mapX - view.x) / view.width) * size.width;
        const y = ((issue.mapY - view.y) / view.height) * size.height - PIN_HEAD;
        const distance = Math.hypot(px - x, py - y);
        if (distance <= bestDistance) {
            best = issue;
            bestDistance = distance;
        }
    }
    return best;
}

// A new or changed issue, checked: → { values } or { error }
export function checkIssue({ place, details, urgent }) {
    if (!place) return { error: "Please choose the enclosure or introcage." };
    if (!details.trim()) return { error: "Please say what's wrong." };
    return { values: { enclosureId: place.id, details: details.trim(), urgent: Boolean(urgent) } };
}

// A Job Done's report: what the issue was, then what was done, so the report
// makes sense by itself in History, an enclosure's log and the Weekly Reports
export const issueReport = (issue, done) => `Job: ${issue.details}\nDone: ${done.trim()}`;

// The open Job List, to paste into WhatsApp (the title in bold: *…*):
//   *Maintenance List 08.11*
//
//   1. ⚠️ Dreamland: Fence wire loose (3 days ago)
//   2. Robert: Tap dripping by the gate (Today)
export function jobListText(issues, enclosures, now = new Date()) {
    const two = (n) => String(n).padStart(2, "0");
    const lines = [`*Maintenance List ${two(now.getDate())}.${two(now.getMonth() + 1)}*`, ""];
    const jobs = openIssues(issues);
    if (!jobs.length) lines.push("No open jobs");
    jobs.forEach((issue, i) => {
        const place = enclosures.find((e) => e.id === issue.enclosureId);
        const details = issue.details.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
        lines.push(
            `${i + 1}. ${issue.urgent ? "⚠️ " : ""}${place ? fullName(place.name) : "Unknown place"}: ${details} (${daysAgo(issue.reportedAt, now)})`,
        );
    });
    return lines.join("\n");
}
