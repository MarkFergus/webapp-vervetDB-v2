import React, { Component } from "react";
import {
    Document,
    Page,
    View,
    Text,
    Image,
    StyleSheet,
    Font,
} from "@react-pdf/renderer";
import OpenSansRegular from "./fonts/OpenSans-Regular.ttf";
import OpenSansItalic from "./fonts/OpenSans-Italic.ttf";

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
    ],
});

const styles = StyleSheet.create({
    document: {
        fontFamily: "OpenSans",
    },
    //marginRight not working so added marginRight inline to parent view container to fix
    page: {
        marginTop: 0,
        marginBottom: 0,
        marginLeft: 15,
        marginRight: 40,
    },
    pageNumber: {
        position: "absolute",
        bottom: 18,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 9,
    },
    pageDate: {
        position: "absolute",
        top: 14,
        right: 0,
        fontSize: 9,
    },
    row: {
        paddingTop: 3,
        paddingBottom: 3,
        flexDirection: "row",
        alignItems: "flex-start",
        borderBottom: "1px solid #ccc",
    },
    image: {
        flex: 0.44,
    },
    detailsContainer: {
        flex: 0.56,
        paddingLeft: 10,
        paddingRight: 20,
    },
    name: {
        fontSize: 15,
        fontWeight: 600,
    },
    chip: {
        fontSize: 8,
        marginBottom: 10,
    },
    bio: {
        fontSize: 9,
        marginBottom: 10,
        overflowWrap: "break-word",
    },
    descTitle: {
        fontSize: 9,
        fontWeight: 700,
        fontStyle: "italic",
    },
    descInfo: {
        fontSize: 9,
        overflowWrap: "break-word",
    },
});

const ROWS_PER_PAGE = 4;

class MonkeyPDF extends Component {
    render() {
        const { monkeys } = this.props;
        const currentDate = new Date();
        const formattedDate = `${currentDate.getDate()} ${currentDate.toLocaleString(
            "default",
            {
                month: "long",
            }
        )} ${currentDate.getFullYear()}`;

        const pages = [];
        let currentPage = [];

        monkeys.forEach((monkey, index) => {
            currentPage.push(monkey);
            //create array of pages from monkeys with specified number per page
            if (
                (index + 1) % ROWS_PER_PAGE === 0 ||
                index === monkeys.length - 1
            ) {
                pages.push(currentPage);
                currentPage = [];
            }
        });
        const totalPages = pages.length;

        return (
            <Document style={styles.document}>
                {pages.map((pageMonkeys, pageIndex) => (
                    <Page style={styles.page} key={pageIndex}>
                        <View style={{ flexGrow: 1, marginRight: 35 }}>
                            <Text style={styles.pageDate}>
                                Created {formattedDate}
                            </Text>
                            {pageMonkeys.map((monkey, index) => {
                                const isMultipleOfFour = index % 4 === 0;

                                return (
                                    <View
                                        key={index}
                                        style={[
                                            styles.row,
                                            //create top border on first row of each page
                                            isMultipleOfFour && {
                                                borderTop: "1px solid #ccc",
                                                marginTop: 27,
                                            },
                                        ]}
                                    >
                                        <Image
                                            src={monkey.img}
                                            style={styles.image}
                                        />
                                        <View style={styles.detailsContainer}>
                                            <Text style={styles.name}>
                                                {monkey.name}
                                            </Text>
                                            <Text style={styles.chip}>
                                                Chip: {monkey.chip}
                                            </Text>
                                            <Text style={styles.bio}>
                                                {monkey.year} {monkey.sex}.{" "}
                                                {monkey.bio}
                                            </Text>
                                            <Text style={styles.descTitle}>
                                                Distinctive features/behaviours:
                                            </Text>
                                            <Text style={styles.descInfo}>
                                                Description information will go
                                                here...
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                            <Text style={styles.pageNumber}>
                                Page {pageIndex + 1} of {totalPages}
                            </Text>
                        </View>
                    </Page>
                ))}
            </Document>
        );
    }
}

export default MonkeyPDF;
