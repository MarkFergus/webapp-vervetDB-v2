import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconArrowRight,
    IconChevronLeft,
    IconCurrentLocation,
    IconMap2,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import CloseButton from "./CloseButton";
import PlaceName from "./PlaceName";
import MapZoom from "./MapZoom";
import useMapCamera, { MAX_ZOOM, wholeOf } from "./useMapCamera";
import { MAP_HEIGHT, MAP_WIDTH, loadMap, wholeMap } from "./SanctuaryMap";
import { placeCard, placesByLabel } from "./mapPlaces";
import { UNITS_PER_METRE, mapPointOf, onMap } from "./mapGeo";
import { enclosureHash, isInside } from "./enclosures";
import { thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import "./SanctuaryMap.css";
import "./WholeMap.css";

// The Interactive Map: the whole sanctuary map in a pop-up, in full colour,
// opened from Map in the side rail, bottom bar or ☰ menu. Starts with the
// whole map in view; drag to move around, and zoom with the slider and
// buttons in the title bar, the mouse wheel, a pinch, or the keyboard
// (+ / − / 0, arrows to move).
// Tapping an enclosure, introcage or area picks it out and shows a small
// card (photo, name, Open Page); tapping anywhere else puts it away.
// My Location (title bar): a blue dot where the phone is (mapGeo.js), with
// a circle for how sure it is. The position stays on the phone, and it's
// only followed while the map is open with My Location on.

// The whole page, until the drawing on it has been measured (the map file
// is an A4 page with empty margins around the drawing)
const PAGE = { x: 0, y: 0, width: MAP_WIDTH, height: MAP_HEIGHT };
// Room left around the drawing (a share of its size)
const MARGIN = 0.015;

// A shape's Inkscape label (inkscape:label; written with another prefix by
// some browsers once the map is copied into the page)
export const inkscapeLabel = (el) => [...el.attributes].find((a) => a.name.endsWith(":label"))?.value;

const SVG = "http://www.w3.org/2000/svg";

// What My Location says when there's no dot to show
const LOCATION_MESSAGES = {
    finding: "Finding your location…",
    away: "You're not at the sanctuary right now",
    denied: "Location is turned off for vervetDB. Allow it in your browser's settings to see where you are.",
    unavailable: "Couldn't find your location. Try again outside, away from buildings.",
};
// When it's found you, the map moves to you, at least this close in
const FOUND_ZOOM = 3;

// Phones: the pop-up fills the screen (as in WholeMap.css)
const PHONE = "(max-width: 624px)";

// How long a card takes to slide back out (as in WholeMap.css)
const CARD_OUT_MS = 220;

//   enclosures, monkeys: the places to tap, and who lives there
function WholeMap({ onClose, enclosures = [], monkeys = [] }) {
    const closeRef = useRef(null);
    const viewRef = useRef(null);
    const [markup, setMarkup] = useState(undefined); // null: couldn't load
    const [bounds, setBounds] = useState(PAGE);
    // Moving around and zooming (useMapCamera.js); a tap picks a place
    const map = useMapCamera(bounds, viewRef, { ready: Boolean(markup), onTap: tapAt });
    const { camera, setCamera, view, size } = map;
    const svgRef = useRef(null);
    // The place tapped (its card showing), or null
    const [picked, setPicked] = useState(null);
    // Its card sliding back out to the left (then it's gone)
    const [leaving, setLeaving] = useState(false);
    function closeCard() {
        if (!picked) return;
        const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        if (still) setPicked(null);
        else setLeaving(true);
    }
    useEffect(() => {
        if (!leaving) return;
        // (as long as the slide out: WholeMap.css)
        const done = setTimeout(() => {
            setPicked(null);
            setLeaving(false);
        }, CARD_OUT_MS);
        return () => clearTimeout(done);
    }, [leaving]);
    const labels = useMemo(() => placesByLabel(enclosures), [enclosures]);

    // My Location: following (on / off); where the phone is ({ x, y } on the
    // map and accuracy: metres); and what's happening ("finding", "here",
    // "away", "denied", "unavailable")
    const [following, setFollowing] = useState(false);
    const [here, setHere] = useState(null);
    const [locationStatus, setLocationStatus] = useState(null);
    useEffect(() => {
        if (!following) return;
        const gps = navigator.geolocation;
        if (!gps) {
            setLocationStatus("unavailable");
            setFollowing(false);
            return;
        }
        setLocationStatus("finding");
        let first = true;
        const watch = gps.watchPosition(
            ({ coords }) => {
                const [x, y] = mapPointOf(coords.latitude, coords.longitude);
                if (!onMap([x, y])) {
                    setHere(null);
                    setLocationStatus("away");
                    return;
                }
                setHere({ x, y, accuracy: coords.accuracy });
                setLocationStatus("here");
                // The first time: the map moves to you
                if (first) {
                    first = false;
                    setCamera((current) => ({ zoom: Math.max(current.zoom, FOUND_ZOOM), cx: x, cy: y }));
                }
            },
            (error) => {
                setHere(null);
                setLocationStatus(error.code === 1 ? "denied" : "unavailable");
                setFollowing(false);
            },
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
        );
        return () => gps.clearWatch(watch);
    }, [following]);
    function toggleLocation() {
        if (following) {
            setFollowing(false);
            setHere(null);
            setLocationStatus(null);
        } else {
            setFollowing(true);
        }
    }

    useDialog(true, closeRef, {
        // (Escape: the card first, then the map)
        onClose: () => (picked ? closeCard() : onClose()),
        onKeyDown: (event) => map.onKeyDown(event),
    });

    useEffect(() => {
        let cancelled = false;
        loadMap()
            .then((doc) => !cancelled && setMarkup(wholeMap(doc)))
            .catch(() => !cancelled && setMarkup(null));
        return () => {
            cancelled = true;
        };
    }, []);

    // The drawing's edges, with a little room around them, once it's on the
    // page (tests have no layout: the whole page)
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg?.getBBox) return;
        const box = svg.getBBox();
        if (!box.width || !box.height) return;
        const pad = Math.max(box.width, box.height) * MARGIN;
        const drawn = { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad };
        setBounds(drawn);
    }, [markup]);

    // Where it starts, once the drawing and the view have been measured: the
    // whole map. Phones (a full-screen pop-up, taller than the map's shape):
    // the map filling the screen top to bottom, a little of each side off
    // screen (zoom out or Whole Map for all of it).
    const started = useRef(false);
    useEffect(() => {
        if (started.current || bounds === PAGE || size.width <= 1) return;
        started.current = true;
        const shape = size.width / size.height;
        const fill = window.matchMedia?.(PHONE).matches;
        const zoom = fill
            ? Math.max(bounds.width, bounds.height * shape) / Math.min(bounds.width, bounds.height * shape)
            : 1;
        setCamera({ ...wholeOf(bounds), zoom: Math.min(zoom, MAX_ZOOM) });
    }, [bounds, size]);

    // The places on the map: their shapes marked (data-place: the place's
    // id) so they can be tapped; everything else lets taps through to them.
    // Not their names written on the map (text, or a group of text, often
    // labelled the same, e.g. "Camelot troop"): a tap on a name goes through
    // to the shape under it.
    useLayoutEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        for (const el of svg.querySelectorAll("*")) {
            if (el.closest("text") || el.querySelector("text")) continue;
            const place = labels.get(inkscapeLabel(el));
            if (place) el.setAttribute("data-place", place.id);
        }
    }, [markup, labels]);

    // The tapped place picked out with a glow (all its shapes: some
    // introcages have two). An introcage's or area's boxes are drawn again on
    // top of everything while it's picked: in the map file they're under the
    // enclosures and icons, which would hide most of the glow. (Not an
    // enclosure: it'd cover its own name, boxes and icons.)
    useEffect(() => {
        const svg = svgRef.current;
        if (!svg || !picked) return;
        const shapes = [...svg.querySelectorAll("[data-place]")].filter(
            (el) => el.getAttribute("data-place") === String(picked.id)
        );
        if (!shapes.length) return;
        if (!isInside(picked) || !svg.getScreenCTM) {
            shapes.forEach((el) => el.classList.add("is-picked"));
            return () => shapes.forEach((el) => el.classList.remove("is-picked"));
        }
        // Each copy placed as its original is: its parent's transform, in
        // the map's own units
        const toMap = svg.getScreenCTM().inverse();
        const lifted = document.createElementNS(SVG, "g");
        lifted.setAttribute("class", "WholeMap-lifted is-picked");
        for (const el of shapes) {
            const m = toMap.multiply(el.parentNode.getScreenCTM());
            const holder = document.createElementNS(SVG, "g");
            holder.setAttribute("transform", `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
            const copy = el.cloneNode(true);
            copy.removeAttribute("data-place");
            holder.appendChild(copy);
            lifted.appendChild(holder);
        }
        svg.appendChild(lifted);
        return () => lifted.remove();
    }, [picked, markup]);

    // A tap: the place under it (or none: the card goes)
    function tapAt(x, y) {
        const shape = document.elementFromPoint?.(x, y)?.closest?.("[data-place]");
        const id = shape ? Number(shape.getAttribute("data-place")) : null;
        const place = enclosures.find((e) => e.id === id);
        if (!place) return closeCard();
        // (another place: its card slides in, even if one was leaving)
        setLeaving(false);
        setPicked(place);
    }

    const card = picked && placeCard(picked, enclosures, monkeys);

    return createPortal(
        <div
            className="MapPopup WholeMap"
            role="dialog"
            aria-modal="true"
            aria-labelledby="WholeMap-title"
            // (the pop-up takes the drawing's shape: see WholeMap.css)
            style={{ "--map-aspect": bounds.width / bounds.height }}
        >
            <div className="MapPopup-overlay" onClick={onClose} />
            <div className="MapPopup-window WholeMap-window">
                <div className="MapPopup-header WholeMap-header">
                    <h2 id="WholeMap-title">Sanctuary Map</h2>
                    {/* Zoom Out, the slider, Zoom In, Whole Map (once the
                        map is in). The slider goes up in equal steps of
                        how many times bigger, so it feels even all the way */}
                    {markup && (
                        <div className="WholeMap-tools">
                            <button
                                type="button"
                                className={`WholeMap-locate${locationStatus === "finding" ? " is-finding" : ""}`}
                                onClick={toggleLocation}
                                aria-pressed={following}
                                aria-label="My Location"
                                title="My Location"
                            >
                                <IconCurrentLocation size={18} aria-hidden="true" />
                            </button>
                            <MapZoom
                                map={map}
                                reset={() => setCamera(wholeOf(bounds))}
                                resetLabel="Whole Map"
                                atReset={camera.zoom === 1}
                            />
                        </div>
                    )}
                    <CloseButton className="MapPopup-close" ref={closeRef} onClick={onClose} />
                </div>
                {markup ? (
                    <div className="WholeMap-area">
                        <div
                            className="WholeMap-view"
                            ref={viewRef}
                            {...map.pointerHandlers}
                        >
                            <svg
                                ref={svgRef}
                                viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                                // (the tapped place's glow: 5 screen pixels, in map units)
                                style={{ "--glow": `${(5 * view.width) / size.width}px` }}
                                role="img"
                                aria-label="The whole sanctuary map"
                                dangerouslySetInnerHTML={{ __html: markup }}
                            />
                            {/* You: a blue dot (the same size at any zoom), in a
                                pale circle as wide as how sure the phone is */}
                            {here && (
                                <svg
                                    className="WholeMap-here"
                                    viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
                                    aria-hidden="true"
                                >
                                    <circle
                                        className="WholeMap-hereAccuracy"
                                        cx={here.x}
                                        cy={here.y}
                                        r={here.accuracy * UNITS_PER_METRE}
                                    />
                                    <circle
                                        className="WholeMap-hereDot"
                                        cx={here.x}
                                        cy={here.y}
                                        r={(7 * view.width) / size.width}
                                        strokeWidth={(2.5 * view.width) / size.width}
                                    />
                                </svg>
                            )}
                        </div>
                        {/* What My Location is doing, when there's no dot */}
                        <p className="WholeMap-location" role="status">
                            {LOCATION_MESSAGES[locationStatus] ?? ""}
                        </p>
                        {/* The tapped place: its photo, name, what it is,
                            and the way to its page */}
                        {card && (
                            <div className="WholeMap-cardSpot">
                                {/* (keyed: another place's card slides in afresh) */}
                                <div
                                    key={picked.id}
                                    className={`WholeMap-card${leaving ? " is-leaving" : ""}`}
                                    role="region"
                                    aria-label={card.name}
                                >
                                    {card.photo ? (
                                        <img
                                            className="WholeMap-cardPhoto"
                                            src={thumbUrl(card.photo)}
                                            alt=""
                                            crossOrigin="anonymous"
                                            onError={fallbackTo(card.photo)}
                                        />
                                    ) : (
                                        <span className="WholeMap-cardPhoto is-empty" aria-hidden="true">
                                            <IconMap2 size={24} stroke={1.5} />
                                        </span>
                                    )}
                                    <div className="WholeMap-cardText">
                                        <h3>
                                            <PlaceName name={card.name} />
                                        </h3>
                                        <p>{card.kind}</p>
                                        <p className="WholeMap-cardCount">
                                            {card.count} {card.count === 1 ? "monkey" : "monkeys"}
                                        </p>
                                        <a className="WholeMap-cardLink" href={enclosureHash(picked)} onClick={onClose}>
                                            Open Page
                                            <IconArrowRight size={16} aria-hidden="true" />
                                        </a>
                                    </div>
                                    {/* Closes it: a chevron back the way it came */}
                                    <button
                                        type="button"
                                        className="WholeMap-cardClose"
                                        onClick={closeCard}
                                        aria-label={`Close ${card.name}`}
                                        title="Close"
                                    >
                                        <IconChevronLeft size={20} stroke={2} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="SanctuaryMap is-empty WholeMap-area" aria-busy={markup === undefined}>
                        <IconMap2 size={36} stroke={1.5} aria-hidden="true" />
                        <span>{markup === undefined ? "Loading the map…" : "Couldn't load the map. Please try again."}</span>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

export default WholeMap;
