import { IconMars, IconVenus } from "@tabler/icons-react";
import { ageLabel } from "./ages";
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
    // What screen readers announce, e.g. "Abby, female, born 2018, Global troop"
    const label = [
        name,
        sex || "sex unknown",
        year ? `born ${year}` : "birth year unknown",
        `${troop} troop`,
    ].join(", ");

    return (
        <button type="button" className="MonkeyCard" onClick={onClick} aria-label={label}>
            <span className="MonkeyCard-image">
                {/* alt="" because the name is right below the photo */}
                <img src={img} alt="" loading="lazy"></img>
            </span>
            <span className="MonkeyCard-info">
                <span className="MonkeyCard-info-name">{name}</span>
                <span className="MonkeyCard-meta">
                    <span className="MonkeyCard-info-troop">{troop}</span>
                    {sex && (
                        <span className="MonkeyCard-sex">
                            <SexIcon sex={sex} />
                            {sex === "male" ? "Male" : "Female"}
                        </span>
                    )}
                    <span className="MonkeyCard-info-age">{ageLabel(year)}</span>
                </span>
            </span>
        </button>
    );
}

export default MonkeyCard;
