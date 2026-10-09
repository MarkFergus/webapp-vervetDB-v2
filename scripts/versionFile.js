// A Vite plugin that writes version.json when the site is built: the
// version in package.json, e.g. { "version": "1.5.0" }. The "new version"
// pop-up (src/UpdatePrompt.jsx) reads it to say which version is now live.
// It isn't saved for offline use, so it's always the latest one.

import fs from "node:fs";

export default function versionFile() {
    return {
        name: "vervetdb-version-file",
        apply: "build",
        generateBundle() {
            const { version } = JSON.parse(fs.readFileSync("package.json", "utf8"));
            this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version }) });
        },
    };
}
