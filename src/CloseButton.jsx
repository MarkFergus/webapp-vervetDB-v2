import { IconX } from "@tabler/icons-react";
import "./CloseButton.css";

// Every pop-up's close button: a square grey chip with an X (8px corners),
// like the monkey pop-up's Quick Actions button. Each pop-up places it.
//   ref: passed through (e.g. to focus it when the pop-up opens)
export default function CloseButton({ className = "", label = "Close", ...props }) {
    return (
        <button type="button" className={`CloseButton ${className}`.trim()} aria-label={label} {...props}>
            <IconX size={22} stroke={2} aria-hidden="true" />
        </button>
    );
}
