import React, { Component } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
import "./ModalPDF.css";

class ModalPDF extends Component {
    constructor(props) {
        super(props);
        this.handleClick = this.handleClick.bind(this);
    }
    handleClick() {
        this.props.createPDF();
        this.props.closePDFModal();
    }
    render() {
        const { isPDFModalOpen, onClose } = this.props;
        return (
            <AnimatePresence>
                {isPDFModalOpen && (
                    <div className="ModalPDF">
                        <motion.div
                            className="ModalPDF-overlay"
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
                            className="ModalPDF-windowbox"
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
                            <div className="ModalPDF-window">
                                <div
                                    className="ModalPDF-close"
                                    onClick={this.props.closePDFModal}
                                >
                                    <IconSquareRoundedX />
                                </div>
                                <motion.div className="ModalPDF-content">
                                    <h1 className="ModalPDF-title">
                                        Create Profile Book
                                    </h1>
                                    <div className="ModalPDF-details">
                                        <h3>
                                            This will create a create a profile
                                            book PDF for the monkeys currently
                                            displayed.
                                        </h3>
                                    </div>
                                    <div className="ModalPDF-Btns">
                                        <button
                                            className="ModalPDF-createBtn"
                                            onClick={this.handleClick}
                                        >
                                            Create PDF
                                        </button>
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

export default ModalPDF;
