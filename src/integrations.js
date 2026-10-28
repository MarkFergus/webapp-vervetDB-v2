// Records → Integration (IntegrationRecordsPage.jsx): the monkeys being
// integrated (Current Integrations: supabase/integrations.sql) and their
// Integration Reports (integration-reports.sql). The workings: the types,
// who can be integrated, and checking a batch of reports.
import { fullName, staying } from "./places";

// The types of integration, in the form's order
export const INTEGRATION_KINDS = {
    adult: "Adult",
    foster_mum: "Foster-Mum",
    group: "Group",
};

// Its status, in Status Update's order. Active and On Hold stay in Current
// Integrations; Completed and Cancelled end it (ended_on: that day) and it
// leaves the list (a Past Integrations list could show them later).
export const INTEGRATION_STATUSES = {
    active: "Active",
    on_hold: "On Hold",
    completed: "Completed",
    cancelled: "Cancelled",
};
export const isCurrent = (status) => status === "active" || status === "on_hold";

// Status Update's date box, by the new status
export const STATUS_DATE_LABELS = {
    active: "Date Resumed",
    on_hold: "Date On Hold",
    completed: "Date Completed",
    cancelled: "Date Cancelled",
};

// A report's longest (the database's too); most are 200–400
export const MAX_REPORT = 500;

// Where it is now, for integrating: the introcage it's staying in, else its
// own introcage (an area of a care unit isn't an introcage), else null
export function integrationPlace(monkey) {
    const stay = staying(monkey);
    if (stay) return stay;
    return monkey.introcage && monkey.introcageType !== "area" ? monkey.introcage : null;
}

// The monkeys a new integration can be started for: in an introcage, and
// without one going on already. By name.
export function integrationChoices(monkeys, integrations) {
    const busy = new Set(integrations.map((i) => i.monkeyId));
    return monkeys
        .filter((m) => m.id != null && !busy.has(m.id) && integrationPlace(m))
        .sort((a, b) => a.name.localeCompare(b.name));
}

// Search a name ("pop" → Poppy); its introcage too ("goliath a")
export function matchesSearch(monkey, text) {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${monkey.name} ${fullName(integrationPlace(monkey) ?? "")}`.toLowerCase();
    return words.every((w) => hay.includes(w));
}

const dayText = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

// A new report's From: the day after its last report ended, else the day its
// integration started (and never after today)
export function reportFrom(latestTo, startedOn, today = new Date()) {
    let from = startedOn;
    if (latestTo) {
        const [y, m, d] = latestTo.split("-").map(Number);
        from = dayText(new Date(y, m - 1, d + 1));
    }
    const now = dayText(today);
    return from > now ? now : from;
}

// The reports typed in ({ monkeyId: { from, to, report } }), checked: the
// ones with a report (the rest are skipped), each needing a From and a To,
// To not before From nor after today, up to MAX_REPORT characters.
//   → { entries: [{ monkeyId, from, to, report }], errors: { monkeyId: message } }
export function checkReports(typed, today = new Date()) {
    const now = dayText(today);
    const entries = [];
    const errors = {};
    for (const [id, row] of Object.entries(typed)) {
        const report = (row.report ?? "").trim();
        if (!report) continue;
        const monkeyId = Number(id);
        const { from, to } = row;
        if (!from || !to) errors[monkeyId] = "Please give the From and To dates.";
        else if (to < from) errors[monkeyId] = "To can't be before From.";
        else if (to > now) errors[monkeyId] = "To can't be in the future.";
        else if (report.length > MAX_REPORT) errors[monkeyId] = `A report can be up to ${MAX_REPORT} characters.`;
        else entries.push({ monkeyId, from, to, report });
    }
    return { entries, errors };
}
