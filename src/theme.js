import { useSyncExternalStore } from "react";

// The site's theme, chosen from the account menu and remembered on this
// device: two dark and two light
//   "dark"            Neon Night (the default)
//   "night-savannah"  Night Savannah
//   "light"           Acacia
//   "pastel-safari"   Pastel Safari
// The page's data-theme is the mode ("dark" / "light": what the light-only
// tweaks in the stylesheets look for); data-palette, the theme when it's
// not its mode's first. The colours are in index.css. index.html sets them
// before the page draws, so there's no flash of the wrong one; this keeps
// them in step after that.

export const THEMES = ["dark", "night-savannah", "light", "pastel-safari"];
const LIGHT = ["light", "pastel-safari"];
const KEY = "vervetdb-theme";
// The browser's own bar colour on phones, matching the top bar
const BAR_COLOUR = { dark: "#121212", "night-savannah": "#16130e", light: "#f9f4e8", "pastel-safari": "#f8fcf9" };

export function currentTheme() {
    const { theme, palette } = document.documentElement.dataset;
    if (THEMES.includes(palette)) return palette;
    return theme === "light" ? "light" : "dark";
}

const listeners = new Set();

export function setTheme(theme) {
    const chosen = THEMES.includes(theme) ? theme : "dark";
    const mode = LIGHT.includes(chosen) ? "light" : "dark";
    const root = document.documentElement;
    root.dataset.theme = mode;
    if (chosen === mode) delete root.dataset.palette;
    else root.dataset.palette = chosen;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", BAR_COLOUR[chosen]);
    document.querySelector('meta[name="color-scheme"]')?.setAttribute("content", mode);
    try {
        localStorage.setItem(KEY, chosen);
    } catch {
        // (private browsing: it just isn't remembered)
    }
    listeners.forEach((listener) => listener());
}

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
