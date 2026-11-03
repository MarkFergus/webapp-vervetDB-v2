// Edit → Monitoring (admins): Condition Check and Notes for Monitoring, kept
// apart from the monkey (staff only), for the Troop Monitoring Notes
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MonkeyForm from "./MonkeyForm";
import { BUILT_IN_DATA, loadMonitoring, saveMonitoring, saveMonkey } from "./monkeyData";
import { useAuth } from "./auth";
import { STAFF } from "./testStaff";

vi.mock("./monkeyData", async (importOriginal) => ({
    ...(await importOriginal()),
    saveMonkey: vi.fn(),
    loadArrivalInfo: vi.fn().mockRejectedValue(new Error("none")),
    loadMonitoring: vi.fn(),
    saveMonitoring: vi.fn(),
}));
vi.mock("./auth", async (importOriginal) => ({ ...(await importOriginal()), useAuth: vi.fn() }));

const ADMIN = { ...STAFF, role: "admin", isEditor: true, isAdmin: true };
const EDITOR = { ...STAFF, role: "editor", isEditor: true, isAdmin: false };
// (a saved monkey: it has an id)
const NITA = { ...BUILT_IN_DATA.monkeys.find((m) => m.troop === "Goliath"), id: 7 };

const onSaved = vi.fn();
const edit = () =>
    render(
        <MonkeyForm
            monkey={NITA} troops={["Goliath"]} troopIds={{ Goliath: 1 }} enclosures={BUILT_IN_DATA.enclosures}
            enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}}
        />
    );
const monitoring = () => screen.getByRole("group", { name: "Monitoring" });

beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue(ADMIN);
    loadMonitoring.mockResolvedValue({ conditionCheck: false, notes: "", updatedByName: null, updatedAt: null });
    saveMonkey.mockImplementation(async (values) => ({ ...values, id: NITA.id, img: values.img }));
    saveMonitoring.mockResolvedValue({});
});

test("admins: a Monitoring part with Condition Check and Notes for Monitoring, as saved", async () => {
    loadMonitoring.mockResolvedValue({ conditionCheck: true, notes: "Old lady", updatedByName: "Sam", updatedAt: null });
    edit();
    await waitFor(() => expect(within(monitoring()).getByRole("checkbox", { name: "Priority Condition Check" })).toBeChecked());
    expect(within(monitoring()).getByRole("textbox", { name: "Notes for Monitoring" })).toHaveValue("Old lady");
});

test("saving: the monitoring goes with the monkey, only when it's changed", async () => {
    const user = userEvent.setup();
    edit();
    await user.click(await within(await screen.findByRole("group", { name: "Monitoring" })).findByRole("checkbox", { name: "Priority Condition Check" }));
    await user.type(within(monitoring()).getByRole("textbox", { name: "Notes for Monitoring" }), "Check she's eating ok");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveMonitoring).toHaveBeenCalledWith(NITA.id, { conditionCheck: true, notes: "Check she's eating ok" });
});

test("nothing changed: not saved again", async () => {
    const user = userEvent.setup();
    edit();
    await screen.findByRole("group", { name: "Monitoring" });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(saveMonitoring).not.toHaveBeenCalled();
});

test("editors see it too (monitoring-editors.sql)", async () => {
    useAuth.mockReturnValue(EDITOR);
    edit();
    expect(await screen.findByRole("group", { name: "Monitoring" })).toBeInTheDocument();
    expect(loadMonitoring).toHaveBeenCalledWith(NITA.id);
});

describe("Status (the Full Profile's Edit, admins): a field like the others; a new one goes to the Monkey Archive on Save", () => {
    const editWith = (onStatusUpdate, quick = false) =>
        render(
            <MonkeyForm
                monkey={NITA} troops={["Goliath"]} troopIds={{ Goliath: 1 }} enclosures={BUILT_IN_DATA.enclosures}
                enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}} quick={quick}
                onStatusUpdate={onStatusUpdate}
            />
        );

    test("In Sanctuary to start; choosing one shows what it means, its date and details; Save saves both", async () => {
        const user = userEvent.setup();
        const onStatusUpdate = vi.fn().mockResolvedValue();
        editWith(onStatusUpdate);
        const status = screen.getByRole("combobox", { name: "Status" });
        expect(status).toHaveDisplayValue("In Sanctuary");
        expect(screen.queryByText(/remove Nita from current records/)).toBeNull();
        await user.selectOptions(status, "missing");
        expect(
            screen.getByText(
                "This will remove " + NITA.name + " from current records. They can still be viewed and restored from the Monkey Archive."
            )
        ).toBeInTheDocument();
        // (in its own box: the day it's recorded (today), an optional Last Seen, and Details)
        const box = screen.getByRole("group", { name: "Status Update" });
        expect(within(box).getByLabelText("Date").value).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(within(box).getByLabelText("Last Seen (optional)")).toHaveValue("");
        // (the details are needed)
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.getByText("Please add the details: what happened.")).toBeInTheDocument();
        expect(saveMonkey).not.toHaveBeenCalled();
        await user.type(within(box).getByLabelText("Details"), "Not seen at monitoring for 3 weeks");
        await user.type(within(box).getByLabelText("Last Seen (optional)"), "2026-10-02");
        // (one warning only: shown on choosing; Save doesn't ask again)
        expect(screen.getAllByText(/from current records/)).toHaveLength(1);
        await user.click(screen.getByRole("button", { name: "Save" }));
        expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
        await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
        expect(saveMonkey).toHaveBeenCalled();
        const [monkey, values] = onStatusUpdate.mock.calls[0];
        expect(monkey.id).toBe(NITA.id);
        expect(values).toMatchObject({ status: "missing", details: "Last seen 2nd Oct 2026. Not seen at monitoring for 3 weeks" });
        // (archived instead: not "saved" back into the list)
        expect(onSaved).not.toHaveBeenCalled();
    });

    test("left In Sanctuary: a normal Save", async () => {
        const user = userEvent.setup();
        const onStatusUpdate = vi.fn();
        editWith(onStatusUpdate);
        await user.click(screen.getByRole("button", { name: "Save" }));
        await waitFor(() => expect(onSaved).toHaveBeenCalled());
        expect(onStatusUpdate).not.toHaveBeenCalled();
    });

    test("not for editors, nor in the pop-up's quick Edit", () => {
        const { unmount } = editWith(vi.fn(), true);
        expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
        unmount();
        useAuth.mockReturnValue(EDITOR);
        editWith(vi.fn());
        expect(screen.queryByRole("combobox", { name: "Status" })).toBeNull();
    });
});
