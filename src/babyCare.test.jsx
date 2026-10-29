// Baby Care's babies (editors): they visit introcages (Move to Introcage)
// while still living in Baby Care, and are never released (Release to Wild
// is for Sickbay's and Quarantine's new arrivals only)
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShowPage from "./ShowPage";
import enclosuresArr from "./enclosuresArr";
import { STAFF } from "./testStaff";

vi.mock("./auth", async (importOriginal) => ({
    ...(await importOriginal()),
    useAuth: () => ({ ...STAFF, role: "editor", isEditor: true }),
}));

const base = { sex: "female", chip: "1", year: 2026, img: ["x.jpg"], bio: "", desc: "", status: "sanctuary", stay: null, inSickbay: false };
const MONKEYS = [
    { ...base, id: 1, name: "Bub", troop: null, introcage: "Dreamland", introcageType: "area", enclosure: "Baby Care" },
    { ...base, id: 2, name: "Quin", troop: null, introcage: "Quarantine", introcageType: "area", enclosure: "Quarantine" },
];

async function quickActionsOf(user, name) {
    render(<ShowPage monkeys={MONKEYS} enclosures={enclosuresArr} editable />);
    await user.click(document.querySelector(`.MonkeyCard[aria-label^="${name},"]`));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Quick Actions" }));
    return dialog;
}

test("Baby Care: Move to Introcage, no Release to Wild", async () => {
    const user = userEvent.setup();
    const dialog = await quickActionsOf(user, "Bub");
    expect(within(dialog).getByRole("button", { name: "Move to Introcage" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Release to Wild" })).toBeNull();
});

test("Quarantine: Release to Wild as before, no Move to Introcage", async () => {
    const user = userEvent.setup();
    const dialog = await quickActionsOf(user, "Quin");
    expect(within(dialog).getByRole("button", { name: "Release to Wild" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Move to Introcage" })).toBeNull();
});
