import { useEffect, useState } from "react";
import { loadMonitoring, NO_MONITORING } from "./monkeyData";

// A monkey's monitoring: Condition Check and Notes for Monitoring (staff
// only; supabase/monitoring.sql). Loaded when `enabled`, and again when
// `version` changes (e.g. the monkey was just saved).
//   → { available: the database has it (and this is staff), loaded, value
//       ({ conditionCheck, notes, … }: see monkeyData.js) }
export default function useMonitoring(monkeyId, enabled, version) {
    const [state, setState] = useState({ available: false, loaded: false, value: NO_MONITORING });
    useEffect(() => {
        if (!enabled || monkeyId == null) {
            setState({ available: false, loaded: false, value: NO_MONITORING });
            return;
        }
        let cancelled = false;
        loadMonitoring(monkeyId)
            .then((value) => !cancelled && setState({ available: true, loaded: true, value }))
            .catch(() => !cancelled && setState({ available: false, loaded: true, value: NO_MONITORING }));
        return () => {
            cancelled = true;
        };
    }, [monkeyId, enabled, version]);
    return state;
}
