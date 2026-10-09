// vervetDB's own icon for a troop enclosure, like the sanctuary's fences:
// tall poles (one each side) with electric wires running across, and on a
// little past them, as the fence carries on.
// Drawn on the same 24 × 24 grid as the Tabler icons, and used the same way:
//   <EnclosureIcon size={24} stroke={1.75} aria-hidden="true" />
// The other designs considered are in logos/enclosure-icon-options.html.
function EnclosureIcon({ size = 24, stroke = 2, color = "currentColor", className, ...props }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={["tabler-icon", className].filter(Boolean).join(" ")}
            {...props}
        >
            {/* The poles */}
            <path d="M5 3v18" />
            <path d="M19 3v18" />
            {/* The wires, running on past the poles */}
            <path d="M2.5 7h19" />
            <path d="M2.5 11h19" />
            <path d="M2.5 15h19" />
            <path d="M2.5 19h19" />
        </svg>
    );
}

export default EnclosureIcon;
