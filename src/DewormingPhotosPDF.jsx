import { Document, Page, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { FORM_FONT, REPORT_FONT } from "./pdfFonts";
import { sheetTitle } from "./dewormingRules";
import { dayLabel } from "./babyRecords";

// A submitted deworming sheet's photos as a PDF, emailed on Submit
// (DewormingResults.jsx): the title (in Caladea, as the printed sheet), when
// and who did it, then each photo of the paper sheet, a page each.
//   sheet: the sheet as submitted; photos: the photos as data URLs

const styles = StyleSheet.create({
    page: {
        padding: 36,
        fontFamily: FORM_FONT,
        fontSize: 10,
        color: "#000",
    },
    title: {
        fontFamily: REPORT_FONT,
        fontSize: 16,
        fontWeight: "bold",
        textAlign: "center",
    },
    meta: {
        marginTop: 4,
        textAlign: "center",
    },
    // (a fixed height: the photo fits on its page, under the title)
    photo: {
        marginTop: 12,
        objectFit: "contain",
        width: "100%",
        height: 715,
    },
});

export default function DewormingPhotosPDF({ sheet, photos }) {
    const title = sheetTitle(sheet);
    const meta = [
        `Started ${dayLabel(sheet.startedOn ?? sheet.startDate)}`,
        sheet.staffNames && `Staff: ${sheet.staffNames}`,
    ]
        .filter(Boolean)
        .join(" · ");
    return (
        <Document title={title}>
            {photos.map((src, i) => (
                <Page key={i} size="A4" style={styles.page}>
                    <Text style={styles.title}>{title}</Text>
                    <Text style={styles.meta}>
                        {meta}
                        {photos.length > 1 ? ` · Photo ${i + 1} of ${photos.length}` : ""}
                    </Text>
                    <Image src={src} style={styles.photo} />
                </Page>
            ))}
        </Document>
    );
}
