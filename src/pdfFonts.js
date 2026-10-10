// The PDFs' fonts (Profile Books, the AM Plates List): Open Sans for the
// text, Russo One like the vervetDB title on the website
import { Font } from "@react-pdf/renderer";
import OpenSansRegular from "./fonts/OpenSans-Regular.ttf";
import OpenSansItalic from "./fonts/OpenSans-Italic.ttf";
import OpenSansBold from "./fonts/OpenSans-Bold.ttf";
import RussoOne from "./fonts/RussoOne-Regular.ttf";

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
