import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { FORM_FONT, REPORT_FONT } from "./pdfFonts";
import { sheetTitle } from "./dewormingRules";

// A deworming sheet to print and fill in by hand, like the paper ones: the
// title (in Caladea, as the paper ones; the rest in Open Sans), the
// line under it (the sheet's instructions), Staff Member(s) and Date
// Started to write in, then a row per monkey: Day 1–3 boxes and its dose
// and dewormer. A 1-day dewormer (Milbeworm): N/A in Day 2 and Day 3.
// Blank rows after the troop's monkeys, for anyone added on the day (not
// on a 6-Month or a section's introcages: everyone's on those already), then
// those in introcages under their own heading (the monkeys staff added, if
// printed again: marked, at the end of their part).
//   sheet: a deworming sheet; lines: its monkeys with their names (and
//   introcageShort, beside an introcage monkey's name), in printOrder;
//   different: "On different schedule: Barry, Pantshula." (under the table)
//   or null
// Always one page: the rows get shorter (and their words smaller) to fit.

const LINE = "0.75pt solid #000";
const BLANK_ROWS = 4;

// A4's height, less the margins, the title, its line, Staff Member(s) and
// the note under the table: what's left for the table's rows
const PAGE_HEIGHT = 842;
const MARGINS = { top: 36, bottom: 30 };
const TOP_PART = 64;
const NOTE = 26;
const ROW = { most: 15, least: 8 };
const LINE_HEIGHT = 1.25;
export function rowSize(rows, { instructions = true, different = false } = {}) {
    const room = PAGE_HEIGHT - MARGINS.top - MARGINS.bottom - TOP_PART + (instructions ? 0 : 14) - (different ? NOTE : 0);
    const height = Math.max(ROW.least, Math.min(ROW.most, Math.floor((room / rows) * 10) / 10));
    // (the words: as big as fit the row, at most the usual 9.5)
    // (its line: LINE_HEIGHT × the size, plus the cell's padding and line)
    return { height, fontSize: Math.min(9.5, Math.floor(((height - 2) / LINE_HEIGHT) * 10) / 10) };
}
// Blank rows: not when everyone's on the sheet from the start
export const blankRows = (sheet) => (sheet.session === "6_month" || String(sheet.groupKey ?? "").startsWith("ics:") ? 0 : BLANK_ROWS);

const styles = StyleSheet.create({
    page: {
        paddingTop: MARGINS.top,
        paddingBottom: MARGINS.bottom,
        paddingHorizontal: 52,
        fontFamily: FORM_FONT,
        fontSize: 9.5,
        color: "#000",
    },
    title: {
        fontFamily: REPORT_FONT,
        fontSize: 16,
        fontWeight: "bold",
        textAlign: "center",
        textDecoration: "underline",
    },
    instructions: {
        marginTop: 4,
        fontSize: 9.5,
        textAlign: "center",
    },
    fillIn: {
        flexDirection: "row",
        marginTop: 10,
        marginBottom: 4,
        fontWeight: "bold",
    },
    fillInPart: {
        flex: 1,
    },
    table: {
        borderTop: LINE,
        borderLeft: LINE,
    },
    row: {
        flexDirection: "row",
    },
    head: {
        backgroundColor: "#cccccc",
        fontWeight: "bold",
    },
    cell: {
        lineHeight: LINE_HEIGHT,
        paddingHorizontal: 2,
        paddingVertical: 0.5,
        borderRight: LINE,
        borderBottom: LINE,
    },
    name: {
        width: "20%",
    },
    day: {
        width: "18.33%",
        textAlign: "center",
    },
    details: {
        width: "25%",
    },
    different: {
        marginTop: 8,
    },
    band: {
        width: "100%",
        textAlign: "center",
        backgroundColor: "#cccccc",
        fontWeight: "bold",
    },
});

// size: rowSize's { height, fontSize }
function Row({ cells, head = false, size }) {
    const [name, day1, day2, day3, details] = cells;
    // (at least that tall: a long Details can still take two lines)
    const fit = { minHeight: size.height, fontSize: size.fontSize };
    return (
        <View style={[styles.row, head && styles.head]} wrap={false}>
            <Text style={[styles.cell, styles.name, fit]}>{name}</Text>
            <Text style={[styles.cell, styles.day, fit]}>{day1}</Text>
            <Text style={[styles.cell, styles.day, fit]}>{day2}</Text>
            <Text style={[styles.cell, styles.day, fit]}>{day3}</Text>
            <Text style={[styles.cell, styles.details, fit]}>{details}</Text>
        </View>
    );
}

function MonkeyRow({ line: l, size }) {
    return (
        <Row
            size={size}
            cells={[
                // (living in an introcage: which, short: "Bruno (Gol A)")
                l.introcage && l.introcageShort ? `${l.name} (${l.introcageShort})` : l.name,
                "",
                l.days === 1 ? "N/A" : "",
                l.days === 1 ? "N/A" : "",
                `${l.dose} ${l.medication}${
                    l.kind === "accidental"
                        ? ` (accidental, Day ${l.fromDay})`
                        : l.kind === "added"
                          ? ` (added Day ${l.fromDay})`
                          : ""
                }`,
            ]}
        />
    );
}

export default function DewormingSheetPDF({ sheet, lines, different = null }) {
    const title = sheetTitle(sheet);
    const troop = lines.filter((l) => !l.introcage);
    const introcages = lines.filter((l) => l.introcage);
    // (a group that's all introcages: no heading, it would head the whole list)
    const parts = troop.length ? [troop, introcages] : [introcages, []];
    const blanks = blankRows(sheet);
    const size = rowSize(1 + lines.length + blanks + (parts[1].length ? 1 : 0), {
        instructions: Boolean(sheet.instructions),
        different: Boolean(different),
    });
    return (
        <Document title={title}>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>{title}</Text>
                {sheet.instructions && <Text style={styles.instructions}>{sheet.instructions}</Text>}
                <View style={styles.fillIn}>
                    <Text style={styles.fillInPart}>Staff Member(s):</Text>
                    <Text style={styles.fillInPart}>Date Started:</Text>
                </View>
                <View style={styles.table}>
                    <Row head size={size} cells={["Name", "Day 1", "Day 2", "Day 3", "Details"]} />
                    {parts[0].map((l) => (
                        <MonkeyRow key={l.monkeyId} line={l} size={size} />
                    ))}
                    {Array.from({ length: blanks }, (_, i) => (
                        <Row key={`blank-${i}`} size={size} cells={["", "", "", "", ""]} />
                    ))}
                    {parts[1].length > 0 && (
                        <View style={styles.row} wrap={false}>
                            <Text style={[styles.cell, styles.band, { minHeight: size.height, fontSize: size.fontSize }]}>Introcages</Text>
                        </View>
                    )}
                    {parts[1].map((l) => (
                        <MonkeyRow key={l.monkeyId} line={l} size={size} />
                    ))}
                </View>
                {different && <Text style={styles.different}>{different}</Text>}
            </Page>
        </Document>
    );
}
