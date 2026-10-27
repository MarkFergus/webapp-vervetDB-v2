import { slug } from "./photoUpload";

// A monkey's status (supabase/monkey-archive.sql): at the sanctuary, or no
// longer there and kept in the Monkey Archive (Admin Dashboard). Released
// comes from Release to Wild; Deceased, Escaped and Missing from Status
// Update (admins). Missing: not seen for a while, deceased or escaped but
// not known which (not a short absence).

export const STATUS_WORDS = {
    sanctuary: "Sanctuary",
    released: "Released",
    deceased: "Deceased",
    escaped: "Escaped",
    missing: "Missing",
};

// The ones Status Update offers in a monkey's pop-up
export const ARCHIVE_STATUSES = ["deceased", "escaped", "missing"];

// The Monkey Archive's filter pills, in order (after All)
export const ARCHIVED = ["deceased", "escaped", "missing", "released"];

export const isArchived = (monkey) => Boolean(monkey?.status) && monkey.status !== "sanctuary";

// The date box's label for each new status (Missing: the day it was last
// seen, once the sanctuary's own checks are done)
export const DATE_LABELS = {
    sanctuary: "Date Returned",
    released: "Date Released",
    deceased: "Date of Death",
    escaped: "Date Escaped",
    missing: "Last Seen",
};

export const MAX_STATUS_DETAILS = 1000;

// The details box's hint for each new status
export const DETAILS_HINTS = {
    sanctuary: "Where and how they were found",
    released: "Where and how they were released",
    deceased: "e.g. found in the troop, or passed away in care",
    escaped: "When and how they got out, and where they were last seen",
    missing: "When and where they were last seen, and the checks made",
};

// Confirm's warning: leaving the current records, or coming back to them
export const removeWarning = (name) =>
    `This will remove ${name} from current records. They can still be viewed and restored from the Monkey Archive.`;
export const restoreWarning = (name, home) =>
    `This will return ${name} to current records${home ? `, at their home location (${home})` : ""}.`;

// An archived monkey's Full Profile: #admin/archive/<name>-<id> (the id, as
// two archived monkeys could share a name and home)
export const ARCHIVE_ROUTE = "admin/archive";

export const archivePageHash = (monkey) => `#${ARCHIVE_ROUTE}/${slug(monkey.name)}-${monkey.id}`;

// The archived monkey's id from the route, or null (the list itself)
export function archiveIdFromRoute(route) {
    const match = /^admin\/archive\/(?:.*-)?(\d+)$/.exec(route);
    return match ? Number(match[1]) : null;
}
