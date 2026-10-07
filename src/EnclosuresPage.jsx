import { useEffect, useState } from "react";
import {
    IconArrowLeft,
    IconCalendar,
    IconChevronDown,
    IconFence,
    IconMapPin,
    IconPencil,
    IconRuler2,
} from "@tabler/icons-react";
import MonkeyRow, { MonkeyListHeader } from "./MonkeyRow";
import SanctuaryMap from "./SanctuaryMap";
import EnclosureForm from "./EnclosureForm";
import MaintenanceLog from "./MaintenanceLog";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
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
    sizeText,
    troopMonkeys,
} from "./enclosures";
import "./EnclosuresPage.css";

// The Enclosures pages, shown under the site's top bar (ShowPage): every
// troop enclosure with its introcages, in section order (#enclosures), and
// one enclosure or introcage's record (#enclosure/<id>): its details and
// the monkeys living there. View only for now; editing comes next.
//   onOpenMonkey(monkey, group): opens the monkey's pop-up, stepping through
//   that group with previous / next

const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

// "← Enclosures" / "← H&B": back up a level
function BackLink({ href, label }) {
    return (
        <a href={href} className="Enclosures-back">
            <IconArrowLeft size={16} aria-hidden="true" />
            {label}
        </a>
    );
}

// The enclosure's own photo, or until it has one, up to four of its monkeys
// in a 2 × 2 grid, or a fence icon if it's empty
function Picture({ enclosure, monkeys, large = false }) {
    const className = `Enclosures-picture${large ? " is-large" : ""}`;
    if (enclosure.photos.length) {
        return (
            <span className={className}>
                <img src={enclosure.photos[0]} alt="" crossOrigin="anonymous" />
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

// A heading that folds its list open and shut (folded to start with)
function Fold({ title, count, children }) {
    const [shown, setShown] = useState(false);
    const id = `Enclosures-${title.toLowerCase().replace(/\s+/g, "-")}`;
    return (
        <section className="Enclosures-block">
            <h2>
                <button
                    type="button"
                    className="Enclosures-toggle"
                    aria-expanded={shown}
                    aria-controls={id}
                    onClick={() => setShown((open) => !open)}
                >
                    {title}
                    {count !== undefined && <span className="Enclosures-count">{count}</span>}
                    <IconChevronDown size={16} aria-hidden="true" />
                </button>
            </h2>
            {shown && <div id={id}>{children}</div>}
        </section>
    );
}

// A troop enclosure's introcages, as rows like the monkey list: a small
// picture (someone living there, or a fence if it's empty), the name, who's
// in it and how many. Each opens that introcage.
function IntrocageList({ introcages, monkeys }) {
    return (
        <div className="IntrocageList">
            {introcages.map((introcage) => {
                const living = residents(introcage, monkeys);
                const face = living.find((m) => !isPlaceholderPhoto(m.img[0]));
                return (
                    <a key={introcage.id} href={enclosureHash(introcage)} className="IntrocageRow">
                        <span className="IntrocageRow-photo">
                            {face ? (
                                <img
                                    src={thumbUrl(face.img[0])}
                                    alt=""
                                    loading="lazy"
                                    crossOrigin="anonymous"
                                    onError={fallbackTo(face.img[0])}
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
function MonkeyGroup({ title, monkeys, onOpen, empty, place }) {
    return (
        <Fold title={title} count={monkeys.length}>
            {monkeys.length ? (
                <div className="MonkeyList">
                    <MonkeyListHeader place={place} />
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
// editing: { canEdit (editors, with the database live), canDelete (admins),
//   onSaved(enclosure) }
function EnclosureRecord({ enclosure, enclosures, monkeys, onOpenMonkey, editing }) {
    const [isEditing, setIsEditing] = useState(false);
    const isIntrocage = enclosure.type === "introcage";
    const parent = isIntrocage ? enclosures.find((e) => e.id === enclosure.parentId) : null;
    const introcages = isIntrocage ? [] : introcagesOf(enclosure, enclosures);
    const troop = isIntrocage ? [] : troopMonkeys(enclosure, monkeys);
    const inIntrocages = isIntrocage ? [] : introcageMonkeys(enclosure, monkeys);
    const living = isIntrocage ? residents(enclosure, monkeys) : troop;
    const established = establishedText(enclosure.established);

    return (
        <>
            {/* Centred, the same width as the monkey list view */}
            <article className="Enclosures-record">
                <BackLink href={parent ? enclosureHash(parent) : ENCLOSURES_HASH} label={parent ? parent.name : "Enclosures"} />
                {/* Computers (iNaturalist style): picture, then About and
                    Features on the left; name, numbers, details, then the map
                    on the right. Phones: one after another. */}
                <div className="Enclosures-hero">
                    <Picture enclosure={enclosure} monkeys={living} large />
                    <div className="Enclosures-summary">
                        <div className="Enclosures-titleRow">
                            <h1 className="Enclosures-recordTitle">{enclosure.name}</h1>
                            {editing.canEdit && (
                                <button type="button" className="Enclosures-edit" onClick={() => setIsEditing(true)}>
                                    <IconPencil size={16} aria-hidden="true" />
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

                        {/* The numbers, worked out from the monkeys */}
                        <dl className={`Enclosures-stats${isIntrocage ? " is-single" : ""}`}>
                            {isIntrocage ? (
                                <div>
                                    <dt>{living.length === 1 ? "Resident" : "Residents"}</dt>
                                    <dd>{living.length}</dd>
                                </div>
                            ) : (
                                <>
                                    <div>
                                        <dt>Troop monkeys</dt>
                                        <dd>{troop.length}</dd>
                                    </div>
                                    <div>
                                        <dt>In introcages</dt>
                                        <dd>{inIntrocages.length}</dd>
                                    </div>
                                    <div>
                                        <dt>Introcages</dt>
                                        <dd>{introcages.length}</dd>
                                    </div>
                                </>
                            )}
                        </dl>

                        {/* The details, as label / value rows */}
                        <dl className="Enclosures-details">
                            <div>
                                <dt>
                                    <IconMapPin size={16} aria-hidden="true" />
                                    Section
                                </dt>
                                <dd>{enclosure.section ?? <span className="Enclosures-unset">Not set</span>}</dd>
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
                        </dl>
                    </div>

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
                            <h2>Features</h2>
                            <p className={enclosure.features ? "Enclosures-features" : "Enclosures-none"}>
                                {enclosure.features || "No features listed yet."}
                            </p>
                        </section>
                    </div>

                    {/* The sanctuary map with this enclosure picked out (an
                        introcage: its enclosure) */}
                    <section className="Enclosures-block Enclosures-mapBlock">
                        <h2>Map</h2>
                        <SanctuaryMap
                            enclosure={parent ?? enclosure}
                            section={enclosure.section}
                            introcage={isIntrocage ? enclosure.name : null}
                        />
                    </section>
                </div>

                {!isIntrocage && introcages.length > 0 && (
                    <Fold title="Introcages" count={introcages.length}>
                        <IntrocageList introcages={introcages} monkeys={monkeys} />
                    </Fold>
                )}

                <Fold title="Maintenance">
                    <MaintenanceLog
                        enclosure={enclosure}
                        live={editing.live}
                        canAdd={editing.canEdit}
                        canDelete={editing.canDelete}
                    />
                </Fold>

                {isIntrocage ? (
                    <MonkeyGroup
                        title="Residents"
                        monkeys={living}
                        onOpen={onOpenMonkey}
                        empty="Nobody's in here at the moment."
                        place="Introcage"
                    />
                ) : (
                    <>
                        <MonkeyGroup title="Troop Monkeys" monkeys={troop} onOpen={onOpenMonkey} empty="No troop monkeys." />
                        {inIntrocages.length > 0 && (
                            <MonkeyGroup
                                title="In introcages"
                                monkeys={inIntrocages}
                                onOpen={onOpenMonkey}
                                place="Introcage"
                            />
                        )}
                    </>
                )}

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

const NO_EDITING = { canEdit: false, canDelete: false, live: false, onSaved: () => {} };

// editing: see EnclosureRecord (plus live: the database has enclosures)
function EnclosuresPage({ route, monkeys, enclosures, sections, onOpenMonkey, inert, editing = NO_EDITING }) {
    const enclosure = enclosureFromRoute(route, enclosures);

    // A new page starts at the top
    useEffect(() => {
        window.scrollTo?.(0, 0);
    }, [route]);

    return (
        <div className="Enclosures" inert={inert}>
            {enclosure ? (
                <EnclosureRecord
                    // (a fresh record each time: lists folded away again)
                    key={enclosure.id}
                    editing={editing}
                    enclosure={enclosure}
                    enclosures={enclosures}
                    monkeys={monkeys}
                    onOpenMonkey={onOpenMonkey}
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
