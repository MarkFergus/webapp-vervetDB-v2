import { useRef, useState } from "react";
import {
    IconSquareRoundedX,
    IconChevronLeft,
    IconChevronRight,
    IconMars,
    IconVenus,
    IconDownload,
    IconPencil,
    IconShare,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { drawMonkeyImage } from "./monkeyImage";
import { ageLabel } from "./ages";
import { monkeyHash, monkeyUrl } from "./monkeyLink";
import { downloadBlob } from "./canvasHelpers";
import { thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import "./Modal.css";

function Modal({
    isModalOpen,
    monkey,
    onClose,
    handlePrevNext,
    prevMonkey,
    nextMonkey,
    onEdit, // given only to editors: shows the Edit button
    position, // { number, total }: where this monkey is in the list (optional)
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
                                {/* Name between quiet round previous / next buttons
                                    (kept in place, just hidden, at either end of
                                    the list so the name doesn't shift) */}
                                <div className="Modal-header">
                                    <button
                                        type="button"
                                        className="Modal-monkeyArrow"
                                        onClick={() => handleClick("prev")}
                                        disabled={!prevMonkey}
                                        aria-label="Previous monkey"
                                    >
                                        <IconChevronLeft size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                    <div className="Modal-heading">
                                        <h1 className="Modal-title" id="Modal-title">
                                            {monkey.name}
                                        </h1>
                                        {position && (
                                            <p className="Modal-position">
                                                {position.number} of {position.total}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="Modal-monkeyArrow"
                                        onClick={() => handleClick("next")}
                                        disabled={!nextMonkey}
                                        aria-label="Next monkey"
                                    >
                                        <IconChevronRight size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                </div>
                                <div className="Modal-img">
                                    {/* Offline and never opened: its saved thumbnail instead */}
                                    <img
                                        key={monkey.img[currentIndex]}
                                        src={monkey.img[currentIndex]}
                                        crossOrigin="anonymous"
                                        onError={fallbackTo(thumbUrl(monkey.img[currentIndex]))}
                                        alt={
                                            monkey.img.length > 1
                                                ? `${monkey.name}, photo ${currentIndex + 1} of ${monkey.img.length}`
                                                : monkey.name
                                        }
                                    ></img>
                                    {monkey.img.length > 1 && (
                                        <>
                                            {/* Round buttons over the photo's edges */}
                                            <button
                                                type="button"
                                                className="Modal-imageButton is-prev"
                                                onClick={() => handleImgClick("prev")}
                                                aria-label="Previous photo"
                                            >
                                                <IconChevronLeft stroke={2.5} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="Modal-imageButton is-next"
                                                onClick={() => handleImgClick("next")}
                                                aria-label="Next photo"
                                            >
                                                <IconChevronRight stroke={2.5} aria-hidden="true" />
                                            </button>
                                            {/* Which photo this is (the photo's
                                                description says it in words) */}
                                            <div className="Modal-photoDots" aria-hidden="true">
                                                {monkey.img.map((_, i) => (
                                                    <span
                                                        key={i}
                                                        className={i === currentIndex ? "is-current" : undefined}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* The facts as pills (like the cards and the saved
                                    picture), then the bio and features */}
                                <div className="Modal-details">
                                    <ul className="Modal-pills" aria-label="Details">
                                        <li className="is-troop">{monkey.troop} troop</li>
                                        <li>
                                            {monkey.sex === "male" && <IconMars size={15} stroke={2} aria-hidden="true" />}
                                            {monkey.sex === "female" && <IconVenus size={15} stroke={2} aria-hidden="true" />}
                                            {monkey.sex === "male" ? "Male" : monkey.sex === "female" ? "Female" : "Sex unknown"}
                                        </li>
                                        <li>{monkey.year ? `Born ${monkey.year}` : "Birth year unknown"}</li>
                                        {monkey.year && <li>{ageLabel(monkey.year)}</li>}
                                        <li>{monkey.chip ? `Chip ${monkey.chip}` : "No chip"}</li>
                                    </ul>
                                    <section className="Modal-section">
                                        <h2 className="Modal-label">Bio</h2>
                                        <p>{monkey.bio || "No bio yet."}</p>
                                    </section>
                                    <section className="Modal-section">
                                        <h2 className="Modal-label">Distinctive features &amp; behaviours</h2>
                                        <p className="Modal-details-description">
                                            {monkey.desc ? monkey.desc : "Nothing. Nada. Zilch."}
                                        </p>
                                    </section>
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
                                    <button type="button" className="Modal-edit is-quiet" onClick={shareMonkey}>
                                        <IconShare size={18} aria-hidden="true" />
                                        {shareStatus === "copied" ? "Link copied!" : "Share"}
                                    </button>
                                    <button
                                        type="button"
                                        className="Modal-edit is-quiet"
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
