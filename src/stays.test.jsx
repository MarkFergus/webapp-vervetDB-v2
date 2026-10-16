// Introcage stays: a monkey staying in an introcage for a while (its home
// doesn't change). Where it counts as "now" and where as "home", and the
// pop-up's Move to Introcage / Return.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Modal from "./Modal";
import MonkeyCard from "./MonkeyCard";
import { DEFAULT_FEEDING, amSummary } from "./feeding";
import { PLACEHOLDER_PHOTO } from "./monkeyFormChecks";
import enclosuresArr from "./enclosuresArr";
import { awayFrom, introcageMonkeys, residents, stayChoices, troopMonkeys } from "./enclosures";
import { monitoringGroups } from "./monitoring";
import { signFor } from "./introcageSigns";
import { currentIntrocage, staying } from "./places";
import { toDatabaseRow } from "./monkeyData";

const byName = (name, type = "introcage") => enclosuresArr.find((e) => e.name === name && e.type === type);
const stayIn = (name, extra = {}) => {
    const cage = byName(name);
    const parent = enclosuresArr.find((e) => e.id === cage.parentId);
    return { id: cage.id, introcage: cage.name, enclosure: parent.name, since: "2026-10-16", note: "", ...extra };
};
const base = {
    sex: "female", chip: "1", year: 2015, img: [PLACEHOLDER_PHOTO], bio: "", desc: "",
    feeding: DEFAULT_FEEDING, inSickbay: false, stay: null,
};
// Pip: Gismo troop, staying in Gismo A. Nita: lives in Gismo A. Rocio:
// lives in Gismo C, staying in Gismo A. Ziggy: Gismo troop, at home.
const pip = { ...base, id: 1, name: "Pip", troop: "Gismo", introcage: null, introcageType: null, enclosure: "Gismo", stay: stayIn("Gismo A") };
const nita = { ...base, id: 2, name: "Nita", troop: null, introcage: "Gismo A", introcageType: "introcage", enclosure: "Gismo" };
const rocio = { ...base, id: 3, name: "Rocio", troop: null, introcage: "Gismo C", introcageType: "introcage", enclosure: "Gismo", stay: stayIn("Gismo A") };
const ziggy = { ...base, id: 4, name: "Ziggy", troop: "Gismo", introcage: null, introcageType: null, enclosure: "Gismo" };
const MONKEYS = [pip, nita, rocio, ziggy];

describe("home and now", () => {
    test("where it is now: its stay, or its home introcage", () => {
        expect(staying(pip)).toBe("Gismo A");
        expect(currentIntrocage(pip)).toBe("Gismo A");
        expect(currentIntrocage(nita)).toBe("Gismo A");
        expect(currentIntrocage(ziggy)).toBe(null);
    });

    test("an introcage's monkeys now: those living there and those staying", () => {
        expect(residents(byName("Gismo A"), MONKEYS).map((m) => m.name)).toEqual(["Nita", "Pip", "Rocio"]);
        // (Rocio lives in Gismo C, but is away)
        expect(residents(byName("Gismo C"), MONKEYS)).toEqual([]);
        expect(awayFrom(byName("Gismo C"), MONKEYS).map((m) => m.name)).toEqual(["Rocio"]);
    });

    test("the troop keeps a troop monkey who is staying in an introcage", () => {
        expect(troopMonkeys(byName("Gismo", "troop"), MONKEYS).map((m) => m.name)).toEqual(["Pip", "Ziggy"]);
    });

    test("the Monitoring Sheet goes by home: Pip still in the troop list", () => {
        const groups = monitoringGroups(MONKEYS, "Gismo", new Date(2026, 9, 16));
        expect(groups[0].monkeys.map((m) => m.name)).toEqual(["Pip", "Ziggy"]);
    });

    test("a visitor from another enclosure is listed with the enclosure it's staying in", () => {
        const visitor = { ...ziggy, id: 5, name: "Visitor", troop: "Goliath", enclosure: "Goliath", stay: stayIn("Gismo D") };
        expect(introcageMonkeys(byName("Gismo", "troop"), [visitor]).map((m) => m.name)).toEqual(["Visitor"]);
    });

    test("the Introcage Sign has who's there now", () => {
        const sign = signFor(byName("Gismo A"), MONKEYS, enclosuresArr, new Date(2026, 9, 16));
        expect(sign.monkeys.map((m) => m.name).sort()).toEqual(["Nita", "Pip", "Rocio"]);
    });

    test("the AM Plates List feeds them where they are now", () => {
        const top = amSummary(MONKEYS, enclosuresArr).find((g) => g.title === "Top Section");
        expect(top.rows).toEqual(["Nita/Pip/Rocio x3"]);
    });
});

describe("where it can stay", () => {
    test("its own enclosure's introcages first, then the others; not its home or where it is", () => {
        const choices = stayChoices(rocio, enclosuresArr);
        const own = choices.filter((c) => c.own).map((c) => c.name);
        expect(own).toEqual(["Gismo D"]);
        expect(choices.length).toBeGreaterThan(own.length);
        expect(choices.every((c) => !["Gismo A", "Gismo C"].includes(c.name))).toBe(true);
    });

    test("none for a new arrival or the Bandits", () => {
        const arrival = { ...base, introcage: "Dreamland", introcageType: "area", enclosure: "Baby Care" };
        expect(stayChoices(arrival, enclosuresArr)).toEqual([]);
        expect(stayChoices({ ...base, troop: "Bandits", introcage: null }, enclosuresArr)).toEqual([]);
    });

    test("a move to that introcage in Edit ends the stay", () => {
        const row = toDatabaseRow({ ...rocio, introcageId: rocio.stay.id }, {});
        expect(row).toMatchObject({ introcage_id: rocio.stay.id, stay_introcage_id: null });
        expect(toDatabaseRow({ ...rocio, introcageId: byName("Gismo C").id }, {})).not.toHaveProperty("stay_introcage_id");
    });
});

describe("the pop-up", () => {
    const open = (monkey, onWhereabouts = vi.fn().mockResolvedValue()) => {
        render(
            <Modal
                isModalOpen
                monkey={monkey}
                onClose={() => {}}
                handlePrevNext={() => {}}
                onWhereabouts={onWhereabouts}
                stayChoices={stayChoices(monkey, enclosuresArr)}
            />
        );
        return onWhereabouts;
    };
    const quickActions = () => userEvent.click(screen.getByRole("button", { name: "Quick Actions" }));

    test("Move to Introcage: which one (its own enclosure's first), the date, a note, and Fed By (Sickbay to start with)", async () => {
        const saved = open({ ...ziggy, stay: null });
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Move to Introcage" }));
        const select = screen.getByLabelText("Introcage");
        expect(within(select).getByRole("group", { name: "Gismo" })).toBeInTheDocument();
        expect(within(select).getByRole("group", { name: "Other Enclosures" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Confirm" })).toBeDisabled();
        expect(screen.getByLabelText("Fed By")).toHaveValue("sickbay");
        expect(screen.queryByText(/will be on the AM Plates List/)).not.toBeInTheDocument();
        await userEvent.selectOptions(select, "Gismo A");
        await userEvent.type(screen.getByLabelText("Note (optional)"), "integration");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(saved.mock.calls[0][1]).toEqual({
            at: "introcage", introcageId: byName("Gismo A").id, since: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), note: "integration",
            fedBy: "sickbay",
        });
    });

    test("fed by the Local Team instead: a reminder it's on the AM Plates List", async () => {
        const saved = open({ ...ziggy, stay: null });
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Move to Introcage" }));
        await userEvent.selectOptions(screen.getByLabelText("Introcage"), "Gismo A");
        await userEvent.selectOptions(screen.getByLabelText("Fed By"), "Local Team");
        expect(screen.getByText(/will be on the AM Plates List while in an introcage/)).toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saved.mock.calls[0][1]).toMatchObject({ fedBy: "localTeam" }));
    });

    test("an introcage monkey keeps its own feeding (no Fed By to choose)", async () => {
        open({ ...nita });
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Move to Introcage" }));
        expect(screen.queryByLabelText("Fed By")).not.toBeInTheDocument();
    });

    test("staying: a teal pill, where and since when, and its feeding", () => {
        open({ ...pip, stay: stayIn("Gismo A", { note: "integration" }) });
        expect(screen.getByText("In", { selector: "li", exact: false })).toHaveClass("is-stay");
        expect(screen.getByText("Gismo A (home: Gismo Troop) · Since 16th Oct 2026 · integration")).toBeInTheDocument();
        expect(screen.getByRole("heading", { name: "Feeding" })).toBeInTheDocument();
    });

    test("Return asks where to: home, or another introcage of its enclosure", async () => {
        const saved = open(pip);
        await quickActions();
        expect(screen.queryByRole("button", { name: "Move to Introcage" })).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole("button", { name: "Return From Introcage" }));
        const where = screen.getByLabelText("Return To");
        expect(within(where).getAllByRole("option").map((o) => o.textContent)).toEqual(["Gismo Troop (Home)", "Gismo C", "Gismo D"]);
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }), { at: "home" }));
    });

    test("Return from Sickbay to an introcage: a stay there", async () => {
        const saved = open({ ...ziggy, inSickbay: true });
        await quickActions();
        await userEvent.click(screen.getByRole("button", { name: "Return From Sickbay" }));
        await userEvent.selectOptions(screen.getByLabelText("Return To"), "Gismo D");
        await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
        await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
        expect(saved.mock.calls[0][1]).toMatchObject({ at: "introcage", introcageId: byName("Gismo D").id });
    });

    test("Move to Sickbay while staying (one place at a time)", async () => {
        open(pip);
        await quickActions();
        expect(screen.getByRole("button", { name: "Move to Sickbay" })).toBeInTheDocument();
    });
});

test("the card's badge says where it's staying", () => {
    render(<MonkeyCard name="Pip" sex="female" year={2015} troop="Gismo" stayingIn="Gismo A" img="x.jpg" onClick={() => {}} />);
    expect(screen.getByRole("button", { name: /staying in Gismo A/ })).toBeInTheDocument();
    expect(screen.getByText("In Gismo A")).toBeInTheDocument();
});
