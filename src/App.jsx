import { useEffect } from "react";
import ShowPage from "./ShowPage";
import MonkeyIcon from "./MonkeyIcon";
import LoadingSkeleton from "./LoadingSkeleton";
import UpdatePrompt from "./UpdatePrompt";
import { AuthProvider, useAuth } from "./auth";
import useHashRoute from "./useHashRoute";
import useMonkeyData from "./useMonkeyData";
import useOnline from "./useOnline";
import { saveThumbnails } from "./offlinePhotos";
import { isInstalledApp } from "./installApp";
import { timeAgo } from "./savedData";
import "./App.css";

// Saves every photo's thumbnail on the device for offline use, for the
// people who need it: signed-in staff, or anyone using the installed app.
// (Everyone else would use up the database's monthly data allowance.)
// Runs after a short pause, so the page itself loads first.
function SaveThumbnails({ live, monkeys }) {
    const { user } = useAuth();
    const wanted = live && (Boolean(user) || isInstalledApp());
    useEffect(() => {
        if (!wanted) return;
        const timer = setTimeout(() => saveThumbnails(monkeys), 3000);
        return () => clearTimeout(timer);
    }, [wanted]);
    return null;
}

function App() {
    const route = useHashRoute();
    const online = useOnline();
    const {
        status,
        savedAt,
        monkeys,
        troops,
        troopIds,
        enclosures,
        sections,
        enclosuresLive,
        monkeySaved,
        monkeyDeleted,
        enclosureSaved,
    } = useMonkeyData();

    // Loading: grey shapes of the page; the game keeps the simple logo + message
    if (status === "loading" && route !== "game") return <LoadingSkeleton />;
    if (status === "loading") {
        return (
            <div className="App App-loading" role="status">
                <MonkeyIcon />
                <p>Loading monkeys…</p>
            </div>
        );
    }

    let notice = null;
    if (status === "saved") {
        notice = online
            ? `Couldn't reach the database, so these are the monkeys saved on this device ${timeAgo(savedAt)}. Editing is off for now.`
            : `You're offline, so these are the monkeys saved on this device ${timeAgo(savedAt)}. Editing is off until you're back online.`;
    } else if (status === "built-in") {
        notice = "Couldn't reach the database, so this is a saved copy of the monkeys and may be out of date.";
    } else if (!online) {
        notice = "You're offline. Photos you haven't opened before may not show, and editing is off until you're back online.";
    }

    return (
        // AuthProvider: lets any page know who's signed in
        <AuthProvider>
            <div className="App">
                {notice && (
                    <p className="App-notice" role="alert">
                        {notice}
                    </p>
                )}
                {/* Every page (the monkeys, the enclosures, the game) under
                    the same top bar */}
                <ShowPage
                    route={route}
                    enclosures={enclosures}
                    sections={sections}
                    enclosuresLive={status === "live" && Boolean(enclosuresLive)}
                    onEnclosureSaved={enclosureSaved}
                    monkeys={monkeys}
                    troops={troops}
                    troopIds={troopIds}
                    // Editing only when the data is live from the database
                    // and there's a connection to save changes
                    editable={status === "live" && online}
                    onMonkeySaved={monkeySaved}
                    onMonkeyDeleted={monkeyDeleted}
                />
                <UpdatePrompt />
                <SaveThumbnails live={status === "live"} monkeys={monkeys} />
            </div>
        </AuthProvider>
    );
}

export default App;
