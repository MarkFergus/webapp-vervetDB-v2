import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    IconSearch,
    IconX,
    IconFileTypePdf,
    IconHourglassLow,
    IconDeviceGamepad2,
    IconMenu2,
    IconPlus,
    IconUser,
} from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
import AccountModal from "./AccountModal";
import { useAuth } from "./auth";
import MonkeyIcon from "./MonkeyIcon";
import "./Nav.css";

// The top bar: logo, search box, then on computers icon buttons, or on
// phones (see Nav.css) a ☰ menu holding the game, PDF, sign in/out and
// (for editors) Add monkey.
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
    isAccountOpen,
    toggleAccount,
    onAddMonkey, // editors only: adds an "Add monkey" button (☰ menu on phones)
    onHome, // the logo: back to the top, search and filters cleared
}) {
    const { user } = useAuth();
    const searchInputRef = useRef(null);
    const menuButtonRef = useRef(null);
    const menuRef = useRef(null);

    // Phones: the ☰ menu
    const [menuOpen, setMenuOpen] = useState(false);

    // The clear button disappears once clicked, so put focus back in the box
    function clearSearch() {
        handleDelete();
        searchInputRef.current?.focus();
    }

    function closeMenu({ returnFocus = false } = {}) {
        setMenuOpen(false);
        if (returnFocus) menuButtonRef.current?.focus();
    }

    // Menu open: focus its first item; Escape or a tap outside closes it
    useEffect(() => {
        if (!menuOpen) return;
        menuRef.current?.querySelector("a, button")?.focus();

        function handleKeyDown(event) {
            if (event.key === "Escape") closeMenu({ returnFocus: true });
        }
        function handlePointerDown(event) {
            const inside =
                menuRef.current?.contains(event.target) ||
                menuButtonRef.current?.contains(event.target);
            if (!inside) closeMenu();
        }
        document.addEventListener("keydown", handleKeyDown);
        document.addEventListener("pointerdown", handlePointerDown);
        return () => {
            document.removeEventListener("keydown", handleKeyDown);
            document.removeEventListener("pointerdown", handlePointerDown);
        };
    }, [menuOpen]);

    function openPDF() {
        closeMenu();
        togglePDFModal();
    }
    // Opens the account pop-up: sign in, or (signed in) Change password /
    // Sign out, the same as the green circle on computers
    function openAccount() {
        closeMenu();
        toggleAccount();
    }
    function addMonkey() {
        closeMenu();
        onAddMonkey();
    }

    const accountLabel = user ? "Account (signed in)" : "Sign in";

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
            <nav className="Nav" inert={isPDFModalOpen || isAccountOpen}>
                {/* The logo: back home (top of the page, search and filters
                    cleared), like YouTube's */}
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
                        {/* Same colour as the "vervetDB" text beside it */}
                        <MonkeyIcon color="currentColor" aria-hidden="true" role={undefined} aria-label={undefined} />
                    </span>
                    <span className="Nav-title" aria-hidden="true">
                        vervetDB
                    </span>
                </a>

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

                {/* Computers: icon buttons */}
                <div className="Nav-buttons">
                    <a
                        href="#game"
                        className="Nav-gameLink"
                        aria-label="Monkey Guesser Game"
                        data-tooltip="Monkey Guesser Game"
                    >
                        <IconDeviceGamepad2 stroke={1.75} size={26} />
                    </a>
                    <button
                        type="button"
                        onClick={togglePDFModal}
                        disabled={isGeneratingPDF}
                        aria-label={
                            isGeneratingPDF
                                ? "Creating Profile Book…"
                                : "Create Profile Book"
                        }
                        data-tooltip={isGeneratingPDF ? "Creating Profile Book…" : "Create Profile Book"}
                    >
                        {isGeneratingPDF ? (
                            <IconHourglassLow className="hourglass" stroke={1.75} size={24} />
                        ) : (
                            <IconFileTypePdf stroke={1.75} size={26} />
                        )}
                    </button>
                    {onAddMonkey && (
                        <button
                            type="button"
                            className="Nav-addMonkey"
                            onClick={onAddMonkey}
                            aria-label="Add New Monkey"
                            data-tooltip="Add New Monkey"
                        >
                            <IconPlus stroke={1.75} size={26} />
                        </button>
                    )}
                    {/* Sign in / account: a person in a circle, green when signed in */}
                    <button
                        type="button"
                        className={user ? "Nav-account is-signed-in" : "Nav-account"}
                        onClick={toggleAccount}
                        aria-label={accountLabel}
                        data-tooltip={user ? "Account" : "Sign in"}
                        data-tooltip-align="end"
                    >
                        <span className="Nav-avatar" aria-hidden="true">
                            <IconUser stroke={1.75} size={20} />
                        </span>
                    </button>
                </div>

                {/* Phones only: ☰ menu with the game, PDF, account and
                    (editors) Add monkey */}
                <div className="Nav-menuWrap">
                    <button
                        type="button"
                        className="Nav-menuButton"
                        ref={menuButtonRef}
                        onClick={() => setMenuOpen((open) => !open)}
                        aria-label={user ? "Menu (signed in)" : "Menu"}
                        aria-expanded={menuOpen}
                        aria-controls="Nav-menu"
                    >
                        <IconMenu2 stroke={2} size={30} />
                        {user && <span className="Nav-menuDot" aria-hidden="true" />}
                    </button>
                    {menuOpen && (
                        <div className="Nav-menu" id="Nav-menu" ref={menuRef}>
                            <a href="#game" onClick={() => closeMenu()}>
                                <IconDeviceGamepad2 stroke={2} aria-hidden="true" />
                                Monkey Guesser Game
                            </a>
                            <button type="button" onClick={openPDF} disabled={isGeneratingPDF}>
                                <IconFileTypePdf stroke={2} aria-hidden="true" />
                                {isGeneratingPDF ? "Creating Profile Book…" : "Create Profile Book"}
                            </button>
                            {onAddMonkey && (
                                <button type="button" onClick={addMonkey}>
                                    <IconPlus stroke={2} aria-hidden="true" />
                                    Add New Monkey
                                </button>
                            )}
                            <button
                                type="button"
                                className={user ? "Nav-menuAccount is-signed-in" : "Nav-menuAccount"}
                                onClick={openAccount}
                            >
                                <span className="Nav-avatar" aria-hidden="true">
                                    <IconUser stroke={2} size={16} />
                                </span>
                                {user ? "Account" : "Sign In"}
                            </button>
                        </div>
                    )}
                </div>
            </nav>
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
                    />
                </div>,
                document.body
            )}
            {createPortal(
                <AccountModal isOpen={isAccountOpen} onClose={toggleAccount} />,
                document.body
            )}
        </>
    );
}

export default Nav;
