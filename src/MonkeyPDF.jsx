import {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
    Font,
    Svg,
    Path,
} from "@react-pdf/renderer";
import OpenSansRegular from "./fonts/OpenSans-Regular.ttf";
import OpenSansItalic from "./fonts/OpenSans-Italic.ttf";
import OpenSansBold from "./fonts/OpenSans-Bold.ttf";
import RussoOne from "./fonts/RussoOne-Regular.ttf";
import { MONKEY_ICON_PATH, MONKEY_ICON_VIEWBOX } from "./monkeyIconPath";
import { placeLabel, placeName } from "./places";

Font.register({
    family: "OpenSans",
    fonts: [
        {
            src: OpenSansRegular,
            fontStyle: "normal",
            fontWeight: "normal",
        },
        {
            src: OpenSansItalic,
            fontStyle: "italic",
            fontWeight: "normal",
        },
        {
            src: OpenSansBold,
            fontStyle: "normal",
            fontWeight: "bold",
        },
    ],
});

// Same font as the vervetDB title on the website
Font.register({ family: "RussoOne", src: RussoOne });

// Keep words whole: wrap to the next line instead of splitting with a hyphen
Font.registerHyphenationCallback((word) => [word]);

// Every photo is shown at the same size (5:4, like most of the photos),
// cropped to fit, so all rows line up
// 3 monkeys a page: photos just under half the page width, leaving room for
// up to three section headings without pushing a row to the next page
const PHOTO_WIDTH = 262;
const PHOTO_HEIGHT = 210;

// Colour of the cover's logo and "vervetDB"
const BRAND_GREY = "#666";

const styles = StyleSheet.create({
    document: {
        fontFamily: "OpenSans",
    },
    // Padding rather than margin: react-pdf applies padding evenly on all sides
    page: {
        fontFamily: "OpenSans",
        paddingTop: 24,
        paddingBottom: 40,
        paddingHorizontal: 30,
    },
    header: {
        flexDirection: "row",
        justifyContent: "space-between",
        fontSize: 9,
        color: "#555",
        marginBottom: 8,
    },
    headerTitle: {
        fontWeight: "bold",
    },
    pageNumber: {
        position: "absolute",
        bottom: 18,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 9,
    },
    row: {
        paddingTop: 3,
        paddingBottom: 3,
        flexDirection: "row",
        alignItems: "flex-start",
        borderBottom: "1px solid #ccc",
    },
    // "Adult Females", "2024 Orphans/Babies"…
    sectionTitle: {
        fontFamily: "RussoOne",
        fontSize: 14,
        paddingTop: 10,
        paddingBottom: 5,
        borderBottom: "1px solid #ccc",
    },
    image: {
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
        objectFit: "cover",
    },
    noPhoto: {
        width: PHOTO_WIDTH,
        height: PHOTO_HEIGHT,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#eee",
        color: "#888",
        fontSize: 9,
    },
    detailsContainer: {
        flex: 1,
        paddingLeft: 12,
    },
    name: {
        fontSize: 15,
        fontWeight: "bold",
    },
    chip: {
        fontSize: 8,
        marginBottom: 10,
    },
    bio: {
        fontSize: 9,
        marginBottom: 10,
    },
    descTitle: {
        fontSize: 9,
        fontStyle: "italic",
        textDecoration: "underline",
    },
    descInfo: {
        fontSize: 9,
    },
    cover: {
        fontFamily: "OpenSans",
        padding: 60,
        justifyContent: "center",
        alignItems: "center",
    },
    // Logo + "vervetDB" at the bottom of the cover, like the website's nav
    coverBrand: {
        position: "absolute",
        bottom: 48,
        left: 0,
        right: 0,
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "flex-end",
    },
    coverBrandIcon: {
        width: 22,
        height: 20,
        marginRight: 6,
        // Lifts the icon so its bottom sits on the text baseline rather than
        // the bottom of the text box (which leaves room for letters like "g")
        marginBottom: 3.9,
    },
    coverBrandName: {
        fontFamily: "RussoOne",
        fontSize: 14,
        color: BRAND_GREY,
    },
    coverTitle: {
        fontSize: 36,
        fontWeight: "bold",
        marginBottom: 6,
    },
    coverSubtitle: {
        fontSize: 18,
        color: "#555",
    },
    coverRule: {
        width: 80,
        borderBottom: "1px solid #ccc",
        marginVertical: 28,
    },
    coverDate: {
        fontSize: 11,
        color: "#555",
    },
});

// Start of the bio line, e.g. "2005 female." or "Unknown birth year, female."
function bioIntro({ year, sex }) {
    const sexText = sex || "sex unknown";
    return year ? `${year} ${sexText}.` : `Unknown birth year, ${sexText}.`;
}

function formatDate(date) {
    const month = date.toLocaleString("default", { month: "long" });
    return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

const monkeyKey = (monkey) => `${monkey.name}-${placeName(monkey)}`;

// One monkey: photo on the left, details on the right
function monkeyRow(monkey, showTroop) {
    return (
        <View style={styles.row}>
            {monkey.pdfPhoto ? (
                <Image src={monkey.pdfPhoto} style={styles.image} />
            ) : (
                <View style={styles.noPhoto}>
                    <Text>Photo unavailable</Text>
                </View>
            )}
            <View style={styles.detailsContainer}>
                <Text style={styles.name}>{monkey.name}</Text>
                <Text style={styles.chip}>
                    {showTroop ? `${placeLabel(monkey)} · ` : ""}
                    Chip: {monkey.chip === null ? "Unknown" : monkey.chip ? monkey.chip : "No Chip"}
                </Text>
                <Text style={styles.bio}>
                    {bioIntro(monkey)} {monkey.bio || "No bio yet."}
                </Text>
                <Text style={styles.descTitle}>Distinctive features/behaviours:</Text>
                <Text style={styles.descInfo}>
                    {monkey.desc ? monkey.desc : "Nothing. Nada. Zilch."}
                </Text>
            </View>
        </View>
    );
}

// sections: [{ title, monkeys }] in book order (see profileBook.js), each
// monkey with its pdfPhoto. title: e.g. "Goliath Troop". showTroop: add each
// monkey's troop (for books that mix troops, like Orphans/Babies).
function MonkeyPDF({ sections, title, showTroop = false }) {
    const formattedDate = formatDate(new Date());
    const troopTitle = title;

    return (
        <Document style={styles.document}>
            <Page style={styles.cover}>
                <Text style={styles.coverTitle}>{troopTitle}</Text>
                <Text style={styles.coverSubtitle}>Profile Book</Text>
                <View style={styles.coverRule} />
                <Text style={styles.coverDate}>Created {formattedDate}</Text>
                <View style={styles.coverBrand}>
                    <Svg
                        viewBox={MONKEY_ICON_VIEWBOX}
                        style={styles.coverBrandIcon}
                    >
                        <Path
                            d={MONKEY_ICON_PATH}
                            fill={BRAND_GREY}
                            fillRule="evenodd"
                        />
                    </Svg>
                    <Text style={styles.coverBrandName}>vervetDB</Text>
                </View>
            </Page>
            {/* The pages flow on by themselves; a monkey's row is never split
                across pages, and a heading never sits alone at the bottom */}
            <Page style={styles.page}>
                <View style={styles.header} fixed>
                    <Text style={styles.headerTitle}>{troopTitle} Profile Book</Text>
                    <Text>Created {formattedDate}</Text>
                </View>
                {sections.map((section) => (
                    <View key={section.title}>
                        {section.monkeys.map((monkey, i) =>
                            i === 0 ? (
                                // The heading and the section's first monkey
                                // stay together, so a heading is never left
                                // alone at the bottom of a page
                                <View key={monkeyKey(monkey)} wrap={false}>
                                    <Text style={styles.sectionTitle}>{section.title}</Text>
                                    {monkeyRow(monkey, showTroop)}
                                </View>
                            ) : (
                                <View key={monkeyKey(monkey)} wrap={false}>
                                    {monkeyRow(monkey, showTroop)}
                                </View>
                            )
                        )}
                    </View>
                ))}
                {/* Page numbers leave out the cover */}
                <Text
                    style={styles.pageNumber}
                    fixed
                    render={({ pageNumber, totalPages }) =>
                        `Page ${pageNumber - 1} of ${totalPages - 1}`
                    }
                />
            </Page>
        </Document>
    );
}

export default MonkeyPDF;
