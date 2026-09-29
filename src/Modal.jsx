import { useState } from "react";
import {
    IconSquareRoundedX,
    IconChevronLeft,
    IconChevronRight,
    IconCaretLeftFilled,
    IconCaretRightFilled,
    IconCamera,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import "./Modal.css";

function Modal({
    isModalOpen,
    monkey,
    onClose,
    handlePrevNext,
    prevMonkey,
    nextMonkey,
}) {
    // Which of the monkey's photos is showing
    const [currentIndex, setCurrentIndex] = useState(0);

    function handleClose() {
        onClose();
        setCurrentIndex(0);
    }
    function handleClick(direction) {
        handlePrevNext(direction);
        setCurrentIndex(0);
    }
    function handleImgClick(direction) {
        const count = monkey.img.length;
        if (direction === "prev") {
            setCurrentIndex((i) => (i - 1 + count) % count);
        } else if (direction === "next") {
            setCurrentIndex((i) => (i + 1) % count);
        }
    }

    return (
        <AnimatePresence>
            {isModalOpen && (
                <div className="Modal">
                    <motion.div
                        className="Modal-overlay"
                        onClick={handleClose}
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
                            <div className="Modal-close" onClick={handleClose}>
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
                                        onClick={() => handleClick("prev")}
                                    >
                                        <IconChevronLeft
                                            className="arrowleft"
                                            stroke="3"
                                        />
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
                                        onClick={() => handleClick("next")}
                                    >
                                        <IconChevronRight
                                            className="arrowright"
                                            stroke="3"
                                        />
                                    </div>
                                </div>
                                <div className="Modal-img">
                                    <img
                                        src={monkey.img[currentIndex]}
                                        alt={monkey.name}
                                    ></img>
                                    {monkey.img.length > 1 && (
                                        <div className="Modal-imageButtonBox">
                                            <button
                                                className="Modal-imageButton"
                                                onClick={() =>
                                                    handleImgClick("prev")
                                                }
                                            >
                                                <IconCaretLeftFilled />
                                            </button>
                                            <button
                                                className="Modal-imageButton"
                                                onClick={() =>
                                                    handleImgClick("next")
                                                }
                                            >
                                                <IconCaretRightFilled />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="Modal-details">
                                    <div className="Modal-icons">
                                        <div className="iconCamera">
                                            <IconCamera />
                                            <span>{monkey.img.length}</span>
                                        </div>
                                    </div>
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
                                        Chip:{" "}
                                        <span>
                                            {monkey.chip ? monkey.chip : "No Chip"}
                                        </span>
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

export default Modal;
