import { useEffect, useRef } from "react";
import {
    IconChartBar,
    IconDeviceGamepad2,
    IconDeviceMobileDown,
    IconFileTypePdf,
    IconHourglassLow,
    IconInfoCircle,
    IconMap2,
    IconPhotoPlus,
    IconPlus,
    IconScan,
} from "@tabler/icons-react";
import useDialog from "./useDialog";
import EnclosuresNavIcon from "./EnclosuresNavIcon";
import MonkeysNavIcon from "./MonkeysNavIcon";
import "./NavBars.css";
import CloseButton from "./CloseButton";

// The site's ways around, beside the top bar (Nav.jsx):
//   SideRail   computers: down the left, Supabase-style: icons, opening
//              out over the page with their names on hover
//   BottomBar  phones: Monkeys · Enclosures · Map · Scan · Game (staff:
//              Photos · Documents)
//   Drawer     phones: ☰ (top left) slides it in from the left: everything
//              (the bottom bar is quick access)
// (The account circle is in the top bar, top right, on both. Admins: Add
// New Monkey at the top of the side rail and the drawer)
// Documents is for staff only (any role), wherever it is
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

// Documents: the PDF icon, or an hourglass while one is being made
function ProfileBookIcon({ busy, size }) {
    return busy ? (
        <IconHourglassLow className="hourglass" stroke={1.75} size={size} aria-hidden="true" />
    ) : (
        <IconFileTypePdf stroke={1.75} size={size} aria-hidden="true" />
    );
}

// ---- Computers: the side rail ----
// Supabase-style: a slim column of icons down the left; hovering over it
// (or tabbing into it) opens it out over the page with their names, so the
// page never moves. The ☰ in the top bar opens it too (touch screens have
// no hover): then picking something, tapping outside or Escape puts it
// away. Lines between the groups (no headings): the main pages, the tools,
// then the app.
//   open / onClose: opened with the ☰
//   onAddMonkey: admins only: Add New Monkey, on its own at the top
//   onProfileBook, onOffline, onAbout: open those pop-ups; onMap: the
//   Interactive Map pop-up
//   onAddPhotos: staff (editors / admins): Add Photos
export function SideRail({ onAddMonkey, open = false, onClose = () => {}, page, onHome, onMap, onAddPhotos, onProfileBook, isGeneratingPDF, onOffline, onAbout, inert }) {
    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (event) => event.key === "Escape" && onClose();
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open]);
    // Opened with the ☰: whatever's picked puts it away too
    const andClose = (fn) => (event) => {
        fn?.(event);
        onClose();
    };
    const item = ({ onClick, ...props }, Icon, label) => (
        <a className="SideRail-item" {...props} onClick={andClose(onClick)}>
            <Icon stroke={1.75} size={22} aria-hidden="true" />
            <span className="SideRail-label">{label}</span>
        </a>
    );
    const button = (onClick, icon, label, props = {}) => (
        <button type="button" className="SideRail-item" onClick={andClose(onClick)} {...props}>
            {icon}
            <span className="SideRail-label">{label}</span>
        </button>
    );
    return (
        <>
        {/* (opened with the ☰: a tap outside puts it away) */}
        {open && <div className="SideRail-backdrop" onClick={onClose} />}
        <aside className={`SideRail${open ? " is-open" : ""}`} id="SideRail" aria-label="Main menu" inert={inert}>
            {onAddMonkey && (
                <div className="SideRail-group">
                    {button(onAddMonkey, <IconPlus stroke={1.75} size={22} aria-hidden="true" />, "Add New Monkey")}
                </div>
            )}
            <div className="SideRail-group">
                {item(monkeysLinkProps(page, onHome), MonkeysNavIcon, "Monkeys")}
                {item(
                    { href: "#enclosures", "aria-current": page === "enclosures" ? "page" : undefined },
                    EnclosuresNavIcon,
                    "Enclosures"
                )}
            </div>
            <div className="SideRail-group">
                {/* Staff: photos already taken, matched to their monkeys */}
                {onAddPhotos &&
                    button(onAddPhotos, <IconPhotoPlus stroke={1.75} size={22} aria-hidden="true" />, "Add Photos")}
                {/* Staff only (any role): Profile Books, the AM Plates List,
                    Introcage Signs… */}
                {onProfileBook &&
                    button(
                        onProfileBook,
                        <ProfileBookIcon busy={isGeneratingPDF} size={22} />,
                        isGeneratingPDF ? "Creating PDF…" : "Documents",
                        { disabled: isGeneratingPDF }
                    )}
                {button(onMap, <IconMap2 stroke={1.75} size={22} aria-hidden="true" />, "Interactive Map")}
                {item({ href: "#statistics", "aria-current": page === "statistics" ? "page" : undefined }, IconChartBar, "Statistics")}
                {item({ href: "#game", "aria-current": page === "game" ? "page" : undefined }, IconDeviceGamepad2, "Monkey Guesser")}
            </div>
            <div className="SideRail-group">
                {button(onOffline, <IconDeviceMobileDown stroke={1.75} size={22} aria-hidden="true" />, "Install & Use Offline")}
                {button(onAbout, <IconInfoCircle stroke={1.75} size={22} aria-hidden="true" />, "About")}
            </div>
            <p className="SideRail-footer">© {YEAR} Vervet Monkey Foundation</p>
        </aside>
        </>
    );
}

// ---- Phones: the bottom bar ----
// Monkeys · Enclosures · Map (the green circle, in the middle), then:
//   Photos (editors / admins: Add Photos, the photo picker straight away),
//   else Scan QR Code; then Documents (staff), else Game. Quick access:
//   everything's in ☰. (The account is in the top bar, top right, as on
//   computers.)
//   onAddPhotos: staff (editors / admins); onProfileBook: staff (any role)
export function BottomBar({ page, onHome, onMap, onAddPhotos, onProfileBook, isGeneratingPDF, onScan, inert }) {
    const tab = (props, Icon, text) => (
        <a className="BottomBar-tab" {...props}>
            <span className="BottomBar-icon">
                <Icon stroke={1.75} size={24} aria-hidden="true" />
            </span>
            <span>{text}</span>
        </a>
    );
    const button = (onClick, icon, text, props = {}) => (
        <button type="button" className="BottomBar-tab" onClick={onClick} {...props}>
            <span className="BottomBar-icon" aria-hidden="true">
                {icon}
            </span>
            <span aria-hidden="true">{text}</span>
        </button>
    );
    return (
        <nav className="BottomBar" aria-label="Main" inert={inert}>
            {tab(monkeysLinkProps(page, onHome), MonkeysNavIcon, "Monkeys")}
            {tab({ href: "#enclosures", "aria-current": page === "enclosures" ? "page" : undefined }, EnclosuresNavIcon, "Enclosures")}
            {/* The Interactive Map (the whole sanctuary map), the highlight:
                a bigger green circle that stands out (no label: its name is
                read out) */}
            <button type="button" className="BottomBar-map" onClick={onMap} aria-label="Interactive Map">
                <span className="BottomBar-mapCircle" aria-hidden="true">
                    <IconMap2 stroke={1.75} size={26} />
                </span>
            </button>
            {onAddPhotos
                ? // Editors / admins: Add Photos, the quick way in
                  button(onAddPhotos, <IconPhotoPlus stroke={1.75} size={24} />, "Photos", { "aria-label": "Add Photos" })
                : // Everyone else: an Introcage Sign's QR code → its page
                  button(onScan, <IconScan stroke={1.75} size={24} />, "Scan", { "aria-label": "Scan QR Code" })}
            {onProfileBook
                ? button(onProfileBook, <ProfileBookIcon busy={isGeneratingPDF} size={24} />, isGeneratingPDF ? "Creating…" : "Documents", {
                      "aria-label": "Documents",
                      disabled: isGeneratingPDF,
                  })
                : tab({ href: "#game", "aria-current": page === "game" ? "page" : undefined }, IconDeviceGamepad2, "Game")}
        </nav>
    );
}

// ---- Phones: the drawer from the left ----
// (☰, top left) Everything, in groups with lines between (no headings), like
// the computers' side rail: Add New Monkey (admins) on its own; the pages;
// the tools; the app. (The bottom bar is just quick access to some of them.)
//   onAddMonkey: admins only; onAddPhotos: editors / admins; onProfileBook:
//   staff (any role): Documents; isGeneratingPDF: while one's made
//   onMap: the Interactive Map; onScan: Scan QR Code (an Introcage Sign's
//   code → its page)
export function Drawer({
    open, onClose, onAddMonkey, onHome, onMap, onAddPhotos, onProfileBook, isGeneratingPDF, onScan, page, onOffline, onAbout,
}) {
    const closeRef = useRef(null);
    useDialog(open, closeRef, { onClose });
    if (!open) return null;
    // Each item closes the drawer, then does its thing
    const then = (fn) => (event) => {
        onClose();
        fn?.(event);
    };
    const button = (onClick, icon, label, props = {}) => (
        <button type="button" className="Drawer-item" onClick={then(onClick)} {...props}>
            {icon}
            {label}
        </button>
    );
    const link = ({ onClick, ...props }, Icon, label) => (
        <a className="Drawer-item" {...props} onClick={then(onClick)}>
            <Icon stroke={1.75} size={24} aria-hidden="true" />
            {label}
        </a>
    );
    return (
        <div className="Drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="Drawer-backdrop" onClick={onClose} />
            <div className="Drawer-panel">
                <div className="Drawer-header">
                    <span className="Drawer-brand">
                        vervet<span className="Nav-titleDB">DB</span>
                    </span>
                    <CloseButton className="Drawer-close" onClick={onClose} ref={closeRef} label="Close menu" />
                </div>
                {onAddMonkey && (
                    <div className="Drawer-group">
                        {button(onAddMonkey, <IconPlus stroke={1.75} size={24} aria-hidden="true" />, "Add New Monkey")}
                    </div>
                )}
                <div className="Drawer-group">
                    {link(monkeysLinkProps(page, onHome), MonkeysNavIcon, "Monkeys")}
                    {link(
                        { href: "#enclosures", "aria-current": page === "enclosures" ? "page" : undefined },
                        EnclosuresNavIcon,
                        "Enclosures"
                    )}
                </div>
                <div className="Drawer-group">
                    {onAddPhotos && button(onAddPhotos, <IconPhotoPlus stroke={1.75} size={24} aria-hidden="true" />, "Add Photos")}
                    {/* (Profile Books, the AM Plates List, Introcage Signs…) */}
                    {onProfileBook &&
                        button(
                            onProfileBook,
                            <ProfileBookIcon busy={isGeneratingPDF} size={24} />,
                            isGeneratingPDF ? "Creating PDF…" : "Documents",
                            { disabled: isGeneratingPDF }
                        )}
                    {button(onMap, <IconMap2 stroke={1.75} size={24} aria-hidden="true" />, "Interactive Map")}
                    {link({ href: "#statistics", "aria-current": page === "statistics" ? "page" : undefined }, IconChartBar, "Statistics")}
                    {button(onScan, <IconScan stroke={1.75} size={24} aria-hidden="true" />, "Scan QR Code")}
                    {link({ href: "#game", "aria-current": page === "game" ? "page" : undefined }, IconDeviceGamepad2, "Monkey Guesser")}
                </div>
                <div className="Drawer-group">
                    {button(onOffline, <IconDeviceMobileDown stroke={1.75} size={24} aria-hidden="true" />, "Install & Use Offline")}
                    {button(onAbout, <IconInfoCircle stroke={1.75} size={24} aria-hidden="true" />, "About")}
                </div>
                <p className="Drawer-footer">© {YEAR} Vervet Monkey Foundation</p>
            </div>
        </div>
    );
}
