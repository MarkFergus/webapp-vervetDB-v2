import { Document, Page, View, Text, StyleSheet } from "@react-pdf/renderer";
import { REPORT_FONT } from "./pdfFonts";
import { EMPTY_TEXT, FULL_SIGN, HALF_SIGN, LINE, TEXT, gaps } from "./introcageSigns";

// Introcage Signs: two 12 × 16 cm signs side by side on a landscape A4
// page, each in a thin border to cut along; a full sign (more than three
// monkeys) on a portrait A4 page of its own. See introcageSigns.js.
//   pages: signPages(); date: e.g. "16 Oct 2026" (when it was made)

const styles = StyleSheet.create({
    pairPage: {
        flexDirection: "row",
        justifyContent: "space-evenly",
        alignItems: "center",
        fontFamily: REPORT_FONT,
        color: "#000",
    },
    fullPage: {
        justifyContent: "center",
        alignItems: "center",
        fontFamily: REPORT_FONT,
        color: "#000",
    },
    sign: {
        border: "0.75pt solid #000",
    },
    title: {
        fontWeight: "bold",
        lineHeight: LINE,
    },
    section: {
        fontStyle: "italic",
        color: "#444",
        lineHeight: LINE,
        borderBottom: "1.5pt solid #000",
    },
    name: {
        fontWeight: "bold",
        lineHeight: LINE,
    },
    details: {
        color: "#333",
        lineHeight: LINE,
    },
    bio: {
        lineHeight: LINE,
    },
    info: {
        fontStyle: "italic",
        lineHeight: LINE,
    },
    // When it was made (so an old sign can be spotted), at the bottom
    updated: {
        marginTop: "auto",
        textAlign: "right",
        color: "#777",
        lineHeight: LINE,
    },
});

function Sign({ sign, box, date }) {
    const size = (key) => TEXT[key] * sign.scale;
    const gap = gaps(sign.scale);
    return (
        <View style={[styles.sign, { width: box.width, height: box.height, padding: box.padding }]}>
            <Text style={[styles.title, { fontSize: size("title") }]}>{sign.title}</Text>
            <Text style={[styles.section, { fontSize: size("section"), paddingBottom: gap.rule / 2, marginBottom: gap.rule / 2 }]}>
                {sign.section}
            </Text>
            {sign.monkeys.map((m, i) => (
                <View key={m.name} style={{ marginTop: i > 0 ? gap.monkey : 0 }} wrap={false}>
                    <Text style={[styles.name, { fontSize: size("name") }]}>{m.name}</Text>
                    {m.details && <Text style={[styles.details, { fontSize: size("details") }]}>{m.details}</Text>}
                    {m.bio && <Text style={[styles.bio, { fontSize: size("bio"), marginTop: gap.bio }]}>{m.bio}</Text>}
                </View>
            ))}
            {!sign.monkeys.length && <Text style={[styles.info, { fontSize: size("bio") }]}>{sign.info || EMPTY_TEXT}</Text>}
            <Text style={[styles.updated, { fontSize: size("updated"), paddingTop: gap.updated }]}>Updated {date}</Text>
        </View>
    );
}

function IntrocageSignPDF({ pages, date }) {
    return (
        <Document title={`Introcage Signs (${date})`}>
            {pages.map((page, i) =>
                page.full ? (
                    <Page key={i} size="A4" orientation="portrait" style={styles.fullPage}>
                        <Sign sign={page.signs[0]} box={FULL_SIGN} date={date} />
                    </Page>
                ) : (
                    <Page key={i} size="A4" orientation="landscape" style={styles.pairPage}>
                        {page.signs.map((sign) => (
                            <Sign key={sign.id} sign={sign} box={HALF_SIGN} date={date} />
                        ))}
                        {/* (an odd one out: still on the left, the right half blank) */}
                        {page.signs.length === 1 && <View style={{ width: HALF_SIGN.width, height: HALF_SIGN.height }} />}
                    </Page>
                )
            )}
        </Document>
    );
}

export default IntrocageSignPDF;
