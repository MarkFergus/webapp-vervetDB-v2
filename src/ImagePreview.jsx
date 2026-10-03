import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import "./ImagePreview.css";

// Firefox's home-screen app on Android can't save files: a download link
// shows about:blank, and a picture opened in a new window can't be saved
// either. But pressing and holding a picture on the page gives Firefox's own
// "Save image". So Save image shows the picture here, with that hint.
//   image:   the picture (a Blob), or null when closed
//   onClose: Done, the backdrop, or Escape
function ImagePreview({ image, onClose }) {
    const [src, setSrc] = useState(null);

    // A data address (the picture itself, not a temporary link), which
    // Firefox can save from its press-and-hold menu
    useEffect(() => {
        if (!image) return setSrc(null);
        const reader = new FileReader();
        reader.onload = () => setSrc(reader.result);
        reader.readAsDataURL(image);
    }, [image]);

    // Escape closes just this, not the pop-up underneath
    useEffect(() => {
        if (!image) return;
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.stopImmediatePropagation();
                onClose();
            }
        }
        document.addEventListener("keydown", handleKeyDown, true);
        return () => document.removeEventListener("keydown", handleKeyDown, true);
    }, [image]);

    if (!image) return null;
    return createPortal(
        <div className="ImagePreview" role="dialog" aria-modal="true" aria-label="Save image">
            <div className="ImagePreview-backdrop" onClick={onClose} />
            <div className="ImagePreview-box">
                <p className="ImagePreview-hint">
                    Press and hold the picture, then choose <b>Save image</b>.
                </p>
                {src && <img src={src} alt="Picture to save" />}
                <button type="button" className="ImagePreview-done" onClick={onClose} autoFocus>
                    Done
                </button>
            </div>
        </div>,
        document.body
    );
}

export default ImagePreview;
