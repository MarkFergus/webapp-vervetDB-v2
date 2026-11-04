// A current injury with no update (or, with none yet, added) for this
// many days: "Update Needed" beside Add Update
export const UPDATE_DUE_DAYS = 14;

// Days from one day ("2026-10-16") to another
const daysBetween = (from, to) => {
    const at = (date) => {
        const [y, m, d] = date.split("-").map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((at(to) - at(from)) / 86400000);
};

// Whether a current injury is due an update (today: "2026-10-30")
export function updateNeeded(entry, today) {
    if (entry.healedOn || !today) return false;
    const last = (entry.updates ?? []).reduce((latest, u) => (u.date > latest ? u.date : latest), entry.date);
    return daysBetween(last, today) >= UPDATE_DUE_DAYS;
}
