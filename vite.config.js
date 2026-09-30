import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
    plugins: [react()],
    // The site is at the top of its own domain: https://vervetdb.com/
    base: "/",
    server: {
        port: 3000,
        open: true,
    },
    test: {
        // Simulated browser, so components can render in tests
        environment: "jsdom",
        // Allows describe/test/expect without importing them (like Jest)
        globals: true,
        setupFiles: "./src/setupTests.js",
        // Time limit per test. The default (5s) is too tight for the bigger
        // tests on GitHub's servers, which are slower than a laptop
        testTimeout: 15000,
    },
});
