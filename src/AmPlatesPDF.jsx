import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import "./pdfFonts";

// The AM Plates List: one A4 page like the plates board's sheet. Each
// group: its name and enclosures | how many plates and which are special |
// who they're for (to check against), and who's fed by Sickbay. Then
// Sickbay's special plates.
//   groups: amSummary() (feeding.js); date: e.g. "10th Oct 2026"

const BORDER = "1pt solid #000";

const styles = StyleSheet.create({
    page: {
        paddingTop: 40,
        paddingBottom: 36,
        paddingHorizontal: 44,
        fontFamily: "OpenSans",
        fontSize: 10,
        color: "#000",
    },
    title: {
        fontSize: 17,
        fontWeight: "bold",
        textAlign: "center",
    },
    titleDate: {
        fontWeight: "normal",
    },
    subtitle: {
        marginTop: 4,
        marginBottom: 10,
        fontSize: 9,
        fontStyle: "italic",
        textAlign: "center",
    },
    table: {
        borderTop: BORDER,
        borderLeft: BORDER,
    },
    row: {
        flexDirection: "row",
        minHeight: 118,
    },
    cell: {
        padding: 5,
        borderRight: BORDER,
        borderBottom: BORDER,
    },
    nameCell: {
        width: "27%",
        justifyContent: "center",
    },
    countCell: {
        width: "27%",
        alignItems: "center",
        justifyContent: "center",
    },
    detailCell: {
        width: "46%",
        justifyContent: "space-between",
        fontSize: 8.5,
    },
    groupTitle: {
        fontSize: 13,
        fontWeight: "bold",
    },
    groupNote: {
        fontSize: 10.5,
        fontStyle: "italic",
    },
    plates: {
        fontSize: 30,
        fontWeight: "bold",
        lineHeight: 1.2,
    },
    count: {
        fontSize: 9.5,
    },
    sickbay: {
        marginTop: 6,
        fontStyle: "italic",
    },
    askSickbay: {
        marginBottom: 10,
        fontSize: 11,
        fontWeight: "bold",
        textDecoration: "underline",
        textAlign: "center",
    },
    footer: {
        marginTop: 8,
        fontSize: 8.5,
        color: "#444",
        textAlign: "right",
    },
});

function AmPlatesPDF({ groups, date }) {
    const total = groups.reduce((n, g) => n + g.plates, 0);
    const cutSmall = groups.reduce((n, g) => n + g.cutSmall, 0);
    return (
        <Document title={`AM Plates List (${date})`}>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>
                    AM Plates List <Text style={styles.titleDate}>({date})</Text>
                </Text>
                <Text style={styles.subtitle}>baby plates are all cut small with fruit</Text>
                <View style={styles.table}>
                    {groups.map((group) => (
                        <View key={group.title} style={styles.row} wrap={false}>
                            <View style={[styles.cell, styles.nameCell]}>
                                <Text style={styles.groupTitle}>{group.title}</Text>
                                <Text style={styles.groupNote}>{group.note}</Text>
                            </View>
                            <View style={[styles.cell, styles.countCell]}>
                                <Text style={styles.plates}>{group.plates}</Text>
                                {group.counts.map((line) => (
                                    <Text key={line} style={styles.count}>{line}</Text>
                                ))}
                            </View>
                            <View style={[styles.cell, styles.detailCell]}>
                                {/* (each cage's entry kept on one line: wraps only after a comma) */}
                                <Text>{group.rows.map((row) => row.replace(/ /g, " ")).join(", ")}</Text>
                                {group.sickbay && <Text style={styles.sickbay}>{group.sickbay} fed by Sickbay</Text>}
                            </View>
                        </View>
                    ))}
                    <View style={styles.row} wrap={false}>
                        <View style={[styles.cell, styles.nameCell]}>
                            <Text style={styles.groupTitle}>Sickbay Special Plates</Text>
                            <Text style={styles.groupNote}>*These are special plates delivered by sickbay team*</Text>
                        </View>
                        <View style={[styles.cell, styles.countCell]}>
                            <Text style={styles.askSickbay}>Please ask Sickbay for number required</Text>
                            <Text style={styles.count}>All cut small + fruit</Text>
                        </View>
                        <View style={[styles.cell, styles.detailCell]} />
                    </View>
                </View>
                <Text style={styles.footer}>
                    Total: {total} {total === 1 ? "plate" : "plates"} ({cutSmall} cut small) + Sickbay&apos;s special plates
                </Text>
            </Page>
        </Document>
    );
}

export default AmPlatesPDF;
