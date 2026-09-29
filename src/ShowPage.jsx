import { useMemo, useState } from "react";
import { IconArrowsSort } from "@tabler/icons-react";
import { pdf } from "@react-pdf/renderer";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import MonkeyCard from "./MonkeyCard";
import MonkeyPDF from "./MonkeyPDF";
import Modal from "./Modal";
import Nav from "./Nav";
import "./ShowPage.css";

const MONKEYS_PER_PAGE = 100;

const byName = (a, b) => a.name.localeCompare(b.name);

// Ties (same troop or year) fall back to alphabetical by name
const compareBy = {
    name: byName,
    troop: (a, b) => a.troop.localeCompare(b.troop) || byName(a, b),
    year: (a, b) => a.year - b.year || byName(a, b),
};

// This year back to 30 years ago, for the year filter
const currYear = new Date().getFullYear();
const yearsArr = Array.from({ length: 31 }, (_, i) => currYear - i);

// The list on screen is worked out from the search, filters and sort
// every time, so they always agree with each other.
function getVisibleMonkeys({ searchValue, troopFilter, yearFilter, sort }) {
    const query = searchValue.trim().toLowerCase();
    const isChipSearch = /^\d+$/.test(query);

    const results = monkeysArr.filter((monkey) => {
        const matchesTroop =
            troopFilter === "All Troops" ||
            monkey.troop.toLowerCase().includes(troopFilter.toLowerCase());
        const matchesYear =
            yearFilter === "All Years" ||
            // Number() on both sides in case a year is entered as text
            Number(monkey.year) === Number(yearFilter);
        const matchesSearch =
            query === "" ||
            (isChipSearch
                ? monkey.chip.toString().includes(query)
                : monkey.name.toLowerCase().includes(query));
        return matchesTroop && matchesYear && matchesSearch;
    });

    // filter() returns a new array, so sorting it leaves monkeysArr alone
    const compare = compareBy[sort.key];
    return results.sort((a, b) =>
        sort.ascending ? compare(a, b) : compare(b, a)
    );
}

function ShowPage() {
    const [searchValue, setSearchValue] = useState("");
    const [troopFilter, setTroopFilter] = useState("All Troops");
    const [yearFilter, setYearFilter] = useState("All Years");
    const [sort, setSort] = useState({ key: "name", ascending: true });
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedMonkey, setSelectedMonkey] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    // Only recalculated when the search, a filter or the sort changes
    const visibleMonkeys = useMemo(
        () =>
            getVisibleMonkeys({ searchValue, troopFilter, yearFilter, sort }),
        [searchValue, troopFilter, yearFilter, sort]
    );

    const selectedIndex = visibleMonkeys.indexOf(selectedMonkey);
    const prevMonkey =
        selectedIndex === -1 ? null : visibleMonkeys[selectedIndex - 1] || null;
    const nextMonkey =
        selectedIndex === -1 ? null : visibleMonkeys[selectedIndex + 1] || null;

    const indexOfLastMonkey = currentPage * MONKEYS_PER_PAGE;
    const currentMonkeys = visibleMonkeys.slice(0, indexOfLastMonkey);

    // Clicking the current sort flips its direction; a new sort starts ascending
    function sortBy(key) {
        setSort((prev) => ({
            key,
            ascending: prev.key === key ? !prev.ascending : true,
        }));
        setCurrentPage(1);
    }
    function filterTroops(event) {
        setTroopFilter(event.target.value);
        setCurrentPage(1);
    }
    function filterYear(event) {
        setYearFilter(event.target.value);
        setCurrentPage(1);
    }
    function handleSearch(event) {
        setSearchValue(event.target.value);
        setCurrentPage(1);
    }
    function handleDelete() {
        setSearchValue("");
        setCurrentPage(1);
    }
    function openModal(m) {
        setSelectedMonkey(m);
        setIsModalOpen(true);
    }
    function closeModal() {
        setIsModalOpen(false);
    }
    function handlePrevNext(direction) {
        if (direction === "prev" && prevMonkey) {
            setSelectedMonkey(prevMonkey);
        } else if (direction === "next" && nextMonkey) {
            setSelectedMonkey(nextMonkey);
        }
    }
    function togglePDFModal() {
        setIsPDFModalOpen((open) => !open);
    }
    //PDF function from react-pdf
    async function createPDF() {
        setIsGeneratingPDF(true);
        const blob = await pdf(<MonkeyPDF monkeys={visibleMonkeys} />).toBlob();
        const url = URL.createObjectURL(blob);

        const filename = "profile_book";
        const newTab = window.open(url, "_blank");
        //filename currently not applying
        newTab.window.document.title = filename;
        setIsGeneratingPDF(false);
    }
    function handleShowMore() {
        setCurrentPage((page) => page + 1);
    }

    return (
        <div className="ShowPage">
            <div className="ShowPage-modal">
                <Modal
                    onClose={closeModal}
                    isModalOpen={isModalOpen}
                    monkey={selectedMonkey}
                    handlePrevNext={handlePrevNext}
                    prevMonkey={prevMonkey}
                    nextMonkey={nextMonkey}
                />
            </div>
            <div className="ShowPage-nav">
                <Nav
                    createPDF={createPDF}
                    isGeneratingPDF={isGeneratingPDF}
                    searchValue={searchValue}
                    handleSearch={handleSearch}
                    handleDelete={handleDelete}
                    isPDFModalOpen={isPDFModalOpen}
                    togglePDFModal={togglePDFModal}
                />
            </div>
            <div className="ShowPage-sortfilter">
                <div className="ShowPage-sort">
                    <h4>Sort:</h4>
                    <button onClick={() => sortBy("name")}>
                        <span>Name </span>
                        <IconArrowsSort />
                    </button>
                    <button onClick={() => sortBy("troop")}>
                        <span>Troop </span>
                        <IconArrowsSort />{" "}
                    </button>
                    <button onClick={() => sortBy("year")}>
                        <span>Year </span>
                        <IconArrowsSort />{" "}
                    </button>
                </div>
                <div className="ShowPage-filter">
                    <h4>Filter:</h4>
                    <select
                        className="ShowPage-filter-select"
                        name="troops"
                        id="troops"
                        value={troopFilter}
                        onChange={filterTroops}
                    >
                        {groupsArr.map((g) => (
                            <option key={g} value={g}>
                                {g}
                            </option>
                        ))}
                    </select>
                    <select
                        className="ShowPage-filter-select"
                        name="year"
                        id="year"
                        value={yearFilter}
                        onChange={filterYear}
                    >
                        <option value="All Years">All Years</option>
                        {yearsArr.map((y) => (
                            <option key={y} value={y}>
                                {y}
                            </option>
                        ))}
                    </select>
                </div>
            </div>
            <div className="ShowPage-monkeys">
                {currentMonkeys.map((m) => (
                    <div
                        key={`${m.name}-${m.chip}-${m.troop}`}
                        onClick={() => openModal(m)}
                    >
                        <MonkeyCard
                            name={m.name}
                            sex={m.sex}
                            year={m.year}
                            troop={m.troop}
                            img={m.img[0]}
                        />
                    </div>
                ))}
            </div>
            {indexOfLastMonkey < visibleMonkeys.length && (
                <div className="ShowPage-showMore">
                    <button
                        className="ShowPage-showMoreBtn"
                        onClick={handleShowMore}
                    >
                        Show More
                    </button>
                </div>
            )}
        </div>
    );
}

export default ShowPage;
