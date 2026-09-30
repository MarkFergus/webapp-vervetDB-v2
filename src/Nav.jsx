import { useRef } from "react";
import {
    IconSearch,
    IconX,
    IconFileTypePdf,
    IconHourglassLow,
    IconDeviceGamepad2,
    IconUser,
    IconUserCheck,
} from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
import AccountModal from "./AccountModal";
import { useAuth } from "./auth";
import MonkeyIcon from "./MonkeyIcon";
import "./Nav.css";

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
    troopFilter,
    isAccountOpen,
    toggleAccount,
}) {
    const searchInputRef = useRef(null);
    const { user } = useAuth();

    // The clear button disappears once clicked, so put focus back in the box
    function clearSearch() {
        handleDelete();
        searchInputRef.current?.focus();
    }

    return (
        <>
            {/* inert: while a pop-up is open, the nav behind it can't be tabbed to */}
            <nav className="Nav" inert={isPDFModalOpen || isAccountOpen}>
                <div className="Nav-icon">
                    <MonkeyIcon />
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
                <div className="Nav-buttons">
                    <a
                        href="#game"
                        className="Nav-gameLink"
                        aria-label="Guess the monkey game"
                        title="Guess the monkey game"
                    >
                        <IconDeviceGamepad2 stroke="2" size="36" />
                    </a>
                    <button
                        type="button"
                        onClick={togglePDFModal}
                        disabled={isGeneratingPDF}
                        aria-label={
                            isGeneratingPDF
                                ? "Creating profile book PDF"
                                : "Profile book PDF"
                        }
                        title="Profile book PDF"
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
                    {/* Sign in / account: green tick-person when signed in */}
                    <button
                        type="button"
                        className={user ? "Nav-account is-signed-in" : "Nav-account"}
                        onClick={toggleAccount}
                        aria-label={user ? "Account (signed in)" : "Sign in"}
                        title={user ? `Signed in as ${user.email}` : "Sign in"}
                    >
                        {user ? (
                            <IconUserCheck stroke="2" size="32" />
                        ) : (
                            <IconUser stroke="2" size="32" />
                        )}
                    </button>
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
                    troopFilter={troopFilter}
                />
            </div>
            <AccountModal isOpen={isAccountOpen} onClose={toggleAccount} />
        </>
    );
}

export default Nav;
