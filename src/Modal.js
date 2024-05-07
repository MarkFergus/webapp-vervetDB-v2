import React, { Component } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import "./Modal.css";

class Modal extends Component {
    render() {
        const { isModalOpen, monkey, onClose } = this.props;
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
                            initial={{ scale: 0 }}
                            animate={{
                                scale: 1,
                                transition: {
                                    duration: 0.3,
                                },
                            }}
                            exit={{
                                scale: 0,
                            }}
                        >
                            <div className="Modal-window">
                                <div className="Modal-close" onClick={onClose}>
                                    <IconSquareRoundedX />
                                </div>
                                <motion.div className="Modal-content">
                                    <h1 className="Modal-title">
                                        {monkey.name}
                                    </h1>
                                    <div className="Modal-img">
                                        <img
                                            src={monkey.img}
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
                                            Chip: <span>42888</span>
                                        </h3>
                                        <h3>
                                            Bio:{" "}
                                            <span>
                                                Arrived as orphan together with
                                                another orphan. Mother was
                                                killed by a velociraptor. Really
                                                likes toast. Fostered by Big
                                                Mama.
                                            </span>
                                        </h3>
                                        <h3>
                                            Description:{" "}
                                            <span>
                                                Golden coat, pacthy silhouettes
                                                around eyes, slight notch on
                                                left ear.
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
