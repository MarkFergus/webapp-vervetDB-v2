import {
    IconSearch,
    IconX,
    IconFileTypePdf,
    IconHourglassLow,
} from "@tabler/icons-react";
import ModalPDF from "./ModalPDF";
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
}) {
    return (
        <>
            <nav className="Nav">
                <div className="Nav-icon">
                    <MonkeyIcon />
                </div>
                <div className="Nav-title">vervetDB</div>
                <div className="Nav-searchbar">
                    <div className="Nav-iconSearch">
                        <IconSearch stroke={2} />
                    </div>
                    <input
                        type="text"
                        placeholder="Name or chip number"
                        name="search"
                        value={searchValue}
                        onChange={handleSearch}
                    ></input>
                    {searchValue.length > 0 && (
                        <div className="Nav-iconX" onClick={handleDelete}>
                            <IconX stroke={2} />
                        </div>
                    )}
                </div>
                <div className="Nav-buttons">
                    <button
                        onClick={togglePDFModal}
                        disabled={isGeneratingPDF}
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
        </>
    );
}

export default Nav;
