import { IconMars, IconVenus } from "@tabler/icons-react";
import "./MonkeyCard.css";

function SexIcon({ sex }) {
    const iconSize = 19;
    const strokeSize = 1;
    if (sex === "male") {
        return <IconMars size={iconSize} stroke={strokeSize} />;
    } else if (sex === "female") {
        return <IconVenus size={iconSize} stroke={strokeSize} />;
    }
    return null;
}

// A button, so it can be reached with Tab and opened with Enter or Space.
// Buttons may only contain inline elements, hence spans rather than divs/h3s.
function MonkeyCard({ name, sex, year, troop, img, onClick }) {
    // What screen readers announce, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        `${troop} troop`,
    ].join(", ");

    return (
        <button
            type="button"
            className="MonkeyCard"
            onClick={onClick}
            aria-label={label}
        >
            <span className="MonkeyCard-image">
                {/* alt="" because the name is right below the photo */}
                <img src={img} alt="" loading="lazy"></img>
            </span>
            <span className="MonkeyCard-info">
                <span className="MonkeyCard-info-name">{name}</span>
                <span className="MonkeyCard-info-sex">
                    <SexIcon sex={sex} />
                </span>
                <span className="MonkeyCard-info-year">{year || "?"}</span>
                <span className="MonkeyCard-info-troop">{troop}</span>
            </span>
        </button>
    );
}

export default MonkeyCard;
