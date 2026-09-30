import ShowPage from "./ShowPage";
import Game from "./Game";
import MonkeyIcon from "./MonkeyIcon";
import { AuthProvider } from "./auth";
import useHashRoute from "./useHashRoute";
import useMonkeyData from "./useMonkeyData";
import "./App.css";

function App() {
    const route = useHashRoute();
    const { status, monkeys, troops, troopIds, monkeySaved, monkeyDeleted } = useMonkeyData();

    if (status === "loading") {
        return (
            <div className="App App-loading" role="status">
                <MonkeyIcon />
                <p>Loading monkeys…</p>
            </div>
        );
    }

    return (
        // AuthProvider: lets any page know who's signed in
        <AuthProvider>
            <div className="App">
                {status === "built-in" && (
                    <p className="App-notice" role="alert">
                        Couldn't reach the database, so this is a saved copy of
                        the monkeys and may be out of date.
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
                        editable={status === "live"}
                        onMonkeySaved={monkeySaved}
                        onMonkeyDeleted={monkeyDeleted}
                    />
                )}
            </div>
        </AuthProvider>
    );
}

export default App;
