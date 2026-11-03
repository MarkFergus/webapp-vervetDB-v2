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

describe("Status (the Full Profile's Edit, admins): Status Update, to the Monkey Archive", () => {
    const editWith = (onStatusUpdate, quick = false) =>
        render(
            <MonkeyForm
                monkey={NITA} troops={["Goliath"]} troopIds={{ Goliath: 1 }} enclosures={BUILT_IN_DATA.enclosures}
                enclosuresLive onClose={() => {}} onSaved={onSaved} onDeleted={() => {}} quick={quick}
                onStatusUpdate={onStatusUpdate}
            />
        );

    test("last in the form; saves through onStatusUpdate (Confirm, then the warning's Confirm)", async () => {
        const user = userEvent.setup();
        const onStatusUpdate = vi.fn().mockResolvedValue();
        editWith(onStatusUpdate);
        const status = screen.getByRole("group", { name: "Status" });
        expect(status).toHaveTextContent("moves");
        await user.click(within(status).getByRole("button", { name: "Status Update" }));
        await user.selectOptions(within(status).getByLabelText("New Status"), "missing");
        await user.type(within(status).getByLabelText("Status Details"), "Not seen at monitoring for 3 weeks");
        await user.click(within(status).getByRole("button", { name: "Confirm" }));
        await user.click(within(status).getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(onStatusUpdate).toHaveBeenCalledTimes(1));
        const [monkey, values] = onStatusUpdate.mock.calls[0];
        expect(monkey.id).toBe(NITA.id);
        expect(values).toMatchObject({ status: "missing", details: "Not seen at monitoring for 3 weeks" });
        // (the monkey itself isn't saved by it)
        expect(saveMonkey).not.toHaveBeenCalled();
    });

    test("Cancel closes it without saving", async () => {
        const user = userEvent.setup();
        const onStatusUpdate = vi.fn();
        editWith(onStatusUpdate);
        const status = screen.getByRole("group", { name: "Status" });
        await user.click(within(status).getByRole("button", { name: "Status Update" }));
        await user.click(within(status).getByRole("button", { name: "Cancel" }));
        expect(onStatusUpdate).not.toHaveBeenCalled();
        expect(within(status).queryByLabelText("New Status")).toBeNull();
    });

    test("not for editors, nor in the pop-up's quick Edit", () => {
        const { unmount } = editWith(vi.fn(), true);
        expect(screen.queryByRole("group", { name: "Status" })).toBeNull();
        unmount();
        useAuth.mockReturnValue(EDITOR);
        editWith(vi.fn());
        expect(screen.queryByRole("group", { name: "Status" })).toBeNull();
    });
});
