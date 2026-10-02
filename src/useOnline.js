import { useEffect, useState } from "react";

// Whether the device thinks it has a connection (updates when that changes)
export default function useOnline() {
    const [online, setOnline] = useState(() => navigator.onLine !== false);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine !== false);
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
            window.removeEventListener("online", update);
            window.removeEventListener("offline", update);
        };
    }, []);
    return online;
}
