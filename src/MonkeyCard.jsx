import { IconCube, IconPhoto, IconFirstAidKit, IconMars, IconSparkles, IconStar, IconStarFilled, IconVenus } from "@tabler/icons-react";
import { fullName } from "./places";
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
//   troop: where it lives, its troop or introcage ("Goliath", "H&B C1")
//   inIntrocage: true for introcage monkeys
//   inSickbay: true while it's in Sickbay (a badge, top left of the photo)
//   newArrival: its New Arrival tag (showsNewArrival: its first 14 days in a
//   care unit; a badge, top left)
//   stayingIn: the introcage it's staying in for now ("Gismo A"; a badge)
//   favourite / onFavourite: the ☆ top right of the photo (favourites.js);
//   no onFavourite, no star. (Beside the card's button, not in it: a button
//   can't hold another)
function MonkeyCard({
    name, sex, year, troop, inIntrocage = false, inSickbay = false, stayingIn = null, newArrival = false, img, onClick,
    favourite = false, onFavourite,
}) {
    const photoNeeded = isPlaceholderPhoto(img);
    // What screen readers announce, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        inIntrocage ? `in ${fullName(troop)}` : `${fullName(troop)} troop`,
        ...(newArrival ? ["new arrival"] : []),
        ...(inSickbay ? ["in Sickbay"] : []),
        ...(stayingIn ? [`staying in ${fullName(stayingIn)}`] : []),
        ...(photoNeeded ? ["photo needed"] : []),
    ].join(", ");

    const card = (
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
                {(newArrival || inSickbay || stayingIn) && (
                    <span className="MonkeyCard-badges">
                        {newArrival && (
                            <span className="MonkeyCard-newArrival">
                                <IconSparkles size={14} aria-hidden="true" />
                                New Arrival
                            </span>
                        )}
                        {/* One badge is enough: New Arrival comes first */}
                        {inSickbay && !newArrival && (
                            <span className="MonkeyCard-sickbay">
                                <IconFirstAidKit size={14} aria-hidden="true" />
                                In Sickbay
                            </span>
                        )}
                        {stayingIn && !newArrival && (
                            <span className="MonkeyCard-stay">
                                <IconCube size={14} aria-hidden="true" />
                                In {stayingIn}
                            </span>
                        )}
                    </span>
                )}
                {/* No photo yet: a quiet photo icon on the grey (screen
                    readers hear "photo needed" in the card's label) */}
                {photoNeeded && (
                    <span className="MonkeyCard-noPhoto" aria-hidden="true">
                        <IconPhoto size={36} stroke={1.5} />
                    </span>
                )}
                {/* The name sits on the photo's dark fade, so the face fills the card */}
                <span className="MonkeyCard-info-name">{name}</span>
            </span>
            <span className="MonkeyCard-info">
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
    if (!onFavourite) return card;
    return (
        <span className={`MonkeyCard-holder${favourite ? " is-favourite" : ""}`}>
            {card}
            <FavouriteStar name={name} favourite={favourite} onClick={onFavourite} />
        </span>
    );
}

// The ☆ on a photo: a gold ★ once it's a favourite (also the pop-up's)
export function FavouriteStar({ name, favourite, onClick, className = "MonkeyCard-star" }) {
    return (
        <button
            type="button"
            className={`${className}${favourite ? " is-on" : ""}`}
            onClick={onClick}
            aria-pressed={favourite}
            aria-label={`Favourite ${name}`}
            title={favourite ? "Remove from Favourites" : "Add to Favourites"}
        >
            {favourite ? <IconStarFilled size={18} aria-hidden="true" /> : <IconStar size={18} stroke={2} aria-hidden="true" />}
        </button>
    );
}

export default MonkeyCard;
