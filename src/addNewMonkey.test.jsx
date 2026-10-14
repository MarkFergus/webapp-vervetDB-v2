// Add New Monkey: a New Arrival or Other, and a new arrival's Arrival Info
// (staff only, in place of the Bio while it lives in a care unit)
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonkeyForm from "./MonkeyForm";
import Modal from "./Modal";
import { BUILT_IN_DATA, loadArrivalInfo, saveArrivalInfo, saveMonkey } from "./monkeyData";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    saveMonkey: vi.fn(),
    loadArrivalInfo: vi.fn(),
    saveArrivalInfo: vi.fn(),
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
});

describe("New Arrival (the first choice)", () => {
    test("Care Unit and Location, Sex and Birth year; no Chip; Arrival Info instead of Bio", async () => {
        add();
        expect(kind("New Arrival")).toHaveAttribute("aria-pressed", "true");
        expect(field("Care Unit")).toBeInTheDocument();
        expect(field("Location")).toBeInTheDocument();
        expect(field("Sex")).toBeInTheDocument();
        expect(field("Birth year")).toBeInTheDocument();
        expect(screen.queryByLabelText("Chip")).not.toBeInTheDocument();
        expect(await screen.findByLabelText(/Arrival Info/)).toBeInTheDocument();
        expect(screen.queryByLabelText("Bio")).not.toBeInTheDocument();
        // Features stay: any identification marks matter if it escapes
        expect(field("Distinctive features")).toBeInTheDocument();
        // The Care Unit list has just the care units (the rest are under Other)
        expect(within(field("Care Unit")).getAllByRole("option").map((o) => o.textContent))
            .toEqual(["Choose…", "Baby Care", "Quarantine", "Sickbay Care Unit"]);
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

    test("in a care unit: Arrival Info in place of the Bio", async () => {
        loadArrivalInfo.mockResolvedValue("Arrived 3 Oct");
        edit({ ...base, introcage: "Quarantine", introcageId: QUARANTINE_AREA.id, introcageType: "area" });
        const box = await screen.findByLabelText(/Arrival Info/);
        await waitFor(() => expect(box).toHaveValue("Arrived 3 Oct"));
        expect(screen.queryByLabelText("Bio")).not.toBeInTheDocument();
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
    const open = (monkey, staff) =>
        render(<Modal isModalOpen monkey={monkey} onClose={() => {}} handlePrevNext={() => {}} staff={staff} />);
    const STAFF = { canSee: true, canAdd: false, userId: "u1", isAdmin: false };

    test("staff see a new arrival's Arrival Info in place of its Bio", async () => {
        loadArrivalInfo.mockResolvedValue("Found by Sam Smith\nBrought in on the 3rd");
        open(RESCUE, STAFF);
        expect(await screen.findByText("Arrival Info")).toBeInTheDocument();
        expect(screen.getByText(/Found by Sam Smith/)).toBeInTheDocument();
        expect(screen.queryByText("Bio")).not.toBeInTheDocument();
    });

    test("visitors (or a rescue moved to a troop) just see the Bio, and nothing is loaded for them", () => {
        open(RESCUE, null);
        expect(screen.getByText("Bio")).toBeInTheDocument();
        expect(screen.queryByText("Arrival Info")).not.toBeInTheDocument();
        expect(loadArrivalInfo).not.toHaveBeenCalled();
    });

    test("a monkey in a troop enclosure shows its Bio even for staff", () => {
        open({ ...RESCUE, introcage: null, introcageType: null, troop: "Goliath", enclosure: "Goliath" }, STAFF);
        expect(screen.getByText("Bio")).toBeInTheDocument();
        expect(loadArrivalInfo).not.toHaveBeenCalled();
    });
});
