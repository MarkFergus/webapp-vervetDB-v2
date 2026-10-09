import { fullName } from "./places";

// A place's full name for headings, cards and pills ("Holt & Barrington C1"),
// in two parts that each stay on one line: a long name wraps as
// "Holt &" / "Barrington C1", never part-way through. The text itself is
// unchanged (ordinary spaces), so it reads and copies normally.
//   suffix: added to the end, kept with the last part (e.g. " Troop")
function PlaceName({ name, suffix = "" }) {
    const full = `${fullName(name)}${suffix}`;
    const at = full.indexOf(" & ");
    if (at === -1) return full;
    return (
        <>
            <span className="nowrap">{full.slice(0, at + 2)}</span>{" "}
            <span className="nowrap">{full.slice(at + 3)}</span>
        </>
    );
}

export default PlaceName;
