import { useEffect } from "react";
import ShowPage from "./ShowPage";
import Game from "./Game";
import MonkeyIcon from "./MonkeyIcon";
import UpdatePrompt from "./UpdatePrompt";
import { AuthProvider } from "./auth";
import useHashRoute from "./useHashRoute";
import useMonkeyData from "./useMonkeyData";
import useOnline from "./useOnline";
import { saveThumbnails } from "./offlinePhotos";
import { timeAgo } from "./savedData";
import "./App.css";

function App() {
    const route = useHashRoute();
    const online = useOnline();
    const { status, savedAt, monkeys, troops, troopIds, monkeySaved, monkeyDeleted } = useMonkeyData();

    // Live data: save every photo's thumbnail on the device for offline use
    // (after a short pause, so the page itself loads first)
    useEffect(() => {
        if (status !== "live") return;
        const timer = setTimeout(() => saveThumbnails(monkeys), 3000);
        return () => clearTimeout(timer);
    }, [status]);

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
                {route === "game" ? (
                    <Game monkeys={monkeys} troops={troops} />
                ) : (
                    <ShowPage
                        monkeys={monkeys}
                        troops={troops}
                        troopIds={troopIds}
                        // Editing only when the data is live from the database
                        // and there's a connection to save changes
                        editable={status === "live" && online}
                        onMonkeySaved={monkeySaved}
                        onMonkeyDeleted={monkeyDeleted}
                    />
                )}
                <UpdatePrompt />
            </div>
        </AuthProvider>
    );
}

export default App;
