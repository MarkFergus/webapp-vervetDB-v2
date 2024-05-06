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
                <div className="Modal-windowbox">
                    <div className="Modal-window">
                        <div className="Modal-close" onClick={this.toggleModal}>
                            <IconSquareRoundedX />
                        </div>
                        <div className="Modal-content">
                            <h1 className="Modal-title">
                                {this.props.monkey.name}
                            </h1>
                            <div className="Modal-img">
                                <img
                                    src={this.props.monkey.img}
                                    alt={this.props.monkey.name}
                                ></img>
                            </div>
                            <div className="Modal-details">
                                <h3>
                                    Troop:{" "}
                                    <span>{this.props.monkey.troop}</span>
                                </h3>
                                <h3>
                                    Sex: <span>{this.props.monkey.sex}</span>
                                </h3>
                                <h3>
                                    Born: <span>{this.props.monkey.year}</span>
                                </h3>
                                <h3>
                                    Chip: <span>42888</span>
                                </h3>
                                <h3>
                                    Bio:{" "}
                                    <span>
                                        Arrived as orphan together with another
                                        orphan. Mother was killed by a
                                        velociraptor. Really likes toast.
                                        Fostered by Big Mama.
                                    </span>
                                </h3>
                                <h3>
                                    Description:{" "}
                                    <span>
                                        Golden coat, pacthy silhouettes around
                                        eyes, slight notch on left ear.
                                    </span>
                                </h3>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

export default Modal;
