import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

// Favourites: the ☆ on a monkey's photo (their ids). Signed in, each account
// keeps its own list in the database (supabase/latest-news.sql), so it's the
// same on a phone and a computer; signed out (or before that file has run),
// they're kept on this device.

const KEY = "vervetdb-favourites";

function deviceFavourites() {
    try {
        const ids = JSON.parse(localStorage.getItem(KEY));
        return new Set(Array.isArray(ids) ? ids : []);
    } catch {
        return new Set();
    }
}

function keepOnDevice(ids) {
    try {
        localStorage.setItem(KEY, JSON.stringify([...ids]));
    } catch {
        // Not remembered this time
    }
}

// { favourites: Set of monkey ids, toggle(id) }
export default function useFavourites() {
    const { user, ready } = useAuth();
    const [favourites, setFavourites] = useState(deviceFavourites);
    // Saved in the database (signed in, and it loaded), or on this device
    const [inAccount, setInAccount] = useState(false);

    useEffect(() => {
        if (!ready) return undefined;
        if (!user) {
            setInAccount(false);
            setFavourites(deviceFavourites());
            return undefined;
        }
        let cancelled = false;
        // (any problem, e.g. latest-news.sql not run yet: this device, for now)
        Promise.resolve()
            .then(() => supabase.from("favourites").select("monkey_id"))
            .then(({ data, error }) => {
                if (error) throw error;
                if (cancelled) return;
                setInAccount(true);
                setFavourites(new Set(data.map((row) => row.monkey_id)));
            })
            .catch((error) => console.error("Couldn't load favourites:", error));
        return () => {
            cancelled = true;
        };
    }, [user?.id, ready]);

    // Starred straight away; put back if the database says no
    function toggle(id) {
        if (id == null) return;
        const adding = !favourites.has(id);
        const change = (ids, add) => {
            const next = new Set(ids);
            if (add) next.add(id);
            else next.delete(id);
            return next;
        };
        setFavourites((ids) => change(ids, adding));
        if (!inAccount) {
            keepOnDevice(change(favourites, adding));
            return;
        }
        const request = adding
            ? supabase.from("favourites").insert({ monkey_id: id })
            : supabase.from("favourites").delete().eq("monkey_id", id);
        Promise.resolve(request)
            .then(({ error }) => {
                if (error) throw error;
            })
            .catch((error) => {
                console.error("Couldn't save the favourite:", error);
                setFavourites((ids) => change(ids, !adding));
            });
    }

    return { favourites, toggle };
}
