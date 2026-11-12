// Meds & Sickbay's workings (MedsRecordsPage.jsx, supabase/vet-visits.sql):
// the vets and reasons, their words, and the Vasectomies page's birth years.
import { BANDITS } from "./stats";

// The vet practices, in the form's order (Other: typed in)
export const VET_PRACTICES = {
    serala: "Serala Animal Clinic",
    tzaneen: "Tzaneen Animal Clinic",
    scheepers: "Dr GJ Scheepers Animal & Bird Clinic",
    other: "Other",
};

// Where a vasectomy was done: On Site, or one of the vets (a vet also adds
// the Vet Visit: the database does that)
export const VASECTOMY_VETS = { on_site: "On Site", ...VET_PRACTICES };

export const VET_REASONS = {
    assessment: "Assessment",
    check_up: "Check-Up",
    vasectomy: "Vasectomy",
    emergency: "Emergency",
    surgery: "Surgery",
    euthanasia: "Euthanasia",
    necropsy: "Necropsy",
    other: "Other",
};

export const MAX_VET_DETAILS = 500;
export const MAX_OTHER_VET = 100;

// "Serala Animal Clinic", "On Site", or the one typed in for Other
export const vetName = (code, other = "") =>
    code === "other" ? other.trim() || "Another vet" : (VASECTOMY_VETS[code] ?? code);

// What's wrong with a vet visit or vasectomy form, field by field ({} when
// it's fine). values: { monkeyId, date, place (practice or vet), other,
// reason (vet visits), details }; today "2026-11-12"
export function vetFormProblems(values, today, { needsReason = true } = {}) {
    const found = {};
    if (!values.monkeyId) found.monkey = "Please choose the monkey.";
    if (!values.date) found.date = "Please choose the date.";
    else if (values.date > today) found.date = "Not in the future, please.";
    if (!values.place) found.place = "Please choose the vet.";
    else if (values.place === "other" && !values.other.trim()) found.other = "Please type the vet's name.";
    if (needsReason && !values.reason) found.reason = "Please choose the reason.";
    if (values.details.length > MAX_VET_DETAILS) found.details = `Up to ${MAX_VET_DETAILS} characters, please.`;
    return found;
}

// A birth year's label: the baby season it starts ("2026" → "2026/27")
export const seasonLabel = (year) => `${year}/${String((Number(year) + 1) % 100).padStart(2, "0")}`;

// Where a boy lives, for the lists, short (on one row beside his name: H&B,
// D&D): his troop, or his introcage's enclosure, or the care unit
const homeOf = (monkey) => monkey.troop ?? monkey.enclosure ?? monkey.introcage ?? "No troop";

// The troops in section order (the user's, 2026-11-12), for the lists;
// anywhere else (Dreamland, a care unit…) after them, then the Bandits last
export const TROOP_ORDER = [
    "D&D", "Goliath", "Gismo", "Royal", "Engeltjie", "Lankora", "Koko", "Camelot",
    "Skrow", "Robert", "Skunkey", "H&B", "Jalamango", "Global", "James",
];
function homeRank(home) {
    if (home === BANDITS) return TROOP_ORDER.length + 1;
    const i = TROOP_ORDER.indexOf(home);
    return i === -1 ? TROOP_ORDER.length : i;
}

// The Vasectomies page's By Birth Year: every boy at the sanctuary, by the
// season he was born in (newest first; unknown last), each year's boys by
// where they live (troops in section order, anywhere else, then the
// Bandits), then by name. done: Vasectomised? Yes, or a vasectomy on
// record.
//   → [{ year (2026, or null), label ("2026/27", "Unknown"), boys: [{
//       monkey, home, done }], total, doneCount }]
export function vasectomyYears(monkeys, vasectomies = []) {
    const vasectomised = new Set(vasectomies.map((v) => v.monkeyId));
    const groups = new Map();
    for (const monkey of monkeys) {
        if (monkey.sex !== "male") continue;
        const year = monkey.year === "" || monkey.year == null ? null : Number(monkey.year);
        if (!groups.has(year)) groups.set(year, []);
        groups.get(year).push({ monkey, home: homeOf(monkey), done: Boolean(monkey.vasectomised) || vasectomised.has(monkey.id) });
    }
    return [...groups.entries()]
        .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : b - a))
        .map(([year, boys]) => {
            boys.sort((a, b) => homeRank(a.home) - homeRank(b.home) || a.home.localeCompare(b.home) || a.monkey.name.localeCompare(b.monkey.name));
            return {
                year,
                label: year === null ? "Unknown" : seasonLabel(year),
                boys,
                total: boys.length,
                doneCount: boys.filter((b) => b.done).length,
            };
        });
}

// A birth year's boys for WhatsApp, every one by where he lives, ✅ after
// the vasectomised ones:
//   *Troop Vasectomies 2026/27*
//   _Troop: 20 - Bandits: 2 · Done: 9_   (Troop: everyone not a Bandit)
//   Goliath: Bruce ✅, Hermit, Coco
export function vasectomyWhatsApp(group) {
    const bandits = group.boys.filter((b) => b.home === BANDITS).length;
    const byHome = new Map();
    for (const boy of group.boys) {
        if (!byHome.has(boy.home)) byHome.set(boy.home, []);
        byHome.get(boy.home).push(`${boy.monkey.name}${boy.done ? " ✅" : ""}`);
    }
    return [
        `*Troop Vasectomies ${group.label}*`,
        `_Troop: ${group.total - bandits} - Bandits: ${bandits} · Done: ${group.doneCount}_`,
        ...[...byHome.entries()].map(([home, names]) => `${home}: ${names.join(", ")}`),
    ].join("\n");
}
