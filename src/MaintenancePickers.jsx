import { useState } from "react";
import { IconBuildingCommunity, IconFilterOff, IconSearch } from "@tabler/icons-react";
import { fullName } from "./places";
import { MAINTENANCE_TYPES, matchesPlace, placeSub } from "./maintenanceRecords";
import "./IntegrationRecordsPage.css"; // (its search and chosen box)
import "./MaintenanceRecordsPage.css";

// What the maintenance forms share (MaintenanceRecordsPage.jsx,
// MaintenanceIssues.jsx).

// Find the enclosure or introcage: a search, then tap one. chosen: shown
// with Change to search again (filtering: the monkey list's pink clear
// filter icon by its name, Clear).
// onType(text): what's typed so far (View narrows the list as you type).
//   note: under a chosen one's name, instead of what it is
export function PlacePicker({ places, enclosures, chosen, onChoose, onType = () => {}, filtering = false, note = null }) {
    const [search, setSearch] = useState("");
    const type = (text) => {
        setSearch(text);
        onType(text);
    };
    const found = search.trim() ? places.filter((p) => matchesPlace(p, search, enclosures)).slice(0, 8) : [];
    if (chosen) {
        return (
            <div className={`IntegrationPage-chosen${filtering ? " is-filter" : ""}`}>
                <span className="MaintenancePage-placeIcon">
                    <IconBuildingCommunity size={20} aria-hidden="true" />
                </span>
                <span className="RecordsPage-baby">
                    <span className="RecordsPage-name">{fullName(chosen.name)}</span>
                    <span className="RecordsPage-place">{note ?? placeSub(chosen, enclosures)}</span>
                </span>
                {filtering ? (
                    <button type="button" className="MaintenancePage-clear" onClick={() => onChoose(null)} aria-label="Clear" title="Clear">
                        <IconFilterOff size={15} aria-hidden="true" />
                    </button>
                ) : (
                    <button type="button" className="Modal-edit is-soft" onClick={() => onChoose(null)}>
                        Change
                    </button>
                )}
            </div>
        );
    }
    return (
        <div className="IntegrationPage-find">
            <label className="IntegrationPage-search">
                <IconSearch size={16} aria-hidden="true" />
                <input
                    type="search"
                    value={search}
                    placeholder="Search enclosures and introcages"
                    onChange={(e) => type(e.target.value)}
                    aria-label="Search enclosures and introcages"
                />
            </label>
            {search.trim() && (
                <ul className="IntegrationPage-found" aria-label="Places found">
                    {found.length ? (
                        found.map((p) => (
                            <li key={p.id}>
                                <button
                                    type="button"
                                    onClick={() => {
                                        onChoose(p);
                                        type("");
                                    }}
                                >
                                    <span className="MaintenancePage-placeIcon">
                                        <IconBuildingCommunity size={18} aria-hidden="true" />
                                    </span>
                                    <span className="RecordsPage-baby">
                                        <span className="RecordsPage-name">{fullName(p.name)}</span>
                                        <span className="RecordsPage-place">{placeSub(p, enclosures)}</span>
                                    </span>
                                </button>
                            </li>
                        ))
                    ) : (
                        <li className="RecordsPage-none">No enclosure or introcage found.</li>
                    )}
                </ul>
            )}
        </div>
    );
}

// Routine or Repair: two buttons
export function TypeButtons({ value, onChange, label = "Maintenance Type", withAll = false }) {
    const options = withAll ? { all: "All", ...MAINTENANCE_TYPES } : MAINTENANCE_TYPES;
    return (
        <div className="MaintenancePage-types" role="group" aria-label={label}>
            {Object.entries(options).map(([id, word]) => (
                <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>
                    {word}
                </button>
            ))}
        </div>
    );
}
