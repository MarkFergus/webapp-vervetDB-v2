import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MedsRecordsPage from "./MedsRecordsPage";
import { deleteVetVisit, loadVasectomies, loadVetVisits, saveVasectomy, saveVetVisit } from "./monkeyData";
import { RECORD_KINDS } from "./babyRecords";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    loadVetVisits: vi.fn(),
    saveVetVisit: vi.fn(),
    deleteVetVisit: vi.fn(),
    loadVasectomies: vi.fn(),
    saveVasectomy: vi.fn(),
}));

const THIS_YEAR = new Date().getFullYear();
const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const MONKEYS = [
    { id: 1, name: "Bruce", sex: "male", year: 2025, troop: "Goliath", enclosure: "Goliath", introcage: null, img: [], vasectomised: false },
    { id: 2, name: "Hermit", sex: "male", year: 2025, troop: "Goliath", enclosure: "Goliath", introcage: null, img: [], vasectomised: true },
    { id: 3, name: "Daisy", sex: "female", year: 2025, troop: "Goliath", enclosure: "Goliath", introcage: null, img: [] },
];
const STAFF = { userId: "u-1", isAdmin: false };
const VISIT = {
    id: 9,
    monkeyId: 1,
    date: `${THIS_YEAR}-02-03`,
    practice: "serala",
    practiceOther: "",
    reason: "assessment",
    details: "Teeth checked",
    loggedBy: "u-1",
    loggedByName: "Sam Smith",
};

const show = (kind) => {
    const user = userEvent.setup();
    render(<MedsRecordsPage kind={RECORD_KINDS[kind]} monkeys={MONKEYS} canEnter staff={STAFF} />);
    return { user };
};

beforeEach(() => {
    vi.clearAllMocks();
    loadVetVisits.mockResolvedValue([VISIT]);
    loadVasectomies.mockResolvedValue([]);
});

describe("Vet Visits", () => {
    test("this year's visits: the monkey, reason · practice, details and who", async () => {
        show("vet-visits");
        expect(loadVetVisits).toHaveBeenCalledWith(THIS_YEAR);
        const list = await screen.findByRole("list", { name: `Vet visits in ${THIS_YEAR}` });
        const row = within(list).getAllByRole("listitem")[0];
        expect(row).toHaveTextContent("Bruce");
        expect(row).toHaveTextContent("Assessment · Serala Animal Clinic");
        expect(row).toHaveTextContent("Teeth checked");
        expect(row).toHaveTextContent("Added by Sam Smith");
    });

    test("+ New Vet Visit: find the monkey, the date, practice, reason and details; saved", async () => {
        const { user } = show("vet-visits");
        await screen.findByRole("list", { name: `Vet visits in ${THIS_YEAR}` });
        await user.click(screen.getByRole("button", { name: "New Vet Visit" }));
        // (nothing chosen: each problem said)
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Please choose the monkey.")).toBeInTheDocument();
        expect(screen.getByText("Please choose the reason.")).toBeInTheDocument();
        expect(saveVetVisit).not.toHaveBeenCalled();

        await user.type(screen.getByRole("searchbox", { name: "Search monkeys" }), "dai");
        await user.click(screen.getByRole("button", { name: /Daisy/ }));
        await user.selectOptions(screen.getByLabelText("Vet Practice"), "Other");
        await user.type(screen.getByLabelText("Vet's Name"), "Hoedspruit Vets");
        await user.selectOptions(screen.getByLabelText("Reason"), "Check-Up");
        await user.type(screen.getByLabelText("Details"), "All good");
        saveVetVisit.mockResolvedValue({ ...VISIT, id: 10 });
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(saveVetVisit).toHaveBeenCalledWith(null, {
                monkeyId: 3,
                date: today(),
                practice: "other",
                practiceOther: "Hoedspruit Vets",
                reason: "check_up",
                details: "All good",
            })
        );
        // (the form closes, and the list loads again)
        await waitFor(() => expect(screen.queryByRole("heading", { name: "New Vet Visit" })).toBeNull());
        expect(loadVetVisits).toHaveBeenCalledTimes(2);
    });

    test("the hint says which Medical records it adds (a Vasectomy visit: the vasectomy too)", async () => {
        const { user } = show("vet-visits");
        await user.click(await screen.findByRole("button", { name: "New Vet Visit" }));
        expect(screen.getByText("A Vet Visit record will also be added to Medical records.")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Reason"), "Vasectomy");
        expect(
            screen.getByText("A Vet Visit and a Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes.")
        ).toBeInTheDocument();
    });

    test("Delete (their own): asks first", async () => {
        const { user } = show("vet-visits");
        await user.click(await screen.findByRole("button", { name: "Delete Bruce's vet visit" }));
        deleteVetVisit.mockResolvedValue();
        await user.click(within(screen.getByRole("dialog", { name: "Delete Bruce's vet visit?" })).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(deleteVetVisit).toHaveBeenCalledWith(9));
        await waitFor(() => expect(screen.getByText(`No vet visits in ${THIS_YEAR}.`)).toBeInTheDocument());
    });

    test("Edit: the form filled in, in its place; the vasectomy follows when it's one; saved", async () => {
        loadVetVisits.mockResolvedValue([{ ...VISIT, reason: "vasectomy" }]);
        const { user } = show("vet-visits");
        await user.click(await screen.findByRole("button", { name: "Edit Bruce's vet visit" }));
        expect(screen.getByRole("heading", { name: "Edit Bruce's Vet Visit" })).toBeInTheDocument();
        // (the monkey stays: no search)
        expect(screen.queryByRole("searchbox")).toBeNull();
        expect(screen.getByLabelText("Details")).toHaveValue("Teeth checked");
        expect(screen.getByText("Its Vasectomy and Medical records will be changed to match.")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Reason"), "Assessment");
        expect(screen.getByText("Its Vasectomy record will be removed from Medical records.")).toBeInTheDocument();
        saveVetVisit.mockResolvedValue({});
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(saveVetVisit).toHaveBeenCalledWith(9, {
                monkeyId: 1,
                date: VISIT.date,
                practice: "serala",
                practiceOther: "",
                reason: "assessment",
                details: "Teeth checked",
            })
        );
        await waitFor(() => expect(screen.queryByRole("heading", { name: /^Edit/ })).toBeNull());
    });

    test("an archived monkey's visit: their name and status (admins), else Archived Monkey", async () => {
        loadVetVisits.mockResolvedValue([
            { ...VISIT, id: 1, monkeyId: 50, monkey: { name: "Rerun", status: "missing" } },
            { ...VISIT, id: 2, monkeyId: 51, monkey: null },
        ]);
        show("vet-visits");
        const rows = within(await screen.findByRole("list", { name: `Vet visits in ${THIS_YEAR}` })).getAllByRole("listitem");
        expect(rows[0]).toHaveTextContent("RerunMissing");
        expect(rows[1]).toHaveTextContent("Archived Monkey");
    });

    test("someone else's: no Delete (not an admin)", async () => {
        loadVetVisits.mockResolvedValue([{ ...VISIT, loggedBy: "u-2" }]);
        show("vet-visits");
        await screen.findByRole("list", { name: `Vet visits in ${THIS_YEAR}` });
        expect(screen.queryByRole("button", { name: /^(Delete|Edit)/ })).toBeNull();
    });

    test("not run yet: said", async () => {
        loadVetVisits.mockRejectedValue(new Error("Please run supabase/vet-visits.sql first."));
        show("vet-visits");
        expect(await screen.findByRole("alert")).toHaveTextContent("vet-visits.sql");
    });
});

describe("Vasectomies", () => {
    test("+ New Vasectomy: boys only; On Site; saved", async () => {
        const { user } = show("vasectomies");
        await user.click(await screen.findByRole("button", { name: "New Vasectomy" }));
        await user.type(screen.getByRole("searchbox", { name: "Search boys" }), "dai");
        expect(screen.getByText("No boy found.")).toBeInTheDocument();
        await user.clear(screen.getByRole("searchbox", { name: "Search boys" }));
        await user.type(screen.getByRole("searchbox", { name: "Search boys" }), "bru");
        await user.click(screen.getByRole("button", { name: /Bruce/ }));
        await user.selectOptions(screen.getByLabelText("Vet"), "On Site");
        expect(screen.getByText("A Vasectomy record will also be added to Medical records, and Vasectomised? set to Yes.")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Vet"), "Tzaneen Animal Clinic");
        expect(
            screen.getByText("A Vasectomy and a Vet Visit record will also be added to Medical records, and Vasectomised? set to Yes.")
        ).toBeInTheDocument();
        saveVasectomy.mockResolvedValue({});
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(saveVasectomy).toHaveBeenCalledWith(null, { monkeyId: 1, date: today(), vet: "tzaneen", vetOther: "", details: "" })
        );
    });

    test("Edit: On Site after all → its vet visit is removed (said first)", async () => {
        loadVasectomies.mockResolvedValue([
            { id: 3, monkeyId: 1, date: "2026-03-01", vet: "serala", vetOther: "", details: "", vetVisitId: 8, loggedBy: "u-1", loggedByName: "Sam" },
        ]);
        const { user } = show("vasectomies");
        await user.click(await screen.findByRole("button", { name: "Edit Bruce's vasectomy" }));
        expect(screen.getByText("Its Vet Visit and Medical records will be changed to match.")).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText("Vet"), "On Site");
        expect(screen.getByText("Its Vet Visit will be removed, as it was done on site.")).toBeInTheDocument();
        saveVasectomy.mockResolvedValue({});
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() =>
            expect(saveVasectomy).toHaveBeenCalledWith(3, { monkeyId: 1, date: "2026-03-01", vet: "on_site", vetOther: "", details: "" })
        );
    });

    test("Log: newest first, where it was done", async () => {
        loadVasectomies.mockResolvedValue([
            { id: 2, monkeyId: 2, date: "2026-03-01", vet: "on_site", vetOther: "", details: "", loggedBy: "u-3", loggedByName: "Jo" },
        ]);
        show("vasectomies");
        const row = within(await screen.findByRole("list", { name: "Vasectomies" })).getAllByRole("listitem")[0];
        expect(row).toHaveTextContent("Hermit");
        expect(row).toHaveTextContent("On Site");
    });

    test("By Birth Year: each year's boys, vasectomised or not, and Copy for WhatsApp", async () => {
        const { user } = show("vasectomies");
        const writeText = vi.fn().mockResolvedValue();
        Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
        await user.click(await screen.findByRole("tab", { name: "By Birth Year" }));
        const year = screen.getByRole("region", { name: "Born 2025/26" });
        expect(year).toHaveTextContent("1 of 2 done");
        expect(within(year).getByLabelText("Vasectomised")).toBeInTheDocument();
        // (born 2025/26: not due until 1 July 2028)
        expect(year).toHaveTextContent("Not Due");
        expect(year).not.toHaveTextContent("Daisy");
        await user.click(within(year).getByRole("button", { name: "Copy" }));
        expect(writeText).toHaveBeenCalledWith("*Troop Vasectomies 2025/26*\n_Troop: 2 - Bandits: 0 · Done: 1_\nGoliath: Bruce, Hermit ✅");
        expect(within(year).getByRole("button", { name: "Copied!" })).toBeInTheDocument();
    });
});
