import { useRef, useState } from "react";
import {
    IconSquareRoundedX,
    IconChevronLeft,
    IconChevronRight,
    IconCaretLeftFilled,
    IconCaretRightFilled,
    IconCamera,
    IconDownload,
    IconPencil,
    IconShare,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { drawMonkeyImage } from "./monkeyImage";
import { ageText } from "./ages";
import { monkeyHash, monkeyUrl } from "./monkeyLink";
import { downloadBlob } from "./canvasHelpers";
import "./Modal.css";

function Modal({
    isModalOpen,
    monkey,
    onClose,
    handlePrevNext,
    prevMonkey,
    nextMonkey,
    onEdit, // given only to editors: shows the Edit button
}) {
    // Which of the monkey's photos is showing
    const [currentIndex, setCurrentIndex] = useState(0);
    // After Share on a computer: "copied" or "failed"; Save image: "saving"
    // or "imageFailed"
    const [shareStatus, setShareStatus] = useState(null);
    const closeButtonRef = useRef(null);

    // Phones open their share menu (e.g. WhatsApp) with a link to this
    // monkey; computers copy the link
    async function shareMonkey() {
        const url = monkeyUrl(monkey);
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${monkey.name} · vervetDB`,
                    text: `${monkey.name} (${monkey.troop} troop) on vervetDB`,
                    url,
                });
                return;
            } catch (err) {
                if (err.name === "AbortError") return; // closed the share menu
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setShareStatus("copied");
        } catch {
            setShareStatus("failed");
        }
    }

    // Downloads a picture of this monkey's profile (with the photo showing)
    async function saveImage() {
        setShareStatus("saving");
        try {
            const blob = await drawMonkeyImage(monkey, { photo: monkey.img[currentIndex] });
            downloadBlob(blob, `vervetdb-${monkeyHash(monkey).split("/")[1]}.png`);
            setShareStatus(null);
        } catch (err) {
            console.error("Couldn't make the picture:", err);
            setShareStatus("imageFailed");
        }
    }

    function handleClose() {
        onClose();
        setCurrentIndex(0);
        setShareStatus(null);
    }
    function handleClick(direction) {
        handlePrevNext(direction);
        setCurrentIndex(0);
        setShareStatus(null);
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
                                        Sex: <span>{monkey.sex || "Unknown"}</span>
                                    </h3>
                                    <h3>
                                        Born:{" "}
                                        <span>
                                            {monkey.year
                                                ? `${monkey.year} ${ageText(monkey.year)}`
                                                : "Unknown"}
                                        </span>
                                    </h3>
                                    <h3>
                                        Chip:{" "}
                                        <span>
                                            {monkey.chip ? monkey.chip : "No Chip"}
                                        </span>
                                    </h3>
                                    <h3>
                                        Bio: <span>{monkey.bio || "No bio yet."}</span>
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
                                {/* Edit (editors only) on the left; Share and
                                    Save image on the right */}
                                <div className="Modal-footer">
                                    {onEdit && (
                                        <button
                                            type="button"
                                            className="Modal-edit"
                                            onClick={() => {
                                                setCurrentIndex(0);
                                                onEdit(monkey);
                                            }}
                                        >
                                            <IconPencil size={18} aria-hidden="true" />
                                            Edit
                                        </button>
                                    )}
                                    <span className="Modal-footer-spacer" />
                                    <button type="button" className="Modal-edit" onClick={shareMonkey}>
                                        <IconShare size={18} aria-hidden="true" />
                                        {shareStatus === "copied" ? "Link copied!" : "Share"}
                                    </button>
                                    <button
                                        type="button"
                                        className="Modal-edit"
                                        onClick={saveImage}
                                        disabled={shareStatus === "saving"}
                                    >
                                        <IconDownload size={18} aria-hidden="true" />
                                        {shareStatus === "saving" ? "Saving…" : "Save image"}
                                    </button>
                                </div>
                                <p className="Modal-shareStatus" role="status">
                                    {shareStatus === "copied" &&
                                        "Link copied. Paste it into a message to share this monkey."}
                                    {shareStatus === "failed" &&
                                        "Sorry, your browser wouldn't let us copy the link."}
                                    {shareStatus === "imageFailed" &&
                                        "Sorry, the picture couldn't be made. Please try again."}
                                </p>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default Modal;
