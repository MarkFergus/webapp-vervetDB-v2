// Records → Maintenance (MaintenanceRecordsPage.jsx): the workings. Its
// reports are the enclosures' maintenance logs (supabase/enclosures.sql,
// maintenance-kind.sql), so one added here shows on the enclosure's page
// too, and the other way round.
import { fullName } from "./places";
import { TYPE_NAMES, isSoleArea } from "./enclosures";

// The list shows this many reports at first (See More for the rest)
export const PAGE_SIZE = 30;

// Where maintenance can be logged: every enclosure, introcage and area (a
// one-area care unit: the unit only, as its page does). By name.
export function maintenancePlaces(enclosures) {
    return enclosures
        .filter((e) => e.id != null && !isSoleArea(e, enclosures))
        .sort((a, b) => fullName(a.name).localeCompare(fullName(b.name)));
}

// Under its name: "Introcage · Goliath", "Troop Enclosure"
export function placeSub(place, enclosures) {
    const parent = place.parentId != null ? enclosures.find((e) => e.id === place.parentId) : null;
    const type = TYPE_NAMES[place.type] ?? "";
    return parent ? `${type} · ${fullName(parent.name)}` : type;
}

// Search by name ("gol a" → Goliath A; "holt" → Holt & Barrington…), its
// enclosure's too ("goliath" → Goliath and its introcages)
export function matchesPlace(place, text, enclosures) {
    const words = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const parent = place.parentId != null ? enclosures.find((e) => e.id === place.parentId) : null;
    const hay = `${place.name} ${fullName(place.name)} ${parent ? `${parent.name} ${fullName(parent.name)}` : ""}`.toLowerCase();
    return words.every((w) => hay.includes(w));
}

// The reports shown: by Maintenance Type ("all", "routine", "repair"), the
// place picked from the list (placeId: that place, and an enclosure's
// introcages too) or else what's typed so far (search), newest first as
// loaded
export function filterReports(reports, { type = "all", placeId = null, search = "" }, enclosures) {
    return reports.filter((r) => {
        if (type !== "all" && r.kind !== type) return false;
        if (placeId != null) {
            if (r.enclosureId === placeId) return true;
            return enclosures.find((e) => e.id === r.enclosureId)?.parentId === placeId;
        }
        if (!search.trim()) return true;
        const place = enclosures.find((e) => e.id === r.enclosureId);
        return Boolean(place) && matchesPlace(place, search, enclosures);
    });
}

// A new report, checked: → { values } or { error }
export function checkReport({ place, doneOn, kind, details }, today) {
    if (!place) return { error: "Please choose the enclosure or introcage." };
    if (!doneOn) return { error: "Please give the date." };
    if (doneOn > today) return { error: "The date can't be in the future." };
    if (!kind) return { error: "Please choose Routine or Repair." };
    if (!details.trim()) return { error: "Please say what was done." };
    return { values: { doneOn, kind, details: details.trim() } };
}
