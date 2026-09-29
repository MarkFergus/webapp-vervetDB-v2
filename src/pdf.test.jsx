import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import monkeysArr from "./monkeysArr";
import { preparePhotosForPdf } from "./pdfPhotos";

// The simulated browser has no canvas, and real PDF building is slow, so
// both are replaced with stand-ins. These tests check the modal and flow.
vi.mock("./pdfPhotos", () => ({
    preparePhotosForPdf: vi.fn(async (monkeys, onProgress) => {
        monkeys.forEach((_, i) => onProgress(i + 1, monkeys.length));
        return monkeys.map((m) => ({ ...m, pdfPhoto: null }));
    }),
}));
vi.mock("@react-pdf/renderer", () => ({
    pdf: () => ({ toBlob: async () => new Blob(["%PDF-"]) }),
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
    const openPdfModal = () =>
        user.click(utils.container.querySelector(".Nav-buttons button"));
    const troopSelect = () => utils.container.querySelector("#troops");
    return { user, openPdfModal, troopSelect, ...utils };
}

test("shows how many monkeys a troop's PDF will include, without a warning", async () => {
    const { user, openPdfModal, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "Goliath");
    await openPdfModal();

    const count = monkeysArr.filter((m) => m.troop === "Goliath").length;
    expect(
        screen.getByText(`${count} monkeys`, { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText(/from Goliath/)).toBeInTheDocument();
    expect(screen.queryByText(/can take several minutes/)).toBeNull();
});

test("warns before creating a PDF of all troops", async () => {
    const { openPdfModal } = setup();
    await openPdfModal();

    expect(
        screen.getByText(`${monkeysArr.length} monkeys`, { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByText(/can take several minutes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create PDF" })).toBeEnabled();
});

test("Create PDF is disabled when no monkeys match", async () => {
    const { user, openPdfModal } = setup();
    await user.type(
        screen.getByPlaceholderText("Name or chip number"),
        "zzzz"
    );
    await openPdfModal();

    expect(screen.getByText(/No monkeys match/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create PDF" })).toBeDisabled();
});

test("creates the PDF from the shown monkeys and downloads it with a troop filename", async () => {
    const { user, openPdfModal, troopSelect } = setup();
    await user.selectOptions(troopSelect(), "D&D");
    await openPdfModal();
    await user.click(screen.getByRole("button", { name: "Create PDF" }));

    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(downloads[0]).toMatch(/^profile_book_D_D_\d{4}-\d{2}-\d{2}\.pdf$/);

    const sent = preparePhotosForPdf.mock.lastCall[0];
    expect(sent.length).toBeGreaterThan(0);
    expect(sent.every((m) => m.troop === "D&D")).toBe(true);

    // Modal closes once the download starts
    await waitFor(() =>
        expect(screen.queryByText("Profile Book PDF")).toBeNull()
    );
});
