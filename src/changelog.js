// vervetDB's version and what changed in each one. Newest first. Only things
// people using the site will notice; behind-the-scenes work doesn't need a
// line. Each line starts with what kind of change it is, changelog-style:
//   New / Added …  a new feature
//   Improved …     an existing feature works or looks better
//   Fixed …        a bug fixed
// The About pop-up shows the current version and its changes, with a link
// to the Updates page (UpdatesPage.jsx): every version, grouped by series.
//
// Version numbers: major.minor.patch
//   major (1.0 → 2.0): a big milestone that changes how vervetDB works
//   minor (1.0 → 1.1): new features people will notice
//   patch (1.0.0 → 1.0.1): small fixes and tweaks
//
// A significant release can have major: true, shown as a "Major Update"
// pill beside its version in About.
//
// To release a new version: add an entry at the top AND change "version"
// in package.json to match (a test checks they agree).
export const CHANGE_TYPES = ["New", "Added", "Improved", "Fixed"];

export const CHANGELOG = [
    {
        version: "1.15.1",
        date: "2026-10-24",
        changes: ["New Baby Care statistics page"],
    },
    {
        version: "1.15.0",
        date: "2026-10-24",
        changes: ["New Statistics page: figures and charts for the sanctuary, each enclosure and the Bandits"],
    },
    {
        version: "1.14.0",
        date: "2026-10-22",
        major: true,
        changes: [
            "New Full Profile page for each monkey (staff only)",
            "Added Species, Birth Date and Current Location to monkey records",
            "Improved Quick Actions: now open to editors, with a date and reason for every move",
            "Improved the maintenance log: staff can edit and delete their own entries",
            "Improved navigation menus",
        ],
    },
    {
        version: "1.13.0",
        date: "2026-10-21",
        changes: [
            "New Troop Monitoring Notes in Documents under Troop Monitoring",
            "Added Monitoring to monkey records: Priority Condition Check and Notes for Monitoring",
            "Added updates to injuries",
            "Added Maintenance Type (Routine or Repair) to the maintenance log",
        ],
    },
    {
        version: "1.12.3",
        date: "2026-10-21",
        changes: ["Improved enclosure pages with a redesign"],
    },
    {
        version: "1.12.2",
        date: "2026-10-17",
        changes: ["New Light theme available"],
    },
    {
        version: "1.12.1",
        date: "2026-10-17",
        changes: [
            "New QR codes on Introcage Signs and Scan QR Code in the ☰ menu (being tested: printed signs don't have them yet)",
        ],
    },
    {
        version: "1.12.0",
        date: "2026-10-16",
        changes: [
            "New Introcage Signs to print, in Documents (was Create PDF)",
            "Improved enclosure maps: zoom and move around in the map pop-up",
            "Improved the Profile Book with a new font",
        ],
    },
    {
        version: "1.11.0",
        date: "2026-10-15",
        changes: ["New Interactive Map"],
    },
    {
        version: "1.10.0",
        date: "2026-10-13",
        // a significant release: "Major Update" beside it in About
        major: true,
        changes: [
            "Improved the whole site with a fresh new look: new fonts, colours, buttons and layout",
        ],
    },
    {
        version: "1.9.0",
        date: "2026-10-11",
        changes: [
            "New In Sickbay badge on monkeys; the AM Plates List counts them as fed by Sickbay until they return",
            "Improved the Sickbay Care Unit: it also lists monkeys in Sickbay for now",
            "New Arrival badge on monkeys living in a care unit",
        ],
    },
    {
        version: "1.8.0",
        date: "2026-10-10",
        // a significant release: "Major Update" beside it in About
        major: true,
        changes: [
            "New Feeding record for introcage monkeys",
            "New options for Create PDFs: AM Plates List and Troop Monitoring Sheets",
            "Fixed pop-ups jumping around when changing options",
        ],
    },
    {
        version: "1.7.0",
        date: "2026-10-10",
        changes: [
            "New enclosure types: Troop Enclosure, Block (Bachelor Block) and Care Unit",
            "Improved the care units: Baby Care, Quarantine and Sickbay Care Unit together, after Sickbay",
            "Improved Quarantine: one area instead of cages A–F",
            "Improved Add Monkey: new arrivals start in a care unit, then move to their home with Edit",
        ],
    },
    {
        version: "1.6.0",
        date: "2026-10-09",
        changes: [
            "New Add Photos for staff: upload several photos at once and choose who's in each",
            "Improved the bottom bar for staff: Add Photos in the middle, Map in the ☰ menu",
            "Improved the Section filters: Quarantine and Sickbay Care Unit left out for now",
        ],
    },
    {
        version: "1.5.1",
        date: "2026-10-09",
        changes: [
            "Added care areas for new intakes: Baby Care and Sickbay Care Unit",
            "Improved Quarantine: now a care area, no longer in the Sickbay section",
            "Added a Section filter for each care area",
        ],
    },
    {
        version: "1.5.0",
        date: "2026-10-09",
        // a significant release: "Major Update" beside it in About
        major: true,
        changes: [
            "New special enclosures: Bachelor Block and Quarantine, with their cages",
            "New Sort on the Enclosures page: Name, Section, Monkeys or Size",
            "Improved names: Dino & Daniel and Holt & Barrington in full, and James B is now Groomingdales",
        ],
    },
    {
        version: "1.4.0",
        date: "2026-10-09",
        changes: [
            "New account photos: tap your picture in Account to add one",
            "New account menu on computers: Account, Changelog, Theme and Sign Out",
            "New Changelog: your own recent changes to monkeys, enclosures and maintenance",
            "Improved the daily summary email: now includes enclosure and introcage changes",
        ],
    },
    {
        version: "1.3.0",
        date: "2026-10-08",
        // a significant release: "Major Update" beside it in About
        major: true,
        changes: [
            "New layout: a side menu on computers, and a bottom bar and ☰ menu on phones",
            "Improved navigation around the app",
        ],
    },
    {
        version: "1.2.1",
        date: "2026-10-08",
        changes: [
            "New previous / next and swipe between enclosure and introcage pages",
            "New introcage details: Troop Door, Plate Slot and Sleeping Perches",
            "Added a Troop / Introcage filter",
            "Added full names for staff, and maintenance accounts",
            "Improved enclosure pages: new layout, one Monkeys list, quick links",
            "Improved the sanctuary map: corrected, clearer labels, larger pop-up",
        ],
    },
    {
        version: "1.2.0",
        date: "2026-10-07",
        // a significant release: "Major Update" beside it in About
        major: true,
        changes: [
            "New Enclosures pages: every troop enclosure and introcage",
            "New sanctuary map on every enclosure and introcage page",
            "New maintenance log for each enclosure and introcage",
            "Added an Enclosures button to the top bar",
        ],
    },
    {
        version: "1.1.4",
        date: "2026-10-06",
        changes: [
            "Added swiping between photos in a monkey's pop-up on phones",
            "Added a monkey count beside Filters and Sort",
            "Added link previews when sharing vervetDB",
            "Improved loading with placeholders while the monkeys load",
            "Improved the top bar on tablets and narrow windows",
        ],
    },
    {
        version: "1.1.3",
        date: "2026-10-06",
        changes: [
            "Added Unknown as an option for chip numbers, alongside No Chip",
            "Improved chip entry on phones: separate two chips with a comma or full stop",
            "Added open-source licences to About",
            "Fixed the page scrolling behind the Filters panel on phones",
        ],
    },
    {
        version: "1.1.2",
        date: "2026-10-04",
        changes: [
            "New Photo Needed badge on monkeys without a photo",
            "New message when no monkeys are found, with a button to clear the search and filters",
            "Added copyright and credits to About",
        ],
    },
    {
        version: "1.1.1",
        date: "2026-10-03",
        changes: [
            "New Admin user profile created",
            "Improved filtering options and design",
        ],
    },
    {
        version: "1.1.0",
        date: "2026-10-03",
        changes: [
            "Added Bandits as their own troop and section",
            "New list view with grid/list switch",
        ],
    },
    {
        version: "1.0.1",
        date: "2026-10-02",
        changes: [
            "Fixed bug with Firefox app not downloading Profile Books",
            "Fixed bug with Firefox app not downloading images, now offers a working option for Firefox users",
            "Improved Sort button, now tidier and shows the current order in words",
            "Improved About screen, now lists the changes in each version",
            "Improved saved monkey card design",
        ],
    },
    {
        version: "1.0.0",
        date: "2026-10-02",
        changes: [
            "New installable app for your phone or computer",
            "New offline use: the monkeys and their photos are saved on your device",
            "New option to download all photos, to use without signal (Install & Use Offline)",
            "Improved photos on phones, now sharper with two monkeys per row",
            "Improved vervetDB app icon, now sharp and clear",
        ],
    },
];

export const APP_VERSION = CHANGELOG[0].version;

// The Updates page (#updates): the versions grouped by series (same
// major.minor, e.g. 1.5.0 and 1.5.1), newest first:
//   [{ series: "1.12", releases: [entries…] }, …]
export function seriesGroups(changelog) {
    const groups = [];
    for (const entry of changelog) {
        const series = entry.version.split(".").slice(0, 2).join(".");
        const last = groups[groups.length - 1];
        if (last?.series === series) last.releases.push(entry);
        else groups.push({ series, releases: [entry] });
    }
    return groups;
}

// Where the Updates page is
export const UPDATES_HASH = "#updates";

// "2 October 2026"
export function releaseDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
