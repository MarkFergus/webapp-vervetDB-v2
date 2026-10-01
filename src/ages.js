// Monkey ages. A monkey's "year" is its birth season, July to June: 2016
// means born between July 2016 and June 2017. Everyone counts as a year
// older on 1 November (the Foundation's default birthday).

const BIRTHDAY_MONTH = 10; // November (months count from 0)

// The season of this year's babies: the most recent one whose 1 November
// birthday hasn't come yet. On 1 Oct 2026 that's 2025; from 1 Nov 2026, 2026.
export function currentBabySeason(today = new Date()) {
    const year = today.getFullYear();
    return today.getMonth() >= BIRTHDAY_MONTH ? year : year - 1;
}

// Age in whole years from the birth year (0 = a baby, under 1), or null if
// the year isn't known
export function ageInYears(year, today = new Date()) {
    if (!year) return null;
    return Math.max(0, currentBabySeason(today) - Number(year));
}

// "(10 years old)", "(1 year old)", "(under 1 year old)", or "" if unknown
export function ageText(year, today = new Date()) {
    const age = ageInYears(year, today);
    if (age === null) return "";
    if (age === 0) return "(under 1 year old)";
    return age === 1 ? "(1 year old)" : `(${age} years old)`;
}
