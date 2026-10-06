// A Vite plugin that writes licences.txt when the site is built: the
// licence text of every open-source package bundled into the site, plus the
// fonts. Linked from About → Open-Source Licences ("Full Licence Texts").
// Only packages that actually end up in the site are listed (not test or
// build tools), so it's never out of date.

import fs from "node:fs";
import path from "node:path";

// The fonts: bundled in the Profile Book PDF (Open Sans, Russo One) or
// loaded from Google Fonts (Nunito Sans, Syne, Russo One). All use the
// SIL Open Font License (scripts/OFL.txt).
const FONTS = [
    ["Nunito Sans", "Copyright 2016 The Nunito Sans Project Authors (https://github.com/Fonthausen/NunitoSans)"],
    ["Open Sans", "Copyright 2020 The Open Sans Project Authors (https://github.com/googlefonts/opensans)"],
    ["Russo One", 'Copyright (c) 2011-2012, Jovanny Lemonad (jovanny.ru), with Reserved Font Name "Russo"'],
    ["Syne", "Copyright 2017 The Syne Project Authors (https://gitlab.com/bonjour-monde/fonderie/syne-typeface)"],
];

const LINE = "=".repeat(72);

// "/…/node_modules/@scope/name/dist/x.js" → "/…/node_modules/@scope/name"
// (the last node_modules in the path, for packages inside packages)
function packageFolder(file) {
    const parts = file.replace(/\\/g, "/").split("/");
    const i = parts.lastIndexOf("node_modules");
    if (i === -1) return null;
    const size = parts[i + 1]?.startsWith("@") ? 3 : 2;
    return parts.slice(0, i + size).join("/");
}

// A package's licence file (LICENSE, LICENCE.md, license.txt …), if it has one
function licenceText(folder) {
    const file = fs
        .readdirSync(folder)
        .find((name) => /^(licen[cs]e|copying)(\.(md|txt))?$/i.test(name));
    return file ? fs.readFileSync(path.join(folder, file), "utf8").trim() : null;
}

// The standard MIT and ISC texts, for packages that say they're MIT / ISC
// in package.json but don't include a licence file
const STANDARD = {
    MIT: `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`,
    ISC: `Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.`,
};

// "Name <email> (site)" or { name } → "Name"
function authorName(author) {
    const text = typeof author === "string" ? author : author?.name;
    return text ? text.replace(/\s*[<(].*$/, "").trim() : null;
}

function packageEntry(folder) {
    const info = JSON.parse(fs.readFileSync(path.join(folder, "package.json"), "utf8"));
    let text = licenceText(folder);
    let licence = typeof info.license === "string" ? info.license : null;
    // No licence in package.json: tell from the licence file itself
    if (!licence && text) licence = /^\W*MIT License/i.test(text) ? "MIT" : "see below";
    if (!text) {
        const owner = authorName(info.author) ?? `the ${info.name} authors`;
        text = STANDARD[licence]
            ? `${licence} License

Copyright (c) ${owner}

${STANDARD[licence]}`
            : `${licence ?? "Unknown"} licence (no licence file included in the package)`;
    }
    return { name: info.name, version: info.version, licence: licence ?? "unknown", text };
}

export default function licenceFile() {
    return {
        name: "vervetdb-licence-file",
        apply: "build",
        generateBundle(_options, bundle) {
            // Every package with code in the site's files
            const folders = new Set();
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== "chunk") continue;
                for (const id of chunk.moduleIds ?? Object.keys(chunk.modules)) {
                    const folder = packageFolder(id.replace(/^\0/, "").split("?")[0]);
                    if (folder && fs.existsSync(path.join(folder, "package.json"))) folders.add(folder);
                }
            }
            // One entry per package name (the same package can sit in two places)
            const packages = new Map();
            for (const folder of folders) {
                const entry = packageEntry(folder);
                if (!packages.has(entry.name)) packages.set(entry.name, entry);
            }
            const sorted = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name));

            const ofl = fs.readFileSync(new URL("./OFL.txt", import.meta.url), "utf8").trim();
            const text = [
                "vervetDB: open-source licences",
                "",
                "vervetDB is built with the open-source software and fonts below.",
                "Thank you to everyone who made and shared them.",
                "",
                "Contents:",
                ...sorted.map((p) => `  ${p.name} ${p.version} (${p.licence})`),
                ...FONTS.map(([font]) => `  ${font} font (OFL-1.1)`),
                "",
                ...sorted.flatMap((p) => [LINE, `${p.name} ${p.version} (${p.licence})`, LINE, "", p.text, ""]),
                LINE,
                `Fonts: ${FONTS.map(([font]) => font).join(", ")} (OFL-1.1)`,
                LINE,
                "",
                ...FONTS.map(([, copyright]) => copyright),
                "",
                ofl,
                "",
            ].join("\n");

            this.emitFile({ type: "asset", fileName: "licences.txt", source: text });
        },
    };
}
