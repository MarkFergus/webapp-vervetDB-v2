import { MONKEY_ICON_HEIGHT, MONKEY_ICON_PATH, MONKEY_ICON_WIDTH } from "./monkeyIconPath";

// The Monkeys button's icon in the nav: the vervetDB monkey, in the nav's
// colour (grey, white when it's the page you're on). Sized to sit like a
// 24 × 24 Tabler icon (a little room round it), and used the same way:
//   <MonkeysNavIcon size={24} aria-hidden="true" />
// (A filled shape, so stroke is ignored.)

// A square box round the monkey, so it's centred with a little room
const BOX = MONKEY_ICON_WIDTH * (24 / 21);
const VIEW_BOX = `${-(BOX - MONKEY_ICON_WIDTH) / 2} ${-(BOX - MONKEY_ICON_HEIGHT) / 2} ${BOX} ${BOX}`;

// eslint-disable-next-line no-unused-vars
function MonkeysNavIcon({ size = 24, stroke, color = "currentColor", className, ...props }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox={VIEW_BOX}
            fill={color}
            className={["tabler-icon", className].filter(Boolean).join(" ")}
            {...props}
        >
            <path d={MONKEY_ICON_PATH} fillRule="evenodd" />
        </svg>
    );
}

export default MonkeysNavIcon;
