import { useEffect, useRef } from "react";
import { IconCircleCheckFilled, IconDownload, IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { BABIES_BOOK, bookTitle } from "./profileBook";
import { currentBabySeason } from "./ages";
import "./ModalPDF.css";

// Firefox on Android: saving can fail in its home-screen app (opens a blank
// page), so a note warns about it
const IS_FIREFOX_ANDROID = /Android/.test(navigator.userAgent) && /Firefox\//.test(navigator.userAgent);

// Largest troop is ~55, so anything over this is probably "All Troops"
const LARGE_PDF_THRESHOLD = 60;

function ModalPDF({
    isPDFModalOpen,
    closePDFModal,
    createPDF,
    isGeneratingPDF,
    progress,
    error,
    monkeyCount,
    // The troop picker: the book chosen ("Goliath", or BABIES_BOOK), the
    // troops to choose from, and what to call when the choice changes
    book,
    troops,
    onChooseBook,
    // The finished book ({ blob, filename }), waiting for Save PDF
    ready,
    onSave,
}) {
    const plural = monkeyCount === 1 ? "monkey" : "monkeys";
    const troopNote = bookTitle(book);

    let status = null;
    if (progress && progress.done < progress.total) {
        status = `Preparing photos ${progress.done} of ${progress.total}…`;
    } else if (progress) {
        status = "Building PDF…";
    }

    // Escape closes; focus starts on the close button
    const closeButtonRef = useRef(null);
    useDialog(isPDFModalOpen, closeButtonRef, { onClose: closePDFModal });

    // Book ready: Save PDF gets the focus, ready for Enter
    const saveButtonRef = useRef(null);
    useEffect(() => {
        if (ready) saveButtonRef.current?.focus();
    }, [ready]);
    const readySize = ready
        ? `${Math.max(0.1, Math.round((ready.blob.size / 1048576) * 10) / 10)} MB`
        : "";

    return (
        <AnimatePresence>
            {isPDFModalOpen && (
                <div
                    className="ModalPDF"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="ModalPDF-title"
                >
                    <motion.div
                        className="ModalPDF-overlay"
                        onClick={closePDFModal}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            transition: {
                                duration: 0.2,
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
                                duration: 0.2,
                            },
                        }}
                        exit={{
                            scale: 0,
                            opacity: 0,
                        }}
                    >
                        <div className="ModalPDF-window">
                            <div className="ModalPDF-close">
                                <button
                                    type="button"
                                    ref={closeButtonRef}
                                    onClick={closePDFModal}
                                    aria-label="Close"
                                >
                                    <IconSquareRoundedX />
                                </button>
                            </div>
                            <motion.div className="ModalPDF-content">
                                <h1
                                    className="ModalPDF-title"
                                    id="ModalPDF-title"
                                >
                                    Create Profile Book
                                </h1>
                                <div>
                                    <p className="ModalPDF-details">
                                        Creates a formatted Troop Profile Book
                                        PDF file.
                                    </p>
                                    <label className="ModalPDF-troop">
                                        Troop
                                        <select
                                            value={book}
                                            onChange={(e) => onChooseBook(e.target.value)}
                                            disabled={isGeneratingPDF}
                                        >
                                            {troops.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                            {/* This season's babies, from every troop */}
                                            <option value={BABIES_BOOK}>
                                                Orphans/Babies ({currentBabySeason()})
                                            </option>
                                        </select>
                                    </label>
                                    <p className="ModalPDF-subdetails">
                                        {monkeyCount === 0 ? (
                                            "No monkeys in this troop yet."
                                        ) : (
                                            <>
                                                This Profile Book will contain{" "}
                                                <span className="ModalPDF-line">
                                                    <b>
                                                        {monkeyCount} {plural}
                                                    </b>{" "}
                                                    from <b>{troopNote}</b>.
                                                </span>
                                            </>
                                        )}
                                    </p>
                                    {monkeyCount > LARGE_PDF_THRESHOLD && (
                                        <p className="ModalPDF-warning">
                                            Large PDFs can take several minutes
                                            to create.{" "}
                                            <span className="ModalPDF-line">
                                                Tip: pick a troop in the filter
                                                first.
                                            </span>
                                        </p>
                                    )}
                                    {ready && (
                                        <p className="ModalPDF-ready" role="status">
                                            <IconCircleCheckFilled size={18} aria-hidden="true" />
                                            Your Profile Book is ready ({readySize})
                                        </p>
                                    )}
                                    {status && (
                                        <p
                                            className="ModalPDF-status"
                                            role="status"
                                        >
                                            {status}
                                        </p>
                                    )}
                                    {error && (
                                        <p
                                            className="ModalPDF-error"
                                            role="alert"
                                        >
                                            {error}
                                        </p>
                                    )}
                                </div>
                                <div className="ModalPDF-Btns">
                                    {ready ? (
                                        <button
                                            ref={saveButtonRef}
                                            className="ModalPDF-createBtn is-save"
                                            onClick={onSave}
                                        >
                                            <IconDownload size={18} aria-hidden="true" />
                                            Save PDF
                                        </button>
                                    ) : (
                                        <button
                                            disabled={
                                                isGeneratingPDF || monkeyCount === 0
                                            }
                                            className="ModalPDF-createBtn"
                                            onClick={createPDF}
                                        >
                                            {isGeneratingPDF
                                                ? "Creating…"
                                                : "Create PDF"}
                                        </button>
                                    )}
                                </div>
                                {IS_FIREFOX_ANDROID && (
                                    <p className="ModalPDF-firefoxNote">
                                        Firefox users may encounter issues downloading the PDF.
                                    </p>
                                )}
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default ModalPDF;
