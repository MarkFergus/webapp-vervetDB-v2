import { useEffect, useMemo, useRef, useState } from "react";
import {
    IconArrowDown,
    IconArrowUp,
    IconArrowBarToUp,
    IconAdjustmentsHorizontal,
    IconX,
} from "@tabler/icons-react";
import { BUILT_IN_DATA } from "./monkeyData";
import MonkeyCard from "./MonkeyCard";
import { preparePhotosForPdf } from "./pdfPhotos";
import Modal from "./Modal";
import MonkeyForm from "./MonkeyForm";
import { useAuth } from "./auth";
import Nav from "./Nav";
import { isMonkeyHash, monkeyFromHash, monkeyHash } from "./monkeyLink";
import { BABIES_BOOK, bookMonkeys, bookSections, bookTitle } from "./profileBook";
import { ageInYears } from "./ages";
import FilterPanel, { AGE_GROUPS, SEXES } from "./FilterPanel";
import { SECTIONS, inSection } from "./sections";
import { APP_VERSION } from "./changelog";
import { downloadBlob } from "./canvasHelpers";
import OfflineModal from "./OfflineModal";
import "./ShowPage.css";

const MONKEYS_PER_PAGE = 100;

const byName = (a, b) => a.name.localeCompare(b.name);

// Ties (same troop, year or sex) fall back to alphabetical by name
const SEX_ORDER = { female: 0, male: 1 };
const compareBy = {
    name: byName,
    troop: (a, b) => a.troop.localeCompare(b.troop) || byName(a, b),
    // Age: youngest first (the latest birth year)
    age: (a, b) => b.year - a.year || byName(a, b),
    sex: (a, b) => SEX_ORDER[a.sex] - SEX_ORDER[b.sex] || byName(a, b),
};

// Age categories: ages use the 1 November birthday, and no birth year
// counts as an adult (as in the Profile Book)
const AGE_TESTS = {
    babies: (age) => age === 0,
    juveniles: (age) => age !== null && age >= 1 && age <= 3,
    adults: (age) => age === null || (age >= 4 && age <= 14),
    elderly: (age) => age !== null && age >= 15,
};
// In any of the chosen categories ([] = every monkey)
function inAgeGroups(monkey, groups) {
    if (groups.length === 0) return true;
    const age = ageInYears(monkey.year);
    return groups.some((g) => AGE_TESTS[g](age));
}

const NO_FILTERS = {
    location: "troop",
    section: "all",
    troop: "All Troops",
    year: "All Years",
    age: [], // age categories picked ([] = all)
    sex: "all",
};

// The list on screen is worked out from the search, filters and sort
// every time, so they always agree with each other.
function getVisibleMonkeys(monkeys, { searchValue, filters, sort }) {
    const { section, troop: troopFilter, year: yearFilter, age, sex } = filters;
    const query = searchValue.trim().toLowerCase();
    const isChipSearch = /^\d+$/.test(query);

    const results = monkeys.filter((monkey) => {
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
        const matchesSex = sex === "all" || monkey.sex === sex;
        return (
            matchesTroop &&
            inSection(monkey.troop, section) &&
            matchesYear &&
            matchesSearch &&
            matchesSex &&
            inAgeGroups(monkey, age)
        );
    });

    // filter() returns a new array, so sorting it leaves the original data alone
    const compare = compareBy[sort.key];
    return results.sort((a, b) => {
        // Unknown birth years (or sexes) go last, whichever direction
        if (sort.key === "age" && !a.year !== !b.year) {
            return a.year ? -1 : 1;
        }
        const knownSex = (m) => m.sex in SEX_ORDER;
        if (sort.key === "sex" && knownSex(a) !== knownSex(b)) {
            return knownSex(a) ? -1 : 1;
        }
        return sort.ascending ? compare(a, b) : compare(b, a);
    });
}

// e.g. profile_book_Goliath_2026-09-30.pdf
// e.g. "profile_book_Goliath_2026-10-01.pdf", "profile_book_Orphans_Babies_…"
function pdfFilename(book) {
    const date = new Date().toISOString().slice(0, 10);
    return `profile_book_${book.replace(/[^a-z0-9]+/gi, "_")}_${date}.pdf`;
}

// monkeys / troops: the data to show (from the database, via App).
// Defaults to the built-in copy, e.g. in tests.
// editable: the data is live from the database, so editors may change it.
// onMonkeySaved / onMonkeyDeleted: tell App about a change, to update the list.
function ShowPage({
    monkeys = BUILT_IN_DATA.monkeys,
    troops = BUILT_IN_DATA.troops,
    troopIds = BUILT_IN_DATA.troopIds,
    editable = false,
    onMonkeySaved = () => {},
    onMonkeyDeleted = () => {},
}) {
    const { isEditor, isAdmin, passwordSetup } = useAuth();
    const canEdit = editable && isEditor;
    // Adding a monkey is for admins only (the database enforces it too)
    const canAdd = canEdit && isAdmin;
    const [searchValue, setSearchValue] = useState("");
    // Filters: { troop, year, age, sex } (see FilterPanel)
    const [filters, setFilters] = useState(NO_FILTERS);
    const troopFilter = filters.troop;
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersButtonRef = useRef(null);
    const [sort, setSort] = useState({ key: "name", ascending: true });
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedMonkey, setSelectedMonkey] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isPDFModalOpen, setIsPDFModalOpen] = useState(false);
    const [isAccountOpen, setIsAccountOpen] = useState(false);
    const [isAboutOpen, setIsAboutOpen] = useState(false);
    const [isOfflineOpen, setIsOfflineOpen] = useState(false);
    // Arrived from a password email link: open the account pop-up by itself
    useEffect(() => {
        if (passwordSetup) setIsAccountOpen(true);
    }, [passwordSetup]);
    // The edit / add form: null when closed, else { monkey } (null = adding)
    const [editing, setEditing] = useState(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(null); // { done, total }
    const [pdfError, setPdfError] = useState(null);
    // Which Profile Book to make: a troop, or BABIES_BOOK
    const troopNames = troops.filter((t) => t !== "All Troops");
    const [pdfBook, setPdfBook] = useState(troopNames[0] ?? BABIES_BOOK);
    // The book's monkeys, in sections, in book order
    const pdfSections = useMemo(
        () => bookSections(bookMonkeys(monkeys, pdfBook)),
        [monkeys, pdfBook]
    );
    const pdfMonkeyCount = pdfSections.reduce((n, s) => n + s.monkeys.length, 0);

    // Only recalculated when the data, search, a filter or the sort changes
    const visibleMonkeys = useMemo(
        () =>
            getVisibleMonkeys(monkeys, { searchValue, filters, sort }),
        [monkeys, searchValue, filters, sort]
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
    function setFilter(field, value) {
        setFilters((f) => {
            const next = { ...f, [field]: value };
            // A troop outside the newly chosen section: back to all troops
            if (field === "section" && !inSection(next.troop, value)) next.troop = NO_FILTERS.troop;
            // A birth year or an age category, not both (a year already
            // decides the category): choosing one clears the other
            if (field === "year" && value !== NO_FILTERS.year) next.age = NO_FILTERS.age;
            if (field === "age" && value.length > 0) next.year = NO_FILTERS.year;
            return next;
        });
        setCurrentPage(1);
    }
    // The logo: back to the top, with the search and filters cleared
    function goHome() {
        setSearchValue("");
        setFilters(NO_FILTERS);
        setCurrentPage(1);
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo?.({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    }
    function clearFilters() {
        setFilters(NO_FILTERS);
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
    // The address shows the open monkey (e.g. #monkey/aroha-james), so it can
    // be shared, and Back (e.g. on a phone) closes the pop-up.
    // pushedAddress: we added the monkey's address to the history (so Back
    // takes it off again) rather than arriving from a link
    const pushedAddress = useRef(false);
    const pageAddress = () => window.location.pathname + window.location.search;

    function showInAddress(m) {
        const hash = monkeyHash(m);
        if (window.location.hash === hash) return;
        if (isMonkeyHash(window.location.hash)) {
            // Already showing a monkey (previous / next): swap it
            window.history.replaceState(null, "", hash);
        } else {
            window.history.pushState(null, "", hash);
            pushedAddress.current = true;
        }
    }
    function leaveAddress() {
        if (!isMonkeyHash(window.location.hash)) return;
        if (pushedAddress.current) {
            pushedAddress.current = false;
            window.history.back();
        } else {
            window.history.replaceState(null, "", pageAddress());
        }
    }

    // Arriving from a monkey's link, or Back / Forward: show what the address says
    useEffect(() => {
        function showFromAddress() {
            const hash = window.location.hash;
            const m = monkeyFromHash(hash, monkeys);
            if (m) {
                setSelectedMonkey(m);
                setIsModalOpen(true);
            } else if (isMonkeyHash(hash)) {
                // A link to a monkey that's since been renamed or deleted
                window.history.replaceState(null, "", pageAddress());
                setIsModalOpen(false);
            } else {
                pushedAddress.current = false;
                setIsModalOpen(false);
            }
        }
        showFromAddress();
        window.addEventListener("hashchange", showFromAddress);
        return () => window.removeEventListener("hashchange", showFromAddress);
    }, [monkeys]);

    function openModal(m) {
        showInAddress(m);
        setSelectedMonkey(m);
        setIsModalOpen(true);
    }
    function closeModal() {
        setIsModalOpen(false);
        leaveAddress();
    }
    function handlePrevNext(direction) {
        const m = direction === "prev" ? prevMonkey : nextMonkey;
        if (!m) return;
        showInAddress(m);
        setSelectedMonkey(m);
    }
    function startEdit(monkey) {
        setIsModalOpen(false);
        leaveAddress();
        setEditing({ monkey });
    }
    function startAdd() {
        setEditing({ monkey: null });
    }
    // Saved: update the list, then show the monkey (with its new details)
    function handleSaved(saved) {
        onMonkeySaved(saved);
        setEditing(null);
        openModal(saved);
    }
    function handleDeleted(id) {
        onMonkeyDeleted(id);
        setEditing(null);
        setSelectedMonkey(null);
    }
    function togglePDFModal() {
        // Opening it while looking at one troop: that troop to start with
        if (!isPDFModalOpen && troopNames.includes(troopFilter)) setPdfBook(troopFilter);
        setIsPDFModalOpen((open) => !open);
        setPdfError(null);
    }
    // Builds the chosen Profile Book and downloads it
    async function createPDF() {
        const monkeys = pdfSections.flatMap((s) => s.monkeys);
        setIsGeneratingPDF(true);
        setPdfError(null);
        setPdfProgress({ done: 0, total: monkeys.length });
        try {
            // The PDF library is large, so it's only loaded when needed
            const [{ pdf }, { default: MonkeyPDF }] = await Promise.all([
                import("@react-pdf/renderer"),
                import("./MonkeyPDF"),
            ]);
            const prepared = await preparePhotosForPdf(monkeys, (done, total) =>
                setPdfProgress({ done, total })
            );
            // Back into sections, now with photos ready for the PDF
            let next = 0;
            const sections = pdfSections.map((s) => ({
                ...s,
                monkeys: prepared.slice(next, (next += s.monkeys.length)),
            }));
            const blob = await pdf(
                <MonkeyPDF
                    sections={sections}
                    title={bookTitle(pdfBook)}
                    showTroop={pdfBook === BABIES_BOOK}
                />
            ).toBlob();
            downloadBlob(blob, pdfFilename(pdfBook));
            setIsPDFModalOpen(false);
        } catch (err) {
            console.error(err);
            setPdfError("Something went wrong creating the PDF. Please try again.");
        } finally {
            setIsGeneratingPDF(false);
            setPdfProgress(null);
        }
    }
    function handleShowMore() {
        setCurrentPage((page) => page + 1);
    }

    // "Back to top": shown once the Filters / sort row has scrolled out of
    // view (the header itself stays at the top)
    const toolbarRef = useRef(null);
    const [navOutOfView, setNavOutOfView] = useState(false);
    // Scrolled at all: a faint line under the pinned header
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        function check() {
            const toolbar = toolbarRef.current;
            if (toolbar) setNavOutOfView(toolbar.getBoundingClientRect().bottom < 0);
            setScrolled(window.scrollY > 0);
        }
        check();
        window.addEventListener("scroll", check, { passive: true });
        return () => window.removeEventListener("scroll", check);
    }, []);
    function scrollToTop() {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        // Keyboard users carry on from the top: the search box
        document
            .querySelector('input[aria-label="Search by name or chip number"]')
            ?.focus({ preventScroll: true });
    }

    const activeFilters = [
        filters.section !== "all" && {
            field: "section",
            label: `${SECTIONS.find((x) => x.id === filters.section).label} section`,
        },
        filters.troop !== NO_FILTERS.troop && { field: "troop", label: filters.troop },
        filters.year !== NO_FILTERS.year && { field: "year", label: `Born ${filters.year}` },
        // One chip per age category picked
        ...AGE_GROUPS.filter((g) => filters.age.includes(g.id)).map((g) => ({
            field: "age",
            id: g.id,
            label: g.label,
        })),
        filters.sex !== "all" && {
            field: "sex",
            label: SEXES.find((x) => x.id === filters.sex).label,
        },
    ].filter(Boolean);

    // While a modal is open, the page behind it can't be tabbed to or clicked
    // ("inert"). The PDF modal lives inside the nav, so the nav handles that one.
    const isAnyModalOpen =
        isModalOpen || isPDFModalOpen || isAccountOpen || isAboutOpen || isOfflineOpen || Boolean(editing);

    // One segment of the Name | Troop | Year sort control. The active one is
    // highlighted with an arrow showing the direction.
    function sortButton(key, label) {
        const isActive = sort.key === key;
        const Arrow = sort.ascending ? IconArrowUp : IconArrowDown;
        return (
            <button
                type="button"
                onClick={() => sortBy(key)}
                aria-pressed={isActive}
            >
                {label}
                {isActive && (
                    <>
                        <Arrow size={14} stroke={2.5} aria-hidden="true" />
                        <span className="visually-hidden">
                            {sort.ascending ? ", ascending" : ", descending"}
                        </span>
                    </>
                )}
            </button>
        );
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
                    position={
                        selectedIndex === -1
                            ? null
                            : { number: selectedIndex + 1, total: visibleMonkeys.length }
                    }
                    onEdit={canEdit ? startEdit : undefined}
                />
            </div>
            <div
                className={scrolled ? "ShowPage-nav is-scrolled" : "ShowPage-nav"}
                inert={isModalOpen || Boolean(editing)}
            >
                <Nav
                    createPDF={createPDF}
                    isGeneratingPDF={isGeneratingPDF}
                    pdfProgress={pdfProgress}
                    pdfError={pdfError}
                    pdfMonkeyCount={pdfMonkeyCount}
                    pdfBook={pdfBook}
                    pdfTroops={troopNames}
                    onChoosePdfBook={setPdfBook}
                    searchValue={searchValue}
                    handleSearch={handleSearch}
                    handleDelete={handleDelete}
                    isPDFModalOpen={isPDFModalOpen}
                    isAccountOpen={isAccountOpen}
                    toggleAccount={() => setIsAccountOpen((open) => !open)}
                    isAboutOpen={isAboutOpen}
                    toggleAbout={() => setIsAboutOpen((open) => !open)}
                    isOfflineOpen={isOfflineOpen}
                    toggleOffline={() => setIsOfflineOpen((open) => !open)}
                    onAddMonkey={canAdd ? startAdd : undefined}
                    togglePDFModal={togglePDFModal}
                    onHome={goHome}
                />
            </div>
            {/* Filters (pills, blue when active), sort (segmented control)
                and, for editors, Add monkey */}
            <div className="ShowPage-toolbar" ref={toolbarRef} inert={isAnyModalOpen}>
                <div className="ShowPage-filtersWrap">
                    <button
                        type="button"
                        className={
                            activeFilters.length ? "ShowPage-filtersButton is-active" : "ShowPage-filtersButton"
                        }
                        ref={filtersButtonRef}
                        onClick={() => setFiltersOpen((open) => !open)}
                        aria-expanded={filtersOpen}
                        aria-controls="FilterPanel"
                        aria-label={
                            activeFilters.length ? `Filters (${activeFilters.length} on)` : "Filters"
                        }
                    >
                        <IconAdjustmentsHorizontal size={16} aria-hidden="true" />
                        Filters
                        {activeFilters.length > 0 && (
                            <span className="ShowPage-filtersCount" aria-hidden="true">
                                {activeFilters.length}
                            </span>
                        )}
                    </button>
                    <FilterPanel
                        open={filtersOpen}
                        onClose={() => setFiltersOpen(false)}
                        buttonRef={filtersButtonRef}
                        troops={troops}
                        filters={filters}
                        onChange={setFilter}
                        onClear={clearFilters}
                        count={visibleMonkeys.length}
                        anyOn={activeFilters.length > 0}
                    />
                </div>
                <div className="ShowPage-sort" role="group" aria-label="Sort by">
                    {sortButton("name", "Name")}
                    {sortButton("troop", "Troop")}
                    {sortButton("age", "Age")}
                    {sortButton("sex", "Sex")}
                </div>
            </div>
            {/* The filters in use: tap one to remove it */}
            {activeFilters.length > 0 && (
                <div className="ShowPage-chips" inert={isAnyModalOpen}>
                    {activeFilters.map((f) => (
                        <button
                            key={f.id ?? f.field}
                            type="button"
                            className="ShowPage-chip"
                            onClick={() =>
                                f.field === "age"
                                    ? setFilter("age", filters.age.filter((a) => a !== f.id))
                                    : setFilter(f.field, NO_FILTERS[f.field])
                            }
                            aria-label={`Remove filter: ${f.label}`}
                        >
                            {f.label}
                            <IconX size={14} aria-hidden="true" />
                        </button>
                    ))}
                    <button type="button" className="ShowPage-clearChips" onClick={clearFilters}>
                        Clear all
                    </button>
                </div>
            )}
            {/* Read out by screen readers when the results change */}
            <p className="visually-hidden" role="status">
                Showing {visibleMonkeys.length}{" "}
                {visibleMonkeys.length === 1 ? "monkey" : "monkeys"}
            </p>
            <div className="ShowPage-monkeys" inert={isAnyModalOpen}>
                {currentMonkeys.map((m) => (
                    <MonkeyCard
                        key={m.id ?? `${m.name}-${m.chip}-${m.troop}`}
                        onClick={() => openModal(m)}
                        name={m.name}
                        sex={m.sex}
                        year={m.year}
                        troop={m.troop}
                        img={m.img[0]}
                    />
                ))}
            </div>
            {indexOfLastMonkey < visibleMonkeys.length && (
                <div className="ShowPage-showMore" inert={isAnyModalOpen}>
                    <button
                        type="button"
                        className="ShowPage-showMoreBtn"
                        onClick={handleShowMore}
                    >
                        Show More
                    </button>
                </div>
            )}
            {/* A quiet line at the very bottom: the version, and About */}
            <footer className="ShowPage-footer" inert={isAnyModalOpen}>
                <button type="button" onClick={() => setIsAboutOpen(true)}>
                    vervetDB {APP_VERSION} · About
                </button>
            </footer>
            {navOutOfView && !isAnyModalOpen && (
                <button
                    type="button"
                    className="ShowPage-toTop"
                    onClick={scrollToTop}
                    aria-label="Back to top"
                    title="Back to top"
                >
                    <IconArrowBarToUp size={24} aria-hidden="true" />
                </button>
            )}
            <OfflineModal
                isOpen={isOfflineOpen}
                onClose={() => setIsOfflineOpen(false)}
                monkeys={monkeys}
                onSignIn={() => {
                    setIsOfflineOpen(false);
                    setIsAccountOpen(true);
                }}
            />
            {editing && (
                <MonkeyForm
                    // key: a fresh form for each monkey
                    key={editing.monkey?.id ?? "new"}
                    monkey={editing.monkey}
                    troops={troops.filter((t) => t !== "All Troops")}
                    troopIds={troopIds}
                    defaultTroop={troopFilter}
                    onClose={() => setEditing(null)}
                    onSaved={handleSaved}
                    onDeleted={handleDeleted}
                />
            )}
        </div>
    );
}

export default ShowPage;
