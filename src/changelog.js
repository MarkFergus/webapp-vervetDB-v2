// vervetDB's version and what changed in each one. Newest first. Only things
// people using the site will notice; behind-the-scenes work doesn't need a
// line. Each line starts with what kind of change it is, changelog-style:
//   New / Added …  a new feature
//   Improved …     an existing feature works or looks better
//   Fixed …        a bug fixed
// The About pop-up shows the current version, then every version's changes
// under its own heading, newest first: a running changelog.
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

// About shows every version in the current series (same major.minor as the
// latest, e.g. 1.1.1 and 1.1.0); older ones fold away under "Earlier
// versions". So 1.2.0 starts a fresh list, and 1.1.x moves to "Earlier".
export function currentSeries(changelog) {
    const series = (version) => version.split(".").slice(0, 2).join(".");
    const latest = series(changelog[0].version);
    return {
        current: changelog.filter((entry) => series(entry.version) === latest),
        earlier: changelog.filter((entry) => series(entry.version) !== latest),
    };
}

// "2 October 2026"
export function releaseDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
