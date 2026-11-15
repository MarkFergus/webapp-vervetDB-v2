// An archived monkey's Full Profile Edit (admins, the Monkey Archive): e.g. a
// missing Arrival Date filled in later, so Monkey Intake counts them. Their
// last home stays as it was, and they stay in the archive.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonkeyForm from "./MonkeyForm";
import AdminPage from "./AdminPage";
import { BUILT_IN_DATA, loadArchive, loadRecords, saveMonkey } from "./monkeyData";
import { useAuth } from "./auth";
import { STAFF } from "./testStaff";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    BUILT_IN_DATA: { ...(await importOriginal()).BUILT_IN_DATA, monkeys: (await import("./testMonkeys")).default },
    saveMonkey: vi.fn(),
    loadArchive: vi.fn(),
    loadRecords: vi.fn(),
    loadArrivalInfo: vi.fn().mockRejectedValue(new Error("none")),
    loadMonitoring: vi.fn().mockResolvedValue({ conditionCheck: false, notes: "", updatedByName: null, updatedAt: null }),
    loadInjuries: vi.fn().mockResolvedValue([]),
    loadIntegration: vi.fn().mockResolvedValue([]),
}));
vi.mock("./auth", async (importOriginal) => ({ ...(await importOriginal()), useAuth: vi.fn() }));

const ADMIN = { ...STAFF, role: "admin", isEditor: true, isAdmin: true };
const NITA = BUILT_IN_DATA.monkeys.find((m) => m.troop === "Goliath");
const MADDIE = {
    ...NITA,
    id: 40,
    name: "Maddie",
    status: "deceased",
    statusOn: "2026-03-01",
    statusDetails: "Passed away in Dreamland",
    statusChanges: [],
    arrivalDate: null,
    arrivalReason: null,
};

beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue(ADMIN);
    loadRecords.mockResolvedValue([]);
    saveMonkey.mockImplementation(async (values) => ({ ...values, id: MADDIE.id }));
});

describe("the form", () => {
    const edit = (onSaved = vi.fn()) =>
        render(
            <MonkeyForm
                monkey={MADDIE} troops={["Goliath"]} troopIds={{ Goliath: 1 }} enclosures={BUILT_IN_DATA.enclosures}
                enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
            />
        );

    test("no Enclosure or Home Location to choose; the Arrival Date can be filled in", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        edit(onSaved);
        expect(screen.queryByText("Enclosure")).toBeNull();
        expect(screen.queryByText("Home Location")).toBeNull();
        await user.type(screen.getByLabelText(/Arrival Date/), "2026-01-19");
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        const [values] = saveMonkey.mock.calls[0];
        expect(values).toMatchObject({ arrivalDate: "2026-01-19", troop: MADDIE.troop });
        // (no new home: no Movement step first)
        expect(screen.queryByText(/new home location/)).toBeNull();
    });

    test("with no home on record: still saves", async () => {
        const user = userEvent.setup();
        const onSaved = vi.fn();
        render(
            <MonkeyForm
                monkey={{ ...MADDIE, troop: null, enclosure: null }} troops={["Goliath"]} troopIds={{ Goliath: 1 }}
                enclosures={BUILT_IN_DATA.enclosures} enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
            />
        );
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(saveMonkey.mock.calls[0][0].troop).toBeNull();
    });
});

describe("their page in the Monkey Archive", () => {
    test("Edit (admins) opens their Full Profile Edit; a save loads the archive again", async () => {
        loadArchive.mockResolvedValue([MADDIE]);
        const onEdit = vi.fn();
        const user = userEvent.setup();
        const { rerender } = render(<AdminPage route="admin/archive/maddie-40" staff={{ canSee: true }} onEdit={onEdit} />);
        await user.click(await screen.findByTitle("Edit"));
        expect(onEdit).toHaveBeenCalledWith(MADDIE);
        rerender(<AdminPage route="admin/archive/maddie-40" staff={{ canSee: true }} onEdit={onEdit} archiveVersion={1} />);
        await waitFor(() => expect(loadArchive).toHaveBeenCalledTimes(2));
    });
});
