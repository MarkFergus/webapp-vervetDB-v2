import { useEffect, useState } from "react";
import Cropper from "react-easy-crop";
import { IconZoomIn, IconZoomOut } from "@tabler/icons-react";
import { cropPhoto, PHOTO_ASPECT } from "./photoUpload";
import "./PhotoCropper.css";

// Frame a chosen photo in the site's 5:4 shape before it's uploaded:
// drag to move, pinch / scroll / slider to zoom.
//   file:      the chosen photo
//   position:  e.g. "Photo 1 of 3" when several were chosen (optional)
//   onUse(blob): the cropped 960 × 768 photo, ready to upload
//   onCancel:  skip this photo
function PhotoCropper({ file, position, onUse, onCancel }) {
    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [area, setArea] = useState(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    // Show the chosen file (and tidy up its temporary address afterwards)
    useEffect(() => {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    async function handleUse() {
        setBusy(true);
        setProblem(null);
        try {
            onUse(await cropPhoto(imageSrc, area));
        } catch (error) {
            setProblem(error.message);
            setBusy(false);
        }
    }

    return (
        <div className="PhotoCropper" role="dialog" aria-modal="true" aria-labelledby="PhotoCropper-title">
            <div className="PhotoCropper-window">
                <div className="PhotoCropper-header">
                    <h2 id="PhotoCropper-title">Crop photo</h2>
                    {position && <span className="PhotoCropper-position">{position}</span>}
                </div>

                <div className="PhotoCropper-area">
                    {imageSrc && (
                        <Cropper
                            image={imageSrc}
                            crop={crop}
                            zoom={zoom}
                            maxZoom={4}
                            aspect={PHOTO_ASPECT}
                            onCropChange={setCrop}
                            onZoomChange={setZoom}
                            onCropComplete={(_, pixels) => setArea(pixels)}
                            showGrid={false}
                        />
                    )}
                </div>

                <p className="PhotoCropper-hint">
                    Drag to move the photo. Pinch, scroll or use the slider to zoom.
                </p>

                <div className="PhotoCropper-zoom">
                    <IconZoomOut size={20} aria-hidden="true" />
                    <input
                        type="range"
                        min={1}
                        max={4}
                        step={0.01}
                        value={zoom}
                        onChange={(e) => setZoom(Number(e.target.value))}
                        aria-label="Zoom"
                    />
                    <IconZoomIn size={20} aria-hidden="true" />
                </div>

                {problem && (
                    <p className="PhotoCropper-problem" role="alert">
                        {problem}
                    </p>
                )}

                <div className="PhotoCropper-buttons">
                    <button type="button" className="PhotoCropper-button is-quiet" onClick={onCancel} disabled={busy}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="PhotoCropper-button"
                        onClick={handleUse}
                        disabled={busy || !area}
                        autoFocus
                    >
                        {busy ? "Preparing…" : "Use photo"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PhotoCropper;
