// Monkey ages. A monkey's "year" is its birth season, July to June: 2016
// means born between July 2016 and June 2017. Everyone counts as a year
// older on 1 October (the Foundation's default birthday).

const BIRTHDAY_MONTH = 9; // October (months count from 0)

// The season of this year's babies: the most recent one whose 1 October
// birthday hasn't come yet. On 30 Sep 2026 that's 2025; from 1 Oct 2026, 2026.
export function currentBabySeason(today = new Date()) {
    const year = today.getFullYear();
    return today.getMonth() >= BIRTHDAY_MONTH ? year : year - 1;
}

// The birth season a date of birth falls in ("2026-11-12" → 2026,
// "2024-02-14" → 2023): from 1 July. (A birth date's Birth Year.)
export function seasonOf(date) {
    const [year, month] = date.split("-").map(Number);
    return month >= 7 ? year : year - 1;
}

// Age in whole years from the birth year (0 = a baby, under 1), or null if
// the year isn't known
export function ageInYears(year, today = new Date()) {
    if (!year) return null;
    return Math.max(0, currentBabySeason(today) - Number(year));
}

// Short, for cards and the pop-up: "9 yrs old", "1 yr old", "Baby" (under 1),
// "Age unknown"
export function ageLabel(year, today = new Date()) {
    const age = ageInYears(year, today);
    if (age === null) return "Age unknown";
    if (age === 0) return "Baby";
    return age === 1 ? "1 yr old" : `${age} yrs old`;
}

// "(10 years old)", "(1 year old)", "(Baby)" for under 1, or "" if unknown
export function ageText(year, today = new Date()) {
    const age = ageInYears(year, today);
    if (age === null) return "";
    if (age === 0) return "(Baby)";
    return age === 1 ? "(1 year old)" : `(${age} years old)`;
}

// The age categories, by age on the 1 October birthday: the Filters
// panel's (the Statistics page has its own, finer ones: stats.js)
//   test(age): for a known age (unknown ages: the filters count them as
//   adults)
export const AGE_GROUPS = [
    { id: "babies", label: "Babies", hint: "<1", test: (age) => age === 0 },
    { id: "juveniles", label: "Juveniles", hint: "1–3", test: (age) => age >= 1 && age <= 3 },
    { id: "adults", label: "Adults", hint: "4–14", test: (age) => age >= 4 && age <= 14 },
    { id: "elderly", label: "Elderly", hint: "15+", test: (age) => age >= 15 },
];
