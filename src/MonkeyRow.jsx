import { IconCube, IconFirstAidKit, IconMars, IconSparkles, IconVenus } from "@tabler/icons-react";
import { fullName } from "./places";
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
            <span className="MonkeyRow-wide">Location</span>
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
//   troop: where it lives, its troop or introcage; inIntrocage: true for
//   introcage monkeys (see MonkeyCard)
//   inSickbay: true while it's in Sickbay (a small badge on the photo)
//   newArrival: its New Arrival tag (showsNewArrival: its first 14 days in a
//   care unit; a small badge, bottom left)
//   stayingIn: the introcage it's staying in for now (a small badge)
function MonkeyRow({ name, sex, year, troop, inIntrocage = false, inSickbay = false, stayingIn = null, newArrival = false, chip, img, onClick }) {
    // The same as the cards, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        inIntrocage ? `in ${fullName(troop)}` : `${fullName(troop)} troop`,
        ...(newArrival ? ["new arrival"] : []),
        ...(inSickbay ? ["in Sickbay"] : []),
        ...(stayingIn ? [`staying in ${fullName(stayingIn)}`] : []),
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
                {/* One badge is enough: New Arrival comes first */}
                {inSickbay && !newArrival && (
                    <span className="MonkeyRow-sickbay" title="In Sickbay">
                        <IconFirstAidKit size={12} aria-hidden="true" />
                    </span>
                )}
                {stayingIn && !newArrival && (
                    <span className="MonkeyRow-stay" title={`In ${fullName(stayingIn)}`}>
                        <IconCube size={12} aria-hidden="true" />
                    </span>
                )}
                {newArrival && (
                    <span className="MonkeyRow-newArrival" title="New Arrival">
                        <IconSparkles size={12} aria-hidden="true" />
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
            {/* The troop ("Skunkey"), or the introcage ("H&B C1") */}
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
