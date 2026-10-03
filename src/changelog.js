// vervetDB's version and what changed in each one. Newest first. Only things
// people using the site will notice; behind-the-scenes work doesn't need a
// line. Each line starts with what kind of change it is, changelog-style:
//   New …       a new feature
//   Improved …  an existing feature works or looks better
//   Fixed …     a bug fixed
// The About pop-up shows the current version, then every version's changes
// under its own heading, newest first: a running changelog.
//
// Version numbers: major.minor.patch
//   major (1.0 → 2.0): a big milestone that changes how vervetDB works
//   minor (1.0 → 1.1): new features people will notice
//   patch (1.0.0 → 1.0.1): small fixes and tweaks
//
// To release a new version: add an entry at the top AND change "version"
// in package.json to match (a test checks they agree).
export const CHANGE_TYPES = ["New", "Improved", "Fixed"];

export const CHANGELOG = [
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

// "2 October 2026"
export function releaseDate(date) {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "long",
        year: "numeric",
    });
}
