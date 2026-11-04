// npm run brief:build: bundles the website's Morning Brief rules into one
// file for Supabase's function (supabase/functions/morning-brief/bundle.js).
import { fileURLToPath } from "node:url";
import { build } from "vite";

const at = (path) => fileURLToPath(new URL(path, import.meta.url));

await build({
    configFile: false,
    publicDir: false,
    logLevel: "warn",
    plugins: [
        {
            // (the function's own database connection, not the website's)
            name: "morning-brief-supabase",
            enforce: "pre",
            resolveId(source) {
                return /(^|\/)supabase$/.test(source) ? at("./morningBriefSupabase.js") : null;
            },
        },
    ],
    build: {
        ssr: at("./morningBriefServer.js"),
        outDir: at("../supabase/functions/morning-brief"),
        emptyOutDir: false,
        minify: false,
        rollupOptions: {
            external: [/^npm:/],
            output: { entryFileNames: "bundle.js", format: "es" },
        },
    },
});
