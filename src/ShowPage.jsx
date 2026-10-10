import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    IconArrowBarToUp,
    IconAdjustmentsHorizontal,
    IconUsersGroup,
    IconChevronDown,
    IconFilterOff,
    IconLayoutGrid,
    IconList,
    IconSearchOff,
    IconX,
} from "@tabler/icons-react";
import { BUILT_IN_DATA } from "./monkeyData";
import MonkeyCard from "./MonkeyCard";
import MonkeyRow, { MonkeyListHeader } from "./MonkeyRow";
import { preparePhotosForPdf } from "./pdfPhotos";
import Modal from "./Modal";
import MonkeyForm from "./MonkeyForm";
import QuickPhotos from "./QuickPhotos";
import { useAuth } from "./auth";
import Nav from "./Nav";
import { isMonkeyHash, monkeyFromHash, monkeyHash } from "./monkeyLink";
import { fullName, homeName, inIntrocage, placeName } from "./places";
import {
    enclosureFromRoute,
    introcageMonkeys,
    isInside,
    isEnclosuresRoute,
    placeHash,
    residents,
    troopMonkeys,
} from "./enclosures";
import EnclosuresPage from "./EnclosuresPage";
import Game from "./Game";
import { BABIES_BOOK, bookMonkeys, bookSections, bookTitle } from "./profileBook";
import { ageInYears } from "./ages";
import FilterPanel, { AGE_GROUPS, SEXES } from "./FilterPanel";
import { SECTIONS, inSection } from "./sections";
import { downloadBlob } from "./canvasHelpers";
import OfflineModal from "./OfflineModal";
import SortMenu from "./SortMenu";
import "./ShowPage.css";

// Monkeys added at a time as the page scrolls (continuous scroll)
const MONKEYS_PER_PAGE = 100;

const byName = (a, b) => a.name.localeCompare(b.name);

// Ties (same troop, year or sex) fall back to alphabetical by name
const SEX_ORDER = { female: 0, male: 1 };
const compareBy = {
    name: byName,
    troop: (a, b) => placeName(a).localeCompare(placeName(b)) || byName(a, b),
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
    location: "all", // "troop" or "introcage": only those
    section: [], // section ids picked ([] = all sections)
    troop: "All Troops",
    year: "All Years",
    age: [], // age categories picked ([] = all)
    sex: "all",
};

// The list on screen is worked out from the search, filters and sort
// every time, so they always agree with each other.
function getVisibleMonkeys(monkeys, { searchValue, filters, sort }) {
    const { location, section, troop: troopFilter, year: yearFilter, age, sex } = filters;
    const query = searchValue.trim().toLowerCase();
    const isChipSearch = /^\d+$/.test(query);

    const results = monkeys.filter((monkey) => {
        const matchesLocation = location === "all" || (location === "introcage") === inIntrocage(monkey);
        const matchesTroop =
            troopFilter === "All Troops" ||
            // Introcage monkeys aren't in the troop: the ones in the
            // introcages at that troop's enclosure (unless Introcage is off,
            // see matchesLocation)
            (inIntrocage(monkey)
                ? homeName(monkey).toLowerCase() === troopFilter.toLowerCase()
                : (monkey.troop ?? "").toLowerCase().includes(troopFilter.toLowerCase()));
        const matchesYear =
            yearFilter === "All Years" ||
            // Number() on both sides in case a year is entered as text
            Number(monkey.year) === Number(yearFilter);
        const matchesSearch =
            query === "" ||
            (isChipSearch
                ? String(monkey.chip ?? "").includes(query)
                : monkey.name.toLowerCase().includes(query));
        const matchesSex = sex === "all" || monkey.sex === sex;
        return (
            matchesLocation &&
            matchesTroop &&
            inSection(homeName(monkey), section) &&
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
const VIEW_KEY = "vervetdb-view";

// route: "enclosures" or "enclosure/<id>" shows the Enclosures pages under
// the same top bar, in place of the monkey list (see EnclosuresPage)
function ShowPage({
    monkeys = BUILT_IN_DATA.monkeys,
    troops = BUILT_IN_DATA.troops,
    troopIds = BUILT_IN_DATA.troopIds,
    enclosures = BUILT_IN_DATA.enclosures,
    sections = BUILT_IN_DATA.sections,
    route = "",
    enclosuresLive = false,
    onEnclosureSaved = () => {},
    editable = false,
    onMonkeySaved = () => {},
    onMonkeyDeleted = () => {},
}) {
    const { isEditor, isAdmin, canLogMaintenance, passwordSetup } = useAuth();
    const canEdit = editable && isEditor;
    // Adding a monkey is for admins only (the database enforces it too)
    const canAdd = canEdit && isAdmin;
    // On the Enclosures pages (only once the database has enclosures)
    const enclosureEditing = {
        canEdit: canEdit && enclosuresLive,
        // the maintenance log: any role, maintenance accounts too
        canLog: editable && canLogMaintenance && enclosuresLive,
        // enclosure details: admins only, for now
        canEditDetails: canEdit && enclosuresLive && isAdmin,
        canDelete: canEdit && enclosuresLive && isAdmin,
        live: enclosuresLive && editable,
        onSaved: onEnclosureSaved,
    };
    const [searchValue, setSearchValue] = useState("");
    // Filters: { location, section, troop, year, age, sex } (see FilterPanel)
    const [filters, setFilters] = useState(NO_FILTERS);
    const troopFilter = filters.troop;
    const [filtersOpen, setFiltersOpen] = useState(false);
    const filtersButtonRef = useRef(null);
    const [sort, setSort] = useState({ key: "name", ascending: true });
    // Photo cards ("grid") or a table-style list ("list"), remembered on
    // this device
    const [view, setView] = useState(() => {
        try {
            return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
        } catch {
            return "grid";
        }
    });
    function chooseView(next) {
        setView(next);
        try {
            localStorage.setItem(VIEW_KEY, next);
        } catch {
            // Not remembered this time
        }
    }
    const [currentPage, setCurrentPage] = useState(1);
    const [selectedMonkey, setSelectedMonkey] = useState(null);
    const [isModalOpen, setIsModalOpen] = useState(false);
    // Monkeys opened lately (their ids, newest first), for Add Photos'
    // suggestions: each monkey opened goes to the front
    const recentIds = useRef([]);
    useEffect(() => {
        const id = isModalOpen ? selectedMonkey?.id : null;
        if (id == null) return;
        recentIds.current = [id, ...recentIds.current.filter((x) => x !== id)].slice(0, 10);
    }, [isModalOpen, selectedMonkey]);
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
    // Add Photos (staff): null when closed, else { files, current, place }
    // (see QuickPhotos). The photo picker is here, always on the page, so
    // the chosen photos arrive even after the menu that opened it has gone.
    const [quickPhotos, setQuickPhotos] = useState(null);
    const photoPickerRef = useRef(null);
    const photoContext = useRef(null);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [pdfProgress, setPdfProgress] = useState(null); // { done, total }
    const [pdfError, setPdfError] = useState(null);
    // The finished book, waiting for Save PDF: { blob, filename }
    const [pdfReady, setPdfReady] = useState(null);
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

    // The pop-up steps through the monkey list, or (opened from an
    // enclosure's page) that group of monkeys
    const onEnclosures = isEnclosuresRoute(route);
    // The game (#game): under the same top bar, without the search box
    const onGame = route === "game";
    // Another page than the monkey list (going home goes back to it)
    const offList = onEnclosures || onGame;
    // The game starts at the top
    useEffect(() => {
        if (onGame) window.scrollTo?.(0, 0);
    }, [onGame]);
    const [modalList, setModalList] = useState(null);
    const neighbours = modalList ?? visibleMonkeys;
    const selectedIndex = neighbours.indexOf(selectedMonkey);
    const prevMonkey =
        selectedIndex === -1 ? null : neighbours[selectedIndex - 1] || null;
    const nextMonkey =
        selectedIndex === -1 ? null : neighbours[selectedIndex + 1] || null;

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
            // A troop outside the newly chosen sections: back to all troops
            if (field === "section" && !inSection(next.troop, value)) next.troop = NO_FILTERS.troop;
            // A birth year or an age category, not both (a year already
            // decides the category): choosing one clears the other
            if (field === "year" && value !== NO_FILTERS.year) next.age = NO_FILTERS.age;
            // (including "All Ages", which also means no year)
            if (field === "age") next.year = NO_FILTERS.year;
            return next;
        });
        setCurrentPage(1);
    }
    // The logo: back to the top, with the search and filters cleared
    function goHome() {
        if (offList) window.location.hash = "";
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
    // "No monkeys found": clear the search and the filters together
    function clearSearchAndFilters() {
        setSearchValue("");
        clearFilters();
    }
    function handleSearch(event) {
        // Searching from another page: the results are on the list
        if (offList) window.location.hash = "";
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
        // (on the Enclosures pages the address stays on the enclosure)
        if (onEnclosures) return;
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

    // list: the monkeys to step through with previous / next (default: the
    // monkey list as searched, filtered and sorted)
    function openModal(m, list = null) {
        setModalList(list);
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
    // Add Photos: the phone's photo picker (or a computer's files) opens
    // straight away. current: the monkey it's for (from its pop-up), or null.
    function startAddPhotos(current = null) {
        // The enclosure / introcage page it's opened on: its monkeys first
        const page = onEnclosures ? enclosureFromRoute(route, enclosures) : null;
        const place = page && {
            name: page.name,
            monkeys:
                isInside(page)
                    ? residents(page, monkeys)
                    : [...troopMonkeys(page, monkeys), ...introcageMonkeys(page, monkeys)],
        };
        photoContext.current = { current, place };
        photoPickerRef.current?.click();
    }
    function photosChosen(event) {
        const files = [...event.target.files];
        event.target.value = ""; // (so the same photos can be chosen again)
        if (!files.length) return;
        // From a monkey's pop-up: it closes, as for Edit
        if (isModalOpen) {
            setIsModalOpen(false);
            leaveAddress();
        }
        setQuickPhotos({ files, ...photoContext.current });
    }
    // Saved: update the list, then show the monkey (with its new details)
    function handleSaved(saved) {
        onMonkeySaved(saved);
        setEditing(null);
        openModal(saved, modalList && modalList.map((m) => (m.id === saved.id ? saved : m)));
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
        setPdfReady(null);
    }
    // Choosing another book: the finished one (if any) no longer applies
    function choosePdfBook(book) {
        setPdfBook(book);
        setPdfReady(null);
    }
    // Builds the chosen Profile Book, then offers Save PDF. Saving needs its
    // own tap: some browsers (Firefox on Android) only allow a download
    // within a few seconds of a tap, and making a book takes longer.
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
            setPdfReady({ blob, filename: pdfFilename(pdfBook) });
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

    // Continuous scroll: an invisible marker under the list loads the next
    // monkeys when it comes within 800px of the screen, before you reach the
    // end. Watched afresh after each load, so a tall screen keeps filling.
    // Browsers without IntersectionObserver get a Show More button instead.
    const hasMore = indexOfLastMonkey < visibleMonkeys.length;
    const canAutoLoad = typeof window.IntersectionObserver === "function";
    const loadMoreRef = useRef(null);
    useEffect(() => {
        const marker = loadMoreRef.current;
        if (!marker || !canAutoLoad) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    observer.disconnect();
                    handleShowMore();
                }
            },
            { rootMargin: "0px 0px 800px 0px" }
        );
        observer.observe(marker);
        return () => observer.disconnect();
    }, [currentPage, hasMore, canAutoLoad, view]);

    // "Back to top": shown once the Filters / sort row has scrolled out of
    // view (the header itself stays at the top)
    const toolbarRef = useRef(null);
    const [navOutOfView, setNavOutOfView] = useState(false);
    // Scrolled at all: a faint line under the pinned header
    const [scrolled, setScrolled] = useState(false);
    useEffect(() => {
        function check() {
            const toolbar = toolbarRef.current;
            // (no toolbar: another page, e.g. the game)
            setNavOutOfView(Boolean(toolbar) && toolbar.getBoundingClientRect().bottom < 0);
            setScrolled(window.scrollY > 0);
        }
        check();
        window.addEventListener("scroll", check, { passive: true });
        return () => window.removeEventListener("scroll", check);
    }, []);
    // Too tight for Filters, Sort, the count and the view switch on one
    // line (narrow phones, long sorts like "Age · Youngest first"): first
    // Filters loses its word (.is-tight), then Sort becomes just an icon
    // (.is-compact). Tried with all the words each time first, before the
    // screen is drawn, so it never flickers.
    useLayoutEffect(() => {
        const toolbar = toolbarRef.current;
        if (!toolbar) return;
        const tooWide = () => toolbar.scrollWidth > toolbar.clientWidth + 1;
        function fit() {
            toolbar.classList.remove("is-tight", "is-compact");
            if (tooWide()) toolbar.classList.add("is-tight");
            if (tooWide()) toolbar.classList.add("is-compact");
        }
        fit();
        if (typeof ResizeObserver === "undefined") return;
        const observer = new ResizeObserver(fit);
        observer.observe(toolbar);
        return () => observer.disconnect();
    }, [sort, filters, visibleMonkeys.length, offList]);
    function scrollToTop() {
        const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
        // Keyboard users carry on from the top: the search box
        document
            .querySelector('input[aria-label="Search by name or chip number"]')
            ?.focus({ preventScroll: true });
    }

    const activeFilters = [
        // One chip per section picked
        ...SECTIONS.filter((s) => filters.section.includes(s.id)).map((s) => ({
            field: "section",
            id: s.id,
            label: s.chip,
        })),
        filters.location !== NO_FILTERS.location && {
            field: "location",
            label: filters.location === "introcage" ? "In introcages" : "In troops",
        },
        filters.troop !== NO_FILTERS.troop && { field: "troop", label: fullName(filters.troop) },
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
        isModalOpen ||
        isPDFModalOpen ||
        isAccountOpen ||
        isAboutOpen ||
        isOfflineOpen ||
        Boolean(editing) ||
        Boolean(quickPhotos);

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
                            : { number: selectedIndex + 1, total: neighbours.length }
                    }
                    onEdit={canEdit ? startEdit : undefined}
                    onAddPhotos={canEdit ? startAddPhotos : undefined}
                    placeHref={selectedMonkey ? placeHash(selectedMonkey, enclosures) : null}
                />
            </div>
            <div
                className={scrolled ? "ShowPage-nav is-scrolled" : "ShowPage-nav"}
                inert={isModalOpen || Boolean(editing) || Boolean(quickPhotos)}
            >
                <Nav
                    createPDF={createPDF}
                    isGeneratingPDF={isGeneratingPDF}
                    pdfProgress={pdfProgress}
                    pdfError={pdfError}
                    pdfMonkeyCount={pdfMonkeyCount}
                    pdfBook={pdfBook}
                    pdfTroops={troopNames}
                    onChoosePdfBook={choosePdfBook}
                    pdfReady={pdfReady}
                    onSavePDF={() => {
                        downloadBlob(pdfReady.blob, pdfReady.filename);
                        setPdfReady(null);
                        setIsPDFModalOpen(false);
                    }}
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
                    onAddPhotos={canEdit ? () => startAddPhotos() : undefined}
                    togglePDFModal={togglePDFModal}
                    onHome={goHome}
                    page={onGame ? "game" : onEnclosures ? "enclosures" : "monkeys"}
                    showSearch={!onGame}
                    barsInert={isAnyModalOpen}
                />
            </div>
            {onGame ? (
                <div inert={isAnyModalOpen}>
                    <Game monkeys={monkeys} troops={troops} />
                </div>
            ) : onEnclosures ? (
                <EnclosuresPage
                    route={route}
                    monkeys={monkeys}
                    enclosures={enclosures}
                    sections={sections}
                    onOpenMonkey={openModal}
                    inert={isAnyModalOpen}
                    editing={enclosureEditing}
                />
            ) : (
            <>
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
                        {/* (hidden when the row's too tight: just the icon) */}
                        <span className="ShowPage-filtersLabel">Filters</span>
                        {activeFilters.length > 0 && (
                            <span className="ShowPage-filtersCount" aria-hidden="true">
                                {activeFilters.length}
                            </span>
                        )}
                        <IconChevronDown className="ShowPage-chevron" size={14} stroke={2} aria-hidden="true" />
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
                <SortMenu sort={sort} onSort={sortBy} />
                {/* How many monkeys match (screen readers hear it from the
                    status line below, so this is for the eyes only) */}
                <span
                    className="ShowPage-count"
                    title={`${visibleMonkeys.length} ${visibleMonkeys.length === 1 ? "monkey" : "monkeys"}`}
                    aria-hidden="true"
                >
                    <IconUsersGroup size={16} aria-hidden="true" />
                    {visibleMonkeys.length}
                </span>
                {/* Cards or list, at the far right */}
                <div className="ShowPage-view" role="group" aria-label="View">
                    <button
                        type="button"
                        aria-pressed={view === "grid"}
                        aria-label="Grid view"
                        title="Grid view"
                        onClick={() => chooseView("grid")}
                    >
                        <IconLayoutGrid size={16} aria-hidden="true" />
                    </button>
                    <button
                        type="button"
                        aria-pressed={view === "list"}
                        aria-label="List view"
                        title="List view"
                        onClick={() => chooseView("list")}
                    >
                        <IconList size={16} aria-hidden="true" />
                    </button>
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
                                // Age categories and sections come off one at a time
                                f.field === "age" || f.field === "section"
                                    ? setFilter(f.field, filters[f.field].filter((x) => x !== f.id))
                                    : setFilter(f.field, NO_FILTERS[f.field])
                            }
                            aria-label={`Remove filter: ${f.label}`}
                        >
                            {f.label}
                            <IconX size={14} aria-hidden="true" />
                        </button>
                    ))}
                    {/* Clear All: the Filters panel's clear icon, in a pink
                        circle the chips' height */}
                    <button
                        type="button"
                        className="ShowPage-clearChips"
                        onClick={clearFilters}
                        aria-label="Clear All"
                        title="Clear All"
                    >
                        <IconFilterOff size={15} aria-hidden="true" />
                    </button>
                </div>
            )}
            {/* Read out by screen readers when the results change */}
            <p className="visually-hidden" role="status">
                Showing {visibleMonkeys.length}{" "}
                {visibleMonkeys.length === 1 ? "monkey" : "monkeys"}
            </p>
            {visibleMonkeys.length === 0 ? (
                <div className="ShowPage-empty" inert={isAnyModalOpen}>
                    <IconSearchOff size={40} aria-hidden="true" />
                    <h2>No monkeys found</h2>
                    <p>
                        {searchValue.trim()
                            ? `Nothing matches “${searchValue.trim()}”`
                            : "Nothing matches"}
                        {activeFilters.length > 0 && (searchValue.trim() ? " with these filters" : " these filters")}.
                    </p>
                    <button type="button" className="ShowPage-emptyClear" onClick={clearSearchAndFilters}>
                        {searchValue.trim() && activeFilters.length > 0
                            ? "Clear Search and Filters"
                            : searchValue.trim()
                              ? "Clear Search"
                              : "Clear Filters"}
                    </button>
                </div>
            ) : view === "list" ? (
                <div className="MonkeyList" inert={isAnyModalOpen}>
                    <MonkeyListHeader />
                    {currentMonkeys.map((m) => (
                        <MonkeyRow
                            key={m.id ?? `${m.name}-${m.chip}-${placeName(m)}`}
                            onClick={() => openModal(m)}
                            name={m.name}
                            sex={m.sex}
                            year={m.year}
                            troop={placeName(m)}
                            inIntrocage={inIntrocage(m)}
                            chip={m.chip}
                            img={m.img[0]}
                        />
                    ))}
                </div>
            ) : (
                <div className="ShowPage-monkeys" inert={isAnyModalOpen}>
                    {currentMonkeys.map((m) => (
                        <MonkeyCard
                            key={m.id ?? `${m.name}-${m.chip}-${placeName(m)}`}
                            onClick={() => openModal(m)}
                            name={m.name}
                            sex={m.sex}
                            year={m.year}
                            troop={placeName(m)}
                            inIntrocage={inIntrocage(m)}
                            img={m.img[0]}
                        />
                    ))}
                </div>
            )}
            {hasMore && canAutoLoad && (
                <div ref={loadMoreRef} className="ShowPage-loadMore" aria-hidden="true"></div>
            )}
            {hasMore && !canAutoLoad && (
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
            </>
            )}
            {/* (the monkey list only: not the game or the enclosures) */}
            {navOutOfView && !offList && !isAnyModalOpen && (
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
            {/* Add Photos' photo picker: photos already taken (or, on most
                phones, a new one) */}
            <input
                ref={photoPickerRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={photosChosen}
                data-testid="add-photos-picker"
            />
            {quickPhotos && (
                <QuickPhotos
                    files={quickPhotos.files}
                    monkeys={monkeys}
                    current={quickPhotos.current}
                    place={quickPhotos.place}
                    recent={recentIds.current.map((id) => monkeys.find((m) => m.id === id)).filter(Boolean)}
                    onSaved={onMonkeySaved}
                    onOpenMonkey={(m) => {
                        setQuickPhotos(null);
                        openModal(m);
                    }}
                    onClose={() => setQuickPhotos(null)}
                />
            )}
            {editing && (
                <MonkeyForm
                    // key: a fresh form for each monkey
                    key={editing.monkey?.id ?? "new"}
                    monkey={editing.monkey}
                    troops={troops.filter((t) => t !== "All Troops")}
                    troopIds={troopIds}
                    enclosures={enclosures}
                    enclosuresLive={enclosuresLive}
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
