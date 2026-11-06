// Edit's + : a new chip, saved straight away as a Microchip record
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AddChip from "./AddChip";
import { addMicrochip } from "./monkeyData";

vi.mock("./monkeyData", () => ({ addMicrochip: vi.fn() }));

beforeEach(() => {
    addMicrochip.mockReset();
});

test("the number is needed; the details aren't; then the monkey's chip comes back", async () => {
    addMicrochip.mockResolvedValue("1011 & 1604");
    const onAdded = vi.fn();
    const user = userEvent.setup();
    render(<AddChip monkeyId={7} onAdded={onAdded} onCancel={() => {}} />);
    await user.click(screen.getByRole("button", { name: "Add Chip" }));
    expect(screen.getByRole("alert")).toHaveTextContent("enter the chip number");
    expect(addMicrochip).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Chip Number"), "1604");
    await user.click(screen.getByRole("button", { name: "Add Chip" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("1011 & 1604"));
    expect(addMicrochip).toHaveBeenCalledWith(7, expect.objectContaining({ number: "1604", note: "" }));
});

test("Enter adds the chip, not the form around it; a refusal is shown", async () => {
    addMicrochip.mockRejectedValue(new Error("Not allowed."));
    const user = userEvent.setup();
    const submit = vi.fn((e) => e.preventDefault());
    render(
        <form onSubmit={submit}>
            <AddChip monkeyId={7} onAdded={() => {}} onCancel={() => {}} />
        </form>
    );
    await user.type(screen.getByLabelText("Chip Number"), "1604{Enter}");
    expect(await screen.findByRole("alert")).toHaveTextContent("Not allowed.");
    expect(submit).not.toHaveBeenCalled();
});
