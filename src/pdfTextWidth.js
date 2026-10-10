// How wide text prints in the PDFs' Open Sans (pdfFonts.js), in points, so
// a column can be made just wide enough for its longest name. Each
// character's width in thousandths of the font size, for the usual
// characters (space to ~), read from the font files; anything else counts
// as a wide-ish 600.
const WIDTHS = {
    regular: [
        260, 264, 398, 646, 572, 827, 729, 219, 295, 295, 551, 572, 259, 322, 263, 367, 572, 572, 572, 572, 572, 572,
        572, 572, 572, 572, 263, 263, 572, 572, 572, 432, 896, 632, 646, 630, 726, 556, 516, 727, 737, 279, 269, 612,
        522, 899, 753, 778, 602, 778, 617, 548, 551, 729, 596, 923, 578, 559, 572, 327, 367, 327, 572, 438, 277, 556,
        612, 479, 612, 562, 336, 543, 613, 252, 252, 525, 252, 926, 613, 602, 612, 612, 409, 477, 356, 613, 500, 775,
        523, 501, 469, 375, 549, 375, 572,
    ],
    bold: [
        260, 286, 472, 646, 572, 901, 750, 266, 339, 339, 545, 572, 285, 322, 285, 413, 572, 572, 572, 572, 572, 572,
        572, 572, 572, 572, 285, 285, 572, 572, 572, 477, 897, 690, 672, 637, 740, 560, 549, 724, 765, 331, 331, 664,
        565, 943, 813, 796, 628, 796, 660, 551, 579, 756, 650, 967, 667, 624, 579, 331, 413, 331, 572, 411, 362, 604,
        633, 514, 633, 591, 387, 565, 657, 305, 305, 620, 305, 982, 657, 619, 633, 633, 454, 497, 434, 657, 569, 856,
        578, 569, 488, 394, 551, 394, 572,
    ],
};

export function textWidth(text, fontSize, bold = false) {
    const widths = bold ? WIDTHS.bold : WIDTHS.regular;
    let total = 0;
    for (const ch of String(text)) total += widths[ch.codePointAt(0) - 32] ?? 600;
    return (total / 1000) * fontSize;
}
