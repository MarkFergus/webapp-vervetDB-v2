// In Sickbay: the pop-up's Move to Sickbay / Return buttons, and the badges
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import MonkeyCard from "./MonkeyCard";
import MonkeyRow from "./MonkeyRow";
import { DEFAULT_FEEDING } from "./feeding";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";
import enclosuresArr from "./enclosuresArr";
import { introcageMonkeys, isNewArrival, monkeyCount } from "./enclosures";

const MONKEY = {
    id: 1, name: "Nita", sex: "female", chip: "123", troop: null, introcage: "Goliath A", introcageType: "introcage",
    enclosure: "Goliath", year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "", feeding: DEFAULT_FEEDING, inSickbay: false,
};

const open = (monkey, onWhereabouts) =>
    render(<Modal isModalOpen monkey={monkey} onClose={() => {}} handlePrevNext={() => {}} onWhereabouts={onWhereabouts} />);
const quickActions = () => userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));

describe("the pop-up's Sickbay button", () => {
    test.each([
        ["Sickbay A", "Sickbay"],
        ["Quarantine A", "Quarantine"],
        ["Baby Care A", "Baby Care"],
    ])("isn't offered to a new arrival in a care unit (%s)", async (introcage, enclosure) => {
        open({ ...MONKEY, introcage, introcageType: "area", enclosure }, vi.fn());
        // (nothing else to do there, so no Quick Actions at all)
        expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
    });

    test("Move to Sickbay asks the date (today) and a note, then saves", async () => {
        const onWhereabouts = vi.fn().mockResolvedValue();
        open(MONKEY, onWhereabouts);
        // (folded away until Quick Actions is opened)
        expect(screen.queryByRole("button", { name: "Move to Sickbay" })).not.toBeInTheDocument();
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Move to Sickbay" }));
        expect(screen.getByLabelText("Date Moved")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Reason (optional)"), "leg wound");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(onWhereabouts).toHaveBeenCalledTimes(1));
        const [monkey, details] = onWhereabouts.mock.calls[0];
        expect(monkey.id).toBe(1);
        expect(details).toEqual({ at: "sickbay", since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), note: "leg wound" });
    });

    test("in Sickbay: a badge, the since date and note, and Return to Introcage", async () => {
        const onWhereabouts = vi.fn().mockResolvedValue();
        open({ ...MONKEY, inSickbay: true, sickbaySince: "2026-10-11", sickbayNote: "leg wound" }, onWhereabouts);
        expect(screen.getByText("In Sickbay", { selector: "li" })).toBeInTheDocument();
        expect(screen.getByText("Since 11th Oct 2026 · leg wound")).toBeInTheDocument();
        expect(screen.getByText("Fed by Sickbay while in Sickbay")).toBeInTheDocument();
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Return to Introcage" }));
        // (a check first: green Confirm)
        expect(screen.getByText("Return Nita to Goliath A?")).toBeInTheDocument();
        // ...with the move's date and reason, like every move (its Movement record)
        fireEvent.change(screen.getByLabelText("Date Moved"), { target: { value: "2026-10-20" } });
        await userEvent.type(screen.getByLabelText("Reason (optional)"), "wound healed");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() =>
            expect(onWhereabouts).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { at: "home", since: "2026-10-20", note: "wound healed" })
        );
    });

    test("a troop monkey returns to its Troop", async () => {
        open({ ...MONKEY, introcage: null, introcageType: null, troop: "Goliath", feeding: undefined, inSickbay: true }, vi.fn());
        await quickActions();
        expect(screen.getByRole("button", { name: "Return to Troop" })).toBeInTheDocument();
    });

    test("a failed save says so", async () => {
        const onWhereabouts = vi.fn().mockRejectedValue(new Error("Couldn't save right now."));
        open({ ...MONKEY, inSickbay: true }, onWhereabouts);
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Return to Introcage" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save right now.");
    });

    test("not in Sickbay: nothing on the record says so", () => {
        open(MONKEY, vi.fn());
        expect(screen.queryByText(/Not in Sickbay/)).not.toBeInTheDocument();
        expect(screen.queryByRole("heading", { name: "Sickbay" })).not.toBeInTheDocument();
    });

    test("no button for visitors (but the badge still shows)", () => {
        open({ ...MONKEY, inSickbay: true }, undefined);
        expect(screen.queryByRole("button", { name: /Quick Actions|Sickbay|Return/ })).not.toBeInTheDocument();
        expect(screen.getByText("In Sickbay", { selector: "li" })).toBeInTheDocument();
    });
});

describe("the cards and rows", () => {
    test("a badge, and the screen reader label says it", () => {
        render(<MonkeyCard name="Nita" sex="female" year={2015} troop="Goliath A" inIntrocage inSickbay img="x.jpg" onClick={() => {}} />);
        expect(screen.getByRole("button", { name: /in Sickbay/ })).toBeInTheDocument();
        render(<MonkeyRow name="Rocio" sex="female" year={2015} troop="Goliath A" inIntrocage inSickbay chip="1" img="x.jpg" onClick={() => {}} />);
        expect(screen.getByRole("button", { name: /Rocio.*in Sickbay/ })).toBeInTheDocument();
    });
});

describe("Sickbay's list (the care unit)", () => {
    const unit = enclosuresArr.find((e) => e.name === "Sickbay" && e.type === "care_unit");
    const goliath = enclosuresArr.find((e) => e.name === "Goliath" && e.type === "troop");
    const at = (name, extra) => ({ ...MONKEY, id: name.length * 100 + name.charCodeAt(0), name, ...extra });
    const newcomer = at("Ziggy", { introcage: "Sickbay", introcageType: "area", enclosure: "Sickbay" });
    const visitor = at("Nita", { inSickbay: true, enclosure: "Goliath" });
    const home = at("Rocio", { enclosure: "Goliath" });
    const monkeys = [newcomer, visitor, home];

    test("its own new arrivals plus everyone in Sickbay for now, A–Z", () => {
        expect(introcageMonkeys(unit, monkeys).map((m) => m.name)).toEqual(["Nita", "Ziggy"]);
        expect(monkeyCount(unit, monkeys)).toBe(2);
    });

    test("a visitor is still counted at home too (the real number in Sickbay)", () => {
        expect(introcageMonkeys(goliath, monkeys).map((m) => m.name)).toEqual(["Nita", "Rocio"]);
    });

    test("only a care-unit area's monkeys are new arrivals", () => {
        expect(isNewArrival(newcomer)).toBe(true);
        expect(isNewArrival(visitor)).toBe(false);
    });

    test("a monkey in Sickbay that is already admitted there is listed once", () => {
        expect(introcageMonkeys(unit, [{ ...newcomer, inSickbay: true }])).toHaveLength(1);
    });
});

describe("Released (new rescues)", () => {
    const rescue = { ...MONKEY, introcage: "Quarantine", introcageType: "area", enclosure: "Quarantine", status: "sanctuary" };
    const openRelease = (monkey, onRelease) =>
        render(<Modal isModalOpen monkey={monkey} onClose={() => {}} handlePrevNext={() => {}} onRelease={onRelease} />);

    test("Released asks the date (today) and release details, then Confirm", async () => {
        const onRelease = vi.fn().mockResolvedValue();
        openRelease(rescue, onRelease);
        await userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Release to Wild" }));
        expect(screen.getByLabelText("Date Released")).toBeInTheDocument();
        await userEvent.type(screen.getByLabelText("Release Details"), "Back to the wild at Tzaneen");
        expect(screen.getByText(/will no longer appear in the app/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(onRelease).toHaveBeenCalledTimes(1));
        const [monkey, details] = onRelease.mock.calls[0];
        expect(monkey.id).toBe(1);
        expect(details).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), details: "Back to the wild at Tzaneen" });
    });

    test("Cancel closes it without saving", async () => {
        const onRelease = vi.fn();
        openRelease(rescue, onRelease);
        await userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Release to Wild" }));
        await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
        expect(onRelease).not.toHaveBeenCalled();
        expect(screen.queryByLabelText("Release Details")).not.toBeInTheDocument();
    });

    test("a failed save says so", async () => {
        const onRelease = vi.fn().mockRejectedValue(new Error("Couldn't save right now."));
        openRelease(rescue, onRelease);
        await userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));
        await userEvent.click(screen.getByRole("button", { name: "Release to Wild" }));
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save right now.");
    });

    test("no Released button unless it's given (new rescues, editors)", () => {
        openRelease(rescue, undefined);
        expect(screen.queryByRole("button", { name: "Quick Actions" })).not.toBeInTheDocument();
    });
});
