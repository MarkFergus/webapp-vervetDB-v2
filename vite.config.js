import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // GitHub Pages serves the site from /webapp-vervetDB-v2/
    base: "/webapp-vervetDB-v2/",
    server: {
        port: 3000,
        open: true,
    },
});
