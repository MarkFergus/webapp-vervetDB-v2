import { useEffect, useRef, useState } from "react";
import { IconChevronDown, IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import MonkeyIcon from "./MonkeyIcon";
import { CHANGELOG, currentSeries, releaseDate } from "./changelog";
import { CREDITS, LICENCES_FILE } from "./credits";
import "./AboutModal.css";

// The About pop-up: which version of vervetDB this is, and a running
// changelog: each version's changes under its own heading (changelog.js).
// Every version in the current series shows (e.g. all the 1.1.x); older
// series fold away under "Earlier versions" (see currentSeries). Below that,
// the open-source software and fonts used fold away too (credits.js).
// Opened from the ⓘ in the top bar, or the ☰ menu on phones.
// One version: its heading (pink) and its changes
function Release({ entry }) {
    return (
        <div className="AboutModal-release">
            <h3>Version {entry.version}</h3>
            <ul>
                {entry.changes.map((change) => (
                    <li key={change}>{change}</li>
                ))}
            </ul>
        </div>
    );
}

function AboutModal({ isOpen, onClose }) {
    const closeRef = useRef(null);
    useDialog(isOpen, closeRef, { onClose });
    const latest = CHANGELOG[0];
    const { current, earlier } = currentSeries(CHANGELOG);
    const [showEarlier, setShowEarlier] = useState(false);
    const [showLicences, setShowLicences] = useState(false);
    // Folded away again each time About opens
    useEffect(() => {
        if (isOpen) {
            setShowEarlier(false);
            setShowLicences(false);
        }
    }, [isOpen]);

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="AboutModal" role="dialog" aria-modal="true" aria-labelledby="AboutModal-title">
                    <motion.div
                        className="AboutModal-overlay"
                        onClick={onClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: 0.2 } }}
                        exit={{ opacity: 0 }}
                    ></motion.div>
                    <motion.div
                        className="AboutModal-windowbox"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1, transition: { duration: 0.2 } }}
                        exit={{ scale: 0, opacity: 0 }}
                    >
                        <div className="AboutModal-window">
                            <div className="AboutModal-close">
                                <button type="button" ref={closeRef} onClick={onClose} aria-label="Close">
                                    <IconSquareRoundedX />
                                </button>
                            </div>
                            <div className="AboutModal-content">
                                <span className="AboutModal-logo" aria-hidden="true">
                                    <MonkeyIcon color="currentColor" role={undefined} aria-label={undefined} />
                                </span>
                                <h1 className="AboutModal-title" id="AboutModal-title">
                                    About vervetDB
                                </h1>
                                <p className="AboutModal-version">
                                    Version {latest.version} · {releaseDate(latest.date)}
                                </p>
                                <p className="AboutModal-description">
                                    vervetDB is a web app for the Vervet Monkey Foundation's staff
                                    and volunteers to access and update monkey records. Although
                                    anyone can view records, it is not intended for public use.
                                </p>
                                <p className="AboutModal-copyright">
                                    © {new Date().getFullYear()} Vervet Monkey Foundation.
                                    <br />
                                    All photos and records belong to the Foundation and may not be
                                    reused without permission.
                                </p>
                                <p className="AboutModal-credit">– Built by Mark Fergus Ashcroft –</p>
                                <section className="AboutModal-changes" aria-labelledby="AboutModal-changesTitle">
                                    <h2 id="AboutModal-changesTitle">Latest changes</h2>
                                    {current.map((entry) => (
                                        <Release key={entry.version} entry={entry} />
                                    ))}
                                    {earlier.length > 0 && (
                                        <button
                                            type="button"
                                            className="AboutModal-earlier"
                                            aria-expanded={showEarlier}
                                            aria-controls="AboutModal-earlierList"
                                            onClick={() => setShowEarlier((shown) => !shown)}
                                        >
                                            Earlier versions
                                            <IconChevronDown size={16} aria-hidden="true" />
                                        </button>
                                    )}
                                    {showEarlier && (
                                        <div id="AboutModal-earlierList">
                                            {earlier.map((entry) => (
                                                <Release key={entry.version} entry={entry} />
                                            ))}
                                        </div>
                                    )}
                                </section>
                                <section className="AboutModal-licences" aria-label="Open-source licences">
                                    <button
                                        type="button"
                                        className="AboutModal-earlier"
                                        aria-expanded={showLicences}
                                        aria-controls="AboutModal-licenceList"
                                        onClick={() => setShowLicences((shown) => !shown)}
                                    >
                                        Open-Source Licences
                                        <IconChevronDown size={16} aria-hidden="true" />
                                    </button>
                                    {showLicences && (
                                        <div id="AboutModal-licenceList">
                                            <p>vervetDB is built with these open-source projects. Thank you to their makers.</p>
                                            <ul>
                                                {CREDITS.map((credit) => (
                                                    <li key={credit.name}>
                                                        <a href={credit.url} target="_blank" rel="noreferrer">
                                                            {credit.name}
                                                        </a>
                                                        <span>
                                                            {credit.use} · {credit.licence}
                                                        </span>
                                                    </li>
                                                ))}
                                            </ul>
                                            <a
                                                className="AboutModal-fullLicences"
                                                href={LICENCES_FILE}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                Full Licence Texts
                                            </a>
                                        </div>
                                    )}
                                </section>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default AboutModal;
