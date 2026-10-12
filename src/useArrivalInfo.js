import { useEffect, useState } from "react";
import { loadArrivalInfo } from "./monkeyData";

// A new rescue's Arrival Info (staff only; supabase/arrival-info.sql). Loaded
// when `enabled`; for a monkey not saved yet (monkeyId null) it just checks
// the database has it.
//   → { available: the database has it (and this is staff), loaded, info }
export default function useArrivalInfo(monkeyId, enabled) {
    const [state, setState] = useState({ available: false, loaded: false, info: "" });
    useEffect(() => {
        if (!enabled) {
            setState({ available: false, loaded: false, info: "" });
            return;
        }
        let cancelled = false;
        loadArrivalInfo(monkeyId ?? 0)
            .then((info) => !cancelled && setState({ available: true, loaded: true, info }))
            .catch(() => !cancelled && setState({ available: false, loaded: true, info: "" }));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled]);
    return state;
}
