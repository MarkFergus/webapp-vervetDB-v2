import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconX, IconMenu2 } from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
import AccountModal from "./AccountModal";
import AboutModal from "./AboutModal";
import { useAuth } from "./auth";
import MonkeyIcon from "./MonkeyIcon";
import AccountMenu from "./AccountMenu";
import { BottomBar, Drawer, SideRail } from "./NavBars";
import WholeMap from "./WholeMap";
import QrScanner from "./QrScanner";
import "./Nav.css";

// The top bar, and the ways around beside it (NavBars.jsx):
//   Computers: ☰ (opens the side rail out; it opens on hover too) and the
//   logo, top left; search in the middle; the account circle (signed in:
//   the account menu, AccountMenu.jsx). The side rail down the left (Add
//   New Monkey at its top, for admins).
//   Phones: the menu button (the drawer from the left), search, and the
//   account circle (as on computers); the bottom bar: Monkeys, Enclosures,
//   Map, then Scan and Game (staff: Photos and Documents).
// Small phones: the search box just says "Search"
const SMALL = "(max-width: 379px)";

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
    pdfMonitoringParts,
    onChangeMonitoringParts,
    pdfCanNotes,
    pdfSignChoices,
    pdfSignList,
    pdfSignPageCount,
    onAddSign,
    onRemoveSign,
    onClearSigns,
    pdfReady,
    onSavePDF,
    isAccountOpen,
    toggleAccount,
    isAboutOpen,
    toggleAbout,
    isOfflineOpen,
    toggleOffline,
    onAddMonkey, // admins only: Add New Monkey, at the top of the side rail / ☰ menu
    showAdmin = false, // admins only: the Admin Dashboard, under Add New Monkey
    showRecords = false, // staff (any role): the Records page
    onAddPhotos, // staff (editors / admins): Add Photos, in Map's place on phones
    onHome, // the logo: back to the top, search and filters cleared
    page = "monkeys", // the page showing: "monkeys", "enclosures", "game", "statistics", "admin"…
    showSearch = true, // false: no search box (the game)
    barsInert = false, // a pop-up is open: the side rail and bottom bar wait
    enclosures = [], // the Interactive Map: the places to tap
    monkeys = [], // … and who lives there
}) {
    const { role } = useAuth();
    // Documents (Profile Books, the AM Plates List, Introcage Signs…): staff only (any role)
    const onCreatePdf = role ? togglePDFModal : undefined;
    const searchInputRef = useRef(null);

    // Computers: the side rail opened out with the ☰ (until something's
    // picked, a tap outside, or a new page)
    const [railOpen, setRailOpen] = useState(false);
    useEffect(() => setRailOpen(false), [page]);
    // The account pop-up opened from the account menu's Changelog: starts there
    const [accountStart, setAccountStart] = useState(null);
    // Phones: the drawer
    const [drawerOpen, setDrawerOpen] = useState(false);
    // Scan QR Code (phones, the ☰ menu): the camera, until a sign is read
    const [scanOpen, setScanOpen] = useState(false);
    const scanned = useCallback((hash) => {
        setScanOpen(false);
        window.location.hash = hash;
    }, []);
    // Small phones (the search box's placeholder: "Search")
    const [smallScreen, setSmallScreen] = useState(() => window.matchMedia?.(SMALL).matches ?? false);
    useEffect(() => {
        const query = window.matchMedia?.(SMALL);
        const update = () => setSmallScreen(query.matches);
        query?.addEventListener?.("change", update);
        return () => query?.removeEventListener?.("change", update);
    }, []);
    // Map (the side rail, bottom bar or drawer): the Interactive Map pop-up
    const [mapOpen, setMapOpen] = useState(false);
    const showMap = () => setMapOpen(true);

    // The clear button disappears once clicked, so put focus back in the box
    function clearSearch() {
        handleDelete();
        searchInputRef.current?.focus();
    }

    const anyPopUp = isPDFModalOpen || isAccountOpen || isAboutOpen || isOfflineOpen || mapOpen;

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
            <nav className={showSearch ? "Nav" : "Nav is-noSearch"} inert={anyPopUp}>
                <div className="Nav-start">
                    {/* Computers: opens the side rail out (over the page), or
                        puts it away */}
                    <button
                        type="button"
                        className="Nav-railButton"
                        onClick={() => setRailOpen((open) => !open)}
                        aria-label={railOpen ? "Close the side menu" : "Open the side menu"}
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
                        {/* Computers: "vervetDB" (DB in blue), lined up with the
                            toolbar and cards below; the monkey is in the search bar */}
                        <span className="Nav-title" aria-hidden="true">
                            vervet<span className="Nav-titleDB">DB</span>
                        </span>
                    </a>
                </div>

                {showSearch ? (
                <div className="Nav-searchbar">
                    {/* The monkey logo in place of a magnifying glass (like Reddit's) */}
                    <div className="Nav-iconSearch" aria-hidden="true">
                        <MonkeyIcon color="currentColor" role={undefined} aria-label={undefined} />
                    </div>
                    <input
                        type="text"
                        // (small phones: just "Search", so it isn't cut off)
                        placeholder={smallScreen ? "Search" : "Name or chip number"}
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

                {/* The account circle (phones too) */}
                <div className="Nav-buttons">
                    {/* Sign in, or (signed in) the account menu */}
                    <AccountMenu
                        onAccount={toggleAccount}
                        onChangelog={() => {
                            setAccountStart("changes");
                            toggleAccount();
                        }}
                    />
                </div>

                {/* Phones: opens the drawer from the left (top left: CSS puts
                    it first) */}
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
                        onAddMonkey={onAddMonkey}
                        showAdmin={showAdmin}
                        showRecords={showRecords}
                        open={railOpen}
                        onClose={() => setRailOpen(false)}
                        onMap={showMap}
                        onAddPhotos={onAddPhotos}
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
                        onMap={showMap}
                        onAddPhotos={onAddPhotos}
                        onProfileBook={onCreatePdf}
                        isGeneratingPDF={isGeneratingPDF}
                        onScan={() => setScanOpen(true)}
                        inert={barsInert || anyPopUp}
                    />
                    {mapOpen && <WholeMap onClose={() => setMapOpen(false)} enclosures={enclosures} monkeys={monkeys} />}
                    <Drawer
                        open={drawerOpen}
                        onClose={() => setDrawerOpen(false)}
                        onAddMonkey={onAddMonkey}
                        showAdmin={showAdmin}
                        showRecords={showRecords}
                        onHome={onHome}
                        onMap={showMap}
                        onAddPhotos={onAddPhotos}
                        onProfileBook={onCreatePdf}
                        isGeneratingPDF={isGeneratingPDF}
                        onScan={() => setScanOpen(true)}
                        page={page}
                        onOffline={toggleOffline}
                        onAbout={toggleAbout}
                    />
                </>,
                document.body
            )}
            {scanOpen && <QrScanner onClose={() => setScanOpen(false)} onFound={scanned} />}
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
                        monitoringParts={pdfMonitoringParts}
                        onChangeMonitoringParts={onChangeMonitoringParts}
                        canNotes={pdfCanNotes}
                        signChoices={pdfSignChoices}
                        signList={pdfSignList}
                        signPageCount={pdfSignPageCount}
                        onAddSign={onAddSign}
                        onRemoveSign={onRemoveSign}
                        onClearSigns={onClearSigns}
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
