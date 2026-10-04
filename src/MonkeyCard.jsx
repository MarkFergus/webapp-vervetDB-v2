import { IconCameraPlus, IconMars, IconVenus } from "@tabler/icons-react";
import { ageLabel } from "./ages";
import { isPlaceholderPhoto, thumbUrl } from "./photoPaths";
import { fallbackTo } from "./photoFallback";
import "./MonkeyCard.css";

function SexIcon({ sex }) {
    if (sex === "male") return <IconMars size={15} stroke={2} aria-hidden="true" />;
    if (sex === "female") return <IconVenus size={15} stroke={2} aria-hidden="true" />;
    return null;
}

// A monkey in the grid, laid out like a video on YouTube: the photo, the
// name, and a quieter line of details ("H&B · ♂ Male · 9 yrs old").
// A button, so it can be reached with Tab and opened with Enter or Space.
// Buttons may only contain inline elements, hence spans rather than divs.
function MonkeyCard({ name, sex, year, troop, img, onClick }) {
    const photoNeeded = isPlaceholderPhoto(img);
    // What screen readers announce, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        `${troop} troop`,
        ...(photoNeeded ? ["photo needed"] : []),
    ].join(", ");

    return (
        <button type="button" className="MonkeyCard" onClick={onClick} aria-label={label}>
            <span className="MonkeyCard-image">
                {/* alt="" because the name is right below the photo.
                    The small thumbnail (faster, and saved for offline use);
                    the full photo if there's no thumbnail */}
                <img
                    key={img}
                    src={thumbUrl(img)}
                    alt=""
                    loading="lazy"
                    crossOrigin="anonymous"
                    onError={fallbackTo(img)}
                ></img>
                {/* Still the grey placeholder: a small badge on the photo,
                    like YouTube's video length */}
                {photoNeeded && (
                    <span className="MonkeyCard-photoNeeded">
                        <IconCameraPlus size={14} aria-hidden="true" />
                        Photo Needed
                    </span>
                )}
            </span>
            <span className="MonkeyCard-info">
                <span className="MonkeyCard-info-name">{name}</span>
                <span className="MonkeyCard-meta">
                    <span className="MonkeyCard-info-troop">{troop}</span>
                    {sex && (
                        <span className="MonkeyCard-sex">
                            <SexIcon sex={sex} />
                            {/* Phones: just the ♂ / ♀ icon (the card's label
                                still says it in words for screen readers) */}
                            <span className="MonkeyCard-sexWord">
                                {sex === "male" ? "Male" : "Female"}
                            </span>
                        </span>
                    )}
                    <span className="MonkeyCard-info-age">
                        {ageLabel(year) === "Age unknown" ? (
                            // Phones (short of space): "Age ?" instead
                            <>
                                <span className="MonkeyCard-ageLong">Age unknown</span>
                                <span className="MonkeyCard-ageShort">Age ?</span>
                            </>
                        ) : (
                            ageLabel(year)
                        )}
                    </span>
                </span>
            </span>
        </button>
    );
}

export default MonkeyCard;
