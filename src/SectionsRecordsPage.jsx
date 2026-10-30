import { useState } from "react";
import { IconPlus } from "@tabler/icons-react";
import { InjuryForm, InjuryItem, useInjuryList } from "./Injuries";
import { hasTroop } from "./enclosures";
import { monkeysIn } from "./stats";
import { fullName, placeLabel } from "./places";
import { dayText } from "./babyRecords";
import { BabyPhoto } from "./PagePicker";
import "./IntegrationReports.css"; // (the injuries' list, as in the pop-up)
import "./IntegrationRecordsPage.css"; // (the troop picker and New Injury's panel)
import "./SectionsRecordsPage.css";

// Records → Sections → Injuries (staff): a troop's injuries (its
// introcages too), by monkey, as in the monkey's pop-up.
//   Current  each injury's date and description, its updates, Add Update
//            and Healed? (it then moves to Past); New Injury: pick the
//            monkey, then the date and description
//   Past     those healed in the last 6 months, with Restore (asked
//            first: it goes back to Current)
// Adding, updates, Healed? and Restore: editors and admins (staff.canAdd);
// Edit / Delete: admins, or whoever added it.
//   staff: { canSee, canAdd, userId, isAdmin, readOnly } (as the pop-up's)

const TROOP_KEY = "vervetdb-sections-troop";
const PAST_MONTHS = 6;

// The day 6 months ago ("2026-04-30")
function pastSince(now = new Date()) {
    const d = new Date(now.getFullYear(), now.getMonth() - PAST_MONTHS, now.getDate());
    return dayText(d);
}

function rememberedTroop() {
    try {
        return localStorage.getItem(TROOP_KEY);
    } catch {
        return null;
    }
}

function rememberTroop(name) {
    try {
        localStorage.setItem(TROOP_KEY, name);
    } catch {
        // Not remembered this time
    }
}

// New Injury: the monkey (from the troop), then the date and description
function NewInjury({ monkeys, injuries, today, onDone }) {
    const [monkeyId, setMonkeyId] = useState("");
    return (
        <div className="IntegrationPage-new">
            <h2 className="RecordsPage-subhead">New Injury</h2>
            <label className="IntegrationPage-choose">
                <span>Monkey</span>
                <select value={monkeyId} onChange={(e) => setMonkeyId(e.target.value)}>
                    <option value="">Choose…</option>
                    {monkeys.map((m) => (
                        <option key={m.id} value={m.id}>
                            {m.introcage ? `${m.name} (${fullName(m.introcage)})` : m.name}
                        </option>
                    ))}
                </select>
            </label>
            <InjuryForm
                initial={{ date: today, description: "" }}
                max={today}
                onSave={async (values) => {
                    if (!monkeyId) throw new Error("Please choose the monkey.");
                    await injuries.add(Number(monkeyId), values);
                    onDone();
                }}
                onCancel={onDone}
            />
        </div>
    );
}

export default function SectionsRecordsPage({ monkeys = [], enclosures = [], staff = null }) {
    const troops = enclosures.filter(hasTroop).sort((a, b) => fullName(a.name).localeCompare(fullName(b.name)));
    const [chosen, setChosen] = useState(rememberedTroop);
    const troop = troops.find((t) => t.name === chosen) ?? troops[0] ?? null;
    const troopMonkeys = troop ? [...monkeysIn(monkeys, troop)].sort((a, b) => a.name.localeCompare(b.name)) : [];
    const [tab, setTab] = useState("current");
    const past = tab === "past";
    const today = dayText(new Date());
    const injuries = useInjuryList(
        troopMonkeys.map((m) => m.id),
        staff,
        past ? pastSince() : null
    );
    const [adding, setAdding] = useState(false);
    const troopName = troop ? `${fullName(troop.name)} Troop` : "this troop";

    // The troop's monkeys with current injuries, by name
    const entries = Array.isArray(injuries.entries) ? injuries.entries : [];
    const injured = troopMonkeys
        .map((monkey) => ({ monkey, list: entries.filter((e) => e.monkeyId === monkey.id) }))
        .filter((g) => g.list.length);

    return (
        <div className="SectionsPage">
            <div className="RecordsPage-tabRow">
                <div className="RecordsPage-tabs" role="tablist" aria-label="Injuries">
                    {[
                        ["current", "Current"],
                        ["past", "Past"],
                    ].map(([id, label]) => (
                        <button
                            key={id}
                            type="button"
                            role="tab"
                            aria-selected={tab === id}
                            className={tab === id ? "is-on" : ""}
                            onClick={() => {
                                setTab(id);
                                setAdding(false);
                            }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>
            <div className="SectionsPage-bar">
                <label className="IntegrationPage-choose SectionsPage-troop">
                    <span>Troop</span>
                    <select
                        value={troop?.name ?? ""}
                        onChange={(e) => {
                            setChosen(e.target.value);
                            rememberTroop(e.target.value);
                            setAdding(false);
                        }}
                    >
                        {troops.map((t) => (
                            <option key={t.id} value={t.name}>
                                {fullName(t.name)}
                            </option>
                        ))}
                    </select>
                </label>
                {!past && injuries.canAdd && !adding && (
                    <button type="button" className="Modal-edit is-soft SectionsPage-add" onClick={() => setAdding(true)}>
                        <IconPlus size={18} aria-hidden="true" />
                        New Injury
                    </button>
                )}
            </div>
            {adding && <NewInjury monkeys={troopMonkeys} injuries={injuries} today={today} onDone={() => setAdding(false)} />}
            {injuries.entries === null ? (
                <p className="RecordsPage-none">Loading…</p>
            ) : injuries.entries === "failed" ? (
                <p className="RecordsPage-problem">Couldn't load the injuries. Please check your connection and try again.</p>
            ) : injured.length === 0 ? (
                <p className="RecordsPage-none">
                    {past ? `No injuries healed in the last ${PAST_MONTHS} months in ${troopName}.` : `No current injuries in ${troopName}.`}
                </p>
            ) : (
                <>
                    <p className="SectionsPage-count">
                        {entries.length} {past ? "healed" : "current"} {entries.length === 1 ? "injury" : "injuries"} ·{" "}
                        {injured.length} {injured.length === 1 ? "monkey" : "monkeys"}
                        {past && ` · last ${PAST_MONTHS} months`}
                    </p>
                    <ul className="SectionsPage-monkeys" aria-label={past ? "Past injuries" : "Current injuries"}>
                        {injured.map(({ monkey, list }) => (
                            <li key={monkey.id} className="SectionsPage-monkey">
                                <div className="SectionsPage-who">
                                    <BabyPhoto monkey={monkey} />
                                    <span className="RecordsPage-baby">
                                        <span className="RecordsPage-name">{monkey.name}</span>
                                        <span className="RecordsPage-place">{placeLabel(monkey)}</span>
                                    </span>
                                </div>
                                <div className="Integration-list SectionsPage-injuries">
                                    <ul aria-label={`${monkey.name}'s injuries`}>
                                        {list.map((entry) => (
                                            <InjuryItem key={entry.id} entry={entry} injuries={injuries} today={today} />
                                        ))}
                                    </ul>
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
}
