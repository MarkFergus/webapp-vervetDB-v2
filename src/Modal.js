import React, { Component } from "react";
import {
    IconSquareRoundedX,
    IconChevronLeft,
    IconChevronRight,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import "./Modal.css";

class Modal extends Component {
    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick(direction) {
        this.props.handlePrevNext(direction);
    }
    render() {
        const { isModalOpen, monkey, onClose, prevMonkey, nextMonkey } =
            this.props;
        return (
            <AnimatePresence>
                {isModalOpen && (
                    <div className="Modal">
                        <motion.div
                            className="Modal-overlay"
                            onClick={onClose}
                            initial={{ opacity: 0 }}
                            animate={{
                                opacity: 1,
                                transition: {
                                    duration: 0.3,
                                },
                            }}
                            exit={{
                                opacity: 0,
                            }}
                        ></motion.div>
                        <motion.div
                            className="Modal-windowbox"
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{
                                scale: 1,
                                opacity: 1,
                                transition: {
                                    duration: 0.3,
                                },
                            }}
                            exit={{
                                scale: 0,
                                opacity: 0,
                            }}
                        >
                            <div className="Modal-window">
                                <div className="Modal-close" onClick={onClose}>
                                    <IconSquareRoundedX />
                                </div>
                                <motion.div className="Modal-content">
                                    <div className="Modal-header">
                                        <div
                                            className={
                                                prevMonkey
                                                    ? "Modal-arrowleft"
                                                    : "Modal-arrowleft-hidden"
                                            }
                                            onClick={() =>
                                                this.handleClick("prev")
                                            }
                                        >
                                            <IconChevronLeft className="arrowleft" />
                                        </div>

                                        <h1 className="Modal-title">
                                            {monkey.name}
                                        </h1>

                                        <div
                                            className={
                                                nextMonkey
                                                    ? "Modal-arrowright"
                                                    : "Modal-arrowright-hidden"
                                            }
                                            onClick={() =>
                                                this.handleClick("next")
                                            }
                                        >
                                            <IconChevronRight className="arrowright" />
                                        </div>
                                    </div>
                                    <div className="Modal-img">
                                        <img
                                            src={monkey.img[0]}
                                            alt={monkey.name}
                                        ></img>
                                    </div>
                                    <div className="Modal-details">
                                        <h3>
                                            Troop: <span>{monkey.troop}</span>
                                        </h3>
                                        <h3>
                                            Sex: <span>{monkey.sex}</span>
                                        </h3>
                                        <h3>
                                            Born: <span>{monkey.year}</span>
                                        </h3>
                                        <h3>
                                            Chip: <span>{monkey.chip}</span>
                                        </h3>
                                        <h3>
                                            Bio: <span>{monkey.bio}</span>
                                        </h3>
                                        <h3>
                                            Distinctive features/behaviours:{" "}
                                            <span className="Modal-details-description">
                                                {monkey.desc
                                                    ? monkey.desc
                                                    : "Nothing. Nada. Zilch."}
                                            </span>
                                        </h3>
                                    </div>
                                </motion.div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        );
    }
}

export default Modal;
