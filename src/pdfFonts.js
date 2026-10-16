// The PDFs' fonts: plain Open Sans for the working sheets (the AM Plates
// List, Troop Monitoring Sheets: no frills), and Caladea, a serif drawn to
// Cambria's measurements (Cambria itself can't be bundled in a website),
// for the Profile Book and Introcage Signs
import { Font } from "@react-pdf/renderer";
import { FORM_FONT, REPORT_FONT } from "./pdfTextWidth";
import OpenSansRegular from "./fonts/OpenSans-Regular.ttf";
import OpenSansItalic from "./fonts/OpenSans-Italic.ttf";
import OpenSansBold from "./fonts/OpenSans-Bold.ttf";
import CaladeaRegular from "./fonts/Caladea-Regular.ttf";
import CaladeaItalic from "./fonts/Caladea-Italic.ttf";
import CaladeaBold from "./fonts/Caladea-Bold.ttf";

export { FORM_FONT, REPORT_FONT };

// Regular, italic and bold of a family
function register(family, regular, italic, bold) {
    Font.register({
        family,
        fonts: [
            { src: regular, fontStyle: "normal", fontWeight: "normal" },
            { src: italic, fontStyle: "italic", fontWeight: "normal" },
            { src: bold, fontStyle: "normal", fontWeight: "bold" },
        ],
    });
}
register(FORM_FONT, OpenSansRegular, OpenSansItalic, OpenSansBold);
register(REPORT_FONT, CaladeaRegular, CaladeaItalic, CaladeaBold);

// Keep words whole: wrap to the next line instead of splitting with a hyphen
Font.registerHyphenationCallback((word) => [word]);
