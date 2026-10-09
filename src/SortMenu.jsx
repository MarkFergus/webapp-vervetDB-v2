import { useEffect, useRef, useState } from "react";
import { IconArrowsSort, IconChevronDown } from "@tabler/icons-react";
import "./SortMenu.css";

// The ways to sort, and what each direction means in words
export const SORTS = [
    { key: "name", label: "Name", up: "A–Z", down: "Z–A" },
    { key: "troop", label: "Troop", up: "A–Z", down: "Z–A" },
    { key: "age", label: "Age", up: "Youngest first", down: "Oldest first" },
    { key: "sex", label: "Sex", up: "Female first", down: "Male first" },
];

// "Name, A–Z" (options: the sorts on offer, SORTS unless given)
export function sortDescription({ key, ascending }, options = SORTS) {
    const s = options.find((option) => option.key === key);
    return `${s.label}, ${ascending ? s.up : s.down}`;
}

// The sort button beside Filters: it shows the sort in use, with what it
// means faded after it ("Name A–Z ▾"), like the dropdown's choices. It
// stays grey (sorting only changes the order; nothing is filtered out). Its
// dropdown offers the other sorts, and the current one the other way round
// ("Name Z–A"). Another sort starts the usual way round.
//   options: the sorts on offer ({ key, label, up, down }), the monkey
//   list's (SORTS) unless given, e.g. the Enclosures list's
function SortMenu({ sort, onSort, options = SORTS }) {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const current = options.find((option) => option.key === sort.key);

    function close() {
        setOpen(false);
        buttonRef.current?.focus();
    }

    // Open: focus the first choice; a click or tap outside closes it
    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector("button")?.focus();
        function handlePointerDown(event) {
            const inside = menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target);
            if (!inside) setOpen(false);
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [open]);

    // Escape closes; arrow keys move between the choices
    function handleKeyDown(event) {
        const items = [...menuRef.current.querySelectorAll("button")];
        const at = items.indexOf(document.activeElement);
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(at + step + items.length) % items.length]?.focus();
        } else if (event.key === "Tab") {
            setOpen(false);
        }
    }

    return (
        <div className="SortMenu">
            <button
                type="button"
                ref={buttonRef}
                className="ShowPage-filtersButton"
                onClick={() => setOpen((isOpen) => !isOpen)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? "SortMenu-menu" : undefined}
                aria-label={`Sort: ${sortDescription(sort, options)}`}
            >
                {/* The sort icon first, like Filters' (when the row's too
                    tight for the words, ShowPage: just the icon) */}
                <IconArrowsSort className="SortMenu-icon" size={16} stroke={2} aria-hidden="true" />
                <span className="SortMenu-current">
                    {current.label}
                    <span className="SortMenu-direction">{sort.ascending ? current.up : current.down}</span>
                </span>
                <IconChevronDown className="ShowPage-chevron" size={14} stroke={2} aria-hidden="true" />
            </button>
            {open && (
                <div className="SortMenu-menu" id="SortMenu-menu" role="menu" ref={menuRef} onKeyDown={handleKeyDown}>
                    {options.map((option) => {
                        const isCurrent = option.key === sort.key;
                        // The current sort is offered the other way round
                        const reversed = isCurrent && (sort.ascending ? option.down : option.up);
                        return (
                            <button
                                key={option.key}
                                type="button"
                                role="menuitem"
                                aria-label={reversed ? `${option.label}, ${reversed}` : option.label}
                                onClick={() => {
                                    onSort(option.key);
                                    close();
                                }}
                            >
                                <span className="SortMenu-label">{option.label}</span>
                                {reversed && (
                                    <span className="SortMenu-direction" aria-hidden="true">
                                        {reversed}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default SortMenu;
