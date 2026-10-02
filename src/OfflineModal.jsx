import { useEffect, useRef, useState } from "react";
import { IconCircleCheckFilled, IconDownload, IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { installPlatform, useInstallApp } from "./installApp";
import { useAuth } from "./auth";
import { aboutSize, downloadPhotos, offlineSupported, photoStatus } from "./offlinePhotos";
import "./AboutModal.css";
import "./OfflineModal.css";

// How to install, for browsers without an Install button
const INSTALL_STEPS = {
    iphone: [
        <>Tap the <b>Share</b> button (the square with an arrow)</>,
        <>Choose <b>Add to Home Screen</b>, then <b>Add</b></>,
    ],
    android: [
        <>Tap <b>⋮</b> (the browser's menu)</>,
        <>Choose <b>Install app</b> or <b>Add to Home screen</b></>,
    ],
    firefox: [
        <>Firefox can't install apps on computers, but it can <b>Pin to taskbar</b> (look for it in the address bar or Firefox's menu)</>,
        <>Or open vervetdb.com in <b>Chrome</b>, <b>Edge</b> or <b>Brave</b> to install it</>,
    ],
    computer: [
        <>Click the <b>install icon</b> at the right-hand end of the address bar</>,
        <>Or open the browser's menu and look for <b>Install vervetDB</b> (or <b>Install page as app</b>)</>,
    ],
};

// The "Install & Use Offline" pop-up (the top bar on computers, ☰ on phones):
// how to install vervetDB as an app, and saving every photo on the device.
// Downloading every photo is for signed-in staff (it uses the database's
// monthly data allowance); anyone else is offered Sign in (onSignIn).
function OfflineModal({ isOpen, onClose, monkeys, onSignIn }) {
    const { user } = useAuth();
    const closeRef = useRef(null);
    useDialog(isOpen, closeRef, { onClose });
    const { installed, canInstall, install } = useInstallApp();
    const supported = offlineSupported();

    const [status, setStatus] = useState(null);
    // While downloading: { done, total }; afterwards: { failed }
    const [progress, setProgress] = useState(null);
    const [result, setResult] = useState(null);
    const stopper = useRef(null);

    async function refreshStatus() {
        if (supported) setStatus(await photoStatus(monkeys));
    }
    useEffect(() => {
        if (isOpen) refreshStatus();
        // Closing stops a download (what's saved so far stays saved)
        if (!isOpen) stopper.current?.abort();
    }, [isOpen]);

    async function downloadAll() {
        stopper.current = new AbortController();
        setResult(null);
        setProgress({ done: 0, total: status.missing.length });
        const failed = await downloadPhotos(status.missing, {
            signal: stopper.current.signal,
            onProgress: (done, total, url, saved) => {
                setProgress({ done, total });
                // Count it straight away in "… of … saved"
                if (saved) {
                    const kind = url.includes("/thumbs/") ? "thumbs" : "photos";
                    setStatus((s) => ({ ...s, [kind]: { ...s[kind], saved: s[kind].saved + 1 } }));
                }
            },
        });
        const stopped = stopper.current.signal.aborted;
        setProgress(null);
        setResult({ failed, stopped });
        await refreshStatus();
    }

    const everythingSaved = status && status.missing.length === 0;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="AboutModal" role="dialog" aria-modal="true" aria-labelledby="OfflineModal-title">
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
                            <div className="AboutModal-content OfflineModal">
                                <h1 className="AboutModal-title" id="OfflineModal-title">
                                    Install & Use Offline
                                </h1>

                                <section className="OfflineModal-section" aria-labelledby="OfflineModal-install">
                                    <h2 id="OfflineModal-install">Install the app</h2>
                                    {installed ? (
                                        <p className="OfflineModal-done">
                                            <IconCircleCheckFilled size={18} aria-hidden="true" />
                                            You're using the installed app.
                                        </p>
                                    ) : (
                                        <>
                                            <p>
                                                vervetDB opens in its own window, with an icon on your
                                                home screen or taskbar.
                                            </p>
                                            {canInstall ? (
                                                <button type="button" className="OfflineModal-button" onClick={install}>
                                                    <IconDownload size={18} aria-hidden="true" />
                                                    Install app
                                                </button>
                                            ) : (
                                                <ol className="OfflineModal-steps">
                                                    {INSTALL_STEPS[installPlatform()].map((step, i) => (
                                                        <li key={i}>{step}</li>
                                                    ))}
                                                </ol>
                                            )}
                                        </>
                                    )}
                                </section>

                                <section className="OfflineModal-section" aria-labelledby="OfflineModal-photos">
                                    <h2 id="OfflineModal-photos">Use Offline</h2>
                                    <p>Download all photos to make available when offline.</p>
                                    {!supported ? (
                                        <p>
                                            Saving photos isn't ready in this window yet. Reload the
                                            page, then open this again.
                                        </p>
                                    ) : !status ? (
                                        <p role="status">Checking what's saved…</p>
                                    ) : (
                                        <>
                                            <ul className="OfflineModal-counts">
                                                <li>
                                                    Small photos (cards): <b>{status.thumbs.saved} of {status.thumbs.total}</b> saved
                                                </li>
                                                <li>
                                                    Full-size photos: <b>{status.photos.saved} of {status.photos.total}</b> saved
                                                </li>
                                            </ul>
                                            {progress ? (
                                                <div className="OfflineModal-progress" role="status">
                                                    <progress value={progress.done} max={progress.total} />
                                                    <span>
                                                        Saving photos… {Math.floor((progress.done / progress.total) * 100)}%
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="OfflineModal-stop"
                                                        onClick={() => stopper.current?.abort()}
                                                    >
                                                        Stop
                                                    </button>
                                                </div>
                                            ) : everythingSaved ? (
                                                <p className="OfflineModal-done">
                                                    <IconCircleCheckFilled size={18} aria-hidden="true" />
                                                    Every photo is saved on this device.
                                                </p>
                                            ) : !user ? (
                                                <>
                                                    <p>
                                                        Staff can download every photo ({aboutSize(status.bytesLeft)}) to
                                                        use without signal. Photos you open are saved anyway.
                                                    </p>
                                                    <button type="button" className="OfflineModal-button" onClick={onSignIn}>
                                                        Sign in to download all photos
                                                    </button>
                                                </>
                                            ) : (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="OfflineModal-button"
                                                        onClick={downloadAll}
                                                    >
                                                        <IconDownload size={18} aria-hidden="true" />
                                                        Download all photos ({aboutSize(status.bytesLeft)})
                                                    </button>
                                                    <p className="OfflineModal-hint">
                                                        Best on Wi-Fi. Photos you open are saved anyway.
                                                    </p>
                                                </>
                                            )}
                                            {result && !progress && (
                                                <p className="OfflineModal-hint" role="status">
                                                    {result.stopped
                                                        ? "Stopped. What was saved stays saved."
                                                        : result.failed
                                                          ? `${result.failed} photo${result.failed === 1 ? "" : "s"} couldn't be saved. Try again later.`
                                                          : "Done!"}
                                                </p>
                                            )}
                                        </>
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

export default OfflineModal;
