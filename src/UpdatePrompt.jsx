import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { IconLoader2 } from "@tabler/icons-react";
import "./UpdatePrompt.css";

// A new version of the site has been downloaded: offer to switch to it,
// e.g. "Version 1.5.0 is now live!" (the number from version.json, written
// at build time: scripts/versionFile.js). It waits for the user, so a game
// or an edit is never reloaded midway; reloading the page doesn't switch,
// Update does. Switching takes a few seconds (the new version takes over,
// then the page reloads), so meanwhile it says so, with a spinner.

// (the switch hasn't reloaded the page by then: reload it anyway)
export const UPDATE_GIVE_UP_MS = 10000;

const reloadPage = () => window.location.reload();

// reload: the page's reload (tests give their own)
function UpdatePrompt({ reload = reloadPage }) {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW();
    // The new version's number: undefined while asking, null if it couldn't
    // be found (offline, say): then it just says a new version is live
    const [version, setVersion] = useState(undefined);
    // Update pressed: switching
    const [updating, setUpdating] = useState(false);

    useEffect(() => {
        if (!needRefresh) return;
        let cancelled = false;
        fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" })
            .then((response) => (response.ok ? response.json() : null))
            .then((data) => !cancelled && setVersion(data?.version ?? null))
            .catch(() => !cancelled && setVersion(null));
        return () => {
            cancelled = true;
        };
    }, [needRefresh]);

    useEffect(() => {
        if (!updating) return;
        const timer = setTimeout(reload, UPDATE_GIVE_UP_MS);
        return () => clearTimeout(timer);
    }, [updating, reload]);

    // (shown once the number's known, so the words don't change under you)
    if (!needRefresh || version === undefined) return null;

    function update() {
        setUpdating(true);
        updateServiceWorker(true);
    }

    return (
        <div className="UpdatePrompt" role="status" aria-busy={updating}>
            <p>
                {updating
                    ? version
                        ? `Updating to version ${version}…`
                        : "Updating vervetDB…"
                    : version
                      ? `Version ${version} is now live!`
                      : "A new version of vervetDB is now live!"}
            </p>
            <div className="UpdatePrompt-buttons">
                {!updating && (
                    <button type="button" className="UpdatePrompt-later" onClick={() => setNeedRefresh(false)}>
                        Later
                    </button>
                )}
                <button type="button" className="UpdatePrompt-refresh" onClick={update} disabled={updating}>
                    {updating && <IconLoader2 className="UpdatePrompt-spinner" size={16} stroke={2.5} aria-hidden="true" />}
                    {updating ? "Updating…" : "Update"}
                </button>
            </div>
        </div>
    );
}

export default UpdatePrompt;
