import { useEffect, useRef } from "react";
import {
    IconDeviceGamepad2,
    IconDeviceMobileDown,
    IconFileTypePdf,
    IconHourglassLow,
    IconInfoCircle,
    IconMap,
    IconPhotoPlus,
    IconPlus,
    IconUsersGroup,
    IconX,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import MonkeyIcon from "./MonkeyIcon";
import EnclosureIcon from "./EnclosureIcon";
import Avatar from "./Avatar";
import "./NavBars.css";

// The site's ways around, beside the top bar (Nav.jsx):
//   SideRail   computers: down the left, YouTube-style. Small (icons with
//              tiny labels) to start with; ☰ opens it out with full labels.
//   BottomBar  phones: Monkeys · Enclosures · Map (staff: Add Photos) ·
//              Game (staff: Create PDF) · You
//   Drawer     phones: ☰ (top right) slides it in from the right: Add New
//              Monkey (admins), Interactive Map (staff), Monkey Guesser
//              Game (staff), Install & Use Offline, About
// Create PDF is for staff only (any role), wherever it is
// page: "monkeys", "enclosures" or "game" (that one shows as current)

const YEAR = new Date().getFullYear();

// The Monkeys link: on the Monkeys page it goes back to the top with the
// search and filters cleared (like the logo); elsewhere, back to the list
function monkeysLinkProps(page, onHome) {
    return {
        href: "#",
        "aria-current": page === "monkeys" ? "page" : undefined,
        onClick: (event) => {
            if (page !== "monkeys" || !onHome) return;
            event.preventDefault();
            onHome();
        },
    };
}

// Create PDF: the PDF icon, or an hourglass while one is being made
function ProfileBookIcon({ busy, size }) {
    return busy ? (
        <IconHourglassLow className="hourglass" stroke={1.75} size={size} aria-hidden="true" />
    ) : (
        <IconFileTypePdf stroke={1.75} size={size} aria-hidden="true" />
    );
}

// ---- Computers: the side rail ----
//   open: full labels in groups; otherwise just the main icons
//   over: opened out over the page (narrower screens): a dimmed backdrop,
//   and picking something, tapping outside or Escape calls onClose
//   onProfileBook, onOffline, onAbout: open those pop-ups; onMap: the
//   Interactive Map (for now, its "coming soon" notice)
//   onAddPhotos: staff (editors / admins): Add Photos
export function SideRail({ open, over, onClose, page, onHome, onMap, onAddPhotos, onProfileBook, isGeneratingPDF, onOffline, onAbout, inert }) {
    useEffect(() => {
        if (!over) return;
        const handleKeyDown = (event) => event.key === "Escape" && onClose();
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [over]);
    // Over the page: whatever's picked puts the rail away too
    const andClose = (fn) => (event) => {
        fn?.(event);
        if (over) onClose();
    };
    const item = ({ onClick, ...props }, Icon, label) => (
        <a className="SideRail-item" {...props} onClick={andClose(onClick)}>
            <Icon stroke={1.75} size={24} aria-hidden="true" />
            <span>{label}</span>
        </a>
    );
    const button = (onClick, icon, label, { className = "SideRail-item", ...props } = {}) => (
        <button type="button" className={className} onClick={andClose(onClick)} {...props}>
            {icon}
            <span>{label}</span>
        </button>
    );
    // The interactive sanctuary map: coming soon
    const map = button(onMap, <IconMap stroke={1.75} size={24} aria-hidden="true" />, open ? "Interactive Map" : "Map", {
        "aria-label": "Interactive Map (coming soon)",
        className: "SideRail-item is-soon",
    });
    // Staff: photos already taken, matched to their monkeys
    const addPhotos =
        onAddPhotos && button(onAddPhotos, <IconPhotoPlus stroke={1.75} size={24} aria-hidden="true" />, "Add Photos");
    // Staff only (any role): Profile Books and the AM Plates List
    const profileBook = onProfileBook && button(
        onProfileBook,
        <ProfileBookIcon busy={isGeneratingPDF} size={24} />,
        // (Profile Books and the AM Plates List; the small rail: just
        // "Create PDF", which fits on one line)
        isGeneratingPDF ? (open ? "Creating PDF…" : "Creating…") : "Create PDF",
        { disabled: isGeneratingPDF }
    );
    return (
        <>
        {over && <div className="SideRail-backdrop" onClick={onClose} />}
        <aside
            className={`SideRail${open ? " is-open" : ""}${over ? " is-over" : ""}`}
            id="SideRail"
            aria-label="Main menu"
            inert={inert}
        >
            <div className="SideRail-group">
                {open && <h2 className="SideRail-heading">Browse</h2>}
                {item(monkeysLinkProps(page, onHome), IconUsersGroup, "Monkeys")}
                {item(
                    { href: "#enclosures", "aria-current": page === "enclosures" ? "page" : undefined },
                    EnclosureIcon,
                    "Enclosures"
                )}
                {/* The small rail: the tools straight after (no headings) */}
                {!open && addPhotos}
                {!open && map}
                {!open && profileBook}
                {!open &&
                    item({ href: "#game", "aria-current": page === "game" ? "page" : undefined }, IconDeviceGamepad2, "Game")}
            </div>
            {open && (
                <>
                    <div className="SideRail-group">
                        <h2 className="SideRail-heading">Tools</h2>
                        {addPhotos}
                        {map}
                        {profileBook}
                        {item(
                            { href: "#game", "aria-current": page === "game" ? "page" : undefined },
                            IconDeviceGamepad2,
                            "Monkey Guesser Game"
                        )}
                    </div>
                    <div className="SideRail-group">
                        <h2 className="SideRail-heading">App</h2>
                        {button(onOffline, <IconDeviceMobileDown stroke={1.75} size={24} aria-hidden="true" />, "Install & Use Offline")}
                        {button(onAbout, <IconInfoCircle stroke={1.75} size={24} aria-hidden="true" />, "About")}
                    </div>
                    <p className="SideRail-footer">© {YEAR} Vervet Monkey Foundation</p>
                </>
            )}
        </aside>
        </>
    );
}

// ---- Phones: the bottom bar ----
//   onAccount: opens the account pop-up; signedIn: the person shows green;
//   avatarUrl: their photo in its place (still ringed in green)
//   onMap: the Interactive Map (for now, its "coming soon" notice)
//   onAddPhotos: staff (editors / admins): Add Photos takes Map's place,
//   opening the photo picker straight away (the quick way in for staff)
//   onProfileBook: staff (any role): Create PDF takes the Game's place (the
//   game's then in the ☰ menu)
export function BottomBar({
    page, onHome, onMap, onAddPhotos, onProfileBook, isGeneratingPDF, onAccount, signedIn, avatarUrl, inert,
}) {
    const tab = (props, Icon, text) => (
        <a className="BottomBar-tab" {...props}>
            <span className="BottomBar-icon">
                <Icon stroke={1.75} size={24} aria-hidden="true" />
            </span>
            <span>{text}</span>
        </a>
    );
    return (
        <nav className="BottomBar" aria-label="Main" inert={inert}>
            {tab(monkeysLinkProps(page, onHome), IconUsersGroup, "Monkeys")}
            {tab({ href: "#enclosures", "aria-current": page === "enclosures" ? "page" : undefined }, EnclosureIcon, "Enclosures")}
            {onAddPhotos ? (
                // Staff: Add Photos, a bigger green circle that stands out
                // (no label: its name is read out)
                <button type="button" className="BottomBar-map is-photos" onClick={onAddPhotos} aria-label="Add Photos">
                    <span className="BottomBar-photosCircle" aria-hidden="true">
                        <IconPhotoPlus stroke={1.75} size={26} />
                    </span>
                </button>
            ) : (
                // The interactive sanctuary map: coming soon
                <button type="button" className="BottomBar-map" onClick={onMap} aria-label="Interactive Map (coming soon)">
                    <span className="BottomBar-icon" aria-hidden="true">
                        <span className="BottomBar-mapCircle">
                            <IconMap stroke={1.75} size={20} />
                        </span>
                    </span>
                    <span aria-hidden="true">Map</span>
                </button>
            )}
            {onProfileBook ? (
                // Staff: Create PDF (Profile Books, the AM Plates List), used
                // often, so here; the game is in the ☰ menu
                <button type="button" className="BottomBar-tab" onClick={onProfileBook} disabled={isGeneratingPDF}>
                    <span className="BottomBar-icon">
                        <ProfileBookIcon busy={isGeneratingPDF} size={24} />
                    </span>
                    <span>{isGeneratingPDF ? "Creating…" : "Create PDF"}</span>
                </button>
            ) : (
                tab({ href: "#game", "aria-current": page === "game" ? "page" : undefined }, IconDeviceGamepad2, "Game")
            )}
            <button
                type="button"
                className={`BottomBar-tab${signedIn ? " is-signed-in" : ""}`}
                onClick={onAccount}
                aria-label={signedIn ? "You (signed in)" : "You (sign in)"}
            >
                <span className="BottomBar-icon" aria-hidden="true">
                    <span className="BottomBar-avatar">
                        <Avatar url={avatarUrl} size={16} />
                    </span>
                </span>
                <span aria-hidden="true">You</span>
            </button>
        </nav>
    );
}

// ---- Phones: the drawer from the right ----
//   onAddMonkey: admins only (Add New Monkey first)
//   onMap: staff only (their bottom bar has Add Photos in Map's place)
//   showGame: staff (their bottom bar has Create PDF in the game's place)
export function Drawer({ open, onClose, onAddMonkey, onMap, showGame, page, onOffline, onAbout }) {
    const closeRef = useRef(null);
    useDialog(open, closeRef, { onClose });
    if (!open) return null;
    // Each item closes the drawer, then does its thing
    const then = (fn) => () => {
        onClose();
        fn();
    };
    return (
        <div className="Drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="Drawer-backdrop" onClick={onClose} />
            <div className="Drawer-panel">
                <div className="Drawer-header">
                    <span className="Drawer-brand">
                        <MonkeyIcon color="currentColor" aria-hidden="true" role={undefined} aria-label={undefined} />
                        vervetDB
                    </span>
                    <button type="button" className="Drawer-close" onClick={onClose} ref={closeRef} aria-label="Close menu">
                        <IconX stroke={2} size={22} />
                    </button>
                </div>
                {onAddMonkey && (
                    <button type="button" className="Drawer-item" onClick={then(onAddMonkey)}>
                        <IconPlus stroke={1.75} size={22} aria-hidden="true" />
                        Add New Monkey
                    </button>
                )}
                {onMap && (
                    <button type="button" className="Drawer-item" onClick={then(onMap)}>
                        <IconMap stroke={1.75} size={22} aria-hidden="true" />
                        Interactive Map
                    </button>
                )}
                {showGame && (
                    <a
                        className="Drawer-item"
                        href="#game"
                        onClick={onClose}
                        aria-current={page === "game" ? "page" : undefined}
                    >
                        <IconDeviceGamepad2 stroke={1.75} size={22} aria-hidden="true" />
                        Monkey Guesser Game
                    </a>
                )}
                <button type="button" className="Drawer-item" onClick={then(onOffline)}>
                    <IconDeviceMobileDown stroke={1.75} size={22} aria-hidden="true" />
                    Install & Use Offline
                </button>
                <button type="button" className="Drawer-item" onClick={then(onAbout)}>
                    <IconInfoCircle stroke={1.75} size={22} aria-hidden="true" />
                    About
                </button>
                <p className="Drawer-footer">© {YEAR} Vervet Monkey Foundation</p>
            </div>
        </div>
    );
}

// "Interactive Map coming soon": slides up from the bottom when Map is
// tapped (until the map is built), and goes again with the next tap, key
// press or scroll anywhere
export function ComingSoon({ open, onClose }) {
    useEffect(() => {
        if (!open) return;
        const close = () => onClose();
        const events = ["pointerdown", "keydown", "wheel", "touchmove"];
        events.forEach((e) => document.addEventListener(e, close, true));
        window.addEventListener("scroll", close, true);
        return () => {
            events.forEach((e) => document.removeEventListener(e, close, true));
            window.removeEventListener("scroll", close, true);
        };
    }, [open]);
    return (
        // (read out by screen readers when it appears)
        <div className="ComingSoon" aria-live="polite">
            {open && (
                <p className="ComingSoon-card">
                    <IconMap stroke={1.75} size={20} aria-hidden="true" />
                    Interactive Map coming soon
                </p>
            )}
        </div>
    );
}
