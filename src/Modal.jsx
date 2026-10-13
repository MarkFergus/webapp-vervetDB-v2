import { useEffect, useRef, useState } from "react";
import PlaceName from "./PlaceName";
import {
    IconX,
    IconChevronLeft,
    IconChevronRight,
    IconMars,
    IconVenus,
    IconDownload,
    IconPencil,
    IconShare,
    IconCameraPlus,
    IconPhotoPlus,
    IconFirstAidKit,
    IconAmbulance,
    IconReportMedical,
    IconDoorExit,
    IconTrees,
    IconSparkles,
    IconBolt,
    IconClipboardText,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { drawMonkeyImage } from "./monkeyImage";
import { ageLabel } from "./ages";
import { monkeyHash, monkeyUrl } from "./monkeyLink";
import { downloadBlob, isFirefoxAndroidApp } from "./canvasHelpers";
import ImagePreview from "./ImagePreview";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import useSwipe from "./useSwipe";
import { placeLabel } from "./places";
import { isNewArrival } from "./enclosures";
import { IntegrationForm, IntegrationList, newReportDates, useIntegration } from "./IntegrationReports";
import { InjuryForm, InjuriesSection, useInjuries } from "./Injuries";
import useArrivalInfo from "./useArrivalInfo";
import { amText, fedBy, hasFeeding, pmText, summaryDate } from "./feeding";
import "./Modal.css";

// Today as the date box wants it ("2026-10-11"), in the browser's own time
const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// What "Return to ..." goes back to
const homeWord = (monkey) =>
    monkey.introcageType === "area" ? "Area" : monkey.introcage ? "Introcage" : "Troop";

function Modal({
    isModalOpen,
    monkey,
    onClose,
    handlePrevNext,
    prevMonkey,
    nextMonkey,
    onEdit, // given only to editors: shows the Edit button
    onAddPhotos, // editors too: Add Photos, for this monkey
    onSickbay, // editors too: Move to Sickbay / Return, async (monkey, { inSickbay, since, note })
    staff, // { canSee, canAdd, userId, isAdmin } for Integration Reports (staff only), or null
    onRelease, // editors, new rescues only: Released, async (monkey, { date, details })
    position, // { number, total }: where this monkey is in the list (optional)
    placeHref, // the page of where it lives ("#enclosure/57"), or null
}) {
    // Which of the monkey's photos is showing
    const [currentIndex, setCurrentIndex] = useState(0);
    // Which way the new photo slides in: "next" (from the right), "prev"
    // (from the left), or null (no slide, e.g. a new monkey)
    const [slideFrom, setSlideFrom] = useState(null);
    // After Share on a computer: "copied" or "failed"; Save image: "saving"
    // or "imageFailed"
    const [shareStatus, setShareStatus] = useState(null);
    // Firefox's home-screen app: the picture shown here to press and hold
    const [preview, setPreview] = useState(null);
    const closeButtonRef = useRef(null);
    // The part that scrolls (photo and details): back to the top for each monkey
    const scrollRef = useRef(null);
    useEffect(() => {
        scrollRef.current?.scrollTo?.(0, 0);
    }, [monkey?.id]);
    // Move to Sickbay: the little form (date and note) while it's open
    const [moreOpen, setMoreOpen] = useState(false);
    const moreRef = useRef(null);
    const [sickbayForm, setSickbayForm] = useState(null);
    const [sickbayBusy, setSickbayBusy] = useState(false);
    const [sickbayProblem, setSickbayProblem] = useState(null);
    // A new rescue's Arrival Info replaces its Bio, for staff
    const arrival = useArrivalInfo(
        monkey?.id,
        Boolean(isModalOpen && staff?.canSee && monkey && isNewArrival(monkey))
    );
    // Released (new rescues): its little form (date and details)
    const [releaseForm, setReleaseForm] = useState(null);
    const [releaseBusy, setReleaseBusy] = useState(false);
    const [releaseProblem, setReleaseProblem] = useState(null);
    // Integration Reports: its form (the + button) and the fold-out list
    const integration = useIntegration(monkey?.id, staff);
    const [integrationForm, setIntegrationForm] = useState(false);
    const [listOpen, setListOpen] = useState(false);
    // Injuries: New Injury's form, and the current list's fold
    const injuries = useInjuries(monkey?.id, staff);
    const [injuryForm, setInjuryForm] = useState(false);
    const [injuriesOpen, setInjuriesOpen] = useState(true);

    // Saves straight away; the pop-up stays open, now with the new state
    async function changeSickbay(inSickbay) {
        setSickbayBusy(true);
        setSickbayProblem(null);
        try {
            await onSickbay(monkey, { inSickbay, since: sickbayForm?.since, note: sickbayForm?.note });
            setSickbayForm(null);
            setMoreOpen(false);
        } catch (err) {
            setSickbayProblem(err.message);
        } finally {
            setSickbayBusy(false);
        }
    }
    // Saves, and the monkey leaves the app (the pop-up closes); its record stays on file
    async function confirmRelease() {
        setReleaseBusy(true);
        setReleaseProblem(null);
        try {
            await onRelease(monkey, { date: releaseForm.date, details: releaseForm.details });
        } catch (err) {
            setReleaseProblem(err.message);
        } finally {
            setReleaseBusy(false);
        }
    }
    // Move to Sickbay: not for new arrivals (anyone in a care unit: a move
    // there is a change of location, not a stay in Sickbay). Return still
    // shows if one is somehow marked In Sickbay.
    const canSickbay = Boolean(onSickbay && monkey && (monkey.inSickbay || !isNewArrival(monkey)));
    // + Integration Report: not for new arrivals (they move to a troop
    // enclosure before integration starts)
    const canReport = Boolean(integration.canAdd && monkey && !isNewArrival(monkey));
    // A tap outside Quick Actions closes it, unless one of its forms is open
    // (so a half-filled form isn't lost)
    const formOpen = Boolean(sickbayForm || releaseForm || integrationForm || injuryForm);
    useEffect(() => {
        if (!moreOpen || formOpen) return;
        function handlePointerDown(event) {
            if (!moreRef.current?.contains(event.target)) setMoreOpen(false);
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [moreOpen, formOpen]);
    function resetSickbay() {
        setReleaseForm(null);
        setReleaseProblem(null);
        setMoreOpen(false);
        setIntegrationForm(false);
        setListOpen(false);
        setInjuryForm(false);
        setSickbayForm(null);
        setSickbayProblem(null);
    }

    // Phones open their share menu (e.g. WhatsApp) with a link to this
    // monkey; computers copy the link
    async function shareMonkey() {
        const url = monkeyUrl(monkey);
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${monkey.name} · vervetDB`,
                    text: `${monkey.name} (${placeLabel(monkey)}) on vervetDB`,
                    url,
                });
                return;
            } catch (err) {
                if (err.name === "AbortError") return; // closed the share menu
            }
        }
        try {
            await navigator.clipboard.writeText(url);
            setShareStatus("copied");
        } catch {
            setShareStatus("failed");
        }
    }

    // Downloads a picture of this monkey's profile (with the photo showing)
    async function saveImage() {
        setShareStatus("saving");
        try {
            const blob = await drawMonkeyImage(monkey, { photo: monkey.img[currentIndex] });
            if (isFirefoxAndroidApp()) setPreview(blob);
            else downloadBlob(blob, `vervetdb-${monkeyHash(monkey).split("/")[1]}.png`);
            setShareStatus(null);
        } catch (err) {
            console.error("Couldn't make the picture:", err);
            setShareStatus("imageFailed");
        }
    }

    function handleClose() {
        onClose();
        setCurrentIndex(0);
        setShareStatus(null);
        resetSickbay();
    }
    function handleClick(direction) {
        handlePrevNext(direction);
        resetSickbay();
        setCurrentIndex(0);
        setSlideFrom(null);
        setShareStatus(null);
    }
    function handleImgClick(direction) {
        const count = monkey.img.length;
        setSlideFrom(direction);
        if (direction === "prev") {
            setCurrentIndex((i) => (i - 1 + count) % count);
        } else if (direction === "next") {
            setCurrentIndex((i) => (i + 1) % count);
        }
    }

    const photoSwipe = useSwipe(handleImgClick, (monkey?.img.length ?? 0) > 1);

    // Escape closes; left/right arrow keys move between monkeys
    useDialog(isModalOpen, closeButtonRef, {
        onClose: handleClose,
        onKeyDown(event) {
            if (event.key === "ArrowLeft" && prevMonkey) {
                handleClick("prev");
            } else if (event.key === "ArrowRight" && nextMonkey) {
                handleClick("next");
            }
        },
    });

    return (
        <AnimatePresence>
            {isModalOpen && (
                <div
                    className="Modal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="Modal-title"
                >
                    <motion.div
                        className="Modal-overlay"
                        onClick={handleClose}
                        initial={{ opacity: 0 }}
                        animate={{
                            opacity: 1,
                            transition: {
                                duration: 0.3,
                            },
                        }}
                        exit={{
                            opacity: 0,
                        }}
                    ></motion.div>
                    <motion.div
                        className="Modal-windowbox"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{
                            scale: 1,
                            opacity: 1,
                            transition: {
                                duration: 0.3,
                            },
                        }}
                        exit={{
                            scale: 0,
                            opacity: 0,
                        }}
                    >
                        <div className="Modal-window">
                            <div className="Modal-close">
                                <button
                                    type="button"
                                    ref={closeButtonRef}
                                    onClick={handleClose}
                                    aria-label="Close"
                                >
                                    <IconX size={22} stroke={2} aria-hidden="true" />
                                </button>
                            </div>
                            {/* Quick Actions (editors): an icon top left (opposite
                                close) that drops down the quick actions; each one's
                                little form opens in the same drop-down */}
                            {(canSickbay || onRelease || canReport || injuries.canAdd) && (
                                <div className="Modal-moreActions" ref={moreRef}>
                                    <button
                                        type="button"
                                        className="Modal-moreToggle"
                                        aria-expanded={moreOpen}
                                        aria-label="Quick Actions"
                                        title="Quick Actions"
                                        onClick={() => (moreOpen ? resetSickbay() : setMoreOpen(true))}
                                    >
                                        <IconBolt size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                    {moreOpen && (
                                        <div className={`Modal-moreRow${formOpen ? " is-form" : ""}`}>
                                            {canSickbay && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    disabled={sickbayBusy}
                                                    onClick={() =>
                                                        monkey.inSickbay
                                                            ? changeSickbay(false)
                                                            : setSickbayForm({ since: todayText(), note: "" })
                                                    }
                                                >
                                                    {/* (the door when returning, the ambulance when moving in) */}
                                                    {monkey.inSickbay ? (
                                                        <IconDoorExit size={18} aria-hidden="true" />
                                                    ) : (
                                                        <IconAmbulance size={18} aria-hidden="true" />
                                                    )}
                                                    {sickbayBusy
                                                        ? "Saving…"
                                                        : monkey.inSickbay
                                                          ? `Return to ${homeWord(monkey)}`
                                                          : "Move to Sickbay"}
                                                </button>
                                            )}
                                            {onRelease && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() => setReleaseForm({ date: todayText(), details: "" })}
                                                >
                                                    <IconTrees size={18} aria-hidden="true" />
                                                    Released to Wild
                                                </button>
                                            )}
                                            {injuries.canAdd && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() => setInjuryForm(true)}
                                                >
                                                    <IconReportMedical size={18} aria-hidden="true" />
                                                    New Injury
                                                </button>
                                            )}
                                            {canReport && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() => setIntegrationForm(true)}
                                                >
                                                    <IconClipboardText size={18} aria-hidden="true" />
                                                    Integration Report
                                                </button>
                                            )}
                                            {injuryForm && (
                                                <InjuryForm
                                                    initial={{ date: todayText(), description: "" }}
                                                    max={todayText()}
                                                    onSave={async (values) => {
                                                        await injuries.add(values);
                                                        setInjuryForm(false);
                                                        setMoreOpen(false);
                                                        setInjuriesOpen(true);
                                                    }}
                                                    onCancel={() => {
                                                        setInjuryForm(false);
                                                        setMoreOpen(false);
                                                    }}
                                                />
                                            )}
                                            {integrationForm && (
                                                <IntegrationForm
                                                    initial={{ ...newReportDates(), report: "" }}
                                                    onSave={async (values) => {
                                                        await integration.add(values);
                                                        setIntegrationForm(false);
                                                        setMoreOpen(false);
                                                        setListOpen(true);
                                                    }}
                                                    onCancel={() => {
                                                        setIntegrationForm(false);
                                                        setMoreOpen(false);
                                                    }}
                                                />
                                            )}
                                            {releaseForm && (
                                                <div className="Modal-sickbayForm">
                                                    <label>
                                                        <span>Date Released</span>
                                                        <input
                                                            type="date"
                                                            value={releaseForm.date}
                                                            max={todayText()}
                                                            onChange={(e) => setReleaseForm({ ...releaseForm, date: e.target.value })}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span>Release Details</span>
                                                        <textarea
                                                            rows={4}
                                                            value={releaseForm.details}
                                                            maxLength={500}
                                                            placeholder="Where and how they were released"
                                                            onChange={(e) => setReleaseForm({ ...releaseForm, details: e.target.value })}
                                                        />
                                                    </label>
                                                    <p className="Modal-releaseNote">
                                                        {monkey.name} will no longer appear in the app. Their record stays on file.
                                                    </p>
                                                    {releaseProblem && (
                                                        <p className="Modal-sickbayProblem" role="alert">
                                                            {releaseProblem}
                                                        </p>
                                                    )}
                                                    <div className="Modal-sickbayActions">
                                                        <button
                                                            type="button"
                                                            className="Modal-edit is-confirm"
                                                            disabled={releaseBusy || !releaseForm.date}
                                                            onClick={confirmRelease}
                                                        >
                                                            {releaseBusy ? "Saving…" : "Confirm"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="Modal-edit is-quiet"
                                                            disabled={releaseBusy}
                                                            onClick={resetSickbay}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {sickbayForm && (
                                                <div className="Modal-sickbayForm">
                                                    <label>
                                                        <span>Date Moved</span>
                                                        <input
                                                            type="date"
                                                            value={sickbayForm.since}
                                                            max={todayText()}
                                                            onChange={(e) => setSickbayForm({ ...sickbayForm, since: e.target.value })}
                                                        />
                                                    </label>
                                                    <label>
                                                        <span>Note (optional)</span>
                                                        <input
                                                            type="text"
                                                            value={sickbayForm.note}
                                                            maxLength={200}
                                                            placeholder="e.g. leg wound"
                                                            onChange={(e) => setSickbayForm({ ...sickbayForm, note: e.target.value })}
                                                        />
                                                    </label>
                                                    <div className="Modal-sickbayActions">
                                                        <button
                                                            type="button"
                                                            className="Modal-edit is-confirm"
                                                            disabled={sickbayBusy}
                                                            onClick={() => changeSickbay(true)}
                                                        >
                                                            {sickbayBusy ? "Saving…" : "Confirm"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="Modal-edit is-quiet"
                                                            disabled={sickbayBusy}
                                                            onClick={resetSickbay}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                            {sickbayProblem && (
                                                <p className="Modal-sickbayProblem" role="alert">
                                                    {sickbayProblem}
                                                </p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                            <motion.div className="Modal-content">
                                {/* Name between quiet round previous / next buttons
                                    (kept in place, just hidden, at either end of
                                    the list so the name doesn't shift) */}
                                <div className="Modal-header">
                                    <button
                                        type="button"
                                        className="Modal-monkeyArrow"
                                        onClick={() => handleClick("prev")}
                                        disabled={!prevMonkey}
                                        aria-label="Previous monkey"
                                    >
                                        <IconChevronLeft size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                    <div className="Modal-heading">
                                        <h1 className="Modal-title" id="Modal-title">
                                            {monkey.name}
                                        </h1>
                                        {position && (
                                            <p className="Modal-position">
                                                {position.number} of {position.total}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        className="Modal-monkeyArrow"
                                        onClick={() => handleClick("next")}
                                        disabled={!nextMonkey}
                                        aria-label="Next monkey"
                                    >
                                        <IconChevronRight size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                </div>
                                {/* The photo and details scroll; the name and arrows above
                                    and the buttons below stay in view */}
                                <div className="Modal-scroll" ref={scrollRef}>
                                {/* Phones: swipe the photo left / right for the next /
                                    previous one; it follows the finger */}
                                <div
                                    className={`Modal-img${monkey.img.length > 1 ? " is-swipeable" : ""}`}
                                    {...photoSwipe.handlers}
                                >
                                    {/* Offline and never opened: its saved thumbnail instead */}
                                    <img
                                        key={monkey.img[currentIndex]}
                                        className={slideFrom ? `is-from-${slideFrom}` : undefined}
                                        style={
                                            photoSwipe.dragX
                                                ? { transform: `translateX(${photoSwipe.dragX}px)`, transition: "none" }
                                                : undefined
                                        }
                                        draggable={false}
                                        src={monkey.img[currentIndex]}
                                        crossOrigin="anonymous"
                                        onError={fallbackTo(thumbUrl(monkey.img[currentIndex]))}
                                        alt={
                                            monkey.img.length > 1
                                                ? `${monkey.name}, photo ${currentIndex + 1} of ${monkey.img.length}`
                                                : monkey.name
                                        }
                                    ></img>
                                    {/* Still the grey placeholder: the same badge as the cards */}
                                    {isPlaceholderPhoto(monkey.img[currentIndex]) && (
                                        <span className="Modal-photoNeeded">
                                            <IconCameraPlus size={16} aria-hidden="true" />
                                            Photo Needed
                                        </span>
                                    )}
                                    {monkey.img.length > 1 && (
                                        <>
                                            {/* Round buttons over the photo's edges */}
                                            <button
                                                type="button"
                                                className="Modal-imageButton is-prev"
                                                onClick={() => handleImgClick("prev")}
                                                aria-label="Previous photo"
                                            >
                                                <IconChevronLeft stroke={2.5} aria-hidden="true" />
                                            </button>
                                            <button
                                                type="button"
                                                className="Modal-imageButton is-next"
                                                onClick={() => handleImgClick("next")}
                                                aria-label="Next photo"
                                            >
                                                <IconChevronRight stroke={2.5} aria-hidden="true" />
                                            </button>
                                            {/* Which photo this is (the photo's
                                                description says it in words) */}
                                            <div className="Modal-photoDots" aria-hidden="true">
                                                {monkey.img.map((_, i) => (
                                                    <span
                                                        key={i}
                                                        className={i === currentIndex ? "is-current" : undefined}
                                                    />
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* The facts as pills (like the cards and the saved
                                    picture), then the bio and features */}
                                <div className="Modal-details">
                                    <ul className="Modal-pills" aria-label="Details">
                                        {/* Its troop (or introcage): tap for that
                                            enclosure's page */}
                                        {placeHref ? (
                                            <li className="is-troop is-link">
                                                <a
                                                    href={placeHref}
                                                    onClick={(event) => {
                                                        // Already on that page: just close
                                                        if (window.location.hash === placeHref) {
                                                            event.preventDefault();
                                                            onClose();
                                                        }
                                                    }}
                                                >
                                                    {monkey.introcage ? <PlaceName name={monkey.introcage} /> : <PlaceName name={monkey.troop} suffix=" Troop" />}
                                                    <IconChevronRight size={14} stroke={2.5} aria-hidden="true" />
                                                </a>
                                            </li>
                                        ) : (
                                            <li className="is-troop">{monkey.introcage ? <PlaceName name={monkey.introcage} /> : <PlaceName name={monkey.troop} suffix=" Troop" />}</li>
                                        )}
                                        {isNewArrival(monkey) && (
                                            <li className="is-newArrival">
                                                <IconSparkles size={15} stroke={2} aria-hidden="true" />
                                                New Arrival
                                            </li>
                                        )}
                                        {/* (right after where it lives) */}
                                        {monkey.inSickbay && (
                                            <li className="is-sickbay">
                                                <IconFirstAidKit size={15} stroke={2} aria-hidden="true" />
                                                In Sickbay
                                            </li>
                                        )}
                                        <li>
                                            {monkey.sex === "male" && <IconMars size={15} stroke={2} aria-hidden="true" />}
                                            {monkey.sex === "female" && <IconVenus size={15} stroke={2} aria-hidden="true" />}
                                            {monkey.sex === "male" ? "Male" : monkey.sex === "female" ? "Female" : "Sex unknown"}
                                        </li>
                                        <li>{monkey.year ? `Born ${monkey.year}` : "Birth year unknown"}</li>
                                        {monkey.year && <li>{ageLabel(monkey.year)}</li>}
                                        <li>{monkey.chip === null ? "Chip Unknown" : monkey.chip ? `Chip ${monkey.chip}` : "No Chip"}</li>
                                    </ul>
                                    {arrival.available ? (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Arrival Info</h2>
                                            <p className="Modal-arrival">{arrival.info || "No arrival info yet."}</p>
                                        </section>
                                    ) : (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Bio</h2>
                                            <p>{monkey.bio || "No bio yet."}</p>
                                        </section>
                                    )}
                                    <section className="Modal-section">
                                        <h2 className="Modal-label">Distinctive features &amp; behaviours</h2>
                                        <p className="Modal-details-description">
                                            {monkey.desc ? monkey.desc : "Nothing. Nada. Zilch."}
                                        </p>
                                    </section>
                                    {/* Introcage monkeys: what they're fed (after the bio and features) */}
                                    {hasFeeding(monkey) && (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Feeding</h2>
                                            {fedBy(monkey) === "sickbay" ? (
                                                <p>
                                                    Fed by Sickbay
                                                    {monkey.feeding.fedBy !== "sickbay" && " while in Sickbay"}
                                                </p>
                                            ) : (
                                                <p className="Modal-feeding">
                                                    <span><b>AM food:</b> {amText(monkey)}</span>
                                                    <span><b>PM food:</b> {pmText(monkey)}</span>
                                                </p>
                                            )}
                                        </section>
                                    )}
                                    {/* In Sickbay: since when and why (the pill says it
                                        in short; nothing at all when it isn't) */}
                                    {monkey.inSickbay && (monkey.sickbaySince || monkey.sickbayNote) && (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Sickbay</h2>
                                            <p>
                                                {[
                                                    monkey.sickbaySince &&
                                                        `Since ${summaryDate(new Date(`${monkey.sickbaySince}T00:00:00`))}`,
                                                    monkey.sickbayNote,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        </section>
                                    )}
                                    {/* Injuries (staff): current, then Injury History
                                        (only once there's been one) */}
                                    <InjuriesSection
                                        injuries={injuries}
                                        open={injuriesOpen}
                                        onToggle={() => setInjuriesOpen((open) => !open)}
                                        today={todayText()}
                                    />
                                    {/* (its own section, with its own line above: only
                                        once there's a report) */}
                                    <IntegrationList
                                        integration={integration}
                                        open={listOpen}
                                        onToggle={() => setListOpen((open) => !open)}
                                    />
                                </div>
                                </div>
                                {/* Pinned to the bottom: the message, then Edit and Photos
                                    (editors only) on the left; Share and Save image on the right */}
                                <div className="Modal-bar">
                                <p className="Modal-shareStatus" role="status">
                                    {shareStatus === "copied" &&
                                        "Link copied. Paste it into a message to share this monkey."}
                                    {shareStatus === "failed" &&
                                        "Sorry, your browser wouldn't let us copy the link."}
                                    {shareStatus === "imageFailed" &&
                                        "Sorry, the picture couldn't be made. Please try again."}
                                </p>
                                <div className="Modal-footer">
                                    {onEdit && (
                                        <button
                                            type="button"
                                            className="Modal-edit"
                                            onClick={() => {
                                                setCurrentIndex(0);
                                                onEdit(monkey);
                                            }}
                                        >
                                            <IconPencil size={18} aria-hidden="true" />
                                            Edit
                                        </button>
                                    )}
                                    {onAddPhotos && (
                                        <button
                                            type="button"
                                            className="Modal-edit is-soft"
                                            onClick={() => onAddPhotos(monkey)}
                                            aria-label={`Add photos of ${monkey.name}`}
                                        >
                                            <IconPhotoPlus size={18} aria-hidden="true" />
                                            Photos
                                        </button>
                                    )}
                                    <span className="Modal-footer-spacer" />
                                    <button type="button" className="Modal-edit is-quiet" onClick={shareMonkey}>
                                        <IconShare size={18} aria-hidden="true" />
                                        {/* (phones: just the icon, so the buttons fit one row) */}
                                        <span className="Modal-editLabel">{shareStatus === "copied" ? "Link copied!" : "Share"}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="Modal-edit is-quiet"
                                        onClick={saveImage}
                                        disabled={shareStatus === "saving"}
                                    >
                                        <IconDownload size={18} aria-hidden="true" />
                                        <span className="Modal-editLabel">{shareStatus === "saving" ? "Saving…" : "Save image"}</span>
                                    </button>
                                </div>
                                </div>
                                <ImagePreview image={preview} onClose={() => setPreview(null)} />
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default Modal;
