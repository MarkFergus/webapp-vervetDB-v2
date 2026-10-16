import { IconZoomIn, IconZoomOut, IconZoomReset } from "@tabler/icons-react";
import { MAX_ZOOM, STEP } from "./useMapCamera";

// The zoom controls in a map pop-up's title bar: Zoom Out, the slider, Zoom
// In, and reset. The slider goes up in equal steps of how many times bigger,
// so it feels even all the way. (Styled in WholeMap.css.)
//   map: from useMapCamera
//   reset: what the reset button does, and its name (e.g. Whole Map);
//   atReset: true when it'd change nothing
function MapZoom({ map, reset, resetLabel, atReset }) {
    const { camera, zoomBy, zoomWith } = map;
    return (
        <div className="WholeMap-zoom" role="group" aria-label="Zoom controls">
            <button
                type="button"
                onClick={() => zoomBy(1 / STEP)}
                disabled={camera.zoom <= 1}
                aria-label="Zoom Out"
                title="Zoom Out"
            >
                <IconZoomOut size={18} aria-hidden="true" />
            </button>
            <input
                type="range"
                className="WholeMap-slider"
                min="0"
                max="100"
                step="1"
                value={Math.round((Math.log(camera.zoom) / Math.log(MAX_ZOOM)) * 100)}
                onChange={(event) => {
                    const zoom = MAX_ZOOM ** (Number(event.target.value) / 100);
                    zoomWith(() => zoom);
                }}
                aria-label="Zoom"
                aria-valuetext={`${camera.zoom.toFixed(1)} times`}
            />
            <button
                type="button"
                onClick={() => zoomBy(STEP)}
                disabled={camera.zoom >= MAX_ZOOM}
                aria-label="Zoom In"
                title="Zoom In"
            >
                <IconZoomIn size={18} aria-hidden="true" />
            </button>
            <button type="button" onClick={reset} disabled={atReset} aria-label={resetLabel} title={resetLabel}>
                <IconZoomReset size={18} aria-hidden="true" />
            </button>
        </div>
    );
}

export default MapZoom;
