// Windows ignores capitals in file names, so "./MonkeyForm" can pick up
// monkeyForm.js instead of MonkeyForm.jsx (this happened twice). This fails
// if any two files in src/ have names that differ only in capitals.
import fs from "node:fs";
import path from "node:path";

test("no two files in src/ differ only in capital letters", () => {
    const dir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"));
    const baseName = (file) => file.replace(/\.[^.]+$/, ""); // without .js / .jsx / .css
    const groups = {};
    for (const file of fs.readdirSync(dir)) {
        const key = baseName(file).toLowerCase();
        (groups[key] ??= new Set()).add(baseName(file));
    }
    const clashes = Object.values(groups)
        .filter((names) => names.size > 1)
        .map((names) => [...names].join(" / "));
    expect(clashes).toEqual([]);
});
