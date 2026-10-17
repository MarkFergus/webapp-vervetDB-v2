import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconCameraOff } from "@tabler/icons-react";
import useDialog from "./useDialog";
import CloseButton from "./CloseButton";
import { qrDestination } from "./qrLink";
import "./QrScanner.css";

// Scan QR Code (the ☰ menu on phones): the camera, full screen, looking for
// an Introcage Sign's QR code. Once it reads one, it goes straight to that
// introcage's page. Android reads codes itself (BarcodeDetector); other
// phones (iPhones) use jsQR, loaded only then. Works offline too.
//   onFound(hash): went to a page (the menu closes this); onClose: Close

// How often a frame is checked (milliseconds)
const EVERY = 200;
// How long "not a vervetDB sign" shows
const NOTICE_MS = 2500;

// Something that reads QR codes in a video frame: async (video, canvas) =>
// the text, or null
async function makeReader() {
    if ("BarcodeDetector" in window) {
        try {
            const formats = await window.BarcodeDetector.getSupportedFormats?.();
            if (!formats || formats.includes("qr_code")) {
                const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
                return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
            }
        } catch {
            // (fall back to jsQR)
        }
    }
    const { default: jsQR } = await import("jsqr");
    return async (video, canvas) => {
        const { videoWidth: w, videoHeight: h } = video;
        if (!w || !h) return null;
        canvas.width = w;
        canvas.height = h;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        context.drawImage(video, 0, 0, w, h);
        return jsQR(context.getImageData(0, 0, w, h).data, w, h)?.data ?? null;
    };
}

function QrScanner({ onClose, onFound }) {
    const closeRef = useRef(null);
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    // null (looking), "starting", "denied", "unavailable"
    const [problem, setProblem] = useState("starting");
    const [notice, setNotice] = useState(null);
    useDialog(true, closeRef, { onClose });

    useEffect(() => {
        let stream = null;
        let timer = null;
        let stopped = false;
        let noticeTimer = null;
        async function start() {
            if (!navigator.mediaDevices?.getUserMedia) {
                setProblem("unavailable");
                return;
            }
            try {
                // (the back camera)
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
            } catch (error) {
                setProblem(error?.name === "NotAllowedError" ? "denied" : "unavailable");
                return;
            }
            if (stopped) return;
            const video = videoRef.current;
            video.srcObject = stream;
            // (not waited for: some browsers are slow to say it's playing;
            // frames are only read once there's a picture)
            video.play().catch(() => {});
            setProblem(null);
            const read = await makeReader();
            const look = async () => {
                if (stopped) return;
                const text = await read(video, canvasRef.current).catch(() => null);
                if (text) {
                    const hash = qrDestination(text);
                    if (hash) {
                        stopped = true;
                        onFound(hash);
                        return;
                    }
                    setNotice("That QR code isn't a vervetDB sign.");
                    clearTimeout(noticeTimer);
                    noticeTimer = setTimeout(() => setNotice(null), NOTICE_MS);
                }
                timer = setTimeout(look, EVERY);
            };
            look();
        }
        start();
        // The camera goes off as soon as this closes
        return () => {
            stopped = true;
            clearTimeout(timer);
            clearTimeout(noticeTimer);
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, [onFound]);

    const messages = {
        denied: "The camera is turned off for vervetDB. Allow it in your browser's settings to scan signs.",
        unavailable: "Couldn't start the camera on this device.",
    };

    return createPortal(
        <div className="QrScanner" role="dialog" aria-modal="true" aria-labelledby="QrScanner-title">
            <div className="QrScanner-header">
                <h2 id="QrScanner-title">Scan QR Code</h2>
                <CloseButton ref={closeRef} onClick={onClose} />
            </div>
            <div className="QrScanner-view">
                <video ref={videoRef} playsInline muted aria-hidden="true" />
                <canvas ref={canvasRef} hidden />
                {/* Where to hold the code */}
                {!problem && <div className="QrScanner-frame" aria-hidden="true" />}
                {messages[problem] && (
                    <div className="QrScanner-problem">
                        <IconCameraOff size={36} stroke={1.5} aria-hidden="true" />
                        <p>{messages[problem]}</p>
                    </div>
                )}
            </div>
            <p className="QrScanner-hint" role="status">
                {notice ?? (problem === "starting" ? "Starting the camera…" : !problem ? "Point the camera at an Introcage Sign's QR code." : "")}
            </p>
        </div>,
        document.body
    );
}

export default QrScanner;
