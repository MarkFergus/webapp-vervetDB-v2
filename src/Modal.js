import React, { Component } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import "./Modal.css";

class Modal extends Component {
    constructor(props) {
        super(props);
        this.closeModal = this.closeModal.bind(this);
    }
    closeModal() {
        console.log("close clicked");
    }
    render() {
        return (
            <div className="Modal">
                <div className="Modal-overlay" onClick={this.closeModal}></div>
                <div className="Modal-window">
                    <div className="Modal-close" onClick={this.closeModal}>
                        <IconSquareRoundedX />
                    </div>
                    <div className="Modal-content">
                        <h1>This is the modal window</h1>
                    </div>
                </div>
            </div>
        );
    }
}

export default Modal;
