import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch, IconX, IconMenu2, IconPlus } from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
import AccountModal from "./AccountModal";
import AboutModal from "./AboutModal";
import { useAuth } from "./auth";
import MonkeyIcon from "./MonkeyIcon";
import AccountMenu from "./AccountMenu";
import { BottomBar, ComingSoon, Drawer, SideRail } from "./NavBars";
import "./Nav.css";

// The top bar, and the ways around beside it (NavBars.jsx):
//   Computers: the menu button (opens the side rail out or back) and the
//   logo; search in the middle; + Add (admins) and the account circle
//   (signed in: the account menu, AccountMenu.jsx). The
//   side rail down the left.
//   Phones: the logo, search, and the menu button (the drawer from the
//   right); the bottom bar: Monkeys, Enclosures, Map (Edit on a page that
//   can be edited), Game, You.
// The side rail: on wide screens, opening it out moves the page over (and
// that's remembered on this device); on narrower ones it slides out over
// the page instead, YouTube-style, until something's picked.
const RAIL_KEY = "vervetdb-rail";
const WIDE = "(min-width: 1280px)";
const isWide = () => window.matchMedia?.(WIDE).matches ?? true;
function savedRailOpen() {
    try {
        return localStorage.getItem(RAIL_KEY) === "open";
    } catch {
        return false;
    }
}

function Nav({
    searchValue,
    handleSearch,
    handleDelete,
    isGeneratingPDF,
    isPDFModalOpen,
    togglePDFModal,
    createPDF,
    pdfProgress,
    pdfError,
    pdfMonkeyCount,
    pdfBook,
    pdfTroops,
    onChoosePdfBook,
    pdfReport,
    onChoosePdfReport,
    pdfPlateCount,
    pdfPlateIntrocages,
    pdfPlateMonkeys,
    pdfMonitoringCount,
    pdfMonitorTroops,
    pdfReady,
    onSavePDF,
    isAccountOpen,
    toggleAccount,
    isAboutOpen,
    toggleAbout,
    isOfflineOpen,
    toggleOffline,
    onAddMonkey, // admins only: "+ Add" (computers), Add New Monkey (the drawer)
    onAddPhotos, // staff (editors / admins): Add Photos, in Map's place on phones
    onHome, // the logo: back to the top, search and filters cleared
    page = "monkeys", // the page showing: "monkeys", "enclosures" or "game"
    showSearch = true, // false: no search box (the game)
    barsInert = false, // a pop-up is open: the side rail and bottom bar wait
}) {
    const { user, avatarUrl, role } = useAuth();
    // Create PDF (Profile Books, the AM Plates List): staff only (any role)
    const onCreatePdf = role ? togglePDFModal : undefined;
    const searchInputRef = useRef(null);

    // Computers: the side rail opened out (labels) or small (icons).
    // Wide screens: pinned open (the page moves over; remembered). Narrower:
    // over the page for a moment.
    const [wide, setWide] = useState(isWide);
    useEffect(() => {
        const query = window.matchMedia?.(WIDE);
        const update = () => setWide(query.matches);
        query?.addEventListener?.("change", update);
        return () => query?.removeEventListener?.("change", update);
    }, []);
    const [railPinned, setRailPinned] = useState(savedRailOpen);
    const [railOver, setRailOver] = useState(false);
    const railOpen = wide ? railPinned : railOver;
    useEffect(() => {
        // (NavBars.css only moves the page over on wide screens)
        document.documentElement.classList.toggle("rail-open", railPinned);
        try {
            localStorage.setItem(RAIL_KEY, railPinned ? "open" : "small");
        } catch {
            // (not saved: fine)
        }
    }, [railPinned]);
    function toggleRail() {
        if (wide) setRailPinned((open) => !open);
        else setRailOver((open) => !open);
    }
    // Over the page: a new page, or a pop-up opening, puts it away
    const closeRailOver = () => setRailOver(false);
    useEffect(closeRailOver, [page, wide]);
    // The account pop-up opened from the account menu's Changelog: starts there
    const [accountStart, setAccountStart] = useState(null);
    // Phones: the drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Map (the side rail or bottom bar): "coming soon" for now
    const [mapNotice, setMapNotice] = useState(false);
    const showMapNotice = () => setMapNotice(true);

    // The clear button disappears once clicked, so put focus back in the box
    function clearSearch() {
        handleDelete();
        searchInputRef.current?.focus();
    }

    const anyPopUp = isPDFModalOpen || isAccountOpen || isAboutOpen || isOfflineOpen;

    // "/" anywhere on the page jumps into the search box (like YouTube and X),
    // unless you're already typing somewhere
    useEffect(() => {
        function handleKeyDown(event) {
            if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
            const tag = event.target.tagName;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(tag) || event.target.isContentEditable) return;
            const input = searchInputRef.current;
            if (!input || input.closest("[inert]")) return; // a pop-up is open
            event.preventDefault();
            input.focus();
        }
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <>
            {/* inert: while a pop-up is open, the nav behind it can't be tabbed to */}
            <nav className="Nav" inert={anyPopUp}>
                <div className="Nav-start">
                    {/* Computers: opens the side rail out, or back to icons */}
                    <button
                        type="button"
                        className="Nav-railButton"
                        onClick={toggleRail}
                        aria-label={railOpen ? "Make the side menu smaller" : "Open the side menu"}
                        aria-expanded={railOpen}
                        aria-controls="SideRail"
                    >
                        <IconMenu2 stroke={1.75} size={24} />
                    </button>
                    {/* The logo: back home (top of the page, search and
                        filters cleared), like YouTube's */}
                    <a
                        href="#"
                        className="Nav-home"
                        aria-label="vervetDB home"
                        onClick={(event) => {
                            event.preventDefault();
                            onHome?.();
                        }}
                    >
                        <span className="Nav-icon">
                            <MonkeyIcon color="currentColor" aria-hidden="true" role={undefined} aria-label={undefined} />
                        </span>
                        <span className="Nav-title" aria-hidden="true">
                            vervetDB
                        </span>
                    </a>
                </div>

                {showSearch ? (
                <div className="Nav-searchbar">
                    <div className="Nav-iconSearch" aria-hidden="true">
                        <IconSearch stroke={2} />
                    </div>
                    <input
                        type="text"
                        placeholder="Name or chip number"
                        aria-label="Search by name or chip number"
                        name="search"
                        ref={searchInputRef}
                        value={searchValue}
                        onChange={handleSearch}
                    ></input>
                    {searchValue.length > 0 && (
                        <button
                            type="button"
                            className="Nav-iconX"
                            onClick={clearSearch}
                            aria-label="Clear search"
                        >
                            <IconX stroke={2} />
                        </button>
                    )}
                </div>
                ) : (
                    // (keeps the middle of the bar: the buttons stay put)
                    <div className="Nav-spacer" />
                )}

                {/* Computers: + Add (admins), then the account circle */}
                <div className="Nav-buttons">
                    {onAddMonkey && (
                        <button type="button" className="Nav-add" onClick={onAddMonkey} aria-label="Add New Monkey">
                            <IconPlus stroke={2} size={20} aria-hidden="true" />
                            Add
                        </button>
                    )}
                    {/* Sign in, or (signed in) the account menu */}
                    <AccountMenu
                        onAccount={toggleAccount}
                        onChangelog={() => {
                            setAccountStart("changes");
                            toggleAccount();
                        }}
                    />
                </div>

                {/* Phones: opens the drawer from the right */}
                <button
                    type="button"
                    className="Nav-menuButton"
                    onClick={() => setDrawerOpen(true)}
                    aria-label="Menu"
                    aria-expanded={drawerOpen}
                >
                    <IconMenu2 stroke={2} size={28} />
                </button>
            </nav>
            {/* The side rail, bottom bar and drawer sit outside the top bar
                (its blur would trap them in its own strip) */}
            {createPortal(
                <>
                    <SideRail
                        open={railOpen}
                        onMap={showMapNotice}
                        onAddPhotos={onAddPhotos}
                        over={!wide && railOver}
                        onClose={closeRailOver}
                        page={page}
                        onHome={onHome}
                        onProfileBook={onCreatePdf}
                        isGeneratingPDF={isGeneratingPDF}
                        onOffline={toggleOffline}
                        onAbout={toggleAbout}
                        inert={barsInert || anyPopUp}
                    />
                    <BottomBar
                        page={page}
                        onHome={onHome}
                        onMap={showMapNotice}
                        onAddPhotos={onAddPhotos}
                        onProfileBook={onCreatePdf}
                        isGeneratingPDF={isGeneratingPDF}
                        onAccount={toggleAccount}
                        signedIn={Boolean(user)}
                        avatarUrl={avatarUrl}
                        inert={barsInert || anyPopUp}
                    />
                    <ComingSoon open={mapNotice} onClose={() => setMapNotice(false)} />
                    <Drawer
                        open={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                        onAddMonkey={onAddMonkey}
                        // (staff: Map's place in the bottom bar is Add Photos)
                        onMap={onAddPhotos ? showMapNotice : undefined}
                        showGame={Boolean(onCreatePdf)}
                        page={page}
                        onOffline={toggleOffline}
                        onAbout={toggleAbout}
                    />
                </>,
                document.body
            )}
            {/* The pop-ups are drawn at the top level of the page (a portal),
                not inside the header: the pinned header's blur would
                otherwise trap them in its own small strip */}
            {createPortal(
                <div className="Nav-pdfmodal">
                    <ModalPDF
                        closePDFModal={togglePDFModal}
                        isPDFModalOpen={isPDFModalOpen}
                        createPDF={createPDF}
                        isGeneratingPDF={isGeneratingPDF}
                        progress={pdfProgress}
                        error={pdfError}
                        monkeyCount={pdfMonkeyCount}
                        book={pdfBook}
                        troops={pdfTroops}
                        onChooseBook={onChoosePdfBook}
                        report={pdfReport}
                        onChooseReport={onChoosePdfReport}
                        plateCount={pdfPlateCount}
                        plateIntrocages={pdfPlateIntrocages}
                        plateMonkeys={pdfPlateMonkeys}
                        monitoringCount={pdfMonitoringCount}
                        monitorTroops={pdfMonitorTroops}
                        ready={pdfReady}
                        onSave={onSavePDF}
                    />
                </div>,
                document.body
            )}
            {createPortal(
                <AccountModal
                    isOpen={isAccountOpen}
                    startView={accountStart}
                    onClose={() => {
                        setAccountStart(null);
                        toggleAccount();
                    }}
                />,
                document.body
            )}
            {createPortal(
                <AboutModal isOpen={isAboutOpen} onClose={toggleAbout} />,
                document.body
            )}
        </>
    );
}

export default Nav;
