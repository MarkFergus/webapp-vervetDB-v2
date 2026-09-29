import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "framer-motion";
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
        troopFilter === "All Troops" ? "from all troops" : `from ${troopFilter}`;

    let status = null;
    if (progress && progress.done < progress.total) {
        status = `Preparing photos ${progress.done} of ${progress.total}…`;
    } else if (progress) {
        status = "Building PDF…";
    }

    return (
        <AnimatePresence>
            {isPDFModalOpen && (
                <div className="ModalPDF">
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
                            <div
                                className="ModalPDF-close"
                                onClick={closePDFModal}
                            >
                                <IconSquareRoundedX />
                            </div>
                            <motion.div className="ModalPDF-content">
                                <h1 className="ModalPDF-title">
                                    Profile Book PDF
                                </h1>
                                <div>
                                    <h3 className="ModalPDF-details">
                                        Creates a profile book PDF of the
                                        monkeys currently shown, in the same
                                        order.
                                    </h3>
                                    <h3 className="ModalPDF-subdetails">
                                        {monkeyCount === 0 ? (
                                            "No monkeys match the current filters."
                                        ) : (
                                            <>
                                                This PDF will include{" "}
                                                <b>
                                                    {monkeyCount} {plural}
                                                </b>{" "}
                                                {troopNote}.
                                            </>
                                        )}
                                    </h3>
                                    {monkeyCount > LARGE_PDF_THRESHOLD && (
                                        <p className="ModalPDF-warning">
                                            Large PDFs can take several minutes
                                            to create. Tip: pick a troop in the
                                            filter first.
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
