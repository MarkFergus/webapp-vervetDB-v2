import { useEffect, useRef } from "react";
import { IconDotsVertical, IconStar, IconTrash } from "@tabler/icons-react";

// The ⋮ button beside a photo in the edit form, and its little menu:
// "Make primary photo" (not for the one that already is) and "Delete photo".
//   number:     the photo's place in the list (1, 2, …), for labels
//   isPrimary:  it's the first photo (card and Profile Book photo)
//   canBePrimary: false for a blank link
//   open / onOpen / onClose: whether this photo's menu is showing
function PhotoOptions({ number, isPrimary, canBePrimary, open, onOpen, onClose, onMakePrimary, onDelete }) {
    const buttonRef = useRef(null);
    const menuRef = useRef(null);
    const menuId = `MonkeyForm-photoMenu-${number}`;

    // Open: focus the first item; a click or tap outside closes it
    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector("button:not(:disabled)")?.focus();
        function handlePointerDown(event) {
            const inside =
                menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target);
            if (!inside) onClose();
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [open]);

    function close() {
        onClose();
        buttonRef.current?.focus();
    }

    // Escape closes just the menu (not the whole form); arrows move between items
    function handleKeyDown(event) {
        const items = [...menuRef.current.querySelectorAll("button:not(:disabled)")];
        const at = items.indexOf(document.activeElement);
        if (event.key === "Escape") {
            event.stopPropagation();
            close();
        } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(at + step + items.length) % items.length]?.focus();
        } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            items[event.key === "Home" ? 0 : items.length - 1]?.focus();
        } else if (event.key === "Tab") {
            onClose();
        }
    }

    return (
        <div className="PhotoOptions">
            <button
                type="button"
                ref={buttonRef}
                id={`MonkeyForm-photoOptions-${number}`}
                className="MonkeyForm-iconButton"
                onClick={() => (open ? onClose() : onOpen())}
                aria-label={`Photo ${number} options${isPrimary ? " (primary photo)" : ""}`}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
            >
                <IconDotsVertical size={20} aria-hidden="true" />
            </button>
            {open && (
                <div className="PhotoOptions-menu" id={menuId} role="menu" ref={menuRef} onKeyDown={handleKeyDown}>
                    {!isPrimary && (
                        <button
                            type="button"
                            role="menuitem"
                            onClick={onMakePrimary}
                            disabled={!canBePrimary}
                        >
                            <IconStar size={18} aria-hidden="true" />
                            Make primary photo
                        </button>
                    )}
                    <button type="button" role="menuitem" className="is-delete" onClick={onDelete}>
                        <IconTrash size={18} aria-hidden="true" />
                        Delete photo
                    </button>
                </div>
            )}
        </div>
    );
}

export default PhotoOptions;
