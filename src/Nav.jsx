import { useEffect, useRef, useState } from "react";
import {
    IconSearch,
    IconX,
    IconFileTypePdf,
    IconHourglassLow,
    IconDeviceGamepad2,
    IconLogin,
    IconLogout,
    IconMenu2,
    IconPlus,
    IconUser,
    IconUserCheck,
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
}) {
    const { user, signOut } = useAuth();
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
    // Signed out: opens the sign-in pop-up. Signed in: signs straight out.
    function signInOrOut() {
        closeMenu({ returnFocus: true });
        if (user) signOut();
        else toggleAccount();
    }
    function addMonkey() {
        closeMenu();
        onAddMonkey();
    }

    const AccountIcon = user ? IconUserCheck : IconUser;
    const accountLabel = user ? "Account (signed in)" : "Sign in";

    return (
        <>
            {/* inert: while a pop-up is open, the nav behind it can't be tabbed to */}
            <nav className="Nav" inert={isPDFModalOpen || isAccountOpen}>
                <div className="Nav-icon">
                    {/* Same colour as the "vervetDB" text beside it */}
                    <MonkeyIcon color="currentColor" />
                </div>
                <div className="Nav-title">vervetDB</div>

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
                        aria-label="Guess The Monkey"
                        title="Guess The Monkey"
                    >
                        <IconDeviceGamepad2 stroke="2" size="36" />
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
                        title={isGeneratingPDF ? "Creating Profile Book…" : "Create Profile Book"}
                    >
                        {isGeneratingPDF ? (
                            <IconHourglassLow
                                className="hourglass"
                                stroke="2"
                                size="32"
                            />
                        ) : (
                            <IconFileTypePdf stroke="2" size="36" />
                        )}
                    </button>
                    {onAddMonkey && (
                        <button
                            type="button"
                            className="Nav-addMonkey"
                            onClick={onAddMonkey}
                            aria-label="Add New Monkey"
                            title="Add New Monkey"
                        >
                            <IconPlus stroke="2" size="36" />
                        </button>
                    )}
                    {/* Sign in / account: green tick-person when signed in */}
                    <button
                        type="button"
                        className={user ? "Nav-account is-signed-in" : "Nav-account"}
                        onClick={toggleAccount}
                        aria-label={accountLabel}
                        title={user ? `Signed in as ${user.email}` : "Sign in"}
                    >
                        <AccountIcon stroke="2" size="32" />
                    </button>
                </div>

                {/* Phones only: ☰ menu with the game, PDF, sign in/out and
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
                                Guess The Monkey
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
                            <button type="button" onClick={signInOrOut}>
                                {user ? (
                                    <IconLogout stroke={2} aria-hidden="true" />
                                ) : (
                                    <IconLogin stroke={2} aria-hidden="true" />
                                )}
                                {user ? "Sign Out" : "Sign In"}
                            </button>
                        </div>
                    )}
                </div>
            </nav>
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
            </div>
            <AccountModal isOpen={isAccountOpen} onClose={toggleAccount} />
        </>
    );
}

export default Nav;
