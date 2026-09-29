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

const ROWS_PER_PAGE = 4;

// Every photo is shown at the same size (5:4, like most of the photos),
// cropped to fit, so all rows line up
const PHOTO_WIDTH = 224;
const PHOTO_HEIGHT = 179;

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
    firstRow: {
        borderTop: "1px solid #ccc",
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

function formatDate(date) {
    const month = date.toLocaleString("default", { month: "long" });
    return `${date.getDate()} ${month} ${date.getFullYear()}`;
}

function MonkeyPDF({ monkeys, troop }) {
    const formattedDate = formatDate(new Date());
    const troopTitle =
        !troop || troop === "All Troops" ? "All Troops" : `${troop} Troop`;

    // Split the monkeys into pages of ROWS_PER_PAGE
    const pages = [];
    for (let i = 0; i < monkeys.length; i += ROWS_PER_PAGE) {
        pages.push(monkeys.slice(i, i + ROWS_PER_PAGE));
    }
    const totalPages = pages.length;

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
            {pages.map((pageMonkeys, pageIndex) => (
                // wrap={false}: each page holds exactly ROWS_PER_PAGE monkeys
                <Page style={styles.page} key={pageIndex} wrap={false}>
                    <View style={styles.header}>
                        <Text style={styles.headerTitle}>
                            {troopTitle} Profile Book
                        </Text>
                        <Text>Created {formattedDate}</Text>
                    </View>
                    {pageMonkeys.map((monkey, index) => (
                        <View
                            key={index}
                            style={[styles.row, index === 0 && styles.firstRow]}
                        >
                            {monkey.pdfPhoto ? (
                                <Image
                                    src={monkey.pdfPhoto}
                                    style={styles.image}
                                />
                            ) : (
                                <View style={styles.noPhoto}>
                                    <Text>Photo unavailable</Text>
                                </View>
                            )}
                            <View style={styles.detailsContainer}>
                                <Text style={styles.name}>{monkey.name}</Text>
                                <Text style={styles.chip}>
                                    Chip: {monkey.chip ? monkey.chip : "No chip"}
                                </Text>
                                <Text style={styles.bio}>
                                    {monkey.year} {monkey.sex}. {monkey.bio}
                                </Text>
                                <Text style={styles.descTitle}>
                                    Distinctive features/behaviours:
                                </Text>
                                <Text style={styles.descInfo}>
                                    {monkey.desc
                                        ? monkey.desc
                                        : "Nothing. Nada. Zilch."}
                                </Text>
                            </View>
                        </View>
                    ))}
                    <Text style={styles.pageNumber} fixed>
                        Page {pageIndex + 1} of {totalPages}
                    </Text>
                </Page>
            ))}
        </Document>
    );
}

export default MonkeyPDF;
