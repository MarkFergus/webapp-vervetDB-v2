import { useState } from "react";
import { IconSearch } from "@tabler/icons-react";
import { matchesSearch } from "./integrations";
import { placeLabel } from "./places";
import { BabyPhoto } from "./PagePicker";
import "./IntegrationRecordsPage.css";

// Finding a monkey for a form: type part of a name (or chip), tap one of the
// monkeys found; then their photo and name, with Change. As New
// Integration's search.
//   monkeys: who can be chosen; chosen: the one chosen, or null
//   label: the search box's ("Search monkeys"); none: when nobody matches
export default function MonkeyFind({ monkeys, chosen, onChoose, label = "Search monkeys", none = "No monkey found." }) {
    const [search, setSearch] = useState("");
    const found = search.trim() ? monkeys.filter((m) => matchesSearch(m, search)).slice(0, 8) : [];
    if (chosen) {
        return (
            <div className="IntegrationPage-chosen">
                <BabyPhoto monkey={chosen} />
                <div className="RecordsPage-baby">
                    <span className="RecordsPage-name">{chosen.name}</span>
                    <span className="RecordsPage-place">{placeLabel(chosen)}</span>
                </div>
                <button type="button" className="Modal-edit is-soft" onClick={() => onChoose(null)}>
                    Change
                </button>
            </div>
        );
    }
    return (
        <div className="IntegrationPage-find">
            <label className="IntegrationPage-search">
                <IconSearch size={16} aria-hidden="true" />
                <input type="search" value={search} placeholder={label} onChange={(e) => setSearch(e.target.value)} aria-label={label} />
            </label>
            {search.trim() && (
                <ul className="IntegrationPage-found" aria-label="Monkeys found">
                    {found.length ? (
                        found.map((m) => (
                            <li key={m.id}>
                                <button type="button" onClick={() => onChoose(m)}>
                                    <BabyPhoto monkey={m} open={false} />
                                    <span className="RecordsPage-baby">
                                        <span className="RecordsPage-name">{m.name}</span>
                                        <span className="RecordsPage-place">{placeLabel(m)}</span>
                                    </span>
                                </button>
                            </li>
                        ))
                    ) : (
                        <li className="RecordsPage-none">{none}</li>
                    )}
                </ul>
            )}
        </div>
    );
}
