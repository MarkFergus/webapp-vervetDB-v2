import { useEffect, useRef, useState } from "react";
import { addMicrochip } from "./monkeyData";
import { MAX_CHIP_NOTE, chipNumberProblem } from "./chipRules";

const todayText = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Edit's +: a new chip's number, date and details (optional). Saved straight
// away with Add Chip, as a Microchip record, which adds the number to the
// monkey (microchip-records.sql), whatever happens to the rest of the form.
//   onAdded(chip): the monkey's chip now; onCancel()
export default function AddChip({ monkeyId, onAdded, onCancel }) {
    const [values, setValues] = useState({ number: "", date: todayText(), note: "" });
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const numberRef = useRef(null);
    useEffect(() => numberRef.current?.focus(), []);
    const set = (field) => (event) => setValues({ ...values, [field]: event.target.value });

    async function add() {
        const wrong = chipNumberProblem(values.number);
        if (wrong) return setProblem(wrong);
        if (!values.date || values.date > todayText()) return setProblem("Please choose the date (not in the future).");
        setBusy(true);
        setProblem(null);
        try {
            onAdded(await addMicrochip(monkeyId, values));
        } catch (err) {
            setProblem(err.message);
            setBusy(false);
        }
    }
    // (Enter here adds the chip, not saves the whole form)
    function enterAdds(event) {
        if (event.key !== "Enter") return;
        event.preventDefault();
        add();
    }

    return (
        <div className="MonkeyForm-addChip" role="group" aria-labelledby="MonkeyForm-addChipTitle">
            <h2 className="MonkeyForm-addChipTitle" id="MonkeyForm-addChipTitle">
                New Microchip
            </h2>
            <div className="MonkeyForm-row is-pair">
                <label className="MonkeyForm-field">
                    <span>Chip Number</span>
                    <input ref={numberRef} type="text" inputMode="numeric" value={values.number} onChange={set("number")} onKeyDown={enterAdds} />
                </label>
                <label className="MonkeyForm-field">
                    <span>Date</span>
                    <input type="date" value={values.date} max={todayText()} onChange={set("date")} onKeyDown={enterAdds} />
                </label>
            </div>
            <label className="MonkeyForm-field">
                <span>Details (optional)</span>
                <textarea rows={2} value={values.note} maxLength={MAX_CHIP_NOTE} onChange={set("note")} />
            </label>
            {problem && (
                <p className="MonkeyForm-fieldError" role="alert">
                    {problem}
                </p>
            )}
            <div className="MonkeyForm-addChipActions">
                <button type="button" className="Modal-edit is-confirm" disabled={busy} onClick={add}>
                    {busy ? "Saving…" : "Add Chip"}
                </button>
                <button type="button" className="Modal-edit is-cancel" disabled={busy} onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </div>
    );
}
