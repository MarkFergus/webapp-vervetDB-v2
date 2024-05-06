import React, { Component } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import "./Modal.css";

class Modal extends Component {
    constructor(props) {
        super(props);
        this.toggleModal = this.toggleModal.bind(this);
    }
    toggleModal() {
        this.props.toggleModal();
    }
    render() {
        return (
            <div className="Modal">
                <div className="Modal-overlay" onClick={this.toggleModal}></div>
                <div className="Modal-window">
                    <div className="Modal-close" onClick={this.toggleModal}>
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
