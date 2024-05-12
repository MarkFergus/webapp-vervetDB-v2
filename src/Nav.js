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
                    <div className="Nav-searchbar">
                        <div class="Nav-iconSearch">
                            <IconSearch stroke={2} />
                        </div>
                        <input
                            type="text"
                            placeholder="Search name or chip number"
                            name="search"
                            value={this.props.searchValue}
                            onChange={this.props.handleSearch}
                        ></input>
                    </div>
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
            </>
        );
    }
}

export default Nav;
