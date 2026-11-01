import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { FORM_FONT } from "./pdfFonts";

// A week's report as an A4 PDF (Past Reports' Download PDF): the same as
// the View, section by section, each with its Missing list in red.
//   report: weekly_report (weekly-report-email.sql: its lines)

const RED = "#b3261e";
const LINE = "0.5pt solid #999";

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 40,
        paddingHorizontal: 40,
        fontFamily: FORM_FONT,
        fontSize: 9.5,
        color: "#000",
    },
    title: {
        fontSize: 16,
        fontWeight: "bold",
    },
    note: {
        marginTop: 3,
        fontSize: 8.5,
        fontStyle: "italic",
    },
    section: {
        marginTop: 14,
    },
    sectionTitle: {
        paddingBottom: 2,
        fontSize: 13,
        fontWeight: "bold",
        borderBottom: "1pt solid #000",
    },
    groupTitle: {
        marginTop: 7,
        marginBottom: 2,
        fontSize: 10,
        fontWeight: "bold",
    },
    line: {
        marginBottom: 2,
    },
    sub: {
        marginBottom: 2,
        marginLeft: 10,
        color: "#444",
    },
    alert: {
        color: RED,
    },
    none: {
        color: "#666",
        fontStyle: "italic",
    },
    missing: {
        marginTop: 7,
        padding: 5,
        border: `0.75pt solid ${RED}`,
    },
    missingTitle: {
        marginBottom: 2,
        fontWeight: "bold",
        color: RED,
    },
    row: {
        flexDirection: "row",
        borderBottom: LINE,
    },
    cell: {
        flex: 1,
        paddingVertical: 2,
        textAlign: "center",
    },
    nameCell: {
        flex: 1.6,
        paddingVertical: 2,
        fontWeight: "bold",
    },
    headCell: {
        fontWeight: "bold",
    },
    pageNumber: {
        position: "absolute",
        bottom: 18,
        right: 40,
        fontSize: 8,
        color: "#666",
    },
});

function Table({ table }) {
    return (
        <View>
            {[table.head, ...table.rows].map((row, r) => (
                <View key={r} style={styles.row} wrap={false}>
                    {row.map((cell, c) => (
                        <Text key={c} style={[c === 0 ? styles.nameCell : styles.cell, r === 0 && styles.headCell]}>
                            {cell}
                        </Text>
                    ))}
                </View>
            ))}
        </View>
    );
}

export default function WeeklyReportPDF({ report }) {
    return (
        <Document title={report.title}>
            <Page size="A4" style={styles.page}>
                <Text style={styles.title}>{report.title}</Text>
                {!report.ended && (
                    <Text style={styles.note}>This week isn't over yet: only the days so far are checked.</Text>
                )}
                {report.sections.map((section) => (
                    <View key={section.id} style={styles.section}>
                        <Text style={styles.sectionTitle}>{section.title}</Text>
                        {section.groups.map((group) => (
                            <View key={group.title}>
                                <Text style={styles.groupTitle} minPresenceAhead={20}>
                                    {group.title}
                                </Text>
                                {group.table ? (
                                    <Table table={group.table} />
                                ) : group.lines.length ? (
                                    group.lines.map((line, i) => (
                                        <View key={i} wrap={false}>
                                            <Text style={[styles.line, line.alert && styles.alert]}>{line.text}</Text>
                                            {line.sub?.map((sub, j) => (
                                                <Text key={j} style={styles.sub}>
                                                    {sub}
                                                </Text>
                                            ))}
                                        </View>
                                    ))
                                ) : (
                                    <Text style={styles.none}>None this week</Text>
                                )}
                            </View>
                        ))}
                        {section.missing.length > 0 && (
                            <View style={styles.missing} wrap={false}>
                                <Text style={styles.missingTitle}>Missing</Text>
                                {section.missing.map((m) => (
                                    <Text key={m} style={styles.alert}>
                                        {m}
                                    </Text>
                                ))}
                            </View>
                        )}
                    </View>
                ))}
                <Text
                    style={styles.pageNumber}
                    render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
                    fixed
                />
            </Page>
        </Document>
    );
}
