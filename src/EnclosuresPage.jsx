import { useEffect, useRef, useState } from "react";
import PlaceName from "./PlaceName";
import {
    IconArrowLeft,
    IconBed,
    IconBowl,
    IconCalendar,
    IconDoor,
    IconHome,
    IconInfoCircle,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconCube,
    IconMap2,
    IconMapPin,
    IconPencil,
    IconPhoto,
    IconRuler2,
    IconTool,
} from "@tabler/icons-react";
import MonkeyRow, { MonkeyListHeader } from "./MonkeyRow";
import SanctuaryMap from "./SanctuaryMap";
import EnclosureForm from "./EnclosureForm";
import MaintenanceLog from "./MaintenanceLog";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import useSwipe from "./useSwipe";
import SortMenu from "./SortMenu";
import { fullName, inIntrocage, placeName, staying } from "./places";
import {
    bySection,
    ENCLOSURES_HASH,
    enclosureFromRoute,
    enclosureHash,
    hasTroop,
    isCareUnit,
    isInside,
    isSoleArea,
    soleArea,
    TYPE_NAMES,
    establishedText,
    introcageMonkeys,
    showsNewArrival,
    introcageWord,
    introcagesOf,
    monkeyCount,
    awayFrom,
    residents,
    averageAge,
    ordinal,
    sizeRank,
    sizeText,
    stepsFrom,
    troopMonkeys,
    troopRank,
} from "./enclosures";
import "./Modal.css"; // the photo arrows and dots
import "./EnclosuresPage.css";
import BenchTreeIcon from "./BenchTreeIcon";
import MonkeysNavIcon from "./MonkeysNavIcon";

// The Enclosures pages, shown under the site's top bar (ShowPage): every
// troop enclosure with its introcages, in section order (#enclosures), and
// one enclosure or introcage's record (#enclosure/<id>): its details and
// the monkeys living there. View only for now; editing comes next.
//   onOpenMonkey(monkey, group): opens the monkey's pop-up, stepping through
//   that group with previous / next

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;
// Just the word, for a number tile's label ("1 Monkey", "3 Monkeys")
const wordFor = (n, word, many = `${word}s`) => (n === 1 ? word : many);

// Care units' cages, which aren't recorded as areas of their own (they
// share one area): how many, and what they're called
const CARE_UNIT_CAGES = {
    Quarantine: { count: 6, word: "Quarantine Cage" },
    Sickbay: { count: 10, word: "Patient Cage" },
};

// An enclosure's Type, in its details
const ENCLOSURE_TYPES = { troop: "Troop Enclosure", block: "Block Enclosure", care_unit: "Care Unit" };

// An introcage's yes / no details (null or missing: not recorded)
const yesNo = (value) => (value === true ? "Yes" : value === false ? "No" : null);

// One of the details rows: icon and label on the left, the value (or "Not
// recorded") on the right
export function DetailRow({ icon: Icon, label, value, className }) {
    return (
        <div className={className || undefined}>
            <dt>
                <Icon size={16} aria-hidden="true" />
                {label}
            </dt>
            <dd>{value ?? <span className="Enclosures-unset">Not recorded</span>}</dd>
        </div>
    );
}

// The details, laid out for phones (two side by side): which are in the
// right-hand column (a line on their left), and the wide one (Type) across
// a whole row when there's an odd number. Gives each row its className.
export function inPairs(rows) {
    const odd = rows.length % 2 === 1;
    let column = 0;
    return rows.map(({ wide, ...row }) => {
        if (wide && odd) {
            column = 0;
            return { ...row, className: "is-wide" };
        }
        const className = column === 1 ? "is-right" : undefined;
        column = 1 - column;
        return { ...row, className };
    });
}

// "← Enclosures" / "← H&B": back up a level
export function BackLink({ href, label }) {
    return (
        <a href={href} className="Enclosures-back">
            <IconArrowLeft size={16} aria-hidden="true" />
            {label}
        </a>
    );
}

// Previous / next record (see stepsFrom): round arrow buttons either side of
// "3 of 73" (on touch screens, just the "3 of 73": they swipe instead)
//   onStep("prev" | "next")
function Steps({ steps, kind, onStep }) {
    const arrow = (direction) => {
        const to = steps[direction];
        const Icon = direction === "prev" ? IconChevronLeft : IconChevronRight;
        // (introcages and areas step through each other: each says which it is)
        const word = isInside(to) ? TYPE_NAMES[to.type].toLowerCase() : kind;
        const label = `${direction === "prev" ? "Previous" : "Next"} ${word}: ${fullName(to.name)}`;
        return (
            <a
                href={enclosureHash(to)}
                className="Enclosures-step"
                aria-label={label}
                title={label}
                onClick={(event) => {
                    // (Ctrl / middle click: a new tab as usual)
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onStep(direction);
                }}
            >
                <Icon size={18} stroke={2.25} aria-hidden="true" />
            </a>
        );
    };
    return (
        <nav className="Enclosures-steps" aria-label={`Other ${kind}s`}>
            {arrow("prev")}
            <span className="Enclosures-position">
                {steps.number} of {steps.total}
            </span>
            {arrow("next")}
        </nav>
    );
}

// An enclosure's photos on its record: one at a time, with round previous /
// next buttons and a dot per photo (like a monkey's pop-up); on phones, swipe
// sideways
export function PhotoSlides({ photos, name }) {
    const [index, setIndex] = useState(0);
    // Slid in from this side after a change ("next" / "prev"), or null
    const [slideFrom, setSlideFrom] = useState(null);
    const count = photos.length;
    // Fewer photos after an edit: stay within them
    const current = Math.min(index, count - 1);
    function go(direction) {
        setSlideFrom(direction);
        setIndex((current + (direction === "next" ? 1 : -1) + count) % count);
    }
    const swipe = useSwipe(go, count > 1);
    return (
        <span className={`Enclosures-picture is-large is-slides${count > 1 ? " is-swipeable" : ""}`} {...swipe.handlers}>
            <img
                key={photos[current]}
                className={slideFrom ? `is-from-${slideFrom}` : undefined}
                style={swipe.dragX ? { transform: `translateX(${swipe.dragX}px)`, transition: "none" } : undefined}
                draggable={false}
                src={photos[current]}
                alt={count > 1 ? `${name}, photo ${current + 1} of ${count}` : name}
                crossOrigin="anonymous"
                onError={fallbackTo(thumbUrl(photos[current]))}
            />
            {count > 1 && (
                <>
                    <button type="button" className="Modal-imageButton is-prev" onClick={() => go("prev")} aria-label="Previous photo">
                        <IconChevronLeft stroke={2.5} aria-hidden="true" />
                    </button>
                    <button type="button" className="Modal-imageButton is-next" onClick={() => go("next")} aria-label="Next photo">
                        <IconChevronRight stroke={2.5} aria-hidden="true" />
                    </button>
                    <span className="Modal-photoDots" aria-hidden="true">
                        {photos.map((url, i) => (
                            <span key={url} className={i === current ? "is-current" : undefined} />
                        ))}
                    </span>
                </>
            )}
        </span>
    );
}

// A place's icon: a bench and tree for an enclosure, a cube for an introcage or area
function PlaceIcon({ enclosure, ...props }) {
    const Icon = isInside(enclosure) ? IconCube : BenchTreeIcon;
    return <Icon {...props} />;
}

// A collage of up to four photos (a 2 × 2 grid), in this order: the
// enclosure's own (primary) photo, then its monkeys, then its introcages'
// photos (each one's primary). If it has none, its icon (a bench and tree;
// an introcage: a cube). The record page shows the enclosure's own photos
// as slides instead, once it has some.
export function picturePhotos(enclosure, introcages, monkeys) {
    const photos = [
        enclosure.photos[0],
        ...monkeys.map((m) => m.img[0]).filter((url) => !isPlaceholderPhoto(url)),
        ...introcages.map((i) => i.photos?.[0]),
    ].filter(Boolean);
    return [...new Set(photos)].slice(0, 4);
}

function Picture({ enclosure, introcages = [], monkeys, large = false }) {
    const className = `Enclosures-picture${large ? " is-large" : ""}`;
    if (large && enclosure.photos.length) {
        return <PhotoSlides key={enclosure.id} photos={enclosure.photos} name={enclosure.name} />;
    }
    const photos = picturePhotos(enclosure, introcages, monkeys);
    if (!photos.length) {
        return (
            <span className={`${className} is-empty`}>
                <PlaceIcon enclosure={enclosure} size={large ? 48 : 36} stroke={1.5} aria-hidden="true" />
            </span>
        );
    }
    return (
        <span className={`${className} is-mosaic is-${photos.length}`}>
            {photos.map((url) => (
                <img
                    key={url}
                    src={thumbUrl(url)}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={fallbackTo(url)}
                />
            ))}
        </span>
    );
}

// A heading that folds its list open and shut. The record keeps which are
// open (so the jump buttons can open one). jumpId: the section's id, to
// scroll to.
export function Fold({ title, count, open, onToggle, jumpId, children }) {
    const id = `Enclosures-${title.toLowerCase().replace(/\s+/g, "-")}`;
    return (
        <section className="Enclosures-block" id={jumpId}>
            <h2>
                <button
                    type="button"
                    className="Enclosures-toggle"
                    aria-expanded={open}
                    aria-controls={id}
                    onClick={onToggle}
                >
                    {title}
                    {count !== undefined && <span className="Enclosures-count">{count}</span>}
                    <IconChevronDown size={16} aria-hidden="true" />
                </button>
            </h2>
            {open && <div id={id}>{children}</div>}
        </section>
    );
}

// The jump buttons' sections: section id on the page
export const jumpId = (key) => `Enclosures-jump-${key}`;

// A number tile for a ranking among the troop enclosures: "3rd" / "Largest
// troop", or a dash with unknown (e.g. "Size not recorded") below it
function Ranking({ label, rank, unknown = "Not known" }) {
    return (
        <div>
            <dt>{rank === null ? unknown : label}</dt>
            <dd>{rank === null ? "–" : ordinal(rank)}</dd>
        </div>
    );
}

// The parts of the page as a row of icons that stays under the top bar
// while scrolling: tapping one scrolls down to it (opening it if it's
// folded away), and the part being read is lit up. Icons only on phones,
// so the row always fits; their names beside them on computers.
//   jumps: [{ key, label, icon }]; onJump(key)
//   refresh: anything that changes which parts are on the page (a monkey's
//   Records tab: its part takes the tab's name), to look again
export function SectionNav({ jumps, onJump, refresh }) {
    const ref = useRef(null);
    const [active, setActive] = useState(null);
    const keys = jumps.map((j) => j.key).join(" ");

    // The part being read: the last one whose top has gone up under the bar
    // (at the very bottom of the page: the last part that's there)
    useEffect(() => {
        const list = keys.split(" ");
        let frame = 0;
        function update() {
            const line = (ref.current?.getBoundingClientRect().bottom ?? 0) + 24;
            let current = null;
            for (const key of list) {
                const top = document.getElementById(jumpId(key))?.getBoundingClientRect().top;
                if (top !== undefined && top <= line) current = key;
            }
            const root = document.documentElement;
            if (current && window.innerHeight + window.scrollY >= root.scrollHeight - 2) {
                current = list.filter((key) => document.getElementById(jumpId(key))).at(-1) ?? current;
            }
            setActive(current);
        }
        const onScroll = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(update);
        };
        update();
        window.addEventListener("scroll", onScroll, { passive: true });
        window.addEventListener("resize", onScroll);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("scroll", onScroll);
            window.removeEventListener("resize", onScroll);
        };
    }, [keys, refresh]);

    return (
        <nav ref={ref} className="Enclosures-sectionNav" aria-label="On this page">
            {jumps.map(({ key, label, icon: Icon }) => (
                <button
                    key={key}
                    type="button"
                    className={`Enclosures-sectionButton${active === key ? " is-active" : ""}`}
                    aria-current={active === key ? "true" : undefined}
                    title={label}
                    onClick={() => onJump(key)}
                >
                    <Icon size={20} stroke={1.75} aria-hidden="true" />
                    <span className="Enclosures-sectionLabel">{label}</span>
                </button>
            ))}
        </nav>
    );
}

// A troop enclosure's introcages, as rows like the monkey list: a small
// picture (its own photo, someone living there, or a cube if it's empty),
// the name, who's in it and how many. Each opens that introcage.
function IntrocageList({ introcages, monkeys }) {
    return (
        <div className="IntrocageList">
            {introcages.map((introcage) => {
                const living = residents(introcage, monkeys);
                // Its own primary photo, or someone living there
                const face = living.find((m) => !isPlaceholderPhoto(m.img[0]));
                const photo = introcage.photos?.[0] ?? face?.img[0];
                return (
                    <a key={introcage.id} href={enclosureHash(introcage)} className="IntrocageRow">
                        <span className="IntrocageRow-photo">
                            {photo ? (
                                <img
                                    src={thumbUrl(photo)}
                                    alt=""
                                    loading="lazy"
                                    crossOrigin="anonymous"
                                    onError={fallbackTo(photo)}
                                />
                            ) : (
                                <IconCube size={22} stroke={1.5} aria-hidden="true" />
                            )}
                        </span>
                        <span className="IntrocageRow-main">
                            <span className="IntrocageRow-name"><PlaceName name={introcage.name} /></span>
                            <span className="IntrocageRow-who">
                                {living.length ? living.map((m) => m.name).join(", ") : "Empty"}
                            </span>
                        </span>
                        <span className="IntrocageRow-count" aria-label={plural(living.length, "monkey")}>
                            {living.length}
                        </span>
                    </a>
                );
            })}
        </div>
    );
}

// The ways to sort the list (the Sort menu, as on the monkey list). The
// first way round is the usual one: sections in order, most monkeys first,
// largest first.
export const ENCLOSURE_SORTS = [
    { key: "name", label: "Name", up: "A–Z", down: "Z–A" },
    { key: "section", label: "Section", up: "Top first", down: "Sickbay first" },
    { key: "monkeys", label: "Monkeys", up: "Most first", down: "Fewest first" },
    { key: "size", label: "Size", up: "Largest first", down: "Smallest first" },
];
export const DEFAULT_ENCLOSURE_SORT = { key: "section", ascending: true };

// The enclosures, sorted. inOrder: in section order (ties keep it); sizes
// not recorded go last, whichever way round, and so do the care units by
// section.
export function sortEnclosures(inOrder, sort, monkeys) {
    const place = new Map(inOrder.map((e, i) => [e, i]));
    const count = new Map(inOrder.map((e) => [e, monkeyCount(e, monkeys)]));
    // Each section's place (Top 0 … Sickbay 3): Sickbay first turns the
    // sections round, each one's enclosures staying in their usual order
    const sectionOrder = [...new Set(inOrder.map((e) => e.section))];
    const sectionOf = (e) => sectionOrder.indexOf(e.section);
    const flip = sort.ascending ? 1 : -1;
    const compare = {
        // (by the names shown: "Dino & Daniel", not "D&D")
        name: (a, b) => fullName(a.name).localeCompare(fullName(b.name)),
        section: (a, b) => sectionOf(a) - sectionOf(b),
        monkeys: (a, b) => count.get(b) - count.get(a),
        size: (a, b) => b.size - a.size,
    }[sort.key];
    return [...inOrder].sort((a, b) => {
        if (sort.key === "size" && (a.size == null) !== (b.size == null)) return a.size == null ? 1 : -1;
        if (sort.key === "size" && a.size == null) return place.get(a) - place.get(b);
        if (sort.key === "section" && isCareUnit(a) !== isCareUnit(b)) return isCareUnit(a) ? 1 : -1;
        if (sort.key === "section" && isCareUnit(a)) return place.get(a) - place.get(b);
        return flip * compare(a, b) || place.get(a) - place.get(b);
    });
}

// The list: every enclosure as a card, in section order to start
// with; Sort changes the order (sort / onSort: see EnclosuresPage)
function EnclosureList({ enclosures, sections, monkeys, sort, onSort }) {
    const inOrder = bySection(enclosures, sections).flatMap((group) => group.enclosures);
    const all = sortEnclosures(inOrder, sort, monkeys);
    const introcageTotal = enclosures.filter((e) => e.type === "introcage").length;
    // (just the troop enclosures: not Bachelor Block or the care units)
    const troopTotal = all.filter(hasTroop).length;
    const totals = `${plural(troopTotal, "troop enclosure")} · ${plural(introcageTotal, "introcage")}`;
    return (
        <>
            {/* No title on screen, like the monkey list (the side rail and
                bottom bar show which page this is). The title is still
                there for screen readers. */}
            <h1 className="visually-hidden">Enclosures</h1>
            {/* Sort, and how many: the same row as the monkey list's */}
            <div className="ShowPage-toolbar Enclosures-toolbar">
                <SortMenu sort={sort} onSort={onSort} options={ENCLOSURE_SORTS} />
                {/* How many: troop enclosures (a bench and tree) and introcages (a cube) */}
                <span className="ShowPage-count Enclosures-totals" title={totals}>
                    <BenchTreeIcon size={16} aria-hidden="true" />
                    <span aria-hidden="true">{plural(troopTotal, "troop enclosure")}</span>
                    {/* (the narrowest phones: left out, so the row fits) */}
                    <span className="Enclosures-introcageTotal" aria-hidden="true">
                        <IconCube size={16} aria-hidden="true" />
                        {plural(introcageTotal, "introcage")}
                    </span>
                    <span className="visually-hidden">{totals}</span>
                </span>
            </div>
                    <div className="Enclosures-grid">
                        {all.map((enclosure) => {
                            // A block or care unit has no troop: the monkeys
                            // in its introcages / areas
                            const living = hasTroop(enclosure)
                                ? troopMonkeys(enclosure, monkeys)
                                : introcageMonkeys(enclosure, monkeys);
                            // (a one-area care unit: no "1 area")
                            const inside = soleArea(enclosure, enclosures) ? [] : introcagesOf(enclosure, enclosures);
                            return (
                                <article key={enclosure.id} className="EnclosureCard">
                                    <a href={enclosureHash(enclosure)} className="EnclosureCard-link">
                                        {/* The name on the picture's dark fade, as on the monkey cards */}
                                        <span className="EnclosureCard-image">
                                            <Picture enclosure={enclosure} introcages={inside} monkeys={living} />
                                            <span className="EnclosureCard-name"><PlaceName name={enclosure.name} /></span>
                                        </span>
                                        {/* Each part whole: if they don't fit on one
                                            line, the next goes onto the line below
                                            (the "·" between them shows only on one line) */}
                                        <span className="EnclosureCard-meta">
                                            <span>{plural(living.length, hasTroop(enclosure) ? "troop monkey" : "monkey")}</span>
                                            {inside.length > 0 && (
                                                <span className="is-more">
                                                    <span className="visually-hidden"> · </span>
                                                    {plural(inside.length, introcageWord(enclosure))}
                                                </span>
                                            )}
                                            {/* Sorted by size: each one's size too */}
                                            {sort.key === "size" && enclosure.size != null && (
                                                <span className="is-more">
                                                    <span className="visually-hidden"> · </span>
                                                    {sizeText(enclosure.size)}
                                                </span>
                                            )}
                                        </span>
                                    </a>
                                </article>
                            );
                        })}
                    </div>
        </>
    );
}

// A group of monkeys on a record, folded away, in the same list view as
// the monkey list. Tapping a monkey opens its pop-up.
function MonkeyGroup({ title, monkeys, onOpen, empty, ...fold }) {
    return (
        <Fold title={title} count={monkeys.length} {...fold}>
            {monkeys.length ? (
                <div className="MonkeyList">
                    <MonkeyListHeader />
                    {monkeys.map((m) => (
                        <MonkeyRow
                            key={m.id ?? m.name}
                            name={m.name}
                            sex={m.sex}
                            year={m.year}
                            troop={placeName(m)}
                            inIntrocage={inIntrocage(m)}
                            inSickbay={m.inSickbay}
                            stayingIn={staying(m)}
                            newArrival={showsNewArrival(m)}
                            chip={m.chip}
                            img={m.img[0]}
                            onClick={() => onOpen(m, monkeys)}
                        />
                    ))}
                </div>
            ) : (
                <p className="Enclosures-none">{empty}</p>
            )}
        </Fold>
    );
}

// One enclosure or introcage
// editing: { canEdit (editors, with the database live), canLog (any role:
//   adding to the maintenance log, and changing their own entries; userId,
//   isAdmin: whose they are, admins any),
//   canEditDetails (admins: About, Features, Size, Established), canDelete (admins),
//   onSaved(enclosure) }
//   steps: previous / next (stepsFrom), or null; onStep(direction)
//   slideFrom: arrived by stepping ("prev" / "next"): slides in from that side
function EnclosureRecord({ enclosure, enclosures, monkeys, onOpenMonkey, editing, steps, onStep, slideFrom }) {
    const [isEditing, setIsEditing] = useState(false);
    // An introcage or area (not an enclosure)
    const isIntrocage = isInside(enclosure);
    // Touch screens: swipe sideways anywhere on the page for the previous /
    // next one (the photos swipe through themselves, so not on those)
    const swipe = useSwipe((direction) => onStep(direction), Boolean(steps) && !isEditing);
    const swipeHandlers = {
        ...swipe.handlers,
        onPointerDown(event) {
            if (event.target.closest?.(".is-swipeable")) return;
            swipe.handlers.onPointerDown(event);
        },
    };
    const parent = isIntrocage ? enclosures.find((e) => e.id === enclosure.parentId) : null;
    // (a one-area care unit, like Quarantine: its area isn't listed, as
    // the unit is that one space)
    const introcages = isIntrocage || soleArea(enclosure, enclosures) ? [] : introcagesOf(enclosure, enclosures);
    const troop = isIntrocage ? [] : troopMonkeys(enclosure, monkeys);
    const inIntrocages = isIntrocage ? [] : introcageMonkeys(enclosure, monkeys);
    // A block or care unit: no troop, so its monkeys are the ones in its
    // introcages / areas; those have no troop door
    const noTroop = !isIntrocage && !hasTroop(enclosure);
    const inNoTroop = Boolean(parent) && !hasTroop(parent);
    // No Size: a care unit (not applicable), or a block (on its introcages
    // instead)
    const noSize = isCareUnit(enclosure) || (noTroop && introcages.length > 0);
    // (an introcage: who's in it now, then those who live here but are
    // staying in another introcage for now, with their badge)
    const living = isIntrocage
        ? [...residents(enclosure, monkeys), ...awayFrom(enclosure, monkeys)]
        : noTroop
          ? inIntrocages
          : troop;
    const established = establishedText(enclosure.established);
    // The troop's average age (a block or care unit: its monkeys')
    const age = isIntrocage ? null : averageAge(noTroop ? inIntrocages : troop);

    // Which folding parts are open: all of them to start with
    const [open, setOpen] = useState({
        introcages: true, maintenance: true, monkeys: true, residents: true,
    });
    const foldProps = (key) => ({
        open: open[key],
        onToggle: () => setOpen((o) => ({ ...o, [key]: !o[key] })),
        jumpId: jumpId(key),
    });
    // Scroll down to a part, opening it first if it's folded away (About:
    // back to the top)
    function jump(key) {
        if (key in open) setOpen((o) => ({ ...o, [key]: true }));
        requestAnimationFrame(() => {
            const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
            if (key === "about") window.scrollTo?.({ top: 0, behavior });
            else document.getElementById(jumpId(key))?.scrollIntoView?.({ behavior, block: "start" });
        });
    }
    // A care unit's are its "Areas"
    const introcagesTitle = isCareUnit(enclosure) ? "Areas" : "Introcages";
    // The description at the top (an introcage's one field), and an
    // enclosure's features at the end of About: each left out when there's
    // nothing written, unless they can fill it in
    const description = (isIntrocage ? enclosure.features : enclosure.description) || "";
    const features = isIntrocage ? "" : enclosure.features || "";
    const showDescription = Boolean(description) || editing.canEditDetails;
    const showFeatures = !isIntrocage && (Boolean(features) || editing.canEditDetails);
    // In the page's order
    // (About: the top of the page)
    const jumps = [
        { key: "about", label: "About", icon: IconInfoCircle },
        // (a care unit's areas, like Baby Care's rooms: a house)
        ...(introcages.length ? [{ key: "introcages", label: introcagesTitle, icon: isCareUnit(enclosure) ? IconHome : IconCube }] : []),
        { key: isIntrocage ? "residents" : "monkeys", label: "Monkeys", icon: MonkeysNavIcon },
        { key: "map", label: "Map", icon: IconMap2 },
        { key: "photos", label: "Photos", icon: IconPhoto },
        { key: "maintenance", label: "Maintenance", icon: IconTool },
    ];

    // The details, in order. A care unit's numbers come first: its monkeys,
    // then its areas or cages (it has no tiles).
    const careUnit = isCareUnit(enclosure);
    const cages = careUnit ? CARE_UNIT_CAGES[enclosure.name] : null;
    const sectionText = !enclosure.section ? (
        <span className="Enclosures-unset">Not set</span>
    ) : isCareUnit(parent ?? enclosure) ? (
        // a care unit (and its areas): "Care Units"
        enclosure.section
    ) : (
        `${enclosure.section} Section`
    );
    const detailRows = inPairs([
        isIntrocage && { icon: MonkeysNavIcon, label: "No. of Monkeys", value: residents(enclosure, monkeys).length },
        careUnit && { icon: MonkeysNavIcon, label: "Monkeys", value: inIntrocages.length },
        careUnit && introcages.length > 0 && { icon: IconHome, label: introcagesTitle, value: introcages.length },
        cages && { icon: IconCube, label: `${cages.word}s`, value: cages.count },
        // What kind of enclosure it is (an introcage: "Introcage at …" under its name)
        !isIntrocage && { icon: BenchTreeIcon, label: "Type", value: ENCLOSURE_TYPES[enclosure.type], wide: true },
        { icon: IconMapPin, label: "Section", value: sectionText },
        !isIntrocage && { icon: IconCalendar, label: "Established", value: established },
        // (not for a care unit, or a block: its introcages have sizes)
        !noSize && { icon: IconRuler2, label: "Size", value: sizeText(enclosure.size) },
        // (an introcage's: not a care unit's area, like Dreamland)
        ...(isIntrocage && enclosure.type === "introcage"
            ? [
                  !inNoTroop && { icon: IconDoor, label: "Troop Door", value: yesNo(enclosure.troopDoor) },
                  { icon: IconBowl, label: "Plate Slot", value: yesNo(enclosure.plateSlot) },
                  { icon: IconBed, label: "Sleeping Perches", value: enclosure.sleepingPerches },
              ]
            : []),
    ].filter(Boolean));
    return (
        <>
            {/* Centred, the same width as the monkey list view */}
            <article
                className={`Enclosures-record${steps ? " is-steppable" : ""}${slideFrom ? ` is-from-${slideFrom}` : ""}`}
                style={swipe.dragX ? { transform: `translateX(${swipe.dragX * 0.6}px)`, opacity: 1 - Math.min(0.5, Math.abs(swipe.dragX) / 600) } : undefined}
                {...swipeHandlers}
            >
                <div className="Enclosures-topRow">
                    <BackLink href={parent ? enclosureHash(parent) : ENCLOSURES_HASH} label={parent ? fullName(parent.name) : "Enclosures"} />
                    {steps && <Steps steps={steps} kind={isIntrocage ? "introcage" : "enclosure"} onStep={onStep} />}
                </div>
                {/* The name, the row of icons, then the numbers and details
                    (the photos have their own part further down) */}
                <div className="Enclosures-heading">
                    <div className="Enclosures-titleRow">
                        <h1 className="Enclosures-recordTitle"><PlaceName name={enclosure.name} /></h1>
                        {editing.canEditDetails && (
                            // The same Edit icon as a monkey's pop-up
                            <button type="button" className="Modal-edit is-icon Enclosures-edit" onClick={() => setIsEditing(true)} title="Edit">
                                <IconPencil size={18} aria-hidden="true" />
                                <span className="Modal-editLabel">Edit</span>
                            </button>
                        )}
                    </div>
                    {isIntrocage && parent && (
                        <p className="Enclosures-parent">
                            {/* (the cube: the introcage symbol, as on the cards) */}
                            <IconCube size={15} aria-hidden="true" />
                            {TYPE_NAMES[enclosure.type]} at <a href={enclosureHash(parent)}><PlaceName name={parent.name} /></a>
                        </p>
                    )}
                </div>

                <SectionNav jumps={jumps} onJump={jump} />

                {/* About: the top of the page. The description, the numbers
                    and details, then the features */}
                <section className={`Enclosures-info${isIntrocage ? " is-noStats" : ""}`} id={jumpId("about")}>
                    <h2>About</h2>
                    {showDescription && (
                        <p className={`Enclosures-description${description ? "" : " Enclosures-none"}`}>
                            {description || "No description yet."}
                        </p>
                    )}
                    {/* (a care unit: no tiles, its numbers in the details,
                        half the page wide on computers) */}
                    <div className={`Enclosures-summary${careUnit ? " is-stacked" : ""}${hasTroop(enclosure) && !isIntrocage ? " is-troop" : ""}`}>
                        {/* The numbers, worked out from the monkeys (an
                            introcage's or care unit's are in the details instead) */}
                        {/* Bachelor Block: its monkeys (no troop, so no troop
                            numbers or rankings; what it is: Type, below) */}
                        {noTroop && !careUnit && (
                            <dl className="Enclosures-stats is-few">
                                <div>
                                    <dt>{wordFor(inIntrocages.length, "Monkey")}</dt>
                                    <dd>{inIntrocages.length}</dd>
                                </div>
                                <div>
                                    <dt>{wordFor(introcages.length, "Introcage")}</dt>
                                    <dd>{introcages.length}</dd>
                                </div>
                                <div>
                                    <dt>Average age</dt>
                                    <dd>{age === null ? "–" : age}</dd>
                                </div>
                            </dl>
                        )}
                        {!isIntrocage && !noTroop && (
                            <dl className="Enclosures-stats">
                                <div>
                                    <dt>{wordFor(troop.length, "Troop monkey")}</dt>
                                    <dd>{troop.length}</dd>
                                </div>
                                <div>
                                    <dt>{wordFor(inIntrocages.length, "Introcage monkey")}</dt>
                                    <dd>{inIntrocages.length}</dd>
                                </div>
                                <div>
                                    <dt>{wordFor(introcages.length, "Introcage")}</dt>
                                    <dd>{introcages.length}</dd>
                                </div>
                                <Ranking label="Largest enclosure" rank={sizeRank(enclosure, enclosures)} unknown="Size not recorded" />
                                <Ranking label="Largest troop" rank={troopRank(enclosure, enclosures, monkeys)} />
                                <div>
                                    <dt>Average age</dt>
                                    <dd>{age === null ? "–" : age}</dd>
                                </div>
                            </dl>
                        )}

                        {/* The details, as label / value rows (phones: two
                            side by side, Type across a row of its own when
                            there's an odd number) */}
                        <dl className="Enclosures-details">
                            {detailRows.map((row) => (
                                <DetailRow key={row.label} {...row} />
                            ))}
                        </dl>
                    </div>

                    {showFeatures && (
                        <div className="Enclosures-about">
                            <h3 className="Enclosures-subhead">Features</h3>
                            <p className={features ? "Enclosures-features" : "Enclosures-none"}>
                                {features || "No features listed yet."}
                            </p>
                        </div>
                    )}
                </section>

                {!isIntrocage && introcages.length > 0 && (
                    <Fold title={introcagesTitle} count={introcages.length} {...foldProps("introcages")}>
                        <IntrocageList introcages={introcages} monkeys={monkeys} />
                    </Fold>
                )}

                {isIntrocage ? (
                    <MonkeyGroup
                        title="Monkeys"
                        monkeys={living}
                        onOpen={onOpenMonkey}
                        empty="Nobody's in here at the moment."
                        {...foldProps("residents")}
                    />
                ) : (
                    // The troop, then the monkeys in its introcages (their
                    // introcage shows where the troop's name would)
                    <MonkeyGroup
                        title="Monkeys"
                        monkeys={[...troop, ...inIntrocages]}
                        onOpen={onOpenMonkey}
                        empty="No monkeys here at the moment."
                        {...foldProps("monkeys")}
                    />
                )}

                {/* The sanctuary map with this enclosure picked out (an
                    introcage: its enclosure) */}
                <section className="Enclosures-block Enclosures-mapBlock" id={jumpId("map")}>
                    <h2>Map</h2>
                    <SanctuaryMap
                        enclosure={parent ?? enclosure}
                        section={enclosure.section}
                        introcage={isIntrocage ? enclosure.name : null}
                        introcages={introcagesOf(parent ?? enclosure, enclosures).map((e) => e.name)}
                    />
                </section>

                {/* Its own photos, one at a time */}
                <section className="Enclosures-block Enclosures-photos" id={jumpId("photos")}>
                    <h2>
                        Photos
                        {enclosure.photos.length > 0 && <span className="Enclosures-count">{enclosure.photos.length}</span>}
                    </h2>
                    {enclosure.photos.length ? (
                        <PhotoSlides key={enclosure.id} photos={enclosure.photos} name={enclosure.name} />
                    ) : (
                        <p className="Enclosures-none">No photos yet.</p>
                    )}
                </section>

                <Fold title="Maintenance" {...foldProps("maintenance")}>
                    <MaintenanceLog
                        enclosure={enclosure}
                        live={editing.live}
                        canAdd={editing.canLog}
                        me={{ userId: editing.userId, isAdmin: editing.isAdmin }}
                    />
                </Fold>
            </article>
            {isEditing && (
                <EnclosureForm
                    enclosure={enclosure}
                    noSize={noSize}
                    noTroopDoor={inNoTroop}
                    onClose={() => setIsEditing(false)}
                    onSaved={(saved) => {
                        editing.onSaved(saved);
                        setIsEditing(false);
                    }}
                />
            )}
        </>
    );
}

const NO_EDITING = {
    canEdit: false, canLog: false, canEditDetails: false, canDelete: false, live: false, onSaved: () => {},
};

// editing: see EnclosureRecord (plus live: the database has enclosures)
function EnclosuresPage({ route, monkeys, enclosures, sections, onOpenMonkey, inert, editing = NO_EDITING }) {
    let enclosure = enclosureFromRoute(route, enclosures);
    // A one-area care unit's area (an old link): the unit instead
    if (enclosure && isSoleArea(enclosure, enclosures)) {
        enclosure = enclosures.find((e) => e.id === enclosure.parentId);
    }
    const steps = enclosure ? stepsFrom(enclosure, enclosures, sections) : null;
    // The last step: { id (where to), from ("prev" / "next") }, so that
    // record slides in from that side
    const [stepped, setStepped] = useState(null);
    // The list's sort: kept while looking at enclosures, so it's the same
    // on coming back from one. Choosing the current sort flips it; another
    // starts the usual way round (as on the monkey list).
    const [sort, setSort] = useState(DEFAULT_ENCLOSURE_SORT);
    const sortBy = (key) =>
        setSort((prev) => ({ key, ascending: prev.key === key ? !prev.ascending : true }));

    // Previous / next: in place of this record in the history, so Back
    // still goes back to wherever they came from
    function step(direction) {
        const to = steps[direction];
        setStepped({ id: to.id, from: direction });
        window.location.replace(enclosureHash(to));
    }

    // A new page starts at the top
    useEffect(() => {
        window.scrollTo?.(0, 0);
    }, [route]);

    return (
        <div className="Enclosures" inert={inert}>
            {enclosure ? (
                <EnclosureRecord
                    // (a fresh record each time: lists back as they start)
                    key={enclosure.id}
                    editing={editing}
                    enclosure={enclosure}
                    enclosures={enclosures}
                    monkeys={monkeys}
                    onOpenMonkey={onOpenMonkey}
                    steps={steps}
                    onStep={step}
                    slideFrom={stepped?.id === enclosure.id ? stepped.from : null}
                />
            ) : route.startsWith("enclosure/") ? (
                <>
                    <BackLink href={ENCLOSURES_HASH} label="Enclosures" />
                    <p className="Enclosures-missing">That enclosure couldn't be found. It may have been removed.</p>
                </>
            ) : (
                <EnclosureList enclosures={enclosures} sections={sections} monkeys={monkeys} sort={sort} onSort={sortBy} />
            )}
        </div>
    );
}

export default EnclosuresPage;
