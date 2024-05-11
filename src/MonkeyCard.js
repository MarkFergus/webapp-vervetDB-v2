import { Component } from "react";
import { IconMars, IconVenus } from "@tabler/icons-react";
import "./MonkeyCard.css";

class MonkeyCard extends Component {
    displaySexIcon(sex) {
        const iconSize = 19;
        const strokeSize = 1;
        if (sex === "male") {
            return <IconMars size={iconSize} stroke={strokeSize} />;
        } else if (sex === "female") {
            return <IconVenus size={iconSize} stroke={strokeSize} />;
        } else {
            return "";
        }
    }
    render() {
        return (
            <div className="MonkeyCard">
                <div className="MonkeyCard-image">
                    <img src={this.props.img} alt=""></img>
                </div>
                <div className="MonkeyCard-info">
                    <h3 className="MonkeyCard-info-name">{this.props.name}</h3>
                    <div className="MonkeyCard-info-sex">
                        {this.displaySexIcon(this.props.sex)}
                    </div>
                    <h3 className="MonkeyCard-info-year">{this.props.year}</h3>
                    <h3 className="MonkeyCard-info-troop">
                        {this.props.troop}
                    </h3>
                </div>
            </div>
        );
    }
}

export default MonkeyCard;
