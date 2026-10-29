import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import PlaceName from "./PlaceName";
import {
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
    IconArrowBigLeftLines,
    IconTrees,
    IconSparkles,
    IconBolt,
    IconArrowBigRightLines,
    IconCube,
    IconUserCircle,
    IconCpu,
    IconRosetteDiscountCheck,
    IconHistory,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { FormLockContext, isTyping } from "./formLock";
import { drawMonkeyImage } from "./monkeyImage";
import { ageLabel } from "./ages";
import { monkeyHash, monkeyUrl } from "./monkeyLink";
import { downloadBlob, isFirefoxAndroidApp } from "./canvasHelpers";
import ImagePreview from "./ImagePreview";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import useSwipe from "./useSwipe";
import { fullName, placeLabel, staying } from "./places";
import { isNewArrival } from "./enclosures";
import { InjuryForm, InjuriesSection, useInjuries } from "./Injuries";
import useMonitoring from "./useMonitoring";
import { amText, fedBy, hasFeeding, pmText, summaryDate } from "./feeding";
import StatusUpdate from "./StatusUpdate";
import RecentEdits from "./RecentEdits";
import { FavouriteStar } from "./MonkeyCard";
import { ARCHIVE_STATUSES } from "./monkeyStatus";
import "./Modal.css";
import CloseButton from "./CloseButton";

// Today as the date box wants it ("2026-10-11"), in the browser's own time
const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// What "Return to ..." goes back to
const homeWord = (monkey) =>
    monkey.introcageType === "area" ? "Area" : monkey.introcage ? "Introcage" : "Troop";
// Its home, in full: "Gismo Troop" or "Holt & Barrington C1"
const homeText = (monkey) => (monkey.introcage ? fullName(monkey.introcage) : `${fullName(monkey.troop)} Troop`);

function Modal({
    isModalOpen,
    monkey,
    onClose,
    handlePrevNext,
    prevMonkey,
    nextMonkey,
    onEdit, // given only to editors: shows the Edit button
    onAddPhotos, // editors too: Add Photos, for this monkey
    // editors too: where it is for now, async (monkey, { at: "home" |
    // "sickbay" | "introcage", introcageId, since, note }): Move to Sickbay,
    // Move to Introcage (a stay, introcage-stays.sql), and Return
    onWhereabouts,
    // The introcages it can stay in (stayChoices in enclosures.js; none
    // until the database has stays: then Return just goes home)
    stayChoices = [],
    staff, // { canSee, canAdd, userId, isAdmin } for Injuries and Monitoring (staff only), or null
    onRelease, // editors, new arrivals only: Released, async (monkey, { date, details })
    // admins: Status Update (Deceased, Escaped, Missing), async (monkey, {
    // status, date, details }): it leaves the current records (monkeyStatus.js)
    onStatusUpdate,
    position, // { number, total }: where this monkey is in the list (optional)
    placeHref, // the page of where it lives ("#enclosure/57"), or null
    onOpenPage, // Full Profile: opens the monkey's own page (MonkeyPage), (monkey)
    favourite = false, // a ★ favourite (favourites.js)
    onFavourite, // the ☆ on the photo: () → adds or removes it (none: no star)
    showRecentEdits = false, // staff: Recent Edits, beside Share
}) {
    // Which of the monkey's photos is showing
    const [currentIndex, setCurrentIndex] = useState(0);
    // Which way the new photo slides in: "next" (from the right), "prev"
    // (from the left), or null (no slide, e.g. a new monkey)
    const [slideFrom, setSlideFrom] = useState(null);
    // After Share on a computer: "copied" or "failed"; Save image: "saving"
    // or "imageFailed"
    const [shareStatus, setShareStatus] = useState(null);
    // Recent Edits showing, over the pop-up (a new monkey puts it away)
    const [editsOpen, setEditsOpen] = useState(false);
    const editsButtonRef = useRef(null);
    useEffect(() => setEditsOpen(false), [monkey?.id, isModalOpen]);
    function closeEdits() {
        setEditsOpen(false);
        // (after the panel's gone)
        setTimeout(() => editsButtonRef.current?.focus());
    }
    // Firefox's home-screen app: the picture shown here to press and hold
    const [preview, setPreview] = useState(null);
    const closeButtonRef = useRef(null);
    // The name, between the previous / next arrows: on one line, its type
    // shrinking just enough to fit (28px down to 20px); a name too long even
    // then (e.g. "Elizabeth Bennett" on a small phone) wraps between words
    const titleRef = useRef(null);
    // The pills under the photo: on one row, leaving out the least needed
    // ones (data-drop: 1 first, then 2) if they don't all fit
    const pillsRef = useRef(null);
    useLayoutEffect(() => {
        const row = pillsRef.current;
        if (!row) return undefined;
        function fit() {
            const optional = [...row.querySelectorAll("[data-drop]")].sort((a, b) => a.dataset.drop - b.dataset.drop);
            optional.forEach((pill) => (pill.hidden = false));
            for (const pill of optional) {
                if (row.scrollWidth <= row.clientWidth) break;
                pill.hidden = true;
            }
        }
        fit();
        const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
        watch?.observe(row);
        return () => watch?.disconnect();
    }, [monkey, isModalOpen]);
    useLayoutEffect(() => {
        const title = titleRef.current;
        if (!title) return undefined;
        function fit() {
            title.style.whiteSpace = "nowrap";
            let size = 28;
            title.style.fontSize = `${size}px`;
            while (title.scrollWidth > title.clientWidth && size > 20) {
                size -= 1;
                title.style.fontSize = `${size}px`;
            }
            if (title.scrollWidth > title.clientWidth) title.style.whiteSpace = "normal";
        }
        fit();
        // (again when the pop-up's width changes: a phone turned round)
        const watch = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fit);
        watch?.observe(title.closest(".Modal-header") ?? title.parentElement);
        return () => watch?.disconnect();
    }, [monkey?.name, isModalOpen]);
    // The part that scrolls (photo and details): back to the top for each monkey
    const scrollRef = useRef(null);
    useEffect(() => {
        scrollRef.current?.scrollTo?.(0, 0);
    }, [monkey?.id]);
    // Move to Sickbay / Move to Introcage / Return: the little form while
    // it's open: { to: "sickbay" | "introcage" | "return", introcageId
    // ("" until chosen; Return: "" = home), since, note }
    const [moreOpen, setMoreOpen] = useState(false);
    const moreRef = useRef(null);
    const [sickbayForm, setSickbayForm] = useState(null);
    const [sickbayBusy, setSickbayBusy] = useState(false);
    const [sickbayProblem, setSickbayProblem] = useState(null);
    // Monitoring (staff): Condition Check and Notes for Monitoring, set by
    // admins in Edit (loaded again once it's saved: a new monkey object)
    const monitoring = useMonitoring(monkey?.id, Boolean(isModalOpen && staff?.canSee && monkey), monkey);
    const { conditionCheck, notes: monitoringNotes } = monitoring.value;
    // Released (new arrivals): its little form (date and details)
    const [releaseForm, setReleaseForm] = useState(null);
    const [releaseBusy, setReleaseBusy] = useState(false);
    const [releaseProblem, setReleaseProblem] = useState(null);
    // Status Update (admins): its little form open
    const [statusForm, setStatusForm] = useState(false);
    // Injuries: New Injury's form, and the current list's fold
    const injuries = useInjuries(monkey?.id, staff);
    const [injuryForm, setInjuryForm] = useState(false);
    const [injuriesOpen, setInjuriesOpen] = useState(true);

    // Saves straight away; the pop-up stays open, now with the new state.
    // (Return to an introcage: a new stay there, from today)
    async function changePlace(form) {
        setSickbayBusy(true);
        setSickbayProblem(null);
        const { to, introcageId, since, note, fedBy } = form;
        const details =
            to === "sickbay"
                ? { at: "sickbay", since, note }
                : introcageId
                  ? {
                        at: "introcage",
                        introcageId: Number(introcageId),
                        since: since ?? todayText(),
                        note: note ?? "",
                        // (a troop monkey: who feeds it while it's there)
                        ...(asksFedBy(form) && { fedBy }),
                    }
                  : { at: "home", since, note };
        try {
            await onWhereabouts(monkey, details);
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
    const canSickbay = Boolean(onWhereabouts && monkey && (monkey.inSickbay || !isNewArrival(monkey)));
    // Where it is for now: staying in an introcage (its name), and whether
    // it's away from home at all
    const stayingIn = monkey ? staying(monkey) : null;
    const away = Boolean(monkey?.inSickbay || stayingIn);
    // Move to Introcage: when the database has stays and it's at home
    const canStay = Boolean(onWhereabouts && monkey && !away && stayChoices.length);
    // Return: from Sickbay, asks where to (home, or its own enclosure's
    // introcages); otherwise (a stay, or nowhere else to go) just asks to
    // confirm going home
    const ownChoices = stayChoices.filter((c) => c.own);
    const otherChoices = stayChoices.filter((c) => !c.own);
    const returnAsks = Boolean(monkey?.inSickbay) && ownChoices.length > 0;
    const returnHome = { to: "return", introcageId: "", fedBy: "sickbay", since: todayText(), note: "" };
    // A troop monkey going into an introcage (not already fed in one): who
    // feeds it there, Sickbay to start with
    const asksFedBy = (form) =>
        Boolean(monkey?.feeding) &&
        !monkey.introcage &&
        !stayingIn &&
        (form.to === "introcage" || (form.to === "return" && Boolean(form.introcageId)));
    // A tap outside Quick Actions closes it, unless one of its forms is open
    // (so a half-filled form isn't lost)
    const formOpen = Boolean(sickbayForm || releaseForm || injuryForm || statusForm);
    // Any form open in the pop-up (these, or one in a list: editing an
    // injury, adding an update…) holds it: no other monkey and no closing
    // until its Cancel or Confirm (formLock.js)
    const [lockCount, setLockCount] = useState(0);
    const lock = useCallback(() => {
        setLockCount((n) => n + 1);
        return () => setLockCount((n) => n - 1);
    }, []);
    const locked = formOpen || lockCount > 0;
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
        setStatusForm(false);
        setReleaseProblem(null);
        setMoreOpen(false);
        setInjuryForm(false);
        setSickbayForm(null);
        setSickbayProblem(null);
    }
    // However it closes (the ✕, or the phone's Back button: the address
    // changes, so handleClose never runs), Quick Actions and its forms close
    // too, so the next pop-up starts fresh
    useEffect(() => {
        if (isModalOpen) return;
        resetSickbay();
        setCurrentIndex(0);
        setShareStatus(null);
    }, [isModalOpen]);

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

    // Escape closes; left/right arrow keys move between monkeys (not while
    // typing in a box, or while a form holds the pop-up)
    useDialog(isModalOpen, closeButtonRef, {
        onClose() {
            // (Escape: Recent Edits first, then the pop-up)
            if (editsOpen) closeEdits();
            else if (!locked) handleClose();
        },
        onKeyDown(event) {
            if (locked || editsOpen || isTyping(event.target)) return;
            if (event.key === "ArrowLeft" && prevMonkey) {
                handleClick("prev");
            } else if (event.key === "ArrowRight" && nextMonkey) {
                handleClick("next");
            }
        },
    });

    return (
        // (forms inside hold the pop-up: formLock.js)
        <FormLockContext.Provider value={lock}>
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
                        onClick={locked ? undefined : handleClose}
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
                                <CloseButton ref={closeButtonRef} onClick={handleClose} disabled={locked} />
                            </div>
                            {/* Quick Actions (editors): an icon top left (opposite
                                close) that drops down the quick actions; each one's
                                little form opens in the same drop-down */}
                            {(canSickbay || canStay || onRelease || onStatusUpdate || injuries.canAdd) && (
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
                                            {/* Move to Sickbay (from home, or ending a stay) */}
                                            {canSickbay && !monkey.inSickbay && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    disabled={sickbayBusy}
                                                    onClick={() => setSickbayForm({ to: "sickbay", since: todayText(), note: "" })}
                                                >
                                                    <IconAmbulance size={18} aria-hidden="true" />
                                                    Move to Sickbay
                                                </button>
                                            )}
                                            {canStay && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() =>
                                                        setSickbayForm({
                                                            to: "introcage",
                                                            introcageId: "",
                                                            since: todayText(),
                                                            note: "",
                                                            fedBy: "sickbay",
                                                        })
                                                    }
                                                >
                                                    <IconArrowBigLeftLines size={18} aria-hidden="true" />
                                                    Move to Introcage
                                                </button>
                                            )}
                                            {/* Return: a check first (from Sickbay, with
                                                somewhere else to go: where to) */}
                                            {onWhereabouts && away && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    disabled={sickbayBusy}
                                                    onClick={() =>
                                                        setSickbayForm(returnHome)
                                                    }
                                                >
                                                    {/* (Move to Introcage's arrow, pointing the other way) */}
                                                    <IconArrowBigRightLines size={18} aria-hidden="true" />
                                                    {sickbayBusy ? "Saving…" : `Return to ${homeWord(monkey)}`}
                                                </button>
                                            )}
                                            {onRelease && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() => setReleaseForm({ date: todayText(), details: "" })}
                                                >
                                                    <IconTrees size={18} aria-hidden="true" />
                                                    Release to Wild
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
                                            {/* (the rare, final one last) */}
                                            {onStatusUpdate && !formOpen && (
                                                <button
                                                    type="button"
                                                    className="Modal-edit is-sickbay"
                                                    onClick={() => setStatusForm(true)}
                                                >
                                                    <IconRosetteDiscountCheck size={18} aria-hidden="true" />
                                                    Status Update
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
                                            {statusForm && (
                                                <StatusUpdate
                                                    name={monkey.name}
                                                    choices={ARCHIVE_STATUSES}
                                                    onSave={(values) => onStatusUpdate(monkey, values)}
                                                    onCancel={resetSickbay}
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
                                                    {/* Move to Introcage: which one (its own
                                                        enclosure's first) */}
                                                    {sickbayForm.to === "introcage" && (
                                                        <label>
                                                            <span>Introcage</span>
                                                            <select
                                                                value={sickbayForm.introcageId}
                                                                onChange={(e) => setSickbayForm({ ...sickbayForm, introcageId: e.target.value })}
                                                            >
                                                                <option value="">Choose…</option>
                                                                {ownChoices.length > 0 && (
                                                                    <optgroup label={fullName(ownChoices[0].enclosure)}>
                                                                        {ownChoices.map((c) => (
                                                                            <option key={c.id} value={c.id}>
                                                                                {fullName(c.name)}
                                                                            </option>
                                                                        ))}
                                                                    </optgroup>
                                                                )}
                                                                {otherChoices.length > 0 && (
                                                                    <optgroup label="Other Enclosures">
                                                                        {otherChoices.map((c) => (
                                                                            <option key={c.id} value={c.id}>
                                                                                {fullName(c.name)}
                                                                            </option>
                                                                        ))}
                                                                    </optgroup>
                                                                )}
                                                            </select>
                                                        </label>
                                                    )}
                                                    {/* Return: home, or one of its own
                                                        enclosure's introcages (a new stay) */}
                                                    {sickbayForm.to === "return" &&
                                                        (returnAsks ? (
                                                            <label>
                                                                <span>Return To</span>
                                                                <select
                                                                    value={sickbayForm.introcageId}
                                                                    onChange={(e) => setSickbayForm({ ...sickbayForm, introcageId: e.target.value })}
                                                                >
                                                                    <option value="">{homeText(monkey)} (Home)</option>
                                                                    {ownChoices.map((c) => (
                                                                        <option key={c.id} value={c.id}>
                                                                            {fullName(c.name)}
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            </label>
                                                        ) : (
                                                            <p className="Modal-confirmText">
                                                                Return {monkey.name} to {homeText(monkey)}?
                                                            </p>
                                                        ))}
                                                    {/* Every move: its date and why (they go
                                                        into its Movement record; a stay or
                                                        Sickbay also shows them while it lasts) */}
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
                                                        <span>Reason (optional)</span>
                                                        <input
                                                            type="text"
                                                            value={sickbayForm.note}
                                                            maxLength={200}
                                                            placeholder={
                                                                sickbayForm.to === "sickbay"
                                                                    ? "e.g. leg wound"
                                                                    : sickbayForm.to === "return"
                                                                      ? "e.g. wound healed"
                                                                      : "e.g. integration with Poppy"
                                                            }
                                                            onChange={(e) => setSickbayForm({ ...sickbayForm, note: e.target.value })}
                                                        />
                                                    </label>
                                                    {/* A troop monkey going into an introcage
                                                        (not already fed in one): who feeds it
                                                        there (Sickbay to start with); fed by
                                                        Mainfeed, it's on the AM Plates List */}
                                                    {asksFedBy(sickbayForm) && (
                                                        <>
                                                            <label>
                                                                <span>Fed By</span>
                                                                <select
                                                                    value={sickbayForm.fedBy}
                                                                    onChange={(e) => setSickbayForm({ ...sickbayForm, fedBy: e.target.value })}
                                                                >
                                                                    <option value="sickbay">Sickbay</option>
                                                                    <option value="localTeam">Mainfeed</option>
                                                                </select>
                                                            </label>
                                                            {sickbayForm.fedBy === "localTeam" && (
                                                                <p className="Modal-releaseNote">
                                                                    {monkey.name} will be on the AM Plates List while in an introcage. Check their AM and PM food in Edit.
                                                                </p>
                                                            )}
                                                        </>
                                                    )}
                                                    <div className="Modal-sickbayActions">
                                                        <button
                                                            type="button"
                                                            className="Modal-edit is-confirm"
                                                            disabled={sickbayBusy || (sickbayForm.to === "introcage" && !sickbayForm.introcageId)}
                                                            onClick={() => changePlace(sickbayForm)}
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
                                        disabled={!prevMonkey || locked}
                                        aria-label="Previous monkey"
                                    >
                                        <IconChevronLeft size={22} stroke={2} aria-hidden="true" />
                                    </button>
                                    <div className="Modal-heading">
                                        <h1 className="Modal-title" id="Modal-title" ref={titleRef}>
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
                                        disabled={!nextMonkey || locked}
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
                                    {/* Its status (New Arrival, In Sickbay, In Gismo A):
                                        on the photo, top left, like the cards */}
                                    {(isNewArrival(monkey) || monkey.inSickbay || stayingIn) && (
                                        <ul className="Modal-status" aria-label="Status">
                                            {isNewArrival(monkey) && (
                                                <li className="is-newArrival">
                                                    <IconSparkles size={15} stroke={2} aria-hidden="true" />
                                                    New Arrival
                                                </li>
                                            )}
                                            {monkey.inSickbay && (
                                                <li className="is-sickbay">
                                                    <IconFirstAidKit size={15} stroke={2} aria-hidden="true" />
                                                    In Sickbay
                                                </li>
                                            )}
                                            {stayingIn && (
                                                <li className="is-stay">
                                                    <IconCube size={15} stroke={2} aria-hidden="true" />
                                                    In <PlaceName name={stayingIn} />
                                                </li>
                                            )}
                                        </ul>
                                    )}
                                    {/* Favourites: the ☆ top right, as on the cards */}
                                    {onFavourite && (
                                        <span className="Modal-star" onPointerDown={(e) => e.stopPropagation()}>
                                            <FavouriteStar
                                                className="MonkeyCard-star"
                                                name={monkey.name}
                                                favourite={favourite}
                                                onClick={onFavourite}
                                            />
                                        </span>
                                    )}
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
                                    <ul className="Modal-pills" aria-label="Details" ref={pillsRef}>
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
                                        {/* Sex: just its symbol (the word is read out), so
                                            the pills fit one line */}
                                        {monkey.sex === "male" || monkey.sex === "female" ? (
                                            <li className="is-sex" title={monkey.sex === "male" ? "Male" : "Female"}>
                                                {monkey.sex === "male" ? (
                                                    <IconMars size={17} stroke={2} aria-hidden="true" />
                                                ) : (
                                                    <IconVenus size={17} stroke={2} aria-hidden="true" />
                                                )}
                                                <span className="visually-hidden">{monkey.sex === "male" ? "Male" : "Female"}</span>
                                            </li>
                                        ) : (
                                            <li>Sex unknown</li>
                                        )}
                                        {/* (left out first if the row's too full: "Birth
                                            year unknown", then "Born 2016", which the age
                                            beside it nearly says, then the chip) */}
                                        <li data-drop={monkey.year ? "2" : "1"}>
                                            {monkey.year ? `Born ${monkey.year}` : "Birth year unknown"}
                                        </li>
                                        {monkey.year && <li>{ageLabel(monkey.year)}</li>}
                                        {/* (and last of all, the chip) */}
                                        {/* The chip: its icon and number ("Chip" is read out) */}
                                        <li data-drop="3" title="Microchip">
                                            <IconCpu size={16} stroke={2} aria-hidden="true" />
                                            <span className="visually-hidden">Chip</span>
                                            {monkey.chip === null ? "Unknown" : monkey.chip ? monkey.chip : "None"}
                                        </li>
                                    </ul>
                                    {/* (a new arrival's Arrival Info: on its page) */}
                                    <section className="Modal-section">
                                        <h2 className="Modal-label">Bio</h2>
                                        <p>{monkey.bio || "No bio yet."}</p>
                                    </section>
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
                                    {/* Staying in an introcage: where, since when and
                                        why (the pill says where in short) */}
                                    {stayingIn && (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Current Location</h2>
                                            <p>
                                                {[
                                                    `${fullName(stayingIn)} (home: ${homeText(monkey)})`,
                                                    monkey.stay.since &&
                                                        `Since ${summaryDate(new Date(`${monkey.stay.since}T00:00:00`))}`,
                                                    monkey.stay.note,
                                                ]
                                                    .filter(Boolean)
                                                    .join(" · ")}
                                            </p>
                                        </section>
                                    )}
                                    {/* Monitoring (staff): only once there's something */}
                                    {monitoring.available && (conditionCheck || monitoringNotes) && (
                                        <section className="Modal-section">
                                            <h2 className="Modal-label">Monitoring</h2>
                                            <p className="Modal-feeding">
                                                {conditionCheck && (
                                                    <span>
                                                        <b>Priority Condition Check</b>
                                                    </span>
                                                )}
                                                {monitoringNotes && <span className="Modal-monitoringNotes">{monitoringNotes}</span>}
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
                                {/* Full Profile (staff), outlined blue, on the left; then
                                    Edit and Photos (editors), Share and Save image, as
                                    icons together on the right (every button's name is
                                    its tooltip and what's read out) */}
                                <div className="Modal-footer">
                                    {onOpenPage ? (
                                        <button
                                            type="button"
                                            className="Modal-edit Modal-fullProfile"
                                            onClick={() => onOpenPage(monkey)}
                                            disabled={locked}
                                        >
                                            <IconUserCircle size={18} aria-hidden="true" />
                                            Full Profile
                                        </button>
                                    ) : (
                                        <span />
                                    )}
                                    <div className="Modal-footerSide is-end">
                                        {onEdit && (
                                            <button
                                                type="button"
                                                className="Modal-edit is-icon"
                                                onClick={() => {
                                                    setCurrentIndex(0);
                                                    onEdit(monkey);
                                                }}
                                                title="Edit"
                                            >
                                                <IconPencil size={18} aria-hidden="true" />
                                                <span className="Modal-editLabel">Edit</span>
                                            </button>
                                        )}
                                        {onAddPhotos && (
                                            <button
                                                type="button"
                                                className="Modal-edit is-soft is-icon"
                                                onClick={() => onAddPhotos(monkey)}
                                                aria-label={`Add photos of ${monkey.name}`}
                                                title="Add Photos"
                                            >
                                                <IconPhotoPlus size={18} aria-hidden="true" />
                                            </button>
                                        )}
                                        {showRecentEdits && (
                                            <button
                                                type="button"
                                                className="Modal-edit is-quiet is-icon"
                                                onClick={() => setEditsOpen(true)}
                                                ref={editsButtonRef}
                                                aria-label={`Recent edits to ${monkey.name}`}
                                                title="Recent Edits"
                                            >
                                                <IconHistory size={18} aria-hidden="true" />
                                            </button>
                                        )}
                                        <button type="button" className="Modal-edit is-quiet is-icon" onClick={shareMonkey} title="Share">
                                            <IconShare size={18} aria-hidden="true" />
                                            <span className="Modal-editLabel">{shareStatus === "copied" ? "Link copied!" : "Share"}</span>
                                        </button>
                                        <button
                                            type="button"
                                            className="Modal-edit is-quiet is-icon"
                                            onClick={saveImage}
                                            disabled={shareStatus === "saving"}
                                            title="Save image"
                                        >
                                            <IconDownload size={18} aria-hidden="true" />
                                            <span className="Modal-editLabel">{shareStatus === "saving" ? "Saving…" : "Save image"}</span>
                                        </button>
                                    </div>
                                </div>
                                </div>
                                {editsOpen && <RecentEdits monkey={monkey} onClose={closeEdits} />}
                                <ImagePreview image={preview} onClose={() => setPreview(null)} />
                            </motion.div>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
        </FormLockContext.Provider>
    );
}

export default Modal;
