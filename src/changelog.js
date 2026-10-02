// vervetDB's version and what changed in each one, shown in the About
// pop-up. Newest first. Only things people using the site will notice;
// behind-the-scenes work doesn't need a line.
//
// Version numbers: major.minor.patch
//   major (1.0 → 2.0): a big milestone that changes how vervetDB works
//   minor (1.0 → 1.1): new features people will notice
//   patch (1.0.0 → 1.0.1): small fixes and tweaks
//
// To release a new version: add an entry at the top AND change "version"
// in package.json to match (a test checks they agree).
export const CHANGELOG = [
    {
        version: "1.0.0",
        date: "2026-10-02",
        changes: [
            "Install vervetDB as an app on your phone or computer",
            "Works offline: the monkeys and their photos are saved on your device",
            "Sharper photos on phones, with two monkeys per row",
            "New, sharp vervetDB app icon",
            "Change your password from the Account pop-up on any device",
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
