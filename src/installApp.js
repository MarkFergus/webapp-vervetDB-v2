import { useEffect, useState } from "react";

// Installing vervetDB as an app.
// Chrome, Edge, Brave and Android offer installing through a
// "beforeinstallprompt" event; it's kept here so an Install button can use
// it later. It fires early, so listening starts when the site loads
// (index.jsx). Other browsers (iPhone, Firefox) need steps instead.

let installEvent = null;
let installedHere = false;
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener());

export function listenForInstall() {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault(); // offered from our own button instead
        installEvent = event;
        notify();
    });
    window.addEventListener("appinstalled", () => {
        installEvent = null;
        installedHere = true;
        notify();
    });
}

// Already open as the installed app (its own window, no address bar)?
export function isInstalledApp() {
    return (
        window.matchMedia?.("(display-mode: standalone)").matches ||
        navigator.standalone === true // iPhone
    );
}

// Which install steps to show: "iphone", "android", "firefox" or "computer"
export function installPlatform(userAgent = navigator.userAgent, touchPoints = navigator.maxTouchPoints) {
    // iPads report themselves as Macs, but have touch screens
    if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && touchPoints > 1)) {
        return "iphone";
    }
    if (/Android/.test(userAgent)) return "android";
    if (/Firefox\//.test(userAgent)) return "firefox";
    return "computer";
}

// For the pop-up: { installed, canInstall, install() }
export function useInstallApp() {
    const [, rerender] = useState(0);
    useEffect(() => {
        const listener = () => rerender((n) => n + 1);
        listeners.add(listener);
        return () => listeners.delete(listener);
    }, []);

    async function install() {
        if (!installEvent) return;
        installEvent.prompt();
        const { outcome } = await installEvent.userChoice;
        if (outcome === "accepted") installedHere = true;
        installEvent = null; // each one can only be used once
        notify();
    }

    return {
        installed: installedHere || isInstalledApp(),
        canInstall: Boolean(installEvent),
        install,
    };
}
