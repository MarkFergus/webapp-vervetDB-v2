import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { preparePhotosForPdf } from "./pdfPhotos";
import { pdf } from "@react-pdf/renderer";
import { currentBabySeason } from "./ages";
import { DEFAULT_FEEDING } from "./feeding";

// Signed in as staff: making PDFs is for staff
vi.mock("./auth", async (importOriginal) => (await import("./testStaff")).staffAuth(await importOriginal()));

// The simulated browser has no canvas, and real PDF building is slow, so
// both are replaced with stand-ins. These tests check the modal and flow.
vi.mock("./pdfPhotos", () => ({
    preparePhotosForPdf: vi.fn(async (monkeys, onProgress) => {
        monkeys.forEach((_, i) => onProgress(i + 1, monkeys.length));
        return monkeys.map((m) => ({ ...m, pdfPhoto: null }));
    }),
}));
vi.mock("@react-pdf/renderer", () => ({
    // Records what the book was made from (its sections, title…)
    pdf: vi.fn(() => ({ toBlob: async () => new Blob(["%PDF-"]) })),
    Font: { register: () => {}, registerHyphenationCallback: () => {} },
    StyleSheet: { create: (s) => s },
    Document: () => null,
    Page: () => null,
    View: () => null,
    Text: () => null,
    Image: () => null,
    Svg: () => null,
    Path: () => null,
}));

let downloads;
beforeEach(() => {
    downloads = [];
    URL.createObjectURL = vi.fn(() => "blob:test");
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
        function () {
            downloads.push(this.download);
        }
    );
});
afterEach(() => vi.restoreAllMocks());

function setup() {
    const user = userEvent.setup();
    const utils = render(<ShowPage />);
    // (the side rail's Create PDF)
    const openMenuItem = () => user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Create PDF" }));
    // Create PDF, then Troop Profile Book
    const openPdfModal = async () => {
        await openMenuItem();
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Profile Book");
    };
    const troopSelect = () => utils.container.querySelector("#troops");
    return { user, openMenuItem, openPdfModal, troopSelect, ...utils };
}

test("shows how many monkeys a troop's PDF will include, without a warning", async () => {
    const { user, openPdfModal, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "Goliath");
    await openPdfModal();

    const count = monkeysArr.filter((m) => m.troop === "Goliath").length;
    expect(
        within(screen.getByRole("dialog")).getByText(`${count} monkeys`, { exact: false })
    ).toBeInTheDocument();
    expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent(
        `Creates a formatted Profile Book for ${count} monkeys from Goliath Troop.`
    );
    expect(screen.queryByText(/can take several minutes/)).toBeNull();
});

test("creates the PDF from the shown monkeys and downloads it with a troop filename", async () => {
    const { user, openPdfModal, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "D&D");
    await openPdfModal();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));

    // Ready: nothing downloads until Save PDF is tapped (Firefox on Android
    // only allows a download straight after a tap)
    const save = await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });
    expect(screen.getByText(/Your Profile Book is ready/)).toBeInTheDocument();
    expect(save).toHaveFocus();
    expect(downloads).toHaveLength(0);
    await user.click(save);
    expect(downloads).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); // closes after saving
    expect(downloads[0]).toMatch(/^profile_book_D_D_\d{4}-\d{2}-\d{2}\.pdf$/);

    const sent = preparePhotosForPdf.mock.lastCall[0];
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => m.troop === "D&D")).toBe(true);

    // Modal closes once the download starts
    await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: "Create PDF" })).toBeNull()
    );
});

describe("choosing the troop", () => {
    const picker = () => screen.getByRole("combobox", { name: "Troop" });
    const madeWith = () => pdf.mock.lastCall[0].props;

    test("starts on the troop being looked at, otherwise the first troop", async () => {
        const { user, openPdfModal, troopSelect } = setup();
        await openPdfModal();
        expect(picker()).toHaveValue("Goliath"); // first troop
        await user.keyboard("{Escape}");

        await user.selectOptions(troopSelect(), "Skrow");
        await openPdfModal();
        expect(picker()).toHaveValue("Skrow");
    });

    test("single troops only, plus this season's Orphans/Babies", async () => {
        const { openPdfModal } = setup();
        await openPdfModal();
        const options = within(picker()).getAllByRole("option").map((o) => o.textContent);
        expect(options).not.toContain("All Troops");
        expect(options.at(-1)).toBe(`Orphans/Babies (${currentBabySeason()})`);
    });

    test("the book is the chosen troop, whatever the search box says", async () => {
        const { user, openPdfModal } = setup();
        await user.type(screen.getByPlaceholderText("Name or chip number"), "zzzz");
        await openPdfModal();
        await user.selectOptions(picker(), "Royal");
        const count = monkeysArr.filter((m) => m.troop === "Royal").length;
        expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent(
            `Creates a formatted Profile Book for ${count} monkeys from Royal Troop.`
        );

        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));
        await user.click(await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 }));
        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(/^profile_book_Royal_\d{4}-\d{2}-\d{2}\.pdf$/);
        const { sections, title, showTroop } = madeWith();
        expect(title).toBe("Royal Troop");
        expect(showTroop).toBe(false);
        const inBook = sections.flatMap((s) => s.monkeys);
        expect(inBook).toHaveLength(count);
        expect(inBook.every((m) => m.troop === "Royal")).toBe(true);
        // Adults first (females, then males), then the youngsters by season
        const titles = sections.map((s) => s.title);
        expect(titles.slice(0, 2)).toEqual(["Adult Females", "Adult Males"]);
        expect(titles.slice(2).every((t) => /^\d{4} Orphans\/Babies$/.test(t) || t === "Adults (Sex Unknown)")).toBe(true);
    });

    test("Orphans/Babies: this season's babies from every troop, with their troop shown", async () => {
        const { user, openPdfModal } = setup();
        await openPdfModal();
        await user.selectOptions(picker(), "Orphans/Babies");
        const season = currentBabySeason();
        const babies = monkeysArr.filter((m) => m.year && Number(m.year) >= season);
        expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent(
            `${babies.length} ${babies.length === 1 ? "monkey" : "monkeys"} from ${season} Orphans/Babies.`
        );
        if (babies.length === 0) return; // nothing to make yet this season

        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));
        await user.click(await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 }));
        expect(downloads).toHaveLength(1);
        expect(downloads[0]).toMatch(/^profile_book_Orphans_Babies_/);
        expect(madeWith()).toMatchObject({ title: `${season} Orphans/Babies`, showTroop: true });
    });
});

// Firefox on Android opens a downloaded PDF in its own viewer and reads the
// file a moment later: the download's address must still work then
test("a download's address stays usable for a few minutes, then is freed", async () => {
    const { downloadBlob, DOWNLOAD_KEEP_MS } = await import("./canvasHelpers");
    vi.useFakeTimers();
    try {
        downloadBlob(new Blob(["pdf"]), "profile_book.pdf");
        expect(downloads).toEqual(["profile_book.pdf"]);
        vi.advanceTimersByTime(60_000);
        expect(URL.revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(DOWNLOAD_KEEP_MS);
        expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
    } finally {
        vi.useRealTimers();
    }
});

test("choosing another troop after the book is ready goes back to Create PDF", async () => {
    const { user, openPdfModal, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "D&D");
    await openPdfModal();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));
    await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });

    await user.selectOptions(within(screen.getByRole("dialog")).getByRole("combobox", { name: "Troop" }), "Royal");
    expect(screen.queryByRole("button", { name: "Save PDF" })).toBeNull();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" })).toBeInTheDocument();
    expect(downloads).toHaveLength(0);
});

describe("Firefox's home-screen app on Android", () => {
    const FIREFOX_ANDROID = "Mozilla/5.0 (Android 15; Mobile; rv:156.0) Gecko/156.0 Firefox/156.0";
    let restore;
    beforeEach(() => {
        const realAgent = navigator.userAgent;
        Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => FIREFOX_ANDROID });
        window.matchMedia = (query) => ({ matches: query === "(display-mode: standalone)" });
        restore = () => {
            Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => realAgent });
            delete window.matchMedia;
        };
    });
    afterEach(() => restore());

    // A download link shows about:blank there; a new window works
    test("files open in a new window instead of downloading from a link", async () => {
        const { downloadBlob } = await import("./canvasHelpers");
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        downloadBlob(new Blob(["pdf"], { type: "application/pdf" }), "profile_book_James.pdf");
        expect(open).toHaveBeenCalledWith("blob:test", "_blank");
        expect(downloads).toHaveLength(0);
        // The file keeps its name, for browsers that use it
        expect(URL.createObjectURL.mock.lastCall[0].name).toBe("profile_book_James.pdf");
    });

    test("in a normal Firefox tab, the usual download", async () => {
        delete window.matchMedia; // not the installed app
        const { downloadBlob } = await import("./canvasHelpers");
        const open = vi.spyOn(window, "open").mockImplementation(() => null);
        downloadBlob(new Blob(["pdf"]), "profile_book_James.pdf");
        expect(open).not.toHaveBeenCalled();
        expect(downloads).toEqual(["profile_book_James.pdf"]);
    });
});

test("Create PDF: choose which PDF first; the troop picker only for a Profile Book", async () => {
    const { user, openMenuItem } = setup();
    await openMenuItem();
    expect(screen.getByRole("combobox", { name: "Document" })).toHaveValue("");
    expect(screen.queryByRole("combobox", { name: "Troop" })).toBeNull();
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" })).toBeDisabled();
    await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Profile Book");
    expect(screen.getByRole("combobox", { name: "Troop" })).toBeInTheDocument();
    // Closed and opened again: chosen afresh
    await user.click(screen.getByRole("button", { name: "Close" }));
    await openMenuItem();
    expect(screen.getByRole("combobox", { name: "Document" })).toHaveValue("");
});

describe("the Troop Monitoring Sheet", () => {
    test("the troop's monkeys (no Orphans/Babies to choose), saved as monitoring_sheet_<troop>_<date>.pdf", async () => {
        const { user, openMenuItem } = setup();
        await openMenuItem();
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Monitoring Sheet");
        const troop = screen.getByRole("combobox", { name: "Troop" });
        expect(within(troop).queryByRole("option", { name: /Orphans/ })).toBeNull();
        await user.selectOptions(troop, "D&D");
        const count = monkeysArr.filter((m) => m.troop === "D&D").length;
        expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent(
            `Creates a Troop Monitoring Sheet for ${count} monkeys from Dino & Daniel Troop.`
        );
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));
        const save = await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });
        expect(screen.getByText(/Your Troop Monitoring Sheet is ready/)).toBeInTheDocument();
        const { title, groups } = pdf.mock.lastCall[0].props;
        expect(title).toBe("Dino & Daniel Troop Monitoring");
        expect(groups.flatMap((g) => g.monkeys).every((m) => m.troop === "D&D")).toBe(true);
        expect(groups.flatMap((g) => g.monkeys)).toHaveLength(count);
        await user.click(save);
        expect(downloads[0]).toMatch(/^monitoring_sheet_D_D_\d{4}-\d{2}-\d{2}\.pdf$/);
    });

    test("the Bandits (a wild troop, not monitored) aren't offered; the Profile Book still has them", async () => {
        const user = userEvent.setup();
        render(<ShowPage troops={["All Troops", "Goliath", "Bandits"]} />);
        await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Create PDF" }));
        const options = () => within(screen.getByRole("combobox", { name: "Troop" })).getAllByRole("option").map((o) => o.value);
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Profile Book");
        expect(options()).toContain("Bandits");
        await user.selectOptions(screen.getByRole("combobox", { name: "Troop" }), "Bandits");
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Monitoring Sheet");
        expect(options()).toEqual(["Goliath"]);
        expect(screen.getByRole("combobox", { name: "Troop" })).toHaveValue("Goliath");
    });

    test("from Orphans/Babies in the Profile Book: starts on the first troop instead", async () => {
        const { user, openPdfModal } = setup();
        await openPdfModal();
        await user.selectOptions(screen.getByRole("combobox", { name: "Troop" }), "Orphans/Babies (" + currentBabySeason() + ")");
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "Troop Monitoring Sheet");
        expect(screen.getByRole("combobox", { name: "Troop" }).value).not.toMatch(/babies/i);
    });
});

describe("the AM Plates List", () => {
    const fed = (name, introcage, enclosure, feeding = {}) => ({
        ...monkeysArr.find((m) => m.name === name), troop: null, introcage, introcageType: "introcage", enclosure,
        feeding: { ...DEFAULT_FEEDING, ...feeding },
    });

    test("Create PDF → AM Plates List: no plates recorded yet (the built-in copy has no feeding)", async () => {
        const { user, openMenuItem } = setup();
        await openMenuItem();
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "AM Plates List");
        expect(screen.queryByRole("combobox", { name: "Troop" })).toBeNull();
        expect(screen.getByText(/No AM plates recorded yet/)).toBeInTheDocument();
        expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" })).toBeDisabled();
    });

    test("made from the introcage monkeys' feeding, and saved as am_plates_<date>.pdf", async () => {
        const user = userEvent.setup();
        const monkeys = [
            ...monkeysArr.filter((m) => !["Aroha", "Hocus"].includes(m.name)),
            fed("Aroha", "H&B C1", "H&B", { amPlates: 2 }),
            fed("Hocus", "H&B C1", "H&B", { fedBy: "sickbay" }),
        ];
        render(<ShowPage monkeys={monkeys} />);
        await user.click(within(screen.getByRole("complementary", { name: "Main menu" })).getByRole("button", { name: "Create PDF" }));
        await user.selectOptions(screen.getByRole("combobox", { name: "Document" }), "AM Plates List");
        expect(document.querySelector(".ModalPDF-subdetails")).toHaveTextContent(
            "Creates an AM Plates List for 1 monkey from 1 introcage."
        );
        await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create PDF" }));
        const save = await screen.findByRole("button", { name: "Save PDF" }, { timeout: 5000 });
        expect(screen.getByText(/Your AM Plates List is ready/)).toBeInTheDocument();
        const { groups, date } = pdf.mock.lastCall[0].props;
        expect(date).toMatch(/^\d{1,2}(st|nd|rd|th) [A-Z][a-z]{2} \d{4}$/);
        expect(groups.find((g) => g.title === "Bottom Section")).toMatchObject({
            plates: 2, rows: ["Aroha x2"], sickbay: "Hocus",
        });
        await user.click(save);
        expect(downloads[0]).toMatch(/^am_plates_\d{4}-\d{2}-\d{2}\.pdf$/);
    });
});
