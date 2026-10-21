import { useEffect, useRef, useState } from "react";
import {
    IconCalendar,
    IconCalendarEvent,
    IconCpu,
    IconDna2,
    IconFlag,
    IconGenderBigender,
    IconHeartHandshake,
    IconId,
    IconDoorEnter,
    IconMapPin,
    IconPencil,
    IconRosetteDiscountCheck,
    IconReportMedical,
    IconFriends,
    IconUserCircle,
    IconWorldPin,
} from "@tabler/icons-react";
import { BackLink, DetailRow, Fold, PhotoSlides, SectionNav, inPairs, jumpId } from "./EnclosuresPage";
import { useIntegration } from "./IntegrationReports";
import { useInjuries } from "./Injuries";
import { IntegrationRecords, RecordList, otherRows, useRecords } from "./MonkeyRecords";
import useArrivalInfo from "./useArrivalInfo";
import { ageInYears } from "./ages";
import { fullName, homeName } from "./places";
import BenchTreeIcon from "./BenchTreeIcon";
import "./EnclosuresPage.css";
import "./MonkeyPage.css";

// A monkey's full page (#monkeys/<name>-<enclosure>), under the site's top
// bar, laid out like an enclosure's record: the name, a row of icons that
// stays at the top, then its parts:
//   Profile         photos, the main facts, bio and description
//   Arrival Info    arrival date, reason and area of origin, and (staff)
//                   the Arrival Details text, folding
//   Records         staff only, folding: two tabs, like a browser's, each
//                   a list of records (MonkeyRecords.jsx)
//     Rehabilitation  movements, observations, escapes, integration
//     Medical         injuries, medicine, treatment, vet visits, observations
//     Integration     integration reports (moved here from the pop-up)
// The pop-up stays as the quick look; every record lives here.

// "9 years old", "1 year old", "Baby" (under 1), or null (not known)
function ageWords(year) {
    const age = ageInYears(year);
    if (age === null) return null;
    if (age === 0) return "Baby";
    return age === 1 ? "1 year old" : `${age} years old`;
}

const SEX_WORDS = { male: "Male", female: "Female" };
const STATUS_WORDS = { sanctuary: "Sanctuary", released: "Released" };

// Its home, in full: "Gismo Troop" or "Holt & Barrington C1"
const homeText = (monkey) => (monkey.introcage ? fullName(monkey.introcage) : `${fullName(monkey.troop)} Troop`);

// (keys: the sections in MonkeyRecords.jsx, and its Integration reports)
const TABS = [
    { key: "rehabilitation", label: "Rehabilitation", icon: IconHeartHandshake },
    { key: "medical", label: "Medical", icon: IconReportMedical },
    { key: "integration", label: "Integration", icon: IconFriends },
];

// The tabs, like a browser's: the chosen one joins the list below it.
// Left / right arrow keys move between them.
function Tabs({ tab, onTab }) {
    const refs = useRef({});
    function onKeyDown(event) {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) return;
        event.preventDefault();
        const i = TABS.findIndex((t) => t.key === tab);
        const next = TABS[(i + step + TABS.length) % TABS.length].key;
        onTab(next);
        refs.current[next]?.focus();
    }
    return (
        <div className="MonkeyPage-tabs" role="tablist" aria-label="Records">
            {TABS.map(({ key, label, icon: Icon }) => (
                <button
                    key={key}
                    ref={(el) => (refs.current[key] = el)}
                    type="button"
                    role="tab"
                    id={`MonkeyPage-tab-${key}`}
                    aria-selected={tab === key}
                    aria-controls="MonkeyPage-tabPanel"
                    tabIndex={tab === key ? 0 : -1}
                    className={`MonkeyPage-tab${tab === key ? " is-active" : ""}`}
                    onClick={() => onTab(key)}
                    onKeyDown={onKeyDown}
                >
                    <Icon size={18} stroke={1.75} aria-hidden="true" />
                    {label}
                </button>
            ))}
        </div>
    );
}

// staff: { canSee, canAdd, userId, isAdmin } (staff, with the database
//   live), or null: Rehabilitation and Medical are staff only
// onEdit(monkey): editors only (the Edit button)
// onOpenCard(monkey): View Card, its pop-up
function MonkeyPage({ monkey, staff, onEdit, onOpenCard, inert }) {
    // (a new page starts at the top)
    useEffect(() => {
        window.scrollTo?.(0, 0);
    }, [monkey?.id]);

    if (!monkey) {
        return (
            <div className="Enclosures MonkeyPage" inert={inert}>
                <BackLink href="#" label="Monkeys" />
                <p className="Enclosures-missing">That monkey couldn't be found. It may have been renamed or removed.</p>
            </div>
        );
    }
    return <MonkeyRecord key={monkey.id ?? monkey.name} monkey={monkey} staff={staff} onEdit={onEdit} onOpenCard={onOpenCard} inert={inert} />;
}

function MonkeyRecord({ monkey, staff, onEdit, onOpenCard, inert }) {
    const isStaff = Boolean(staff?.canSee);
    const integration = useIntegration(monkey.id, staff);
    const injuries = useInjuries(monkey.id, staff);
    // Its Arrival Details (staff; written in Add New Monkey or Edit)
    const arrival = useArrivalInfo(monkey.id, isStaff);
    const records = useRecords(monkey.id, staff);
    // The Records tab showing
    const [tab, setTab] = useState("rehabilitation");
    // Which folding parts are open: both to start with
    const [open, setOpen] = useState({ arrival: true, records: true });
    const foldProps = (key) => ({
        open: open[key],
        onToggle: () => setOpen((o) => ({ ...o, [key]: !o[key] })),
    });

    // In the page's order (Profile: the top of the page). Rehabilitation
    // and Medical: the Records part, on that tab (the part takes the tab's
    // name, so the bar lights up the one showing)
    const jumps = [
        { key: "profile", label: "Profile", icon: IconUserCircle },
        { key: "arrival", label: "Arrival Info", icon: IconDoorEnter },
        ...(isStaff ? TABS : []),
    ];
    // Scroll down to a part, opening it first if it's folded away
    function jump(key) {
        const tabKey = TABS.some((t) => t.key === key);
        if (tabKey) setTab(key);
        const fold = tabKey ? "records" : key;
        if (fold in open) setOpen((o) => ({ ...o, [fold]: true }));
        requestAnimationFrame(() => {
            const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
            if (key === "profile") window.scrollTo?.({ top: 0, behavior });
            else document.getElementById(jumpId(key))?.scrollIntoView?.({ behavior, block: "start" });
        });
    }
    // Where it lives: its enclosure ("Goliath"), then where in it
    // ("Goliath Troop" or "Goliath A"); then the rest (phones: two side by
    // side, Microchip across the last row)
    // (the Bandits: none. The built-in copy has no enclosures: its troop's)
    const enclosureName = "enclosure" in monkey ? monkey.enclosure : homeName(monkey);
    const profileRows = inPairs([
        { icon: BenchTreeIcon, label: "Enclosure", value: enclosureName ? fullName(enclosureName) : "None" },
        { icon: IconMapPin, label: "Location", value: homeText(monkey) },
        { icon: IconCalendarEvent, label: "Age", value: ageWords(monkey.year) },
        { icon: IconGenderBigender, label: "Sex", value: SEX_WORDS[monkey.sex] ?? null },
        // (only the year is recorded so far: its birth season, see ages.js)
        { icon: IconCalendar, label: "Birth Date", value: null },
        { icon: IconCalendar, label: "Birth Year", value: monkey.year || null },
        // (not recorded yet: Vervet, Samango or Bush Baby)
        { icon: IconDna2, label: "Species", value: null },
        // (once the database has a status: Sanctuary or Released, so far)
        { icon: IconRosetteDiscountCheck, label: "Status", value: STATUS_WORDS[monkey.status] ?? null },
        {
            icon: IconCpu,
            label: "Microchip",
            value: monkey.chip === null ? null : monkey.chip ? String(monkey.chip) : "No Chip",
            wide: true,
        },
    ]);
    // Arrival: not recorded yet (Orphaned, Injured, Confiscated, Handover)
    const detailRows = inPairs([
        { icon: IconCalendar, label: "Arrival Date", value: null },
        { icon: IconFlag, label: "Arrival Reason", value: null },
        { icon: IconWorldPin, label: "Area of Origin", value: null, wide: true },
    ]);

    return (
        <div className="Enclosures MonkeyPage" inert={inert}>
            <article className="Enclosures-record">
                <div className="Enclosures-topRow">
                    <BackLink href="#" label="Monkeys" />
                </div>
                <div className="Enclosures-heading">
                    <div className="Enclosures-titleRow">
                        <h1 className="Enclosures-recordTitle">{monkey.name}</h1>
                        {/* View Card (its pop-up), and Edit (editors) */}
                        <div className="MonkeyPage-actions">
                            {onOpenCard && (
                                <button type="button" className="Modal-edit is-soft Enclosures-edit" onClick={() => onOpenCard(monkey)}>
                                    <IconId size={18} aria-hidden="true" />
                                    View Card
                                </button>
                            )}
                            {onEdit && (
                                <button type="button" className="Modal-edit Enclosures-edit" onClick={() => onEdit(monkey)}>
                                    <IconPencil size={18} aria-hidden="true" />
                                    Edit
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <SectionNav jumps={jumps} onJump={jump} />

                {/* Profile: the photos beside the main facts (phones: the
                    photos first), then the bio and description */}
                <section className="Enclosures-info MonkeyPage-profile" id={jumpId("profile")}>
                    <h2>Profile</h2>
                    <div className="MonkeyPage-profileTop">
                        <div className="MonkeyPage-photos">
                            <PhotoSlides photos={monkey.img} name={monkey.name} />
                        </div>
                        <dl className="Enclosures-details MonkeyPage-facts">
                            {profileRows.map((row) => (
                                <DetailRow key={row.label} {...row} />
                            ))}
                        </dl>
                    </div>
                    <div className="Enclosures-about">
                        <h3 className="Enclosures-subhead">Bio</h3>
                        <p className={monkey.bio ? "MonkeyPage-text" : "Enclosures-none"}>{monkey.bio || "No bio yet."}</p>
                    </div>
                    <div className="Enclosures-about">
                        <h3 className="Enclosures-subhead">Description</h3>
                        <p className={monkey.desc ? "MonkeyPage-text" : "Enclosures-none"}>
                            {monkey.desc || "No description yet."}
                        </p>
                    </div>
                </section>

                {/* Arrival Info: (staff) the Arrival Details written about it
                    on the left, and the details on the right (phones: the
                    Arrival Details first) */}
                <Fold title="Arrival Info" jumpId={jumpId("arrival")} {...foldProps("arrival")}>
                    <div className={`MonkeyPage-arrival${arrival.available ? " has-text" : ""}`}>
                        {arrival.available && (
                            <div className="MonkeyPage-arrivalText">
                                <h3 className="Enclosures-subhead">Arrival Details</h3>
                                <p className={arrival.info ? "MonkeyPage-text" : "Enclosures-none"}>
                                    {arrival.info || "No arrival details yet."}
                                </p>
                            </div>
                        )}
                        <dl className="Enclosures-details MonkeyPage-rows">
                            {detailRows.map((row) => (
                                <DetailRow key={row.label} {...row} />
                            ))}
                        </dl>
                    </div>
                </Fold>

                {/* Records (staff): Rehabilitation and Medical, a tab each */}
                {isStaff && (
                    <Fold title="Records" jumpId={jumpId(tab)} {...foldProps("records")}>
                        <Tabs tab={tab} onTab={setTab} />
                        <div
                            className="MonkeyPage-tabPanel"
                            id="MonkeyPage-tabPanel"
                            role="tabpanel"
                            aria-labelledby={`MonkeyPage-tab-${tab}`}
                        >
                            {tab === "integration" ? (
                                <IntegrationRecords integration={integration} />
                            ) : (
                                <RecordList
                                    key={tab}
                                    section={tab}
                                    records={records}
                                    others={otherRows(tab, { monkey, injuries })}
                                />
                            )}
                        </div>
                    </Fold>
                )}
            </article>
        </div>
    );
}

export default MonkeyPage;
