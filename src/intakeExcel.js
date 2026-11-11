// Monkey Intake as an Excel file: a sheet per list (Arrivals, Released,
// Deceased, Escaped or Missing), each with the form's title, a coloured
// heading row and the monkeys, in the Monkey Intake Form's colours.
// The library is only loaded when a file is made.
import { INTAKE_SUBTITLE, intakeTitle } from "./intakeReport";

// The form's colours: the list's title band and the column headings
export const BAND = "#E9F29D";
export const HEADING = "#FFB86C";

// The sheets' names (Excel allows 31 characters)
const SHEET_NAMES = { arrivals: "Arrivals", released: "Released", deceased: "Deceased", gone: "Escaped or Missing" };

// One list → the sheet's rows (exported for the tests)
export function sheetRows(list, year, updated) {
    const span = list.columns.length;
    const across = (cell) => [{ ...cell, columnSpan: span }, ...Array(span - 1).fill(null)];
    return [
        across({ value: intakeTitle(year), fontWeight: "bold", fontSize: 16 }),
        across({ value: `${INTAKE_SUBTITLE} · Updated: ${updated}`, fontStyle: "italic" }),
        across({ value: list.title, fontWeight: "bold", fontSize: 13, backgroundColor: BAND }),
        list.columns.map((c) => ({ value: c.label, fontWeight: "bold", backgroundColor: HEADING })),
        ...(list.rows.length
            ? list.rows.map((row) =>
                  list.columns.map((c) => ({
                      value: row[c.key] ?? "",
                      alignVertical: "top",
                      ...(c.key === "name" ? { fontWeight: "bold" } : {}),
                      ...(c.key === "notes" ? { wrap: true } : {}),
                  }))
              )
            : [across({ value: list.none, fontStyle: "italic" })]),
    ];
}

// The whole report → an .xlsx Blob
export async function intakeExcel(lists, year, updated) {
    const { default: writeExcelFile } = await import("write-excel-file/browser");
    return writeExcelFile(
        lists.map((list) => ({
            sheet: SHEET_NAMES[list.id],
            orientation: "landscape",
            data: sheetRows(list, year, updated),
            // (a little wider than the page's shares: Excel's characters)
            columns: list.columns.map((c) => ({ width: Math.round(c.width * 1.3) })),
        })),
        // (one font throughout, bold cells included)
        { fontFamily: "Calibri", fontSize: 11 }
    ).toBlob();
}
