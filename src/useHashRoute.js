import { useEffect, useState } from "react";

// The part of the address after "#", e.g. "game" for .../#game.
// Using the hash works on GitHub Pages and keeps the back button working.
export default function useHashRoute() {
    const [route, setRoute] = useState(() => window.location.hash.slice(1));

    useEffect(() => {
        const update = () => setRoute(window.location.hash.slice(1));
        window.addEventListener("hashchange", update);
        return () => window.removeEventListener("hashchange", update);
    }, []);

    return route;
}
