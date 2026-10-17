import { useEffect, useRef, useState } from "react";
import { IconCheck, IconHistory, IconLogout, IconMoon, IconSun, IconUser } from "@tabler/icons-react";
import { setTheme, useTheme } from "./theme";
import { useAuth } from "./auth";
import Avatar from "./Avatar";
import "./AccountMenu.css";

// Computers: the account circle at the top right (Nav.jsx). Signed out, it
// opens the sign-in pop-up. Signed in, a menu drops down (like Supabase's):
// who you are (photo, name, email), Account (the signed-in pop-up, for
// now the account page), Changelog (staff: your own changes), a Theme
// section listing Dark and Light (like Supabase's: the chosen one ticked;
// tapped, it switches and the menu stays open), and Sign Out.
//   onAccount: opens the account pop-up; onChangelog: opens it on Changelog
// The theme choices, in order
const THEME_CHOICES = [
    { id: "dark", label: "Dark", Icon: IconMoon },
    { id: "light", label: "Light", Icon: IconSun },
];

function AccountMenu({ onAccount, onChangelog }) {
    const { user, role, name, avatarUrl, signOut } = useAuth();
    const [open, setOpen] = useState(false);
    const theme = useTheme();
    const buttonRef = useRef(null);
    const menuRef = useRef(null);

    // Signed out (or in) while it's open: put it away
    useEffect(() => setOpen(false), [user]);

    function close() {
        setOpen(false);
        buttonRef.current?.focus();
    }

    // Open: focus the first choice; a click or tap outside closes it
    useEffect(() => {
        if (!open) return;
        menuRef.current?.querySelector("[role^=menuitem]")?.focus();
        function handlePointerDown(event) {
            const inside = menuRef.current?.contains(event.target) || buttonRef.current?.contains(event.target);
            if (!inside) setOpen(false);
        }
        document.addEventListener("pointerdown", handlePointerDown);
        return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [open]);

    // Escape closes; arrow keys move between the choices
    function handleKeyDown(event) {
        const items = [...menuRef.current.querySelectorAll("[role^=menuitem]")];
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

    // Each choice puts the menu away first
    const choose = (fn) => () => {
        setOpen(false);
        fn();
    };

    return (
        <div className="AccountMenu">
            {/* Sign in / account: a person in a circle (or their photo),
                green when signed in */}
            <button
                type="button"
                ref={buttonRef}
                className={user ? "Nav-account is-signed-in" : "Nav-account"}
                onClick={user ? () => setOpen((isOpen) => !isOpen) : onAccount}
                aria-label={user ? "Account (signed in)" : "Sign in"}
                aria-haspopup={user ? "menu" : undefined}
                aria-expanded={user ? open : undefined}
                aria-controls={open ? "AccountMenu-menu" : undefined}
                // (no hover label while the menu's showing)
                data-tooltip={open ? undefined : user ? "Account" : "Sign in"}
                data-tooltip-align="end"
            >
                <span className="Nav-avatar" aria-hidden="true">
                    <Avatar url={avatarUrl} size={20} />
                </span>
            </button>
            {open && (
                <div
                    className="AccountMenu-menu"
                    id="AccountMenu-menu"
                    role="menu"
                    aria-label="Account"
                    ref={menuRef}
                    onKeyDown={handleKeyDown}
                >
                    {/* Who's signed in */}
                    <div className="AccountMenu-who">
                        <span className="AccountMenu-avatar" aria-hidden="true">
                            <Avatar url={avatarUrl} size={20} />
                        </span>
                        <span className="AccountMenu-names">
                            {name && <span className="AccountMenu-name">{name}</span>}
                            <span className="AccountMenu-email">{user.email}</span>
                        </span>
                    </div>
                    <div className="AccountMenu-divider" role="separator" />
                    <button type="button" role="menuitem" onClick={choose(onAccount)}>
                        <IconUser stroke={1.75} size={18} aria-hidden="true" />
                        Account
                    </button>
                    {role && (
                        <button type="button" role="menuitem" onClick={choose(onChangelog)}>
                            <IconHistory stroke={1.75} size={18} aria-hidden="true" />
                            Changelog
                        </button>
                    )}
                    <div className="AccountMenu-divider" role="separator" />
                    {/* Theme: both choices, the chosen one ticked */}
                    <div role="group" aria-labelledby="AccountMenu-themeTitle">
                        <p className="AccountMenu-section" id="AccountMenu-themeTitle">
                            Theme
                        </p>
                        {THEME_CHOICES.map(({ id, label, Icon }) => (
                            <button
                                key={id}
                                type="button"
                                role="menuitemradio"
                                aria-checked={theme === id}
                                onClick={() => setTheme(id)}
                            >
                                <Icon stroke={1.75} size={18} aria-hidden="true" />
                                {label}
                                {theme === id && <IconCheck className="AccountMenu-check" stroke={2} size={16} aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                    <div className="AccountMenu-divider" role="separator" />
                    <button type="button" role="menuitem" onClick={choose(signOut)}>
                        <IconLogout stroke={1.75} size={18} aria-hidden="true" />
                        Sign Out
                    </button>
                </div>
            )}
        </div>
    );
}

export default AccountMenu;
