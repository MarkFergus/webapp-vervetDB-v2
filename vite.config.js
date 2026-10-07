import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import licenceFile from "./scripts/licenceFile.js";

export default defineConfig({
    plugins: [
        react(),
        // licences.txt: the open-source licences, linked from About
        licenceFile(),
        // Installable app: the manifest (name, icons, own window) and a
        // service worker that keeps the site's files on the device
        VitePWA({
            // A new version waits until the user taps Refresh (UpdatePrompt),
            // so nothing reloads in the middle of a game or an edit
            registerType: "prompt",
            includeAssets: ["favicon.ico", "favicon.svg", "apple-touch-icon.png"],
            manifest: {
                id: "/",
                name: "vervetDB",
                short_name: "vervetDB",
                description: "A web app for the Vervet Monkey Foundation's staff and volunteers to access and update monkey records",
                start_url: "/",
                scope: "/",
                display: "standalone",
                background_color: "#1f1f1f",
                theme_color: "#161616",
                icons: [
                    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
                    // Android crops icons to a circle: this one has room to spare
                    {
                        src: "/icon-maskable-512.png",
                        sizes: "512x512",
                        type: "image/png",
                        purpose: "maskable",
                    },
                ],
            },
            workbox: {
                // Saved on install: the site itself. The Profile Book's PDF
                // maker and its fonts are big, so they're saved the first time
                // someone makes a Profile Book instead (below)
                globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
                // (preview.png is only for link previews, not the app)
                // (the sanctuary map is big: saved the first time it's
                // shown instead, see runtimeCaching)
                globIgnores: ["**/react-pdf*.js", "**/MonkeyPDF*.js", "preview.png", "VMF_Sanctuary_Map.svg"],
                navigateFallback: "/index.html",
                // Other files opened directly (a test page, a PDF) open as
                // themselves, not as the app
                navigateFallbackDenylist: [/^\/(?!index\.html)[^/]+\.[a-z0-9]+$/i],
                // First visit: start saving things for offline use straight
                // away, rather than from the next visit. (New versions still
                // wait for Refresh, see UpdatePrompt.)
                clientsClaim: true,
                runtimeCaching: [
                    // Monkey photos never change at the same address (a new
                    // photo gets a new name), so once saved they're used from
                    // the device. Thumbnails: all of them (~8 MB, saved in the
                    // background, see offlinePhotos.js). Full photos: each one
                    // the first time it's opened. The first rule that matches wins.
                    {
                        urlPattern: ({ url }) =>
                            url.pathname.includes("/storage/v1/object/public/monkey-photos/thumbs/"),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "vervetdb-thumbnails",
                            expiration: { maxEntries: 3000, purgeOnQuotaError: true },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        urlPattern: ({ url }) =>
                            url.pathname.includes("/storage/v1/object/public/monkey-photos/"),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "vervetdb-photos",
                            expiration: { maxEntries: 1500, purgeOnQuotaError: true },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        // The "no photo yet" picture (still on ImgBB)
                        urlPattern: ({ url }) => url.origin === "https://i.ibb.co",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "vervetdb-other-photos",
                            expiration: { maxEntries: 20, purgeOnQuotaError: true },
                            cacheableResponse: { statuses: [200] },
                        },
                    },
                    {
                        // Files in /assets/ never change (their names change instead)
                        urlPattern: ({ url, sameOrigin }) =>
                            sameOrigin && url.pathname.startsWith("/assets/"),
                        handler: "CacheFirst",
                        options: {
                            cacheName: "vervetdb-assets",
                            expiration: { maxEntries: 30 },
                        },
                    },
                    {
                        // The sanctuary map (Enclosures pages)
                        urlPattern: ({ url, sameOrigin }) =>
                            sameOrigin && url.pathname === "/VMF_Sanctuary_Map.svg",
                        handler: "StaleWhileRevalidate",
                        options: { cacheName: "vervetdb-map" },
                    },
                    {
                        urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
                        handler: "StaleWhileRevalidate",
                        options: { cacheName: "google-fonts-css" },
                    },
                    {
                        urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
                        handler: "CacheFirst",
                        options: {
                            cacheName: "google-fonts",
                            expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
                            cacheableResponse: { statuses: [0, 200] },
                        },
                    },
                ],
            },
        }),
    ],
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
        // The service worker helper only exists in a real build: tests use a
        // stand-in that never reports an update
        alias: {
            "virtual:pwa-register/react": fileURLToPath(new URL("./src/testStubs/pwaRegister.js", import.meta.url)),
        },
        // Time limit per test. The default (5s) is too tight for the bigger
        // tests on GitHub's servers, which are slower than a laptop
        testTimeout: 15000,
    },
});
