import { useRef, useState } from "react";
import {
    IconSquareRoundedX,
    IconChevronLeft,
    IconChevronRight,
    IconCaretLeftFilled,
    IconCaretRightFilled,
    IconCamera,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
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
    const closeButtonRef = useRef(null);

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

    // Escape closes; left/right arrow keys move between monkeys
    useDialog(isModalOpen, closeButtonRef, {
        onClose: handleClose,
        onKeyDown(event) {
            if (event.key === "ArrowLeft" && prevMonkey) {
                handleClick("prev");
            } else if (event.key === "ArrowRight" && nextMonkey) {
                handleClick("next");
            }
        },
    });

    return (
        <AnimatePresence>
            {isModalOpen && (
                <div
                    className="Modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="Modal-title"
                >
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
                            <div className="Modal-close">
                                <button
                                    type="button"
                                    ref={closeButtonRef}
                                    onClick={handleClose}
                                    aria-label="Close"
                                >
                                    <IconSquareRoundedX />
                                </button>
                            </div>
                            <motion.div className="Modal-content">
                                <div className="Modal-header">
                                    <button
                                        type="button"
                                        className={
                                            prevMonkey
                                                ? "Modal-arrowleft"
                                                : "Modal-arrowleft-hidden"
                                        }
                                        onClick={() => handleClick("prev")}
                                        disabled={!prevMonkey}
                                        aria-label="Previous monkey"
                                    >
                                        <IconChevronLeft
                                            className="arrowleft"
                                            stroke="3"
                                        />
                                    </button>

                                    <h1 className="Modal-title" id="Modal-title">
                                        {monkey.name}
                                    </h1>

                                    <button
                                        type="button"
                                        className={
                                            nextMonkey
                                                ? "Modal-arrowright"
                                                : "Modal-arrowright-hidden"
                                        }
                                        onClick={() => handleClick("next")}
                                        disabled={!nextMonkey}
                                        aria-label="Next monkey"
                                    >
                                        <IconChevronRight
                                            className="arrowright"
                                            stroke="3"
                                        />
                                    </button>
                                </div>
                                <div className="Modal-img">
                                    <img
                                        src={monkey.img[currentIndex]}
                                        alt={
                                            monkey.img.length > 1
                                                ? `${monkey.name}, photo ${currentIndex + 1} of ${monkey.img.length}`
                                                : monkey.name
                                        }
                                    ></img>
                                    {monkey.img.length > 1 && (
                                        <div className="Modal-imageButtonBox">
                                            <button
                                                type="button"
                                                className="Modal-imageButton"
                                                onClick={() =>
                                                    handleImgClick("prev")
                                                }
                                                aria-label="Previous photo"
                                            >
                                                <IconCaretLeftFilled />
                                            </button>
                                            <button
                                                type="button"
                                                className="Modal-imageButton"
                                                onClick={() =>
                                                    handleImgClick("next")
                                                }
                                                aria-label="Next photo"
                                            >
                                                <IconCaretRightFilled />
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="Modal-details">
                                    <div className="Modal-icons">
                                        <div
                                            className="iconCamera"
                                            role="img"
                                            aria-label={`${monkey.img.length} ${monkey.img.length === 1 ? "photo" : "photos"}`}
                                        >
                                            <IconCamera aria-hidden="true" />
                                            <span aria-hidden="true">
                                                {monkey.img.length}
                                            </span>
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
