import { MONKEY_ICON_PATH, MONKEY_ICON_VIEWBOX } from "./monkeyIconPath";

// The vervetDB monkey logo as a vector, so it's sharp on any screen
function MonkeyIcon({ color = "#b5b3ac", ...props }) {
    return (
        <svg
            viewBox={MONKEY_ICON_VIEWBOX}
            role="img"
            aria-label="vervetDB monkey logo"
            {...props}
        >
            <path d={MONKEY_ICON_PATH} fill={color} fillRule="evenodd" />
        </svg>
    );
}

export default MonkeyIcon;
