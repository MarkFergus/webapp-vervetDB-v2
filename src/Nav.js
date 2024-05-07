import { Component } from "react";
import monkeyIcon from "./monkey-icon.png";
import "./Nav.css";

class Nav extends Component {
    render() {
        return (
            <nav className="Nav">
                <div className="Nav-icon">
                    <img src={monkeyIcon} alt="monkey icon" />
                </div>
                <p className="Nav-title">vervetDB</p>
                <div className="Nav-buttons">
                    {/* <button disabled>Link1</button>
                    <button disabled>Link2</button> */}
                    <button disabled>Sign In</button>
                </div>
            </nav>
        );
    }
}

export default Nav;
