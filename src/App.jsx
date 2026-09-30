import ShowPage from "./ShowPage";
import Game from "./Game";
import useHashRoute from "./useHashRoute";
import "./App.css";

function App() {
    const route = useHashRoute();
    return (
        <div className="App">{route === "game" ? <Game /> : <ShowPage />}</div>
    );
}

export default App;
