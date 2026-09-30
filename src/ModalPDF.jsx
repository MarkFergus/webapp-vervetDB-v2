import { useRef } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import "./ModalPDF.css";

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
    troopFilter,
}) {
    const plural = monkeyCount === 1 ? "monkey" : "monkeys";
    const troopNote =
        troopFilter === "All Troops" ? "all troops" : `${troopFilter} Troop`;

    let status = null;
    if (progress && progress.done < progress.total) {
        status = `Preparing photos ${progress.done} of ${progress.total}…`;
    } else if (progress) {
        status = "Building PDF…";
    }

    // Escape closes; focus starts on the close button
    const closeButtonRef = useRef(null);
    useDialog(isPDFModalOpen, closeButtonRef, { onClose: closePDFModal });

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
                                        Creates a formatted Profile Book as a
                                        PDF file with the currently displayed
                                        monkeys.
                                    </p>
                                    <p className="ModalPDF-subdetails">
                                        {monkeyCount === 0 ? (
                                            "No monkeys match the current filters."
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
                                </div>
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default ModalPDF;
