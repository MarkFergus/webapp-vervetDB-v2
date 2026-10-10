import { useEffect, useRef } from "react";
import { fullName } from "./places";
import { IconCircleCheckFilled, IconDownload, IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { BABIES_BOOK, bookTitle } from "./profileBook";
import { currentBabySeason } from "./ages";
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
    // The troop picker: the book chosen ("Goliath", or BABIES_BOOK), the
    // troops to choose from, and what to call when the choice changes
    book,
    troops,
    onChooseBook,
    // The finished book ({ blob, filename }), waiting for Save PDF
    ready,
    onSave,
    // Which PDF: null (not chosen yet), "profileBook", "monitoring" (a
    // Troop Monitoring Sheet) or "amPlates" (the AM Plates List), and what
    // to call when the choice changes;
    // plateCount / plateMonkeys / plateIntrocages: the summary's Local
    // Team plates, the monkeys they're for, and how many introcages
    report = null,
    onChooseReport,
    plateCount = 0,
    plateMonkeys = 0,
    plateIntrocages = 0,
    // monitoringCount: the troop's monkeys on its Monitoring Sheet;
    // monitorTroops: the troops that are monitored (not the Bandits)
    monitoringCount = 0,
    monitorTroops = troops,
}) {
    const isAmPlates = report === "amPlates";
    const isProfileBook = report === "profileBook";
    const isMonitoring = report === "monitoring";
    const REPORT_NAMES = { profileBook: "Profile Book", monitoring: "Troop Monitoring Sheet", amPlates: "AM Plates List" };
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
                                    Create PDF
                                </h1>
                                <div>
                                    {/* Which document (until there's a Reports section) */}
                                    <label className="ModalPDF-troop">
                                        Document
                                        <select
                                            value={report ?? ""}
                                            onChange={(e) => onChooseReport?.(e.target.value || null)}
                                            disabled={isGeneratingPDF}
                                        >
                                            {!report && <option value="">Choose…</option>}
                                            {/* (A–Z) */}
                                            <option value="amPlates">AM Plates List</option>
                                            <option value="monitoring">Troop Monitoring Sheet</option>
                                            <option value="profileBook">Troop Profile Book</option>
                                        </select>
                                    </label>
                                    {isAmPlates ? (
                                        <>
                                            <p className="ModalPDF-subdetails">
                                                {plateCount === 0 ? (
                                                    "No AM plates recorded yet: set them in each introcage monkey's Feeding."
                                                ) : (
                                                    <>
                                                        Creates an AM Plates List for{" "}
                                                        <span className="ModalPDF-line">
                                                            <b>
                                                                {plateMonkeys} {plateMonkeys === 1 ? "monkey" : "monkeys"}
                                                            </b>{" "}
                                                            from{" "}
                                                            <b>
                                                                {plateIntrocages} {plateIntrocages === 1 ? "introcage" : "introcages"}
                                                            </b>
                                                            .
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                        </>
                                    ) : isProfileBook || isMonitoring ? (
                                        <>
                                            <label className="ModalPDF-troop">
                                                Troop
                                                <select
                                                    value={book}
                                                    onChange={(e) => onChooseBook(e.target.value)}
                                                    disabled={isGeneratingPDF}
                                                >
                                                    {(isMonitoring ? monitorTroops : troops).map((t) => (
                                                        <option key={t} value={t}>
                                                            {fullName(t)}
                                                        </option>
                                                    ))}
                                                    {/* This season's babies, from every troop (a
                                                        Profile Book only: not a troop to monitor) */}
                                                    {isProfileBook && (
                                                        <option value={BABIES_BOOK}>
                                                            Orphans/Babies ({currentBabySeason()})
                                                        </option>
                                                    )}
                                                </select>
                                            </label>
                                            <p className="ModalPDF-subdetails">
                                                {(isMonitoring ? monitoringCount : monkeyCount) === 0 ? (
                                                    "No monkeys in this troop yet."
                                                ) : (
                                                    <>
                                                        {isMonitoring
                                                            ? "Creates a Troop Monitoring Sheet for"
                                                            : "Creates a formatted Profile Book for"}{" "}
                                                        <span className="ModalPDF-line">
                                                            <b>
                                                                {isMonitoring
                                                                    ? `${monitoringCount} ${monitoringCount === 1 ? "monkey" : "monkeys"}`
                                                                    : `${monkeyCount} ${plural}`}
                                                            </b>{" "}
                                                            from <b>{troopNote}</b>.
                                                        </span>
                                                    </>
                                                )}
                                            </p>
                                            {isProfileBook && monkeyCount > LARGE_PDF_THRESHOLD && (
                                                <p className="ModalPDF-warning">
                                                    Large PDFs can take several minutes
                                                    to create.{" "}
                                                    <span className="ModalPDF-line">
                                                        Tip: pick a troop in the filter
                                                        first.
                                                    </span>
                                                </p>
                                            )}
                                        </>
                                    ) : null}
                                    {ready && (
                                        <p className="ModalPDF-ready" role="status">
                                            <IconCircleCheckFilled size={18} aria-hidden="true" />
                                            Your {REPORT_NAMES[report]} is ready ({readySize})
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
                                                isGeneratingPDF ||
                                                !report ||
                                                (isAmPlates ? plateCount === 0 : isMonitoring ? monitoringCount === 0 : monkeyCount === 0)
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
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default ModalPDF;
