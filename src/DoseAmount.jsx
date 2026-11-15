// A dose's amount, to suit its unit (dewormingRules.js): tabs and teaspoons
// from a list (1/4, 1/2…); grams and ml typed in (to 1 and 2 decimal places)
import { DECIMALS_FOR, amountsFor, tidyAmount, typedUnit } from "./dewormingRules";
import "./DoseAmount.css";

// empty: the list's first choice when nothing's chosen ("Dose…"), or null
// for none (then one is always chosen)
export default function DoseAmount({ unit, amount, onChange, label, empty = "Dose…", emptyDisabled = false }) {
    if (typedUnit(unit)) {
        const step = 1 / 10 ** DECIMALS_FOR[unit];
        return (
            <input
                type="number"
                className="DoseAmount"
                inputMode="decimal"
                min={step}
                step={step}
                placeholder={unit === "g" ? "0.0" : "0.00"}
                aria-label={label}
                value={amount}
                onChange={(e) => onChange(e.target.value)}
                // (tidied to its decimal places once typed)
                onBlur={() => amount !== "" && onChange(tidyAmount(unit, amount))}
            />
        );
    }
    return (
        <select aria-label={label} value={amount} onChange={(e) => onChange(e.target.value)}>
            {(empty !== null || amount === "") && (
                <option value="" disabled={emptyDisabled}>
                    {empty ?? "Dose…"}
                </option>
            )}
            {amountsFor(unit, amount).map((a) => (
                <option key={a} value={a}>
                    {a}
                </option>
            ))}
        </select>
    );
}
