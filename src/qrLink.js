// What a scanned QR code points to in vervetDB (Scan QR Code, QrScanner.jsx):
// an Introcage Sign's code is a link like https://vervetdb.com/#enclosure/26
// (introcageSigns.js). Returns the part to go to ("#enclosure/26"), or null
// if it isn't a vervetDB link (another site's code, or plain text).
//   origin: this site's own address too (a copy running elsewhere, e.g. a
//   test on the computer, still follows its own links)
import { SITE_URL } from "./introcageSigns";

// The pages a code may open: an enclosure / introcage, or a monkey
const PAGE = /^#(enclosure\/\d+|monkey\/[\w-]+)$/;

export function qrDestination(text, origin = window.location.origin) {
    let url;
    try {
        url = new URL(String(text).trim());
    } catch {
        return null;
    }
    const ours = [new URL(SITE_URL).origin, origin];
    if (!ours.includes(url.origin)) return null;
    return PAGE.test(url.hash) ? url.hash : null;
}
