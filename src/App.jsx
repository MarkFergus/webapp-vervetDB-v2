import ShowPage from "./ShowPage";
import Game from "./Game";
import MonkeyIcon from "./MonkeyIcon";
import useHashRoute from "./useHashRoute";
import useMonkeyData from "./useMonkeyData";
import "./App.css";

function App() {
    const route = useHashRoute();
    const { status, monkeys, troops } = useMonkeyData();

    if (status === "loading") {
        return (
            <div className="App App-loading" role="status">
                <MonkeyIcon />
                <p>Loading monkeys…</p>
            </div>
        );
    }

    return (
        <div className="App">
            {status === "built-in" && (
                <p className="App-notice" role="alert">
                    Couldn't reach the database, so this is a saved copy of the
                    monkeys and may be out of date.
                </p>
            )}
            {route === "game" ? (
                <Game monkeys={monkeys} troops={troops} />
            ) : (
                <ShowPage monkeys={monkeys} troops={troops} />
            )}
        </div>
    );
}

export default App;
