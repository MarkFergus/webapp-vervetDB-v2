import { Component } from "react";
import { IconArrowsSort } from "@tabler/icons-react";
import { pdf } from "@react-pdf/renderer";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import MonkeyCard from "./MonkeyCard";
import MonkeyPDF from "./MonkeyPDF";
import Modal from "./Modal";
import Nav from "./Nav";
import "./ShowPage.css";

const byName = (a, b) => a.name.localeCompare(b.name);

// Ties (same troop or year) fall back to alphabetical by name
const compareBy = {
    name: byName,
    troop: (a, b) => a.troop.localeCompare(b.troop) || byName(a, b),
    year: (a, b) => a.year - b.year || byName(a, b),
};

class ShowPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            selectedMonkey: null,
            yearsArr: [],
            sortKey: "name",
            sortAscending: true,
            currentTroopFilter: "All Troops",
            currentYearFilter: "All Years",
            searchValue: "",
            isModalOpen: false,
            isPDFModalOpen: false,
            isGeneratingPDF: false,
            currentPage: 1,
            monkeysPerPage: 100,
        };
        this.openModal = this.openModal.bind(this);
        this.closeModal = this.closeModal.bind(this);
        this.togglePDFModal = this.togglePDFModal.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        this.handleDelete = this.handleDelete.bind(this);
        this.handleShowMore = this.handleShowMore.bind(this);
        this.handlePrevNext = this.handlePrevNext.bind(this);
    }
    updateYearsArr() {
        const currYear = new Date().getFullYear();
        const yearsArr = [];
        for (let i = currYear; i >= currYear - 30; i--) {
            yearsArr.push(i);
        }
        this.setState({
            yearsArr: yearsArr,
        });
    }
    // The list on screen is worked out from the search, filters and sort
    // every time, so they always agree with each other.
    getVisibleMonkeys() {
        const {
            searchValue,
            currentTroopFilter,
            currentYearFilter,
            sortKey,
            sortAscending,
        } = this.state;
        const query = searchValue.trim().toLowerCase();
        const isChipSearch = /^\d+$/.test(query);

        const results = monkeysArr.filter((monkey) => {
            const matchesTroop =
                currentTroopFilter === "All Troops" ||
                monkey.troop
                    .toLowerCase()
                    .includes(currentTroopFilter.toLowerCase());
            const matchesYear =
                currentYearFilter === "All Years" ||
                // Number() on both sides in case a year is entered as text
                Number(monkey.year) === Number(currentYearFilter);
            const matchesSearch =
                query === "" ||
                (isChipSearch
                    ? monkey.chip.toString().includes(query)
                    : monkey.name.toLowerCase().includes(query));
            return matchesTroop && matchesYear && matchesSearch;
        });

        // filter() returns a new array, so sorting it leaves monkeysArr alone
        const compare = compareBy[sortKey];
        return results.sort((a, b) =>
            sortAscending ? compare(a, b) : compare(b, a)
        );
    }
    // Clicking the current sort flips its direction; a new sort starts ascending
    sortBy(key) {
        this.setState((st) => ({
            sortKey: key,
            sortAscending: st.sortKey === key ? !st.sortAscending : true,
            currentPage: 1,
        }));
    }
    filterTroops = (event) => {
        this.setState({
            currentTroopFilter: event.target.value,
            currentPage: 1,
        });
    };
    filterYear = (event) => {
        this.setState({
            currentYearFilter: event.target.value,
            currentPage: 1,
        });
    };
    handleSearch(event) {
        this.setState({
            searchValue: event.target.value,
            currentPage: 1,
        });
    }
    handleDelete() {
        this.setState({
            searchValue: "",
            currentPage: 1,
        });
    }
    getPrevNextMonkeys(visibleMonkeys) {
        const selectedIndex = visibleMonkeys.indexOf(this.state.selectedMonkey);
        if (selectedIndex === -1) {
            return { prevMonkey: null, nextMonkey: null };
        }
        return {
            prevMonkey: visibleMonkeys[selectedIndex - 1] || null,
            nextMonkey: visibleMonkeys[selectedIndex + 1] || null,
        };
    }
    openModal(m) {
        this.setState({ selectedMonkey: m, isModalOpen: true });
    }
    closeModal() {
        this.setState({ isModalOpen: false });
    }
    handlePrevNext(direction) {
        const { prevMonkey, nextMonkey } = this.getPrevNextMonkeys(
            this.getVisibleMonkeys()
        );
        if (direction === "prev" && prevMonkey) {
            this.setState({ selectedMonkey: prevMonkey });
        } else if (direction === "next" && nextMonkey) {
            this.setState({ selectedMonkey: nextMonkey });
        }
    }
    togglePDFModal() {
        this.setState((st) => ({
            isPDFModalOpen: !st.isPDFModalOpen,
        }));
    }
    //PDF function from react-pdf
    createPDF = async () => {
        this.setState({ isGeneratingPDF: true });
        const monkeys = this.getVisibleMonkeys();
        const blob = await pdf(<MonkeyPDF monkeys={monkeys} />).toBlob();
        const url = URL.createObjectURL(blob);

        const filename = "profile_book";
        const newTab = window.open(url, "_blank");
        //filename currently not applying
        newTab.window.document.title = filename;
        this.setState({ isGeneratingPDF: false });
    };
    componentDidMount() {
        this.updateYearsArr();
    }
    handleShowMore() {
        this.setState((prevState) => ({
            currentPage: prevState.currentPage + 1,
        }));
    }
    render() {
        const { currentPage, monkeysPerPage } = this.state;
        const visibleMonkeys = this.getVisibleMonkeys();
        const { prevMonkey, nextMonkey } =
            this.getPrevNextMonkeys(visibleMonkeys);
        const indexOfLastMonkey = currentPage * monkeysPerPage;
        const currentMonkeys = visibleMonkeys.slice(0, indexOfLastMonkey);

        return (
            <div className="ShowPage">
                <div className="ShowPage-modal">
                    <Modal
                        onClose={this.closeModal}
                        isModalOpen={this.state.isModalOpen}
                        monkey={this.state.selectedMonkey}
                        handlePrevNext={this.handlePrevNext}
                        prevMonkey={prevMonkey}
                        nextMonkey={nextMonkey}
                    />
                </div>
                <div className="ShowPage-nav">
                    <Nav
                        createPDF={this.createPDF}
                        isGeneratingPDF={this.state.isGeneratingPDF}
                        searchValue={this.state.searchValue}
                        handleSearch={this.handleSearch}
                        handleDelete={this.handleDelete}
                        isPDFModalOpen={this.state.isPDFModalOpen}
                        togglePDFModal={this.togglePDFModal}
                    />
                </div>
                <div className="ShowPage-sortfilter">
                    <div className="ShowPage-sort">
                        <h4>Sort:</h4>
                        <button onClick={() => this.sortBy("name")}>
                            <span>Name </span>
                            <IconArrowsSort />
                        </button>
                        <button onClick={() => this.sortBy("troop")}>
                            <span>Troop </span>
                            <IconArrowsSort />{" "}
                        </button>
                        <button onClick={() => this.sortBy("year")}>
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
                            value={this.state.currentTroopFilter}
                            onChange={this.filterTroops}
                        >
                            {groupsArr.map((g, index) => (
                                <option key={`group-${index}`} value={g}>
                                    {g}
                                </option>
                            ))}
                        </select>
                        <select
                            className="ShowPage-filter-select"
                            name="year"
                            id="year"
                            value={this.state.currentYearFilter}
                            onChange={this.filterYear}
                        >
                            <option value="All Years">All Years</option>
                            {this.state.yearsArr.map((y, index) => (
                                <option key={`year-${index}`} value={y}>
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
                            onClick={() => this.openModal(m)}
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
                            onClick={this.handleShowMore}
                        >
                            Show More
                        </button>
                    </div>
                )}
            </div>
        );
    }
}

export default ShowPage;
