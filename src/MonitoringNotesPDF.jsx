import { Document, Page, View, Text, StyleSheet, Svg, Circle } from "@react-pdf/renderer";
import { FORM_FONT, REPORT_FONT } from "./pdfFonts";
import { priorityChecks } from "./monitoringNotes";
import { MonitoringSheetPages } from "./MonitoringPDF";

// The Troop Monitoring Notes, like the paper draft: when it was created (top
// right), the title, the Priority Checks (in bold, with ◦ points under
// them), then the Monitoring Notes: the troop's current injuries, one per
// line, with the rest of the page left blank for staff to write in (they
// add it to the app afterwards).
//   title: e.g. "Goliath Monitoring Notes"; date: "21st Oct 2026";
//   notes: monitoringNotes()

const styles = StyleSheet.create({
    page: {
        paddingTop: 36,
        paddingBottom: 40,
        paddingHorizontal: 42,
        fontFamily: FORM_FONT,
        fontSize: 10.5,
        color: "#000",
    },
    created: {
        fontSize: 9,
        fontStyle: "italic",
        textAlign: "right",
    },
    // (the title in the Profile Book's serif)
    title: {
        marginTop: 2,
        fontFamily: REPORT_FONT,
        fontSize: 15,
        fontWeight: "bold",
        textAlign: "center",
        textDecoration: "underline",
    },
    heading: {
        marginTop: 18,
        marginBottom: 8,
        fontSize: 11,
        fontWeight: "bold",
        textDecoration: "underline",
    },
    check: {
        marginBottom: 7,
    },
    checkTitle: {
        fontWeight: "bold",
    },
    point: {
        flexDirection: "row",
        alignItems: "flex-start",
        marginTop: 4,
        marginLeft: 18,
    },
    bullet: {
        width: 14,
        paddingTop: 5,
    },
    // (no lineHeight: with bold / italic parts inside, it's measured a
    // line too tall)
    pointText: {
        flex: 1,
    },
    label: {
        fontStyle: "italic",
    },
    name: {
        fontWeight: "bold",
    },
    none: {
        fontStyle: "italic",
        color: "#555",
    },
    injury: {
        marginBottom: 9,
        lineHeight: 1.35,
    },
});

// ◦ (drawn: the font hasn't got one)
function Bullet() {
    return (
        <View style={styles.bullet}>
            <Svg width={5} height={5} viewBox="0 0 10 10">
                <Circle cx="5" cy="5" r="4" stroke="#000" strokeWidth="1.2" fill="none" />
            </Svg>
        </View>
    );
}

export function MonitoringNotesPage({ title, date, notes }) {
    const checks = priorityChecks(notes);
    return (
        <Page size="A4" style={styles.page}>
            <Text style={styles.created}>Created on {date}</Text>
            <Text style={styles.title}>{title}</Text>

            <Text style={styles.heading}>Priority Checks</Text>
            {checks.length ? (
                checks.map((check) => (
                    <View key={check.title} style={styles.check} wrap={false}>
                        <View>
                            <Text style={styles.checkTitle}>{check.title}</Text>
                            {check.lines?.map((line, j) => (
                                <View key={j} style={styles.point}>
                                    <Bullet />
                                    <Text style={styles.pointText}>
                                        {line.label ? <Text style={styles.label}>{line.label} </Text> : null}
                                        {line.name ? <Text style={styles.name}>{line.name} </Text> : null}
                                        {line.text}
                                    </Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ))
            ) : (
                <Text style={styles.none}>Nothing to check this time.</Text>
            )}

            <Text style={styles.heading}>Monitoring Notes:</Text>
            {notes.injuries.map((injury, i) => (
                <Text key={i} style={styles.injury}>
                    {injury.name} - {injury.text}
                </Text>
            ))}
        </Page>
    );
}

// The Troop Monitoring Sheet and / or Notes, in one PDF (the sheet first).
//   sheet: { title, groups } or null; notes: { title, date, notes } or null
function MonitoringDocument({ sheet, notes }) {
    return (
        <Document title={notes?.title ?? sheet?.title}>
            {sheet && <MonitoringSheetPages {...sheet} />}
            {notes && <MonitoringNotesPage {...notes} />}
        </Document>
    );
}

export default MonitoringDocument;
