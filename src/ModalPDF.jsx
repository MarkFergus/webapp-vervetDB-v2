import { useEffect, useRef } from "react";
import { fullName } from "./places";
import { IconCircleCheckFilled, IconDownload } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { BABIES_BOOK, bookTitle } from "./profileBook";
import { currentBabySeason } from "./ages";
import "./ModalPDF.css";
import CloseButton from "./CloseButton";
import IntrocageSignPicker from "./IntrocageSignPicker";

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
    // monitorTroops: the troops that are monitored (not the Bandits);
    // monitoringParts: which to create ({ sheet, notes }: the Sheet and / or
    // the Monitoring Notes), onChangeMonitoringParts(parts); canNotes: the
    // Notes are offered (staff only)
    monitoringCount = 0,
    monitorTroops = troops,
    monitoringParts = { sheet: true, notes: false },
    onChangeMonitoringParts,
    canNotes = false,
    // Introcage Signs ("introcageSign"): the introcages to choose from
    // (signChoices), the ids chosen, how many pages they make, and what to
    // call to change the list
    signChoices = [],
    signList = [],
    signPageCount = 0,
    onAddSign,
    onRemoveSign,
    onClearSigns,
}) {
    const isAmPlates = report === "amPlates";
    const isProfileBook = report === "profileBook";
    const isMonitoring = report === "monitoring";
    const isSigns = report === "introcageSign";
    // (Troop Monitoring: just the Sheet, unless the Notes can be had)
    const parts = canNotes ? monitoringParts : { sheet: true, notes: false };
    const noParts = !parts.sheet && !parts.notes;
    const REPORT_NAMES = {
        profileBook: "Profile Book",
        monitoring: parts.sheet && parts.notes ? "Troop Monitoring PDF" : parts.notes ? "Troop Monitoring Notes" : "Troop Monitoring Sheet",
        amPlates: "AM Plates List",
        introcageSign: "Introcage Signs",
    };
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
                                <CloseButton ref={closeButtonRef} onClick={closePDFModal} />
                            </div>
                            <motion.div className="ModalPDF-content">
                                <h1
                                    className="ModalPDF-title"
                                    id="ModalPDF-title"
                                >
                                    Documents
                                </h1>
                                <p className="ModalPDF-intro">Create a downloadable PDF for the chosen document.</p>
                                <div>
                                    {/* Which document */}
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
                                            <option value="introcageSign">Introcage Sign</option>
                                            <option value="monitoring">Troop Monitoring</option>
                                            <option value="profileBook">Troop Profile Book</option>
                                        </select>
                                    </label>
                                    {isSigns ? (
                                        <>
                                            <IntrocageSignPicker
                                                choices={signChoices}
                                                list={signList}
                                                onAdd={onAddSign}
                                                onRemove={onRemoveSign}
                                                onClear={onClearSigns}
                                                disabled={isGeneratingPDF}
                                            />
                                            <p className="ModalPDF-subdetails">
                                                {signList.length === 0 ? (
                                                    "Find an introcage, then Add to List. Signs print two to a page, to cut out."
                                                ) : (
                                                    <>
                                                        Creates{" "}
                                                        <b>
                                                            {signList.length} {signList.length === 1 ? "sign" : "signs"}
                                                        </b>{" "}
                                                        on{" "}
                                                        <b>
                                                            {signPageCount} {signPageCount === 1 ? "page" : "pages"}
                                                        </b>
                                                        .
                                                    </>
                                                )}
                                            </p>
                                        </>
                                    ) : isAmPlates ? (
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
                                            {/* Troop Monitoring (staff): the Sheet, the Notes, or both */}
                                            {isMonitoring && canNotes && (
                                                <div className="ModalPDF-parts" role="group" aria-label="Include">
                                                    {[
                                                        ["sheet", "Monitoring Sheet"],
                                                        ["notes", "Monitoring Notes"],
                                                    ].map(([key, label]) => (
                                                        <label key={key}>
                                                            <input
                                                                type="checkbox"
                                                                checked={parts[key]}
                                                                disabled={isGeneratingPDF}
                                                                onChange={(e) =>
                                                                    onChangeMonitoringParts?.({ ...parts, [key]: e.target.checked })
                                                                }
                                                            />
                                                            {label}
                                                        </label>
                                                    ))}
                                                </div>
                                            )}
                                            <p className="ModalPDF-subdetails">
                                                {isMonitoring && noParts ? (
                                                    "Choose the Monitoring Sheet, the Monitoring Notes, or both."
                                                ) : (isMonitoring ? monitoringCount : monkeyCount) === 0 ? (
                                                    "No monkeys in this troop yet."
                                                ) : isMonitoring ? (
                                                    // (just the troop: e.g. "Creates a Monitoring Sheet
                                                    // and Monitoring Notes for Goliath.")
                                                    <>
                                                        Creates{" "}
                                                        {parts.sheet && parts.notes
                                                            ? "a Monitoring Sheet and Monitoring Notes"
                                                            : parts.notes
                                                              ? "Monitoring Notes"
                                                              : "a Monitoring Sheet"}{" "}
                                                        {/* (runs on: "for" kept with the name) */}
                                                        for{"\u00a0"}
                                                        <b>{fullName(book)}</b>.
                                                    </>
                                                ) : (
                                                    <>
                                                        Creates a formatted Profile Book for{" "}
                                                        <span className="ModalPDF-line">
                                                            <b>{`${monkeyCount} ${plural}`}</b> from <b>{troopNote}</b>.
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
                                                (isSigns
                                                    ? signList.length === 0
                                                    : isAmPlates
                                                      ? plateCount === 0
                                                      : isMonitoring
                                                        ? monitoringCount === 0 || noParts
                                                        : monkeyCount === 0)
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
