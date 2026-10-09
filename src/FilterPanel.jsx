import { useEffect, useRef } from "react";
import { fullName } from "./places";
import { IconFilterOff, IconX } from "@tabler/icons-react";
import { SECTIONS, inSection } from "./sections";
import { lockScroll, unlockScroll } from "./useDialog";
import "./FilterPanel.css";

// The choices in the Filters panel. Age categories (several can be picked)
// use the 1 November birthday (see ages.js); monkeys with no birth year
// count as adults.
export const AGE_GROUPS = [
    { id: "babies", label: "Babies", hint: "<1" },
    { id: "juveniles", label: "Juveniles", hint: "1–3" },
    { id: "adults", label: "Adults", hint: "4–14" },
    { id: "elderly", label: "Elderly", hint: "15+" },
];
// Where the monkeys live: in a troop, or in an introcage ("all": both)
export const LOCATIONS = [
    { id: "all", label: "All" },
    { id: "troop", label: "Troop" },
    { id: "introcage", label: "Introcage" },
];
export const SEXES = [
    { id: "all", label: "All" },
    { id: "female", label: "Female" },
    { id: "male", label: "Male" },
];

// Birth years to choose from: this year back to 2000
const thisYear = new Date().getFullYear();
export const FILTER_YEARS = Array.from({ length: thisYear - 1999 }, (_, i) => thisYear - i);

// Pills where several can be on at once, like the game's troop picker:
// "All Sections" (dashed) is on when none are; tapping another adds or
// removes it.
//   value: the ids that are on ([] = all)
//   allOff: something else is doing the filtering (e.g. a birth year), so
//           "All …" shows as off too
function Pills({ label, allLabel, options, value, onChange, allOff = false }) {
    const labelId = `FilterPanel-${label.toLowerCase().replace(/\s+/g, "-")}`;
    const toggle = (id) =>
        onChange(value.includes(id) ? value.filter((v) => v !== id) : options.map((o) => o.id).filter((o) => o === id || value.includes(o)));
    return (
        <div className="FilterPanel-section">
            <span className="FilterPanel-label" id={labelId}>
                {label}
            </span>
            <div className="FilterPanel-pills" role="group" aria-labelledby={labelId}>
                <button
                    type="button"
                    className="is-all"
                    aria-pressed={value.length === 0 && !allOff}
                    onClick={() => onChange([])}
                >
                    {allLabel}
                </button>
                {options.map((o) => (
                    <button key={o.id} type="button" aria-pressed={value.includes(o.id)} onClick={() => toggle(o.id)}>
                        {o.label}
                        {o.hint && <small aria-hidden="true">{o.hint}</small>}
                    </button>
                ))}
            </div>
        </div>
    );
}

// Two pills, both on to start with (everyone): tapping one off shows only
// the other; the last one on can't be turned off (that would show nobody).
// Used for Location (Troop / Introcage) and Sex (Female / Male).
//   options: [{ id: "all" }, first, second]; value: "all" or the one still on
//   hideLabel: the box's title already says what it is (e.g. Sex)
function PairPills({ label, options, value, onChange, hideLabel = false }) {
    const labelId = `FilterPanel-${label.toLowerCase().replace(/\s+/g, "-")}`;
    const [first, second] = options.filter((o) => o.id !== "all");
    const on = (id) => value === "all" || value === id;
    function tap(id) {
        if (value === "all") onChange(id === first.id ? second.id : first.id); // this one off
        else if (value !== id) onChange("all"); // this one back on
    }
    return (
        <div className="FilterPanel-section">
            <span className={hideLabel ? "visually-hidden" : "FilterPanel-label"} id={labelId}>
                {label}
            </span>
            <div className="FilterPanel-pills is-two" role="group" aria-labelledby={labelId}>
                {[first, second].map((o) => (
                    <button
                        key={o.id}
                        type="button"
                        aria-pressed={on(o.id)}
                        // The only one on: tapping it does nothing
                        aria-disabled={value === o.id}
                        onClick={() => tap(o.id)}
                    >
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

// The Filters panel: location (troop or introcage, section, troop), birth
// year, age group and sex. The list behind it updates straight away;
// "Show N monkeys" just closes it.
//   filters: { location, section, troop, year, age, sex }; onChange(field, value)
//   open / onClose; buttonRef: the Filters button (focus goes back to it)
//   anyOn: some filter is in use (otherwise Clear All is greyed out)
function FilterPanel({ open, onClose, buttonRef, troops, filters, onChange, onClear, count, anyOn }) {
    const panelRef = useRef(null);

    // Open: focus the first choice. Escape or a click outside closes it.
    useEffect(() => {
        if (!open) return;
        panelRef.current?.querySelector(".FilterPanel-section select, .FilterPanel-section button")?.focus();
        function handleKeyDown(event) {
            if (event.key === "Escape") {
                event.stopPropagation();
                close();
            }
        }
        function handlePointerDown(event) {
            const inside =
                panelRef.current?.contains(event.target) || buttonRef.current?.contains(event.target);
            if (!inside) onClose();
        }
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [open]);

    // Phones: the panel is a sheet covering the page, so the page behind
    // can't scroll (on computers it's a small dropdown; scrolling is fine)
    useEffect(() => {
        if (!open || !window.matchMedia?.("(max-width: 624px)").matches) return;
        lockScroll();
        return unlockScroll;
    }, [open]);

    function close() {
        onClose();
        buttonRef.current?.focus();
    }

    return (
        <>
            {/* Phones: the page dims behind the panel */}
            {open && <div className="FilterPanel-backdrop" aria-hidden="true" />}
            <div
                className="FilterPanel"
                id="FilterPanel"
                role="dialog"
                aria-label="Filters"
                ref={panelRef}
                hidden={!open}
            >
                <div className="FilterPanel-header">
                    <h2>Filters</h2>
                    <button type="button" className="FilterPanel-close" onClick={close} aria-label="Close filters">
                        <IconX size={20} aria-hidden="true" />
                    </button>
                </div>

                <div className="FilterPanel-group">
                    <span className="FilterPanel-groupTitle">Location</span>
                    {/* Introcage only, with a troop chosen: that troop's
                        enclosure's introcages */}
                    <PairPills
                        label="Living in"
                        options={LOCATIONS}
                        value={filters.location}
                        onChange={(v) => onChange("location", v)}
                    />
                    <Pills
                        label="Section"
                        allLabel="All Sections"
                        options={SECTIONS}
                        value={filters.section}
                        onChange={(v) => onChange("section", v)}
                        // A troop chosen: that's what's filtering, so "All
                        // Sections" shows as off
                        allOff={filters.troop !== "All Troops"}
                    />
                    <label className="FilterPanel-section">
                        <span className="FilterPanel-label">Troop</span>
                        {/* Pink, so it stands out: most people go straight here */}
                        <select
                            id="troops"
                            className="FilterPanel-troop"
                            aria-label="Filter by troop"
                            value={filters.troop}
                            onChange={(e) => onChange("troop", e.target.value)}
                        >
                            {/* Only the troops in the chosen sections */}
                            {troops
                                .filter((t) => t === "All Troops" || inSection(t, filters.section))
                                .map((t) => (
                                    <option key={t} value={t}>
                                        {fullName(t)}
                                    </option>
                                ))}
                        </select>
                    </label>
                </div>

                {/* A birth year or an age category, not both: choosing one
                    puts the other back to "all" (see ShowPage setFilter) */}
                <div className="FilterPanel-group">
                    <div className="FilterPanel-groupHeader">
                        <span className="FilterPanel-groupTitle">Age</span>
                        <span className="FilterPanel-note">Pick a birth year or a category</span>
                    </div>
                    <label className="FilterPanel-section">
                        <span className="FilterPanel-label">Birth year</span>
                        {/* No year chosen: a dimmed "Choose a year…" (not in the
                            list itself); "Any year" in the list clears it */}
                        <select
                            id="year"
                            aria-label="Filter by year"
                            className={filters.year === "All Years" ? "is-empty" : undefined}
                            value={filters.year}
                            onChange={(e) =>
                                onChange("year", e.target.value === "any" ? "All Years" : e.target.value)
                            }
                        >
                            <option value="All Years" hidden>
                                Choose a year…
                            </option>
                            <option value="any">Any year</option>
                            {FILTER_YEARS.map((y) => (
                                <option key={y} value={y}>
                                    {y}
                                </option>
                            ))}
                        </select>
                    </label>
                    <Pills
                        label="Category"
                        allLabel="All Ages"
                        // A birth year chosen: that's doing the filtering, so
                        // "All Ages" isn't on either (back to its dotted outline)
                        allOff={filters.year !== "All Years"}
                        options={AGE_GROUPS}
                        value={filters.age}
                        onChange={(v) => onChange("age", v)}
                    />
                </div>

                <div className="FilterPanel-group">
                    <span className="FilterPanel-groupTitle">Sex</span>
                    <PairPills label="Sex" options={SEXES} value={filters.sex} onChange={(v) => onChange("sex", v)} hideLabel />
                </div>

                <div className="FilterPanel-footer">
                    <button type="button" className="FilterPanel-clear" onClick={onClear} disabled={!anyOn}>
                        <IconFilterOff size={16} aria-hidden="true" />
                        Clear All
                    </button>
                    <button type="button" className="FilterPanel-show" onClick={close}>
                        Show {count} {count === 1 ? "monkey" : "monkeys"}
                    </button>
                </div>
            </div>
        </>
    );
}

export default FilterPanel;
