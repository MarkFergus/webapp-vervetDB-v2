// A monkey's microchips: a Microchip record's words, as the database reads
// them to add the number to the monkey (microchip-records.sql).

export const MAX_CHIP_NOTE = 900;

// "Microchipped 12345", then ": the note" if there is one
export const microchipText = ({ number, note = "" }) =>
    `Microchipped ${number.trim()}${note.trim() ? `: ${note.trim()}` : ""}`;

// ...and back again ({ number, note }), or null
export function parseMicrochip(details) {
    const match = /^Microchipped (\d+)(?:: ([\s\S]*))?$/.exec(details ?? "");
    return match ? { number: match[1], note: match[2] ?? "" } : null;
}

// What's wrong with a typed chip number (one number, digits only), or null
export function chipNumberProblem(number) {
    const text = number.trim();
    if (!text) return "Please enter the chip number.";
    return /^\d+$/.test(text) ? null : "Chip numbers can only contain digits.";
}
