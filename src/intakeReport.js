// Monkey Intake (Admin Dashboard → Monkey Intake): one calendar year's
// arrivals, releases, deaths, and escaped or missing monkeys, each in its
// own list, in the layout of the sanctuary's own Monkey Intake Form. The
// same lists make the page, the PDF (IntakePDF.jsx) and the Excel file
// (intakeExcel.js).
//   Arrivals            arrival date in the year
//   Released Monkeys    released in the year (their status date)
//   Deceased Monkeys    died in the year
//   Escaped or Missing  escaped, or last seen, in the year
// Only each monkey's current status counts: one released and since brought
// back isn't in Released.
import { ordinal } from "./enclosures";
import { ageFromBirthDate, ageInYears } from "./ages";
import { fullName } from "./places";
import { SPECIES } from "./species";
import { STATUS_WORDS } from "./monkeyStatus";
import { ARRIVAL_CONDITIONS, ARRIVAL_REASONS } from "./arrival";

// Each list's columns: key, label, and width (a share of the page; in Excel
// about that many characters)
const NO = { key: "no", label: "No.", width: 5 };
const NAME = { key: "name", label: "Name", width: 16 };
const SEX = { key: "sex", label: "Sex", width: 5 };
const SPECIES_COLUMN = { key: "species", label: "Species", width: 10 };
const TROOP = { key: "troop", label: "Troop", width: 14 };

export const INTAKE_LISTS = [
    {
        id: "arrivals",
        title: "Sanctuary Arrivals",
        none: "No arrivals",
        columns: [
            NO,
            { key: "date", label: "Date", width: 17 },
            NAME,
            SEX,
            SPECIES_COLUMN,
            { key: "age", label: "Approx Age on Arrival", width: 12 },
            { key: "reason", label: "Reason", width: 12 },
            { key: "condition", label: "Condition", width: 10 },
            { key: "notes", label: "Notes", width: 38 },
            { key: "status", label: "Status", width: 10 },
        ],
    },
    {
        id: "released",
        title: "Released Monkeys",
        none: "No releases",
        columns: [
            NO,
            { key: "date", label: "Date of Release", width: 17 },
            NAME,
            SEX,
            SPECIES_COLUMN,
            { key: "age", label: "Approx Age", width: 12 },
            { key: "notes", label: "Release Information", width: 50 },
        ],
    },
    {
        id: "deceased",
        title: "Deceased Monkeys",
        none: "No deaths",
        columns: [
            NO,
            { key: "date", label: "Date of Death", width: 17 },
            NAME,
            SEX,
            SPECIES_COLUMN,
            TROOP,
            { key: "notes", label: "Details", width: 50 },
        ],
    },
    {
        id: "gone",
        title: "Escaped or Missing Monkeys",
        none: "No escaped or missing monkeys",
        columns: [
            NO,
            { key: "date", label: "Date", width: 17 },
            NAME,
            SEX,
            SPECIES_COLUMN,
            TROOP,
            { key: "reason", label: "Status", width: 10 },
            { key: "notes", label: "Notes", width: 40 },
        ],
    },
];

// The years to choose from: this one back to 2018
export const FIRST_INTAKE_YEAR = 2018;
export function intakeYears(today = new Date()) {
    const years = [];
    for (let y = today.getFullYear(); y >= FIRST_INTAKE_YEAR; y -= 1) years.push(y);
    return years;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// "18th February 2024", as the form writes dates (months in full)
export const longDate = (date) => `${ordinal(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

const asDate = (text) => {
    const [y, m, d] = text.split("-").map(Number);
    return new Date(y, m - 1, d);
};
const inYear = (text, year) => Boolean(text) && text.startsWith(`${year}-`);

const sexText = (sex) => (sex === "female" ? "F" : sex === "male" ? "M" : "");
const speciesText = (species) => (species ? (SPECIES[species] ?? species).replace(/ Monkey$/, "") : "");

// Their age on a day, short (the column says it's approximate): from the
// birth date ("6 days", "6 weeks", "3 months", "2 years"), or else the
// birth year ("Under 1 year", "3 years"); "" when neither is known
export function ageOn(monkey, dateText) {
    if (!dateText) return "";
    const day = asDate(dateText);
    if (monkey.birthDate) {
        const age = ageFromBirthDate(monkey.birthDate, day);
        return age === "Born today" ? "Newborn" : age.replace(/ old$/, "");
    }
    const years = ageInYears(monkey.year, day);
    if (years === null) return "";
    if (years === 0) return "Under 1 year";
    return `${years} year${years === 1 ? "" : "s"}`;
}

// Oldest first, then by name
const byDate = (dateOf) => (a, b) => dateOf(a).localeCompare(dateOf(b)) || a.name.localeCompare(b.name);

const numbered = (rows) => rows.map((row, i) => ({ no: String(i + 1), ...row }));

// The four lists for a year: [{ ...INTAKE_LISTS entry, rows: [{ no, date,
// name, … }] }], every value as text.
//   monkeys: every monkey that arrived or changed status that year (with
//   statusOn / statusDetails); notes: { monkeyId: arrival info }
export function intakeReport(monkeys, year, notes = {}) {
    const statusIn = (status) =>
        monkeys.filter((m) => m.status === status && inYear(m.statusOn, year)).sort(byDate((m) => m.statusOn));
    const common = (m, dateText) => ({
        date: longDate(asDate(dateText)),
        name: m.name,
        sex: sexText(m.sex),
        species: speciesText(m.species),
    });
    const rows = {
        arrivals: monkeys
            .filter((m) => inYear(m.arrivalDate, year))
            .sort(byDate((m) => m.arrivalDate))
            .map((m) => ({
                ...common(m, m.arrivalDate),
                age: ageOn(m, m.arrivalDate),
                reason: ARRIVAL_REASONS[m.arrivalReason] ?? "",
                condition: ARRIVAL_CONDITIONS[m.arrivalCondition] ?? "",
                notes: notes[m.id]?.trim() ?? "",
                status: STATUS_WORDS[m.status] ?? "",
            })),
        released: statusIn("released").map((m) => ({
            ...common(m, m.statusOn),
            age: ageOn(m, m.statusOn),
            notes: m.statusDetails?.trim() ?? "",
        })),
        deceased: statusIn("deceased").map((m) => ({
            ...common(m, m.statusOn),
            troop: m.troop ? fullName(m.troop) : "",
            notes: m.statusDetails?.trim() ?? "",
        })),
        gone: monkeys
            .filter((m) => (m.status === "escaped" || m.status === "missing") && inYear(m.statusOn, year))
            .sort(byDate((m) => m.statusOn))
            .map((m) => ({
                ...common(m, m.statusOn),
                troop: m.troop ? fullName(m.troop) : "",
                reason: STATUS_WORDS[m.status],
                notes: m.statusDetails?.trim() ?? "",
            })),
    };
    return INTAKE_LISTS.map((list) => ({ ...list, rows: numbered(rows[list.id]) }));
}

// "VMF Monkey Intake Form 2024", and the file names
export const intakeTitle = (year) => `VMF Monkey Intake Form ${year}`;
export const INTAKE_SUBTITLE = "Arrivals, Releases & Deaths";
export const intakeFileName = (year, extension) => `VMF_Monkey_Intake_${year}.${extension}`;
