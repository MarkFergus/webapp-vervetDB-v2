import { Document, Page, View, Text, StyleSheet, Svg, Circle, Line, Polyline } from "@react-pdf/renderer";
import "./pdfFonts";
import { MONITORING_CHECKS, MONITORING_COLUMNS, monitoringPages } from "./monitoring";
import { textWidth } from "./pdfTextWidth";

// The Troop Monitoring Sheet, like the paper one: the checks at the top,
// then a row per monkey (name and a ♂ / ♀ sign) with a box for each
// session, every other row lightly tinted to read across. The names column
// is just wide enough for the longest name; the session boxes share the
// rest evenly.
//   title: e.g. "Gismo Troop Monitoring"; groups: monitoringGroups()

const LINE = "0.6pt solid #000";
// A4 portrait, less the margins and the title
const PAGE_HEIGHT = 841.89;
const MARGIN = 24;
const TITLE_HEIGHT = 34;

const styles = StyleSheet.create({
    page: {
        paddingVertical: MARGIN,
        paddingHorizontal: 32,
        fontFamily: "OpenSans",
        color: "#000",
    },
    title: {
        fontSize: 13,
        fontWeight: "bold",
        textAlign: "center",
        textDecoration: "underline",
    },
    titleRow: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "baseline",
        gap: 5,
    },
    pageOf: {
        fontSize: 10,
    },
    key: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 2,
        marginTop: 1,
        marginBottom: 3,
    },
    keyText: {
        fontSize: 6.5,
        fontStyle: "italic",
    },
    table: {
        borderTop: LINE,
        borderLeft: LINE,
    },
    row: {
        flexDirection: "row",
    },
    nameCell: {
        flexDirection: "row",
        alignItems: "center",
        gap: 3,
        paddingHorizontal: 2,
        borderRight: LINE,
        borderBottom: LINE,
    },
    box: {
        flex: 1,
        borderRight: LINE,
        borderBottom: LINE,
    },
    check: {
        backgroundColor: "#c8c8c8",
    },
    checkText: {
        fontWeight: "bold",
    },
    tint: {
        backgroundColor: "#ececec",
    },
    heading: {
        justifyContent: "center",
        borderRight: LINE,
        borderBottom: LINE,
        backgroundColor: "#c8c8c8",
    },
    headingText: {
        fontWeight: "bold",
        textAlign: "center",
    },
});

// ♂ / ♀, drawn (the font hasn't got them)
function SexSign({ sex, size }) {
    if (sex === "male") {
        return (
            <Svg width={size} height={size} viewBox="0 0 10 10">
                <Circle cx="4" cy="6" r="3" stroke="#000" strokeWidth="1" fill="none" />
                <Line x1="6.2" y1="3.8" x2="9.2" y2="0.8" stroke="#000" strokeWidth="1" />
                <Line x1="6.4" y1="0.8" x2="9.2" y2="0.8" stroke="#000" strokeWidth="1" />
                <Line x1="9.2" y1="0.8" x2="9.2" y2="3.6" stroke="#000" strokeWidth="1" />
            </Svg>
        );
    }
    if (sex === "female") {
        return (
            <Svg width={size} height={size} viewBox="0 0 10 10">
                <Circle cx="5" cy="3.6" r="3" stroke="#000" strokeWidth="1" fill="none" />
                <Line x1="5" y1="6.6" x2="5" y2="10" stroke="#000" strokeWidth="1" />
                <Line x1="3.2" y1="8.4" x2="6.8" y2="8.4" stroke="#000" strokeWidth="1" />
            </Svg>
        );
    }
    return null;
}

function Boxes({ height, style }) {
    return Array.from({ length: MONITORING_COLUMNS }, (_, i) => <View key={i} style={[styles.box, { height }, style]} />);
}

function MonitoringPDF({ title, groups }) {
    // One page, or a big troop over more (monitoringPages): page 1 has all
    // the checks; the others just the Date row, so the sessions line up
    const pages = monitoringPages(groups);
    const checksOn = (i) => (i === 0 ? MONITORING_CHECKS : ["Date"]);
    // Rows as tall as fit on the fullest page, up to a comfortable size;
    // the same on every page
    const rows = Math.max(
        ...pages.map(
            (page, i) => checksOn(i).length + page.reduce((n, g) => n + g.monkeys.length + (g.title ? 1 : 0), 0)
        )
    );
    const height = Math.max(9, Math.min(17, (PAGE_HEIGHT - 2 * MARGIN - TITLE_HEIGHT) / rows));
    const fontSize = Math.min(8.5, height * 0.62);
    // The names column: the longest name and its ♂ / ♀ sign, plus the
    // cell's padding (2 each side) and a little room; the checks' names
    // (bold) as big as the monkeys' if they fit, smaller if not
    const PADDING = 6;
    const signWidth = 3 + fontSize * 0.95;
    const names = groups.flatMap((g) => g.monkeys);
    const nameWidth = Math.max(60, ...names.map((m) => textWidth(m.name, fontSize) + signWidth + PADDING));
    const checkSize = (check) => Math.min(fontSize, (fontSize * (nameWidth - PADDING)) / textWidth(check, fontSize, true));
    const nameCell = [styles.nameCell, { width: nameWidth, height }];
    return (
        <Document title={title}>
            {pages.map((page, p) => (
                <Page key={p} size="A4" style={styles.page}>
                    {/* (the page number beside the title, not underlined with it) */}
                    <View style={styles.titleRow}>
                        <Text style={styles.title}>{title}</Text>
                        {pages.length > 1 && <Text style={styles.pageOf}>({p + 1} of {pages.length})</Text>}
                    </View>
                    {/* (the tick drawn: the font hasn't got one) */}
                    <View style={styles.key}>
                        <Svg width={6} height={6} viewBox="0 0 10 10">
                            <Polyline points="1,5.5 4,8.5 9,1.5" stroke="#000" strokeWidth="1.4" fill="none" />
                        </Svg>
                        <Text style={styles.keyText}>if seen … ? if unsure of ID … add * for new condition</Text>
                    </View>
                    <View style={styles.table}>
                        {checksOn(p).map((check) => (
                            <View key={check} style={styles.row} wrap={false}>
                                <View style={[...nameCell, styles.check]}>
                                    <Text style={[styles.checkText, { fontSize: checkSize(check) }]}>{check}</Text>
                                </View>
                                <Boxes height={height} style={styles.check} />
                            </View>
                        ))}
                        {page.map((group) => (
                            <View key={group.title ?? "troop"}>
                                {group.title && (
                                    <View style={[styles.heading, { height }]} wrap={false}>
                                        <Text style={[styles.headingText, { fontSize }]}>{group.title}</Text>
                                    </View>
                                )}
                                {group.monkeys.map((monkey, i) => {
                                    // Every other row tinted, starting again after each heading
                                    const tint = i % 2 === 1 ? styles.tint : null;
                                    return (
                                        <View key={monkey.id ?? monkey.name} style={styles.row} wrap={false}>
                                            <View style={[...nameCell, tint]}>
                                                <Text style={{ fontSize }}>{monkey.name}</Text>
                                                <SexSign sex={monkey.sex} size={fontSize * 0.95} />
                                            </View>
                                            <Boxes height={height} style={tint} />
                                        </View>
                                    );
                                })}
                            </View>
                        ))}
                    </View>
                </Page>
            ))}
        </Document>
    );
}

export default MonitoringPDF;
