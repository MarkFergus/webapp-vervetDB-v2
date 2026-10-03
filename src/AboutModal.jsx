import { useRef } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import MonkeyIcon from "./MonkeyIcon";
import { CHANGELOG, releaseDate } from "./changelog";
import "./AboutModal.css";

// The About pop-up: which version of vervetDB this is, and a running
// changelog: each version's changes under its own heading (changelog.js). Opened from the ⓘ in the top bar, the ☰ menu on
// phones, or the line at the bottom of the main page.
function AboutModal({ isOpen, onClose }) {
    const closeRef = useRef(null);
    useDialog(isOpen, closeRef, { onClose });
    const latest = CHANGELOG[0];

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
                                    vervetDB is a web app for the Vervet Monkey Foundation's monkey
                                    records. It's built mainly for staff and volunteers, to help
                                    identify monkeys and keep their information up to date.
                                </p>
                                <section className="AboutModal-changes" aria-labelledby="AboutModal-changesTitle">
                                    <h2 id="AboutModal-changesTitle">Latest changes</h2>
                                    {CHANGELOG.map((entry) => (
                                        <div key={entry.version} className="AboutModal-release">
                                            <h3>Version {entry.version}</h3>
                                            <ul>
                                                {entry.changes.map((change) => (
                                                    <li key={change}>{change}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
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
