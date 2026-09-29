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

function MonkeyCard({ name, sex, year, troop, img }) {
    return (
        <div className="MonkeyCard">
            <div className="MonkeyCard-image">
                <img src={img} alt=""></img>
            </div>
            <div className="MonkeyCard-info">
                <h3 className="MonkeyCard-info-name">{name}</h3>
                <div className="MonkeyCard-info-sex">
                    <SexIcon sex={sex} />
                </div>
                <h3 className="MonkeyCard-info-year">{year}</h3>
                <h3 className="MonkeyCard-info-troop">{troop}</h3>
            </div>
        </div>
    );
}

export default MonkeyCard;
