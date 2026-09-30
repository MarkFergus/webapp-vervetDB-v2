import { useEffect, useState } from "react";
import { BUILT_IN_DATA, loadMonkeyData } from "./monkeyData";

// Loads the monkeys and troops once, when the site opens.
// status: "loading" → "live" (from the database), or "built-in" if the
// database couldn't be reached (then monkeys/troops are the built-in copy).
export default function useMonkeyData() {
    const [data, setData] = useState({ status: "loading", ...BUILT_IN_DATA });

    useEffect(() => {
        let cancelled = false;
        loadMonkeyData()
            .then((live) => {
                if (!cancelled) setData({ status: "live", ...live });
            })
            .catch((error) => {
                console.error("Couldn't load monkeys from the database:", error);
                if (!cancelled) setData({ status: "built-in", ...BUILT_IN_DATA });
            });
        return () => {
            cancelled = true;
        };
    }, []);

    return data;
}
