// The Enclosures button's icon in the nav: a see-through cube, its hidden
// back edges dotted. Drawn on the same 24 × 24 grid as the Tabler icons,
// and used the same way:
//   <EnclosuresNavIcon size={24} stroke={1.75} aria-hidden="true" />
// (Its lines are drawn a touch thinner than the stroke asked for.)

// The cube: a hexagon with a "Y" inside; the back edges, hidden behind it.
// (A little bigger than a Tabler icon's shapes, filling more of the grid)
const OUTLINE = "M12 1.55L21.35 6.78V17.22L12 22.45L2.65 17.22V6.78Z";
const FRONT_EDGES = "M2.65 6.78L12 12L21.35 6.78M12 12V22.45";
const BACK_EDGES = "M12 1.55V12M2.65 17.22L12 12L21.35 17.22";

function EnclosuresNavIcon({ size = 24, stroke = 1.75, color = "currentColor", className, ...props }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={stroke - 0.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={["tabler-icon", className].filter(Boolean).join(" ")}
            {...props}
        >
            <path d={BACK_EDGES} strokeWidth={1.15} strokeDasharray="0 2.1" opacity={0.85} />
            <path d={OUTLINE} />
            <path d={FRONT_EDGES} />
        </svg>
    );
}

export default EnclosuresNavIcon;
