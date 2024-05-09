import { Component } from "react";
import { IconArrowsDownUp } from "@tabler/icons-react";
import { pdf } from "@react-pdf/renderer";
import { v4 as uuidv4 } from "uuid";
import monkeysArr from "./monkeysArr";
import groupsArr from "./groupsArr";
import MonkeyCard from "./MonkeyCard";
import MonkeyPDF from "./MonkeyPDF";
import Modal from "./Modal";
import Nav from "./Nav";
import "./ShowPage.css";

class ShowPage extends Component {
    constructor(props) {
        super(props);
        this.state = {
            monkeys: monkeysArr.sort((a, b) => a.name.localeCompare(b.name)),
            //track sorting state to toggle on next click
            sortNameAscending: true,
            sortTroopAscending: false,
            sortYearAscending: false,
            isModalOpen: false,
            selectedMonkey: null,
            isGeneratingPDF: false,
            currentGroupFilter: "All Troops",
            currentYearFilter: "All Years",
            yearsArr: [],
        };
        this.sortByName = this.sortByName.bind(this);
        this.sortByTroop = this.sortByTroop.bind(this);
        this.sortByYear = this.sortByYear.bind(this);
        this.toggleModal = this.toggleModal.bind(this);
        this.createPDF = this.createPDF.bind(this);
        this.filterGroups = this.filterGroups.bind(this);
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
        console.log(yearsArr);
    }
    sortByName() {
        if (!this.state.sortNameAscending) {
            this.setState({
                monkeys: this.state.monkeys.sort((a, b) =>
                    a.name.localeCompare(b.name)
                ),
                sortNameAscending: true,
                sortTroopAscending: false,
                sortYearAscending: false,
            });
        } else {
            this.setState({
                monkeys: this.state.monkeys.sort((b, a) =>
                    a.name.localeCompare(b.name)
                ),
                sortNameAscending: false,
                sortTroopAscending: false,
                sortYearAscending: false,
            });
        }
    }
    sortByTroop() {
        if (!this.state.sortTroopAscending) {
            this.setState({
                monkeys: this.state.monkeys.sort((a, b) =>
                    a.troop.localeCompare(b.troop)
                ),
                sortTroopAscending: true,
                sortNameAscending: false,
                sortYearAscending: false,
            });
        } else {
            this.setState({
                monkeys: this.state.monkeys.sort((b, a) =>
                    a.troop.localeCompare(b.troop)
                ),
                sortTroopAscending: false,
                sortNameAscending: false,
                sortYearAscending: false,
            });
        }
    }
    sortByYear() {
        if (!this.state.sortYearAscending) {
            this.setState({
                monkeys: this.state.monkeys.sort((a, b) => a.year - b.year),
                sortYearAscending: true,
                sortTroopAscending: false,
                sortNameAscending: false,
            });
        } else {
            this.setState({
                monkeys: this.state.monkeys.sort((b, a) => a.year - b.year),
                sortYearAscending: false,
                sortTroopAscending: false,
                sortNameAscending: false,
            });
        }
    }
    filterGroups = (event) => {
        const selectedFilter = event.target.value;
        let filteredMonkeys;

        if (selectedFilter === "All Troops") {
            filteredMonkeys = monkeysArr.sort((a, b) =>
                a.name.localeCompare(b.name)
            );
        } else {
            filteredMonkeys = monkeysArr.filter((monkey) =>
                monkey.troop
                    .toLowerCase()
                    .includes(selectedFilter.toLowerCase())
            );
        }
        this.setState((prevState) => ({
            monkeys: filteredMonkeys,
            currentGroupFilter: selectedFilter,
            currentYearFilter: "All Years",
        }));
    };
    filterYear = (event) => {
        const selectedFilter = event.target.value;
        let filteredMonkeys;

        if (selectedFilter === "All Years") {
            filteredMonkeys = monkeysArr.sort((a, b) =>
                a.name.localeCompare(b.name)
            );
        } else {
            filteredMonkeys = monkeysArr.filter(
                (monkey) => monkey.year === Number(selectedFilter)
            );
        }
        this.setState((prevState) => ({
            monkeys: filteredMonkeys,
            currentYearFilter: selectedFilter,
            currentGroupFilter: "All Troops",
        }));
    };
    toggleModal(m) {
        this.setState((st) => ({
            selectedMonkey: m,
            isModalOpen: !st.isModalOpen,
        }));
    }
    //PDF function from react-pdf
    createPDF = async () => {
        this.setState({ isGeneratingPDF: true });
        const { monkeys } = this.state;
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
    render() {
        let monkeys = this.state.monkeys;

        return (
            <div className="ShowPage">
                <div className="ShowPage-modal">
                    <Modal
                        onClose={this.toggleModal}
                        isModalOpen={this.state.isModalOpen}
                        monkey={this.state.selectedMonkey}
                    />
                </div>
                <div className="ShowPage-nav">
                    <Nav
                        createPDF={this.createPDF}
                        isGeneratingPDF={this.state.isGeneratingPDF}
                    />
                </div>
                <div className="ShowPage-sortfilter">
                    <div className="ShowPage-sort">
                        <h4>Sort by:</h4>
                        <button onClick={this.sortByName}>
                            <span>Name </span>
                            <IconArrowsDownUp />
                        </button>
                        <button onClick={this.sortByTroop}>
                            <span>Troop </span>
                            <IconArrowsDownUp />{" "}
                        </button>
                        <button onClick={this.sortByYear}>
                            <span>Year </span>
                            <IconArrowsDownUp />{" "}
                        </button>
                    </div>
                    <div className="ShowPage-filter">
                        <h4>Filter by:</h4>
                        <select
                            className="ShowPage-filter-select"
                            name="groups"
                            id="groups"
                            value={this.state.currentGroupFilter}
                            onChange={this.filterGroups}
                        >
                            {groupsArr.map((g) => (
                                <option value={g}>{g}</option>
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
                            {this.state.yearsArr.map((y) => (
                                <option value={y}>{y}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className="ShowPage-monkeys">
                    {monkeys.map((m) => (
                        <div key={uuidv4()} onClick={() => this.toggleModal(m)}>
                            <MonkeyCard
                                name={m.name}
                                sex={m.sex}
                                year={m.year}
                                troop={m.troop}
                                chip={m.chip}
                                img={m.img[0]}
                                bio={m.bio}
                            />
                        </div>
                    ))}
                </div>
            </div>
        );
    }
}

export default ShowPage;
