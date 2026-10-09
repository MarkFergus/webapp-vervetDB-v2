import { useEffect, useState } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";
import "./UpdatePrompt.css";

// A new version of the site has been downloaded: offer to switch to it,
// e.g. "Version 1.5.0 is now live!" (the number from version.json, written
// at build time: scripts/versionFile.js). It waits for the user, so a game
// or an edit is never reloaded midway; reloading the page doesn't switch,
// Update does.
function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW();
    // The new version's number: undefined while asking, null if it couldn't
    // be found (offline, say): then it just says a new version is live
    const [version, setVersion] = useState(undefined);

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

    // (shown once the number's known, so the words don't change under you)
    if (!needRefresh || version === undefined) return null;

    return (
        <div className="UpdatePrompt" role="status">
            <p>{version ? `Version ${version} is now live!` : "A new version of vervetDB is now live!"}</p>
            <div className="UpdatePrompt-buttons">
                <button type="button" className="UpdatePrompt-later" onClick={() => setNeedRefresh(false)}>
                    Later
                </button>
                <button type="button" className="UpdatePrompt-refresh" onClick={() => updateServiceWorker(true)}>
                    Update
                </button>
            </div>
        </div>
    );
}

export default UpdatePrompt;
