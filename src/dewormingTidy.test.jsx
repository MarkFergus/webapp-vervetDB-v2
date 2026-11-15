// Deworming tidy-ups: doses by unit (grams added; tabs and teaspoons from a
// list, grams and ml typed), Ivermectin, and the printed sheet on one page
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import DoseAmount from "./DoseAmount";
import { amountForUnit, amountsFor, doseText, parseDewormingRecord, swapsOf, tidyAmount, UNITS, usualDose, daysFor } from "./dewormingRules";
import { ResultsTable } from "./DewormingResults";
import { blankRows, rowSize } from "./DewormingSheetPDF";

describe("doses", () => {
    test("units: tab, tsp, ml and g; each list's amounts", () => {
        expect(UNITS).toEqual(["tab", "tsp", "ml", "g"]);
        expect(amountsFor("tab")).toEqual(["1/4", "1/2", "3/4", "1"]);
        expect(amountsFor("tsp")).toEqual(["1/8", "1/4", "1/2"]);
        // (one already chosen that isn't listed: kept, in size order)
        expect(amountsFor("tsp", "1/16")).toEqual(["1/16", "1/8", "1/4", "1/2"]);
        expect(amountsFor("tab", "1 1/2")).toEqual(["1/4", "1/2", "3/4", "1", "1 1/2"]);
    });

    test("grams to 1 decimal place, ml to 2", () => {
        expect(tidyAmount("g", "0.15")).toBe("0.2");
        expect(tidyAmount("g", "0.10")).toBe("0.1");
        expect(tidyAmount("ml", "1.256")).toBe("1.26");
        expect(tidyAmount("ml", "0")).toBe("");
        expect(tidyAmount("ml", "abc")).toBe("");
        expect(doseText("0.10", "g")).toBe("0.1 g");
        expect(doseText("1/2", "tab")).toBe("1/2 tab");
    });

    test("a new unit: the amount stays if it fits, else starts empty", () => {
        expect(amountForUnit("1/4", "tsp")).toBe("1/4");
        expect(amountForUnit("3/4", "tsp")).toBe("");
        expect(amountForUnit("1/2", "g")).toBe("");
        expect(amountForUnit("0.5", "ml")).toBe("0.5");
        expect(amountForUnit("0.5", "tab")).toBe("");
    });

    test("Ivermectin: 0.1 g, one dose; grams in a record's words", () => {
        expect(usualDose("Ivermectin")).toBe("0.1 g");
        expect(daysFor("Ivermectin")).toBe(1);
        expect(parseDewormingRecord("6-Month - 0.1 g Ivermectin, one dose only")).toMatchObject({ amount: "0.1", unit: "g", medication: "Ivermectin" });
        expect(parseDewormingRecord("6-Month - 1 1/2 tab Albendazole, one dose only")).toMatchObject({ amount: "1 1/2", unit: "tab" });
    });

    test("the box: a list for tabs, a number for grams (tidied when left)", async () => {
        const user = userEvent.setup();
        function Box() {
            const [dose, setDose] = useState({ unit: "tab", amount: "" });
            return (
                <>
                    <DoseAmount label="Dose" unit={dose.unit} amount={dose.amount} onChange={(amount) => setDose({ ...dose, amount })} />
                    <button type="button" onClick={() => setDose({ unit: "g", amount: amountForUnit(dose.amount, "g") })}>
                        Grams
                    </button>
                </>
            );
        }
        render(<Box />);
        expect(screen.getByRole("combobox", { name: "Dose" })).toBeInTheDocument();
        await user.click(screen.getByRole("button", { name: "Grams" }));
        const box = screen.getByRole("spinbutton", { name: "Dose" });
        await user.type(box, "0.15");
        await user.tab();
        expect(box).toHaveValue(0.2);
    });
});

describe("a dewormer changed partway", () => {
    const LINE = {
        id: 1,
        monkeyId: 1,
        name: "Sybil",
        medication: "Albendazole",
        dose: "1/4 tab",
        days: 3,
        doses: {
            1: { result: "none" },
            2: { result: "full", medication: "Pyrantel", dose: "0.3 ml" },
            3: { result: "full", medication: "Pyrantel", dose: "0.3 ml" },
        },
    };

    test("each change, once, from its day", () => {
        expect(swapsOf(LINE)).toEqual([{ day: 2, medication: "Pyrantel", dose: "0.3 ml" }]);
        expect(swapsOf({ ...LINE, doses: { 1: { result: "full" } } })).toEqual([]);
    });

    test("the list's Details: the sheet's dewormer, then the change under it", () => {
        render(<ResultsTable lines={[LINE]} />);
        const details = screen.getByText("0.3 ml Pyrantel").closest("td");
        expect(details).toHaveTextContent("1/4 tab Albendazole0.3 ml Pyrantel");
        expect(details.querySelector(".Deworming-changed [aria-label='Changed to']")).not.toBeNull();
        // (the sheet's dewormer crossed out; one never changed isn't)
        expect(details.querySelector("s")).toHaveTextContent("1/4 tab Albendazole");
    });

    test("never changed: not crossed out", () => {
        render(<ResultsTable lines={[{ ...LINE, doses: { 1: { result: "full" } } }]} />);
        expect(screen.getByText("1/4 tab Albendazole").tagName).not.toBe("S");
    });

    test("days not needed after the course finished: N/A", () => {
        const line = (id, name, medication, days, doses) => ({ id, monkeyId: id, name, medication, dose: "1/4 tab", days, doses });
        render(
            <ResultsTable
                lines={[
                    line(1, "Ash", "Albendazole", 3, { 1: { result: "full" }, 2: { result: "none" } }),
                    line(2, "Fern", "Ivermectin", 1, { 1: { result: "full" } }),
                    line(3, "Gus", "Albendazole", 3, { 1: { result: "full" } }),
                ]}
            />
        );
        const cells = (name) => [...screen.getByRole("rowheader", { name }).parentElement.querySelectorAll("td")].slice(0, 3).map((td) => td.textContent);
        expect(cells("Ash")).toEqual(["✓", "✗", "N/A"]);
        expect(cells("Fern")).toEqual(["✓", "N/A", "N/A"]);
        // (still going: not entered yet)
        expect(cells("Gus")).toEqual(["✓", "", ""]);
    });

    test("Pyrantel: 0.3 ml", () => {
        expect(usualDose("Pyrantel")).toBe("0.3 ml");
    });
});

describe("the printed sheet", () => {
    test("no blank rows on a 6-Month, or a section's introcages", () => {
        expect(blankRows({ session: "6_month", groupKey: "troop:1" })).toBe(0);
        expect(blankRows({ session: "3_month", groupKey: "ics:Top" })).toBe(0);
        expect(blankRows({ session: "3_month", groupKey: "troop:1" })).toBe(4);
        expect(blankRows({ session: "6_month_fu", groupKey: "enclosure:4" })).toBe(4);
    });

    test("rows shrink to fit one page: the usual size when there's room", () => {
        expect(rowSize(20)).toEqual({ height: 15, fontSize: 9.5 });
        const many = rowSize(80);
        expect(many.height * 80).toBeLessThanOrEqual(842 - 66 - 64);
        expect(many.fontSize).toBeLessThan(9.5);
    });
});
