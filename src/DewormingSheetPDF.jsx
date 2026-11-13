import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { FORM_FONT, REPORT_FONT } from "./pdfFonts";
import { sheetTitle } from "./dewormingRules";

// A deworming sheet to print and fill in by hand, like the paper ones: the
// title (in Caladea, as the paper ones; the rest in Open Sans), the
// line under it (the sheet's instructions), Staff Member(s) and Date
// Started to write in, then a row per monkey: Day 1–3 boxes and its dose
// and dewormer. A 1-day dewormer (Milbeworm): N/A in Day 2 and Day 3.
// Blank rows after the troop's monkeys, for anyone added on the day, then
// those in introcages under their own heading (the monkeys staff added, if
// printed again: marked, at the end of their part).
//   sheet: a deworming sheet; lines: its monkeys with their names (and
//   introcageShort, beside an introcage monkey's name), in printOrder;
//   different: "On different schedule: Barry, Pantshula." (under the table)
//   or null

const LINE = "0.75pt solid #000";
const BLANK_ROWS = 4;

const styles = StyleSheet.create({
    page: {
        paddingTop: 48,
        paddingBottom: 40,
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
        minHeight: 15,
        paddingHorizontal: 2,
        paddingVertical: 1,
        borderRight: LINE,
        borderBottom: LINE,
    },
    name: {
        width: "21%",
    },
    day: {
        width: "18%",
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

function Row({ cells, head = false }) {
    const [name, day1, day2, day3, details] = cells;
    return (
        <View style={[styles.row, head && styles.head]} wrap={false}>
            <Text style={[styles.cell, styles.name]}>{name}</Text>
            <Text style={[styles.cell, styles.day]}>{day1}</Text>
            <Text style={[styles.cell, styles.day]}>{day2}</Text>
            <Text style={[styles.cell, styles.day]}>{day3}</Text>
            <Text style={[styles.cell, styles.details]}>{details}</Text>
        </View>
    );
}

function MonkeyRow({ line: l }) {
    return (
        <Row
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
                    <Row head cells={["Name", "Day 1", "Day 2", "Day 3", "Details"]} />
                    {parts[0].map((l) => (
                        <MonkeyRow key={l.monkeyId} line={l} />
                    ))}
                    {Array.from({ length: BLANK_ROWS }, (_, i) => (
                        <Row key={`blank-${i}`} cells={["", "", "", "", ""]} />
                    ))}
                    {parts[1].length > 0 && (
                        <View style={styles.row} wrap={false}>
                            <Text style={[styles.cell, styles.band]}>Introcages</Text>
                        </View>
                    )}
                    {parts[1].map((l) => (
                        <MonkeyRow key={l.monkeyId} line={l} />
                    ))}
                </View>
                {different && <Text style={styles.different}>{different}</Text>}
            </Page>
        </Document>
    );
}
