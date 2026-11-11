import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { loadIntake } from "./monkeyData";
import { downloadBlob } from "./canvasHelpers";
import MonkeyIntake from "./MonkeyIntake";

vi.mock("./monkeyData", async (importOriginal) => ({ ...(await importOriginal()), loadIntake: vi.fn() }));
vi.mock("./canvasHelpers", async (importOriginal) => ({ ...(await importOriginal()), downloadBlob: vi.fn() }));
vi.mock("./intakeExcel", async (importOriginal) => ({
    ...(await importOriginal()),
    intakeExcel: vi.fn(async () => new Blob(["xlsx"])),
}));

const THIS_YEAR = new Date().getFullYear();

const ARRIVAL = {
    id: 1,
    name: "Mia",
    sex: "female",
    species: "vervet",
    year: "",
    status: "sanctuary",
    arrivalDate: `${THIS_YEAR}-02-18`,
    arrivalReason: "orphaned",
    arrivalCondition: "healthy",
};

beforeEach(() => {
    loadIntake.mockReset();
    downloadBlob.mockReset();
});

test("this year's lists to start with; another year loads that year's", async () => {
    const user = userEvent.setup();
    loadIntake.mockResolvedValue({ monkeys: [ARRIVAL], notes: { 1: "Found on a farm" } });
    render(<MonkeyIntake />);
    expect(loadIntake).toHaveBeenCalledWith(THIS_YEAR);
    const arrivals = await screen.findByRole("region", { name: "Sanctuary Arrivals" });
    const row = within(arrivals).getAllByRole("row")[1];
    expect(row).toHaveTextContent("Mia");
    expect(row).toHaveTextContent("Orphaned");
    expect(row).toHaveTextContent("Found on a farm");
    expect(screen.getByRole("region", { name: "Released Monkeys" })).toHaveTextContent("No releases");
    expect(screen.getByRole("region", { name: "Deceased Monkeys" })).toHaveTextContent("No deaths");
    expect(screen.getByRole("region", { name: "Escaped or Missing Monkeys" })).toHaveTextContent("No escaped or missing monkeys");

    loadIntake.mockResolvedValue({ monkeys: [], notes: {} });
    await user.selectOptions(screen.getByLabelText("Year"), "2024");
    expect(loadIntake).toHaveBeenLastCalledWith(2024);
    expect(await screen.findByRole("region", { name: "Sanctuary Arrivals" })).toHaveTextContent("No arrivals");
});

test("Download Excel: the whole report as an .xlsx file", async () => {
    const user = userEvent.setup();
    loadIntake.mockResolvedValue({ monkeys: [ARRIVAL], notes: {} });
    render(<MonkeyIntake />);
    await screen.findByRole("region", { name: "Sanctuary Arrivals" });
    await user.click(screen.getByRole("button", { name: "Download Excel" }));
    await waitFor(() => expect(downloadBlob).toHaveBeenCalledWith(expect.any(Blob), `VMF_Monkey_Intake_${THIS_YEAR}.xlsx`));
});

test("a problem loading: said", async () => {
    loadIntake.mockRejectedValue(new Error("Please run supabase/arrival-details.sql first."));
    render(<MonkeyIntake />);
    expect(await screen.findByRole("alert")).toHaveTextContent("arrival-details.sql");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeDisabled();
});
