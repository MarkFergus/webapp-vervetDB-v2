import { Component } from "react";
import {
    IconSearch,
    IconX,
    IconFileTypePdf,
    IconHourglassLow,
} from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
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
                        <div className="Nav-iconSearch">
                            <IconSearch stroke={2} />
                        </div>
                        <input
                            type="text"
                            placeholder="Name or chip number"
                            name="search"
                            value={this.props.searchValue}
                            onChange={this.props.handleSearch}
                        ></input>
                        {this.props.searchValue.length > 0 && (
                            <div
                                className="Nav-iconX"
                                onClick={this.props.handleDelete}
                            >
                                <IconX stroke={2} />
                            </div>
                        )}
                    </div>
                    <div className="Nav-buttons">
                        <button
                            onClick={this.props.togglePDFModal}
                            disabled={this.props.isGeneratingPDF}
                        >
                            {this.props.isGeneratingPDF ? (
                                <IconHourglassLow
                                    className="hourglass"
                                    stroke="2"
                                    size="32"
                                />
                            ) : (
                                <IconFileTypePdf stroke="2" size="36" />
                            )}
                        </button>
                    </div>
                </nav>
                <div className="Nav-pdfmodal">
                    <ModalPDF
                        closePDFModal={this.props.togglePDFModal}
                        isPDFModalOpen={this.props.isPDFModalOpen}
                        createPDF={this.props.createPDF}
                    />
                </div>
            </>
        );
    }
}

export default Nav;
