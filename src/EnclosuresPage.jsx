import { useEffect, useState } from "react";
import {
    IconArrowDown,
    IconArrowLeft,
    IconBed,
    IconBowl,
    IconCalendar,
    IconDoor,
    IconChevronDown,
    IconChevronLeft,
    IconChevronRight,
    IconFence,
    IconMap,
    IconMapPin,
    IconPencil,
    IconRuler2,
    IconTool,
    IconUsersGroup,
} from "@tabler/icons-react";
import MonkeyRow, { MonkeyListHeader } from "./MonkeyRow";
import SanctuaryMap from "./SanctuaryMap";
import EnclosureForm from "./EnclosureForm";
import MaintenanceLog from "./MaintenanceLog";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import useSwipe from "./useSwipe";
import { inIntrocage, placeName } from "./places";
import {
    bySection,
    ENCLOSURES_HASH,
    enclosureFromRoute,
    enclosureHash,
    establishedText,
    introcageMonkeys,
    introcagesOf,
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

// The Enclosures pages, shown under the site's top bar (ShowPage): every
// troop enclosure with its introcages, in section order (#enclosures), and
// one enclosure or introcage's record (#enclosure/<id>): its details and
// the monkeys living there. View only for now; editing comes next.
//   onOpenMonkey(monkey, group): opens the monkey's pop-up, stepping through
//   that group with previous / next

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// An introcage's yes / no details (null or missing: not recorded)
const yesNo = (value) => (value === true ? "Yes" : value === false ? "No" : null);

// One of the details rows: icon and label on the left, the value (or "Not
// recorded") on the right
function DetailRow({ icon: Icon, label, value }) {
    return (
        <div>
            <dt>
                <Icon size={16} aria-hidden="true" />
                {label}
            </dt>
            <dd>{value ?? <span className="Enclosures-unset">Not recorded</span>}</dd>
        </div>
    );
}

// "← Enclosures" / "← H&B": back up a level
function BackLink({ href, label }) {
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
        const label = `${direction === "prev" ? "Previous" : "Next"} ${kind}: ${to.name}`;
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
function PhotoSlides({ photos, name }) {
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

// The enclosure's own photos (cards: the primary one, small), or until it
// has some, up to four of its monkeys in a 2 × 2 grid, or a fence icon if
// it's empty
function Picture({ enclosure, monkeys, large = false }) {
    const className = `Enclosures-picture${large ? " is-large" : ""}`;
    if (enclosure.photos.length) {
        if (large) return <PhotoSlides key={enclosure.id} photos={enclosure.photos} name={enclosure.name} />;
        return (
            <span className={className}>
                <img
                    src={thumbUrl(enclosure.photos[0])}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={fallbackTo(enclosure.photos[0])}
                />
            </span>
        );
    }
    const faces = monkeys.filter((m) => !isPlaceholderPhoto(m.img[0])).slice(0, 4);
    if (!faces.length) {
        return (
            <span className={`${className} is-empty`}>
                <IconFence size={large ? 48 : 36} stroke={1.5} aria-hidden="true" />
            </span>
        );
    }
    return (
        <span className={`${className} is-mosaic is-${faces.length}`}>
            {faces.map((m) => (
                <img
                    key={m.id ?? m.name}
                    src={thumbUrl(m.img[0])}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={fallbackTo(m.img[0])}
                />
            ))}
        </span>
    );
}

// A heading that folds its list open and shut. The record keeps which are
// open (so the jump buttons can open one). jumpId: the section's id, to
// scroll to.
function Fold({ title, count, open, onToggle, jumpId, children }) {
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
const jumpId = (key) => `Enclosures-jump-${key}`;

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

// Buttons that scroll down to a part of the page (opening it if it's
// folded away): a row across the page under the details on computers, a
// list on phones.
//   jumps: [{ key, label, icon }]; onJump(key)
function JumpList({ jumps, onJump }) {
    return (
        // Three or fewer (an introcage's): kept in one row on all but the
        // narrowest phones
        <nav className={`Enclosures-jumps${jumps.length <= 3 ? " is-few" : ""}`} aria-label="On this page">
            {jumps.map(({ key, label, icon: Icon }) => (
                <button key={key} type="button" className="Enclosures-jump" onClick={() => onJump(key)}>
                    <Icon size={18} stroke={1.75} aria-hidden="true" />
                    <span className="Enclosures-jumpLabel">{label}</span>
                    <IconArrowDown size={16} className="Enclosures-jumpArrow" aria-hidden="true" />
                </button>
            ))}
        </nav>
    );
}

// A troop enclosure's introcages, as rows like the monkey list: a small
// picture (its own photo, someone living there, or a fence if it's empty),
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
                                <IconFence size={22} stroke={1.5} aria-hidden="true" />
                            )}
                        </span>
                        <span className="IntrocageRow-main">
                            <span className="IntrocageRow-name">{introcage.name}</span>
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

// The list: every troop enclosure as a card, one after another in section
// order (a section filter can come later)
function EnclosureList({ enclosures, sections, monkeys }) {
    const all = bySection(enclosures, sections).flatMap((group) => group.enclosures);
    const introcageTotal = enclosures.filter((e) => e.type === "introcage").length;
    return (
        <>
            <h1 className="Enclosures-title">Enclosures</h1>
            <p className="Enclosures-subtitle">
                {plural(all.length, "troop enclosure")} · {plural(introcageTotal, "introcage")}
            </p>
                    <div className="Enclosures-grid">
                        {all.map((enclosure) => {
                            const troop = troopMonkeys(enclosure, monkeys);
                            return (
                                <article key={enclosure.id} className="EnclosureCard">
                                    <a href={enclosureHash(enclosure)} className="EnclosureCard-link">
                                        <Picture enclosure={enclosure} monkeys={troop} />
                                        <span className="EnclosureCard-name">{enclosure.name}</span>
                                        <span className="EnclosureCard-meta">
                                            {plural(troop.length, "troop monkey")} ·{" "}
                                            {plural(introcagesOf(enclosure, enclosures).length, "introcage")}
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
//   adding to the maintenance log),
//   canEditDetails (admins: About, Features, Size, Established), canDelete (admins),
//   onSaved(enclosure) }
//   steps: previous / next (stepsFrom), or null; onStep(direction)
//   slideFrom: arrived by stepping ("prev" / "next"): slides in from that side
function EnclosureRecord({ enclosure, enclosures, monkeys, onOpenMonkey, editing, steps, onStep, slideFrom }) {
    const [isEditing, setIsEditing] = useState(false);
    const isIntrocage = enclosure.type === "introcage";
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
    const introcages = isIntrocage ? [] : introcagesOf(enclosure, enclosures);
    const troop = isIntrocage ? [] : troopMonkeys(enclosure, monkeys);
    const inIntrocages = isIntrocage ? [] : introcageMonkeys(enclosure, monkeys);
    const living = isIntrocage ? residents(enclosure, monkeys) : troop;
    const established = establishedText(enclosure.established);
    // The troop's average age
    const age = isIntrocage ? null : averageAge(troop);

    // Which folding parts are open: all but an enclosure's (long) monkey
    // list to start with
    const [open, setOpen] = useState({
        introcages: true, maintenance: true, monkeys: false, residents: true,
    });
    const foldProps = (key) => ({
        open: open[key],
        onToggle: () => setOpen((o) => ({ ...o, [key]: !o[key] })),
        jumpId: jumpId(key),
    });
    // Scroll down to a part, opening it first if it's folded away
    function jump(key) {
        if (key in open) setOpen((o) => ({ ...o, [key]: true }));
        requestAnimationFrame(() => {
            const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
            document.getElementById(jumpId(key))?.scrollIntoView?.({ behavior: reduce ? "auto" : "smooth", block: "start" });
        });
    }
    // In the page's order (an introcage: its monkeys before Maintenance)
    const maintenanceJump = { key: "maintenance", label: "Maintenance", icon: IconTool };
    const jumps = isIntrocage
        ? [
              { key: "map", label: "Map", icon: IconMap },
              { key: "residents", label: "Monkeys", icon: IconUsersGroup },
              maintenanceJump,
          ]
        : [
              { key: "map", label: "Map", icon: IconMap },
              ...(introcages.length
                  ? [{ key: "introcages", label: "Introcages", icon: IconFence }]
                  : []),
              maintenanceJump,
              { key: "monkeys", label: "Monkeys", icon: IconUsersGroup },
          ];

    // Enclosures: before the monkeys; introcages: at the bottom
    const maintenance = (
        <Fold title="Maintenance" {...foldProps("maintenance")}>
            <MaintenanceLog
                enclosure={enclosure}
                live={editing.live}
                canAdd={editing.canLog}
                canDelete={editing.canDelete}
            />
        </Fold>
    );

    return (
        <>
            {/* Centred, the same width as the monkey list view */}
            <article
                className={`Enclosures-record${steps ? " is-steppable" : ""}${slideFrom ? ` is-from-${slideFrom}` : ""}`}
                style={swipe.dragX ? { transform: `translateX(${swipe.dragX * 0.6}px)`, opacity: 1 - Math.min(0.5, Math.abs(swipe.dragX) / 600) } : undefined}
                {...swipeHandlers}
            >
                <div className="Enclosures-topRow">
                    <BackLink href={parent ? enclosureHash(parent) : ENCLOSURES_HASH} label={parent ? parent.name : "Enclosures"} />
                    {steps && <Steps steps={steps} kind={isIntrocage ? "introcage" : "enclosure"} onStep={onStep} />}
                </div>
                {/* Computers (iNaturalist style): picture, then About and
                    Features on the left; name, numbers, details, then the map
                    on the right. Phones: one after another. */}
                <div className="Enclosures-hero">
                    {/* The name (phones: above the picture; computers: beside it) */}
                    <div className="Enclosures-heading">
                        <div className="Enclosures-titleRow">
                            <h1 className="Enclosures-recordTitle">{enclosure.name}</h1>
                            {editing.canEditDetails && (
                                // The same Edit button as a monkey's pop-up
                                <button type="button" className="Modal-edit Enclosures-edit" onClick={() => setIsEditing(true)}>
                                    <IconPencil size={18} aria-hidden="true" />
                                    Edit
                                </button>
                            )}
                        </div>
                        {isIntrocage && parent && (
                            <p className="Enclosures-parent">
                                <IconFence size={15} aria-hidden="true" />
                                Introcage at <a href={enclosureHash(parent)}>{parent.name}</a>
                            </p>
                        )}
                    </div>
                    <Picture enclosure={enclosure} monkeys={living} large />
                    <div className="Enclosures-summary">
                        {/* The numbers, worked out from the monkeys (an
                            introcage's one number is in the details instead) */}
                        {!isIntrocage && (
                            <dl className="Enclosures-stats">
                                <div>
                                    <dt>Troop monkeys</dt>
                                    <dd>{troop.length}</dd>
                                </div>
                                <div>
                                    <dt>Introcage monkeys</dt>
                                    <dd>{inIntrocages.length}</dd>
                                </div>
                                <div>
                                    <dt>Introcages</dt>
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

                        {/* The details, as label / value rows */}
                        <dl className="Enclosures-details">
                            {isIntrocage && <DetailRow icon={IconUsersGroup} label="No. of Monkeys" value={living.length} />}
                            <div>
                                <dt>
                                    <IconMapPin size={16} aria-hidden="true" />
                                    Section
                                </dt>
                                {/* e.g. "Top Section" */}
                                <dd>{enclosure.section ? `${enclosure.section} Section` : <span className="Enclosures-unset">Not set</span>}</dd>
                            </div>
                            {!isIntrocage && (
                                <div>
                                    <dt>
                                        <IconCalendar size={16} aria-hidden="true" />
                                        Established
                                    </dt>
                                    <dd>{established ?? <span className="Enclosures-unset">Not recorded</span>}</dd>
                                </div>
                            )}
                            <div>
                                <dt>
                                    <IconRuler2 size={16} aria-hidden="true" />
                                    Size
                                </dt>
                                <dd>{sizeText(enclosure.size) ?? <span className="Enclosures-unset">Not recorded</span>}</dd>
                            </div>
                            {isIntrocage && (
                                <>
                                    <DetailRow icon={IconDoor} label="Troop Door" value={yesNo(enclosure.troopDoor)} />
                                    <DetailRow icon={IconBowl} label="Plate Slot" value={yesNo(enclosure.plateSlot)} />
                                    <DetailRow icon={IconBed} label="Sleeping Perches" value={enclosure.sleepingPerches} />
                                </>
                            )}
                        </dl>
                    </div>

                    <JumpList jumps={jumps} onJump={jump} />

                    <div className="Enclosures-text">
                        {!isIntrocage && (
                            <section className="Enclosures-block">
                                <h2>About</h2>
                                <p className={enclosure.description ? undefined : "Enclosures-none"}>
                                    {enclosure.description || "No description yet."}
                                </p>
                            </section>
                        )}
                        <section className="Enclosures-block">
                            {/* (introcages: their one field, so "Description") */}
                            <h2>{isIntrocage ? "Description" : "Features"}</h2>
                            <p className={enclosure.features ? "Enclosures-features" : "Enclosures-none"}>
                                {enclosure.features || (isIntrocage ? "No description yet." : "No features listed yet.")}
                            </p>
                        </section>
                    </div>

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
                </div>

                {!isIntrocage && introcages.length > 0 && (
                    <Fold title="Introcages" count={introcages.length} {...foldProps("introcages")}>
                        <IntrocageList introcages={introcages} monkeys={monkeys} />
                    </Fold>
                )}

                {!isIntrocage && maintenance}

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

                {isIntrocage && maintenance}
            </article>
            {isEditing && (
                <EnclosureForm
                    enclosure={enclosure}
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
    const enclosure = enclosureFromRoute(route, enclosures);
    const steps = enclosure ? stepsFrom(enclosure, enclosures, sections) : null;
    // The last step: { id (where to), from ("prev" / "next") }, so that
    // record slides in from that side
    const [stepped, setStepped] = useState(null);

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
                <EnclosureList enclosures={enclosures} sections={sections} monkeys={monkeys} />
            )}
        </div>
    );
}

export default EnclosuresPage;
