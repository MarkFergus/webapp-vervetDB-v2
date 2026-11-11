import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { REPORT_FONT } from "./pdfFonts";
import { INTAKE_SUBTITLE, intakeTitle } from "./intakeReport";
import { BAND, HEADING } from "./intakeExcel";

// Monkey Intake as a PDF, like the sanctuary's Monkey Intake Form: A4
// portrait, the title and when it was made, then each list under its band
// (Sanctuary Arrivals, Released, Deceased, Escaped or Missing) as a table
// with orange headings, in the Profile Book's serif.
//   lists: intakeReport(); year: 2024; updated: "11th November 2026"

const LINE = "#000";

// Each list's column widths in points, in its columns' order: A4 portrait
// less the margins (535pt), the notes taking what's left
const PDF_WIDTHS = {
    arrivals: [18, 76, 62, 20, 42, 52, 50, 42, 123, 50],
    released: [18, 76, 70, 20, 42, 52, 257],
    deceased: [18, 76, 70, 20, 42, 80, 229],
    gone: [18, 76, 70, 20, 42, 70, 42, 197],
};

const styles = StyleSheet.create({
    page: {
        paddingTop: 30,
        paddingBottom: 36,
        paddingHorizontal: 30,
        fontFamily: REPORT_FONT,
        fontSize: 8,
        color: "#000",
    },
    top: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-end",
        borderBottomWidth: 1,
        borderBottomColor: LINE,
        paddingBottom: 6,
    },
    title: { fontSize: 18, fontWeight: "bold" },
    subtitle: { fontSize: 13, fontWeight: "bold" },
    updated: { fontSize: 9, fontStyle: "italic" },
    list: { marginTop: 16 },
    band: {
        backgroundColor: BAND,
        paddingVertical: 3,
        paddingHorizontal: 4,
        fontSize: 12,
        fontWeight: "bold",
    },
    row: {
        flexDirection: "row",
        borderLeftWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: LINE,
    },
    headingRow: { backgroundColor: HEADING },
    cell: {
        paddingVertical: 3,
        paddingHorizontal: 3,
        borderRightWidth: 0.5,
        borderColor: LINE,
    },
    heading: { fontWeight: "bold" },
    name: { fontWeight: "bold" },
    none: {
        paddingVertical: 4,
        paddingHorizontal: 4,
        fontStyle: "italic",
        borderLeftWidth: 0.5,
        borderRightWidth: 0.5,
        borderBottomWidth: 0.5,
        borderColor: LINE,
    },
    pageNumber: {
        position: "absolute",
        bottom: 16,
        right: 30,
        fontSize: 8,
    },
});

function List({ list }) {
    const widths = PDF_WIDTHS[list.id];
    const total = widths.reduce((sum, w) => sum + w, 0);
    const width = (c) => `${(widths[list.columns.indexOf(c)] / total) * 100}%`;
    return (
        <View style={styles.list}>
            {/* (the band and headings kept together, never alone at a page's foot) */}
            <View wrap={false} minPresenceAhead={24}>
                <Text style={styles.band}>{list.title}</Text>
                <View style={[styles.row, styles.headingRow]}>
                    {list.columns.map((c) => (
                        <Text key={c.key} style={[styles.cell, styles.heading, { width: width(c) }]}>
                            {c.label}
                        </Text>
                    ))}
                </View>
            </View>
            {list.rows.length ? (
                list.rows.map((row) => (
                    <View key={row.no} style={styles.row} wrap={false}>
                        {list.columns.map((c) => (
                            <Text key={c.key} style={[styles.cell, c.key === "name" && styles.name, { width: width(c) }]}>
                                {row[c.key]}
                            </Text>
                        ))}
                    </View>
                ))
            ) : (
                <Text style={styles.none}>{list.none}</Text>
            )}
        </View>
    );
}

export default function IntakePDF({ lists, year, updated }) {
    return (
        <Document title={intakeTitle(year)} author="Vervet Monkey Foundation">
            <Page size="A4" style={styles.page}>
                <View style={styles.top}>
                    <View>
                        <Text style={styles.title}>{intakeTitle(year)}</Text>
                        <Text style={styles.subtitle}>{INTAKE_SUBTITLE}</Text>
                    </View>
                    <Text style={styles.updated}>Updated: {updated}</Text>
                </View>
                {lists.map((list) => (
                    <List key={list.id} list={list} />
                ))}
                <Text style={styles.pageNumber} render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} fixed />
            </Page>
        </Document>
    );
}
