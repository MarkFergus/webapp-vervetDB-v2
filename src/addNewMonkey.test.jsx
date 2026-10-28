// Add New Monkey: a New Arrival or Other, and a new arrival's Arrival Info
// (staff only, shown on the monkey's page; it takes the Bio's place when adding one), with the Bio for any other monkey
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonkeyForm from "./MonkeyForm";
import Modal from "./Modal";
import MonkeyPage from "./MonkeyPage";
import { BUILT_IN_DATA, arrivalDetailsAvailable, loadArrivalInfo, saveArrivalInfo, saveMonkey } from "./monkeyData";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    saveMonkey: vi.fn(),
    loadArrivalInfo: vi.fn(),
    saveArrivalInfo: vi.fn(),
    // (the database has Arrival Date and Reason: arrival-details.sql; off
    // unless a test says)
    arrivalDetailsAvailable: vi.fn(),
}));

const TROOPS = ["Goliath", "Bandits"];
const TROOP_IDS = { Goliath: 1, Bandits: 2 };
const byKind = (type, name) => BUILT_IN_DATA.enclosures.find((e) => e.type === type && e.name === name);
const QUARANTINE = byKind("care_unit", "Quarantine");
const QUARANTINE_AREA = byKind("area", "Quarantine");

const onSaved = vi.fn();
const add = (troops = TROOPS) =>
    render(
        <MonkeyForm
            monkey={null} troops={troops} troopIds={TROOP_IDS} enclosures={BUILT_IN_DATA.enclosures}
            enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
        />
    );
const field = (label) => screen.getByLabelText(label, { exact: false });
const kind = (name) => within(screen.getByRole("group", { name: "Type" })).getByRole("button", { name });

beforeEach(() => {
    vi.clearAllMocks();
    loadArrivalInfo.mockResolvedValue("");
    saveMonkey.mockImplementation(async (values) => ({ ...values, id: 500, img: values.img }));
    saveArrivalInfo.mockResolvedValue();
    arrivalDetailsAvailable.mockReturnValue(false);
});

describe("New Arrival (the first choice)", () => {
    test("Care Unit and Location, Sex and Birth year; no Chip; the Arrival Info, no Bio", async () => {
        add();
        expect(kind("New Arrival")).toHaveAttribute("aria-pressed", "true");
        expect(field("Care Unit")).toBeInTheDocument();
        expect(field("Location")).toBeInTheDocument();
        expect(field("Sex")).toBeInTheDocument();
        expect(field("Birth year")).toBeInTheDocument();
        expect(screen.queryByLabelText("Chip")).not.toBeInTheDocument();
        expect(await screen.findByLabelText(/Arrival Info/)).toBeInTheDocument();
        // (the Arrival Info is all that's needed: the Bio comes later, in Edit)
        expect(screen.queryByLabelText("Bio")).not.toBeInTheDocument();
        // Features stay: any identification marks matter if it escapes
        expect(field("Distinctive features")).toBeInTheDocument();
        // The Care Unit list has just the care units (the rest are under Other)
        expect(within(field("Care Unit")).getAllByRole("option").map((o) => o.textContent))
            .toEqual(["Choose…", "Baby Care", "Quarantine", "Sickbay"]);
    });

    test("saved as No Chip, with its Arrival Info kept apart", async () => {
        const user = userEvent.setup();
        add();
        await screen.findByLabelText(/Arrival Info/);
        await user.type(field("Name"), "Rescue One");
        await user.selectOptions(field("Care Unit"), `enclosure:${QUARANTINE.id}`);
        await user.type(screen.getByLabelText(/Arrival Info/), "Found by Sam Smith near the road");
        await user.click(screen.getByRole("button", { name: "Add monkey" }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        const [values] = saveMonkey.mock.calls[0];
        expect(values).toMatchObject({ name: "Rescue One", chip: "", troop: null, introcageId: QUARANTINE_AREA.id, bio: "" });
        await waitFor(() => expect(saveArrivalInfo).toHaveBeenCalledWith(500, "Found by Sam Smith near the road"));
        expect(onSaved).toHaveBeenCalled();
    });

    test("without Arrival Info in the database (or not staff): the Bio, as before", async () => {
        loadArrivalInfo.mockRejectedValue({ code: "42P01" });
        add();
        await waitFor(() => expect(loadArrivalInfo).toHaveBeenCalled());
        expect(screen.getByLabelText("Bio")).toBeInTheDocument();
        expect(screen.queryByLabelText(/Arrival Info/)).not.toBeInTheDocument();
    });
});

describe("a new arrival's Arrival Date and Arrival Reason", () => {
    const today = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    beforeEach(() => arrivalDetailsAvailable.mockReturnValue(true));

    test("the hint, then the date (today to start with) and the reasons", () => {
        add();
        expect(screen.getByText("New arrivals start in a care unit. For adding sanctuary monkeys, select Other at the top.")).toBeInTheDocument();
        expect(field("Arrival Date")).toHaveValue(today());
        expect(within(field("Arrival Reason")).getAllByRole("option").map((o) => o.textContent))
            .toEqual(["Choose…", "Orphaned", "Injured", "Confiscated", "Surrendered"]);
    });

    test("both needed; then saved with the monkey", async () => {
        const user = userEvent.setup();
        add();
        await user.type(field("Name"), "Rescue Two");
        await user.selectOptions(field("Care Unit"), `enclosure:${QUARANTINE.id}`);
        await user.clear(field("Arrival Date"));
        await user.click(screen.getByRole("button", { name: "Add monkey" }));
        expect(screen.getByText("Please enter the arrival date (not in the future).")).toBeInTheDocument();
        expect(screen.getByText("Please choose the arrival reason.")).toBeInTheDocument();
        expect(saveMonkey).not.toHaveBeenCalled();
        await user.type(field("Arrival Date"), "2026-10-20");
        await user.selectOptions(field("Arrival Reason"), "orphaned");
        await user.click(screen.getByRole("button", { name: "Add monkey" }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveMonkey.mock.calls[0][0]).toMatchObject({ arrivalDate: "2026-10-20", arrivalReason: "orphaned" });
    });

    test("not for Other (nor back again: today once more)", async () => {
        const user = userEvent.setup();
        add();
        await user.click(kind("Other"));
        expect(screen.queryByLabelText(/Arrival Date/)).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Arrival Reason/)).not.toBeInTheDocument();
        await user.click(kind("New Arrival"));
        expect(field("Arrival Date")).toHaveValue(today());
    });

    const editMonkey = (extra) =>
        render(
            <MonkeyForm
                monkey={{ id: 7, name: "Old Timer", sex: "female", chip: "", troop: "Goliath", introcage: null, year: 2010,
                    img: [], bio: "", desc: "", ...extra }}
                troops={TROOPS} troopIds={TROOP_IDS} enclosures={BUILT_IN_DATA.enclosures}
                enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
            />
        );

    test("in Edit: any monkey, and either can stay blank (not recorded)", async () => {
        const user = userEvent.setup();
        editMonkey({ arrivalDate: null, arrivalReason: null });
        expect(field("Arrival Date")).toHaveValue("");
        expect(field("Arrival Reason")).toHaveValue("");
        expect(within(field("Arrival Reason")).getAllByRole("option")[0]).toHaveTextContent("Not recorded");
        expect(field("Arrival Date").closest("label")).not.toHaveTextContent("(required)");
        expect(field("Arrival Reason").closest("label")).not.toHaveTextContent("(required)");
        await user.selectOptions(field("Arrival Reason"), "injured");
        await user.click(screen.getByRole("button", { name: /Save/ }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveMonkey.mock.calls[0][0]).toMatchObject({ arrivalDate: "", arrivalReason: "injured" });
    });

    test("in Edit: its saved date and reason, to change", async () => {
        const user = userEvent.setup();
        editMonkey({ arrivalDate: "2019-03-02", arrivalReason: "orphaned" });
        expect(field("Arrival Date")).toHaveValue("2019-03-02");
        expect(field("Arrival Reason")).toHaveValue("orphaned");
        await user.selectOptions(field("Arrival Reason"), "surrendered");
        await user.click(screen.getByRole("button", { name: /Save/ }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveMonkey.mock.calls[0][0]).toMatchObject({ arrivalDate: "2019-03-02", arrivalReason: "surrendered" });
    });

    test("in Edit, before the database has them: not there", () => {
        editMonkey({});
        expect(screen.queryByLabelText(/Arrival Date/)).not.toBeInTheDocument();
    });
});

describe("Other", () => {
    test("any enclosure and location; everything else as is (chip and bio too)", async () => {
        const user = userEvent.setup();
        add();
        await user.click(kind("Other"));
        expect(kind("Other")).toHaveAttribute("aria-pressed", "true");
        expect(field("Enclosure")).toBeEnabled();
        expect(field("Enclosure")).toHaveValue("");
        const offered = within(field("Enclosure")).getAllByRole("option").map((o) => o.textContent);
        // troops (the Bandits too), blocks and care units
        expect(offered).toEqual(expect.arrayContaining(["Goliath", "Bandits", "Quarantine"]));
        expect(screen.getByLabelText("Chip")).toBeInTheDocument();
        expect(screen.getByLabelText("Bio")).toBeInTheDocument();
        expect(screen.queryByLabelText(/Arrival Info/)).not.toBeInTheDocument();
    });

    test("saved in the Bandits troop", async () => {
        const user = userEvent.setup();
        add();
        await user.click(kind("Other"));
        await user.type(field("Name"), "Wild One");
        await user.selectOptions(field("Enclosure"), "Bandits");
        expect(field("Location")).toHaveDisplayValue("Bandits Troop");
        await user.click(screen.getByRole("button", { name: "Add monkey" }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveMonkey.mock.calls[0][0]).toMatchObject({ name: "Wild One", troop: "Bandits", introcage: null });
        expect(saveArrivalInfo).not.toHaveBeenCalled();
    });

    test("saved in a troop", async () => {
        const user = userEvent.setup();
        add();
        await user.click(kind("Other"));
        await user.type(field("Name"), "Late Record");
        await user.selectOptions(field("Enclosure"), "Goliath");
        await user.click(screen.getByRole("button", { name: "Add monkey" }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveMonkey.mock.calls[0][0]).toMatchObject({ name: "Late Record", troop: "Goliath" });
    });

    test("going back to New Arrival starts the care unit choice again", async () => {
        const user = userEvent.setup();
        add();
        await user.click(kind("Other"));
        await user.selectOptions(field("Enclosure"), "Goliath");
        await user.click(kind("New Arrival"));
        expect(field("Care Unit")).toBeEnabled();
        expect(field("Care Unit")).toHaveValue("");
        expect(screen.queryByLabelText("Chip")).not.toBeInTheDocument();
    });
});

test("the choice is there without a Bandits troop too", () => {
    add(["Goliath"]);
    expect(screen.getByRole("group", { name: "Type" })).toBeInTheDocument();
});

describe("editing", () => {
    const edit = (monkey) =>
        render(
            <MonkeyForm
                monkey={monkey} troops={TROOPS} troopIds={TROOP_IDS} enclosures={BUILT_IN_DATA.enclosures}
                enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
            />
        );
    const base = {
        id: 12, name: "Pip", sex: "female", chip: "", year: 2020, img: [], bio: "A bio", desc: "", troop: null,
        enclosure: "Quarantine",
    };

    test("in a care unit: the Bio and the Arrival Info", async () => {
        loadArrivalInfo.mockResolvedValue("Arrived 3 Oct");
        edit({ ...base, introcage: "Quarantine", introcageId: QUARANTINE_AREA.id, introcageType: "area" });
        const box = await screen.findByLabelText(/Arrival Info/);
        await waitFor(() => expect(box).toHaveValue("Arrived 3 Oct"));
        expect(screen.getByLabelText("Bio")).toBeInTheDocument();
    });

    test("in a troop enclosure: the Bio, and the Arrival Info kept on record", async () => {
        loadArrivalInfo.mockResolvedValue("Arrived 3 Oct");
        edit({ ...base, troop: "Goliath", enclosure: "Goliath", introcage: null, introcageId: null, introcageType: null });
        const box = await screen.findByLabelText(/Arrival Info/);
        await waitFor(() => expect(box).toHaveValue("Arrived 3 Oct"));
        expect(screen.getByLabelText("Bio")).toHaveValue("A bio");
    });

    test("changing the Arrival Info saves it; leaving it alone doesn't", async () => {
        const user = userEvent.setup();
        loadArrivalInfo.mockResolvedValue("Arrived 3 Oct");
        saveMonkey.mockImplementation(async (values, _ids, id) => ({ ...values, id, img: values.img }));
        edit({ ...base, introcage: "Quarantine", introcageId: QUARANTINE_AREA.id, introcageType: "area" });
        const box = await screen.findByLabelText(/Arrival Info/);
        await waitFor(() => expect(box).toHaveValue("Arrived 3 Oct"));
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(saveMonkey).toHaveBeenCalledTimes(1));
        expect(saveArrivalInfo).not.toHaveBeenCalled();
    });
});

describe("the pop-up", () => {
    const RESCUE = {
        id: 12, name: "Pip", sex: "female", chip: "", year: 2020, img: ["x.jpg"], bio: "A bio", desc: "",
        troop: null, introcage: "Quarantine", introcageType: "area", enclosure: "Quarantine",
    };
    const STAFF = { canSee: true, canAdd: false, userId: "u1", isAdmin: false };

    test("shows the Bio, even for staff and new arrivals: the Arrival Info is on the monkey's page", () => {
        render(<Modal isModalOpen monkey={RESCUE} onClose={() => {}} handlePrevNext={() => {}} staff={STAFF} />);
        expect(screen.getByText("Bio")).toBeInTheDocument();
        expect(screen.queryByText("Arrival Info")).not.toBeInTheDocument();
        expect(loadArrivalInfo).not.toHaveBeenCalled();
    });
});

test("the monkey's page: its Arrival Date and Reason (or Not recorded)", () => {
    const rescue = BUILT_IN_DATA.monkeys[0];
    const { unmount } = render(<MonkeyPage monkey={{ ...rescue, arrivalDate: "2026-10-20", arrivalReason: "confiscated" }} staff={null} />);
    expect(screen.getByText("Arrival Date").closest("div")).toHaveTextContent("20th Oct 2026");
    expect(screen.getByText("Arrival Reason").closest("div")).toHaveTextContent("Confiscated");
    unmount();
    render(<MonkeyPage monkey={{ ...rescue, arrivalDate: null, arrivalReason: null }} staff={null} />);
    expect(screen.getByText("Arrival Date").closest("div")).toHaveTextContent("Not recorded");
    expect(screen.getByText("Arrival Reason").closest("div")).toHaveTextContent("Not recorded");
});

describe("the monkey's page", () => {
    const MONKEY = {
        id: 12, name: "Pip", sex: "female", chip: "", year: 2020, img: ["x.jpg"], bio: "A bio", desc: "",
        troop: "Goliath", introcage: null, introcageType: null, enclosure: "Goliath",
    };
    const STAFF = { canSee: true, canAdd: false, userId: "u1", isAdmin: false };

    // (its text box's heading: "Arrival Info", as in the form, inside the
    // Arrival Info part)
    const textHeading = () => document.querySelector(".MonkeyPage-arrivalText h3");

    test("staff see the Arrival Info text (any monkey, not just new arrivals)", async () => {
        loadArrivalInfo.mockResolvedValue("Found by Sam Smith\nBrought in on the 3rd");
        render(<MonkeyPage monkey={MONKEY} staff={STAFF} />);
        expect(await screen.findByText(/Found by Sam Smith/)).toBeInTheDocument();
        expect(textHeading()).toHaveTextContent("Arrival Info");
        expect(loadArrivalInfo).toHaveBeenCalledWith(12);
    });

    test("none yet: says so", async () => {
        loadArrivalInfo.mockResolvedValue("");
        render(<MonkeyPage monkey={MONKEY} staff={STAFF} />);
        expect(await screen.findByText("No arrival info yet.")).toBeInTheDocument();
    });

    test("saved in Edit (a new monkey object): loaded again, so the new text shows", async () => {
        loadArrivalInfo.mockResolvedValue("Found by Sam");
        const { rerender } = render(<MonkeyPage monkey={MONKEY} staff={STAFF} />);
        await screen.findByText("Found by Sam");
        loadArrivalInfo.mockResolvedValue("Found by Sam near the river");
        rerender(<MonkeyPage monkey={{ ...MONKEY }} staff={STAFF} />);
        expect(await screen.findByText("Found by Sam near the river")).toBeInTheDocument();
        expect(loadArrivalInfo).toHaveBeenCalledTimes(2);
    });

    test("visitors: no Arrival Info text, and nothing is loaded for them", () => {
        render(<MonkeyPage monkey={MONKEY} staff={null} />);
        expect(screen.getByRole("heading", { name: "Arrival Info" })).toBeInTheDocument();
        expect(textHeading()).toBeNull();
        expect(loadArrivalInfo).not.toHaveBeenCalled();
    });
});

test("the monkey's page: its age, as precise as its birth date allows", () => {
    const base = BUILT_IN_DATA.monkeys[0];
    const ago = (days) => {
        const d = new Date();
        d.setDate(d.getDate() - days);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    };
    const ageOf = (monkey) => {
        const { unmount } = render(<MonkeyPage monkey={monkey} staff={null} />);
        const text = screen.getByText("Age").closest("div").textContent;
        unmount();
        return text;
    };
    expect(ageOf({ ...base, birthDate: ago(3) })).toContain("3 days old");
    expect(ageOf({ ...base, birthDate: ago(21) })).toContain("3 weeks old");
    // Only a birth year: years, and "<1 year old" for this season's babies
    const season = new Date().getMonth() >= 9 ? new Date().getFullYear() : new Date().getFullYear() - 1;
    expect(ageOf({ ...base, birthDate: null, year: season })).toContain("<1 year old");
    expect(ageOf({ ...base, birthDate: null, year: season - 5 })).toContain("5 years old");
});
