import { IconCameraPlus, IconMars, IconVenus } from "@tabler/icons-react";
import { ageLabel } from "./ages";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import "./MonkeyRow.css";

// The list view's column headings (computers; phones have no room for them)
export function MonkeyListHeader() {
    return (
        <div className="MonkeyRow MonkeyRow-header" aria-hidden="true">
            <span />
            <span>Name</span>
            <span className="MonkeyRow-wide">Troop</span>
            <span className="MonkeyRow-wide">Sex</span>
            <span className="MonkeyRow-wide MonkeyRow-born">Born</span>
            <span className="MonkeyRow-wide">Age</span>
            <span>Chip</span>
        </div>
    );
}

// A monkey in the list view: a small photo, then the details in columns.
// On phones: photo, name with "Troop · ♀ · 2018 · 7 yrs old" under it (the
// year dropped if there isn't room), and chip.
// A button, so it can be reached with Tab and opened with Enter or Space.
function MonkeyRow({ name, sex, year, troop, chip, img, onClick }) {
    // The same as the cards, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        `${troop} troop`,
        ...(isPlaceholderPhoto(img) ? ["photo needed"] : []),
    ].join(", ");
    const sexWord = sex === "male" ? "Male" : sex === "female" ? "Female" : "–";
    const SexIcon = sex === "male" ? IconMars : sex === "female" ? IconVenus : null;
    const age = ageLabel(year) === "Age unknown" ? "Unknown" : ageLabel(year);

    return (
        <button type="button" className="MonkeyRow" onClick={onClick} aria-label={label}>
            <span className="MonkeyRow-photo">
                <img
                    key={img}
                    src={thumbUrl(img)}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={fallbackTo(img)}
                />
                {/* Still the grey placeholder: a small camera badge */}
                {isPlaceholderPhoto(img) && (
                    <span className="MonkeyRow-photoNeeded" title="Photo needed">
                        <IconCameraPlus size={12} aria-hidden="true" />
                    </span>
                )}
            </span>
            <span className="MonkeyRow-main">
                <span className="MonkeyRow-name">{name}</span>
                {/* Phones: the details under the name, like the cards */}
                <span className="MonkeyRow-meta">
                    <span>{troop}</span>
                    {SexIcon && (
                        <span>
                            <SexIcon size={14} stroke={2} aria-hidden="true" />
                        </span>
                    )}
                    {year && <span className="MonkeyRow-metaYear">{year}</span>}
                    <span>{year ? ageLabel(year) : "Age ?"}</span>
                </span>
            </span>
            <span className="MonkeyRow-wide">{troop}</span>
            <span className="MonkeyRow-wide">
                {SexIcon && <SexIcon size={14} stroke={2} aria-hidden="true" />}
                {sexWord}
            </span>
            <span className="MonkeyRow-wide MonkeyRow-born">{year || "–"}</span>
            <span className="MonkeyRow-wide">{age}</span>
            <span className="MonkeyRow-chip">{chip === null ? "Unknown" : chip || "No Chip"}</span>
        </button>
    );
}

export default MonkeyRow;
