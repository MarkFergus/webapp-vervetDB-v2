import { useSyncExternalStore } from "react";

// The site's theme: "dark" (the default) or "light", chosen from the account
// menu, or Theme in the side rail / ☰ menu, and remembered on this device.
// The colours are in index.css (:root, and :root[data-theme="light"]).
// index.html sets it before the page draws, so there's no flash of the
// wrong one; this keeps it in step after that.

export const THEMES = ["dark", "light"];
const KEY = "vervetdb-theme";
// The browser's own bar colour on phones, matching the page
const BAR_COLOUR = { dark: "#121212", light: "#ffffff" };

export function currentTheme() {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const listeners = new Set();

export function setTheme(theme) {
    const chosen = THEMES.includes(theme) ? theme : "dark";
    document.documentElement.dataset.theme = chosen;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOUR[chosen]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", chosen);
    try {
        localStorage.setItem(KEY, chosen);
    } catch {
        // (private browsing: it just isn't remembered)
    }
    listeners.forEach((listener) => listener());
}

export const toggleTheme = () => setTheme(currentTheme() === "dark" ? "light" : "dark");

// The theme now, kept up to date in a component
export function useTheme() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        currentTheme,
        () => "dark"
    );
}
