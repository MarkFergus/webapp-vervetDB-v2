import { useRegisterSW } from "virtual:pwa-register/react";
import "./UpdatePrompt.css";

// A new version of the site has been downloaded: offer to switch to it.
// It waits for the user, so a game or an edit is never reloaded midway.
function UpdatePrompt() {
    const {
        needRefresh: [needRefresh, setNeedRefresh],
        updateServiceWorker,
    } = useRegisterSW();

    if (!needRefresh) return null;

    return (
        <div className="UpdatePrompt" role="status">
            <p>A new version of vervetDB is ready.</p>
            <div className="UpdatePrompt-buttons">
                <button type="button" className="UpdatePrompt-later" onClick={() => setNeedRefresh(false)}>
                    Later
                </button>
                <button type="button" className="UpdatePrompt-refresh" onClick={() => updateServiceWorker(true)}>
                    Refresh
                </button>
            </div>
        </div>
    );
}

export default UpdatePrompt;
