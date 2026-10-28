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

// An age from a birth date ("2026-10-20"), as precise as it's useful:
//   under a week     days ("Born today", "1 day old", "6 days old")
//   under 3 months   weeks ("1 week old"… "12 weeks old", or 13: until
//                    it's 3 months old by its birth date)
//   under a year     months ("3 months old"… "11 months old")
//   then             years, by its birthday ("1 year old", "4 years old")
// null without a date. (Its real birthday: not the 1 October one.)
export function ageFromBirthDate(birthDate, today = new Date()) {
    if (!birthDate) return null;
    const [by, bm, bd] = birthDate.split("-").map(Number);
    const born = new Date(by, bm - 1, bd);
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const days = Math.max(0, Math.round((day - born) / 86400000));
    // whole calendar months since it was born
    const months = Math.max(
        0,
        (day.getFullYear() - by) * 12 + (day.getMonth() - (bm - 1)) - (day.getDate() < bd ? 1 : 0)
    );
    const say = (n, word) => `${n} ${word}${n === 1 ? "" : "s"} old`;
    if (days === 0) return "Born today";
    if (days < 7) return say(days, "day");
    if (months < 3) return say(Math.floor(days / 7), "week");
    if (months < 12) return say(months, "month");
    return say(Math.floor(months / 12), "year");
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

// The age categories, by age on the 1 October birthday: the same in the
// Filters panel and on the Statistics page (stats.js)
//   test(age): for a known age (an unknown age is in none of them: the
//   filters show it under All Ages only, Statistics on its own)
export const AGE_GROUPS = [
    { id: "babies", label: "Babies", hint: "<1", test: (age) => age === 0 },
    { id: "juveniles", label: "Juveniles", hint: "1–3", test: (age) => age >= 1 && age <= 3 },
    { id: "youngAdults", label: "Young Adults", hint: "4–10", test: (age) => age >= 4 && age <= 10 },
    { id: "seniorAdults", label: "Senior Adults", hint: "11–19", test: (age) => age >= 11 && age <= 19 },
    { id: "goldenOldies", label: "Golden Oldies", hint: "20+", test: (age) => age >= 20 },
];
