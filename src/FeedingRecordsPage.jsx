import { useContext, useMemo, useState } from "react";
import { IconFileTypePdf } from "@tabler/icons-react";
import { amSummary, BOWL_SIZES, bowlsText, feedingList, summaryDate, troopBowlsList } from "./feeding";
import { saveEnclosure } from "./monkeyData";
import { downloadBlob } from "./canvasHelpers";
import { BabyPhoto } from "./PagePicker";
import { OpenMonkeyContext } from "./openMonkey";
import { fullName } from "./places";
import "./IntegrationReports.css"; // (the problem line)
import "./FeedingRecordsPage.css";

// Records → Sections → Feeding (staff): every introcage monkey's feeding on one
// page, by section with its plate counts, and the AM Plates List to download. To change a monkey's feeding: tap them for their pop-up.
// Introcages / Troops switches between them. Troops: how many PM bowls of each
// size each troop gets (admins enter them).
//   staff: { isAdmin, readOnly, … }; onEnclosureSaved(enclosure)

const VIEWS = [
    ["introcages", "Introcages"],
    ["troops", "Troops"],
];

const SHOW = [
    ["all", "All"],
    ["localTeam", "Mainfeed"],
    ["sickbay", "Sickbay"],
];

const SIZE_NAMES = { small: "Small", medium: "Medium", large: "Large" };

function MonkeyRow({ row }) {
    const openMonkey = useContext(OpenMonkeyContext);
    const { monkey } = row;
    return (
        <li className="Feeding-row">
            <BabyPhoto monkey={monkey} />
            <div className="Feeding-rowText">
                {openMonkey ? (
                    <button type="button" className="Feeding-name" onClick={() => openMonkey(monkey)}>
                        {monkey.name}
                    </button>
                ) : (
                    <b className="Feeding-name">{monkey.name}</b>
                )}
                {row.sickbay ? (
                    <span className="Feeding-sickbay">Fed by Sickbay</span>
                ) : (
                    <>
                        <span><b>AM:</b> {row.am}</span>
                        <span><b>PM:</b> {row.pm}</span>
                    </>
                )}
            </div>
        </li>
    );
}

// A number box's text → its number (empty: none)
const count = (text) => (text === "" ? 0 : Number(text));
const validCount = (text) => Number.isInteger(count(text)) && count(text) >= 0 && count(text) <= 200;
// A troop's bowls as typed in the boxes (0: left empty)
const typedBowls = (bowls) => Object.fromEntries(BOWL_SIZES.map((size) => [size, bowls[size] ? String(bowls[size]) : ""]));

// Each troop's bowls by size; admins: Edit, then a number for each size
function TroopBowls({ enclosures, canEdit, onSaved }) {
    const troops = useMemo(() => troopBowlsList(enclosures), [enclosures]);
    const [typed, setTyped] = useState(null);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);

    async function save() {
        const bad = troops.find((t) => BOWL_SIZES.some((size) => !validCount(typed[t.id][size])));
        if (bad) return setProblem(`Please check the numbers for ${fullName(bad.name)} (0 to 200).`);
        const changed = troops.filter((t) => BOWL_SIZES.some((size) => count(typed[t.id][size]) !== t.bowls[size]));
        setBusy(true);
        setProblem(null);
        try {
            for (const troop of changed) {
                const bowls = Object.fromEntries(BOWL_SIZES.map((size) => [size, count(typed[troop.id][size])]));
                onSaved(await saveEnclosure(troop, { bowls }));
            }
            setTyped(null);
        } catch (error) {
            setProblem(error.message);
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="Feeding-group" aria-label="Troop PM Bowls">
            <div className="Feeding-groupHead">
                <h2>Troop PM Bowls</h2>
                {canEdit && !typed && (
                    <button
                        type="button"
                        className="Modal-edit is-blue"
                        onClick={() => setTyped(Object.fromEntries(troops.map((t) => [t.id, typedBowls(t.bowls)])))}
                    >
                        Edit
                    </button>
                )}
            </div>
            <ul className={`Feeding-bowls${typed ? " is-editing" : ""}`}>
                {typed && (
                    <li className="Feeding-bowlSizes" aria-hidden="true">
                        <span />
                        {BOWL_SIZES.map((size) => (
                            <span key={size}>{SIZE_NAMES[size]}</span>
                        ))}
                    </li>
                )}
                {troops.map((t) => (
                    <li key={t.id}>
                        <span>{fullName(t.name)} Troop</span>
                        {typed ? (
                            BOWL_SIZES.map((size) => (
                                <input
                                    key={size}
                                    type="number"
                                    inputMode="numeric"
                                    min="0"
                                    max="200"
                                    aria-label={`${SIZE_NAMES[size]} bowls for ${fullName(t.name)} Troop`}
                                    value={typed[t.id][size]}
                                    onChange={(e) => setTyped({ ...typed, [t.id]: { ...typed[t.id], [size]: e.target.value } })}
                                />
                            ))
                        ) : bowlsText(t.bowls) ? (
                            <b>{bowlsText(t.bowls)}</b>
                        ) : (
                            <span className="Feeding-unset">Not entered</span>
                        )}
                    </li>
                ))}
            </ul>
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {typed && (
                <div className="Feeding-actions">
                    <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={save}>
                        {busy ? "Saving…" : "Save"}
                    </button>
                    <button
                        type="button"
                        className="Modal-edit is-cancel"
                        disabled={busy}
                        onClick={() => {
                            setTyped(null);
                            setProblem(null);
                        }}
                    >
                        Cancel
                    </button>
                </div>
            )}
        </section>
    );
}

function Tabs({ label, options, value, onChange }) {
    return (
        <div className="RecordsPage-tabs" role="tablist" aria-label={label}>
            {options.map(([id, text]) => (
                <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={value === id}
                    className={value === id ? "is-on" : ""}
                    onClick={() => onChange(id)}
                >
                    {text}
                </button>
            ))}
        </div>
    );
}

export default function FeedingRecordsPage({ monkeys, enclosures, staff, onEnclosureSaved = () => {} }) {
    const [show, setShow] = useState("all");
    const [making, setMaking] = useState(false);
    const [problem, setProblem] = useState(null);
    const groups = useMemo(() => feedingList(monkeys, enclosures, show), [monkeys, enclosures, show]);
    // (troop bowls only once troop-bowls.sql has run)
    const hasBowls = enclosures.some((e) => e.type === "troop" && e.bowls);
    const [view, setView] = useState("introcages");
    const showTroops = hasBowls && view === "troops";

    async function downloadPlates() {
        setMaking(true);
        setProblem(null);
        try {
            const [{ pdf }, { default: AmPlatesPDF }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./AmPlatesPDF"),
            ]);
            const blob = await pdf(<AmPlatesPDF groups={amSummary(monkeys, enclosures)} date={summaryDate()} />).toBlob();
            downloadBlob(blob, `am_plates_${new Date().toISOString().slice(0, 10)}.pdf`);
        } catch (error) {
            console.error(error);
            setProblem("Couldn't create the PDF. Check your internet connection, then try again.");
        } finally {
            setMaking(false);
        }
    }

    return (
        <div className="Feeding">
            <div className="Feeding-bar">
                {/* (Troops: only once troop-bowls.sql has run) */}
                {hasBowls && <Tabs label="Introcages or Troops" options={VIEWS} value={view} onChange={setView} />}
                <button type="button" className="Modal-edit is-blue Feeding-download" disabled={making} onClick={downloadPlates}>
                    <IconFileTypePdf size={18} aria-hidden="true" />
                    {making ? "Creating…" : "AM Plates List"}
                </button>
            </div>
            {!showTroops && (
                <div className="Feeding-show">
                    <Tabs label="Fed By" options={SHOW} value={show} onChange={setShow} />
                </div>
            )}
            {problem && (
                <p className="Integration-problem" role="alert">
                    {problem}
                </p>
            )}
            {showTroops ? (
                <TroopBowls
                    enclosures={enclosures}
                    canEdit={Boolean(staff?.isAdmin && !staff.readOnly)}
                    onSaved={onEnclosureSaved}
                />
            ) : (
                <>
                    {groups.length === 0 && <p className="RecordsPage-intro">No monkeys to show.</p>}
                    {groups.map((group) => (
                        <section key={group.title} className="Feeding-group" aria-label={group.title}>
                            <div className="Feeding-groupHead">
                                <h2>{group.title}</h2>
                                {show !== "sickbay" && (
                                    <p className="Feeding-counts">
                                        {[group.plates === 1 ? "1 plate" : `${group.plates} plates`, ...group.counts].join(" · ")}
                                    </p>
                                )}
                            </div>
                            {group.places.map((place) => (
                                <div key={place.id} className="Feeding-place">
                                    <h3>{fullName(place.name)}</h3>
                                    {place.babies && <p className="Feeding-note">Babies share one plate. All plates here cut small + fruit.</p>}
                                    <ul>
                                        {place.monkeys.map((row) => (
                                            <MonkeyRow key={row.monkey.id} row={row} />
                                        ))}
                                    </ul>
                                </div>
                            ))}
                        </section>
                    ))}
                </>
            )}
        </div>
    );
}
