// Staff Activity's workings (StaffActivity.jsx, supabase/staff-activity.sql):
// what each kind of change is called, which group it's in, and each
// change put into words ("Description: Bite on tail → Deep bite on tail").

// What each part of a row is called, and how its value is shown:
//   date "2026-10-20" → "20 Oct 2026"; g / ml: "512 g"; yesno: Yes / No;
//   words: "foster_mum" → "Foster Mum"; (none) as it is
const field = (label, format = null) => ({ label, format });

// Each kind of change (staff_activity's source): its name, its group (the
// What filter) and, for the rows the website puts into words, their parts
export const SOURCES = {
    monkey: { label: "Monkey Profile", group: "monkeys" },
    enclosure: { label: "Enclosure", group: "enclosures" },
    introcage: { label: "Introcage", group: "enclosures" },
    maintenance: {
        label: "Maintenance",
        group: "enclosures",
        fields: { done_on: field("Date Done", "date"), kind: field("Type", "words"), details: field("Details") },
    },
    injuries: {
        label: "Injury",
        group: "medical",
        fields: {
            injury_date: field("Date", "date"),
            description: field("Description"),
            healed_on: field("Healed", "date"),
        },
    },
    injury_updates: {
        label: "Injury Update",
        group: "medical",
        fields: { update_date: field("Date", "date"), details: field("Details") },
    },
    monitoring: {
        label: "Monitoring",
        group: "medical",
        fields: { condition_check: field("Condition Check", "yesno"), notes: field("Notes") },
    },
    weights: {
        label: "Weight",
        group: "medical",
        fields: { weigh_date: field("Date", "date"), grams: field("Weight", "g"), notes: field("Notes") },
    },
    milk_totals: {
        label: "Milk Total",
        group: "medical",
        fields: { milk_date: field("Date", "date"), total_ml: field("Milk", "ml"), notes: field("Notes") },
    },
    monkey_records: {
        label: "Record",
        group: "records",
        fields: {
            record_date: field("Date", "date"),
            section: field("Section", "words"),
            category: field("Category", "words"),
            details: field("Details"),
        },
    },
    arrival_info: { label: "Arrival Info", group: "records", fields: { info: field("Arrival Info") } },
    integrations: {
        label: "Integration",
        group: "records",
        fields: {
            started_on: field("Started", "date"),
            kind: field("Type", "words"),
            status: field("Status", "words"),
            status_on: field("Status Date", "date"),
            ended_on: field("Ended", "date"),
        },
    },
    integration_reports: {
        label: "Integration Report",
        group: "records",
        fields: { from_date: field("From", "date"), to_date: field("To", "date"), report: field("Report") },
    },
    monitoring_sessions: {
        label: "Monitoring Session",
        group: "records",
        fields: {
            session_date: field("Date", "date"),
            status: field("Status", "words"),
            food_used: field("Food Used", "words"),
            fence: field("Fence", "words"),
            waters: field("Waters", "words"),
            food: field("Food", "words"),
            notes: field("Notes"),
        },
    },
    monkey_conditions: {
        label: "Condition",
        group: "medical",
        fields: { condition_date: field("Date", "date"), description: field("Condition") },
    },
    profiles: { label: "Staff Name", group: "admin", fields: { full_name: field("Name") } },
    editors: { label: "User Type", group: "admin", fields: { role: field("User Type", "words"), is_admin: field("Admin", "yesno") } },
    troops: { label: "Troop", group: "admin", fields: { name: field("Name"), sort_order: field("Order") } },
    sections: { label: "Section", group: "admin", fields: { name: field("Name"), sort_order: field("Order") } },
};

// The What filter
export const GROUPS = [
    { id: "all", label: "Everything" },
    { id: "monkeys", label: "Monkey Profiles" },
    { id: "medical", label: "Medical" },
    { id: "records", label: "Records" },
    { id: "enclosures", label: "Enclosures and Maintenance" },
    { id: "admin", label: "Staff and Admin" },
];

// How far back (or Custom: From and To dates)
export const PERIODS = [
    { days: 1, label: "24 Hours" },
    { days: 7, label: "7 Days" },
    { days: 14, label: "14 Days" },
    { days: 30, label: "30 Days" },
];

// A day ("2026-10-20") as "20 Oct 2026"
export const dayWords = (date) => valueText(date, "date");

// The period to ask for: { since, until } (Dates)
//   days: the last that many days, up to now; or "custom": from the start
//   of the From day to the end of the To day ("2026-10-20"), on this
//   device's clock
export function periodFor(days, from, to, now = new Date()) {
    if (days !== "custom") return { since: new Date(now.getTime() - days * 86400000), until: now };
    const start = (text, extra = 0) => {
        const [y, m, d] = text.split("-").map(Number);
        return new Date(y, m - 1, d + extra);
    };
    return { since: start(from), until: start(to, 1) };
}

export const sourceOf = (change) => SOURCES[change.source] ?? { label: wordsFor(change.source ?? "Change"), group: "admin" };

// "foster_mum" → "Foster Mum"
function wordsFor(text) {
    return String(text)
        .split("_")
        .filter(Boolean)
        .map((w) => w[0].toUpperCase() + w.slice(1))
        .join(" ");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONGEST = 120;

// One value, as shown: "(blank)" when empty, long text shortened
export function valueText(value, format) {
    if (value === null || value === undefined || value === "") return "(blank)";
    if (format === "date" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
        return `${d} ${MONTHS[m - 1]} ${y}`;
    }
    if (format === "g" || format === "ml") return `${Number(value).toLocaleString("en-GB")} ${format}`;
    if (format === "yesno") return value === true || value === "true" ? "Yes" : "No";
    if (format === "words") return wordsFor(value);
    const text = String(value).replace(/\s+/g, " ").trim();
    return text.length > LONGEST ? `${text.slice(0, LONGEST).trimEnd()}…` : text;
}

// The parts of a row worth listing, for a table without its own list:
// everything but ids, links and who-and-when
const IGNORED = /^(id|.*_id|.*_by|.*_by_name|.*_at)$/;
function partsOf(source, rows) {
    if (source.fields) return Object.entries(source.fields);
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r ?? {})))].filter((k) => !IGNORED.test(k));
    return keys.map((k) => [k, field(wordsFor(k))]);
}

// What a change did, in words: monkeys and enclosures come with their own
// lines; the rest from the row before and after. Added / deleted: what it
// had; changed: "Label: before → after" for each part that changed.
export function changeLines(change) {
    if (Array.isArray(change.lines)) return change.lines;
    const before = change.old_row ?? null;
    const after = change.new_row ?? null;
    if (!before && !after) return [];
    const parts = partsOf(sourceOf(change), [before, after]);
    const lines = [];
    for (const [key, { label, format }] of parts) {
        if (before && after) {
            const was = valueText(before[key], format);
            const now = valueText(after[key], format);
            if (was !== now) lines.push(`${label}: ${was} → ${now}`);
        } else {
            const value = (after ?? before)[key];
            if (value !== null && value !== undefined && value !== "") lines.push(`${label}: ${valueText(value, format)}`);
        }
    }
    return lines;
}

// Only the changes in a group ("all": every one)
export const inGroup = (changes, group) => (group === "all" ? changes : changes.filter((c) => sourceOf(c).group === group));
