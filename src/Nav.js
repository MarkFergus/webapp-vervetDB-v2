import { Component } from "react";
import { IconSearch } from "@tabler/icons-react";
import monkeyIcon from "./monkey-icon.png";
import "./Nav.css";

class Nav extends Component {
    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick() {
        this.props.createPDF();
    }

    render() {
        return (
            <>
                <nav className="Nav">
                    <div className="Nav-icon">
                        <img src={monkeyIcon} alt="monkey icon" />
                    </div>
                    <p className="Nav-title">vervetDB</p>
                    <div className="Nav-buttons">
                        <button
                            onClick={this.handleClick}
                            disabled={this.props.isGeneratingPDF}
                        >
                            {this.props.isGeneratingPDF
                                ? "Downloading..."
                                : "Create PDF"}
                        </button>
                    </div>
                </nav>
                <div className="Nav-searchbar">
                    <input
                        type="text"
                        placeholder="Search for a name or chip number"
                        name="search"
                        value={this.props.searchValue}
                        onChange={this.props.handleSearchInputChange}
                    ></input>
                    <button onClick={this.props.handleSearch}>
                        <IconSearch stroke={2} />
                    </button>
                </div>
            </>
        );
    }
}

export default Nav;
