import { createClient } from "@supabase/supabase-js";
import { offlineFetch } from "./offlineFetch";

// The connection to vervetDB's Supabase project. These two values are
// public by design (they're sent to every visitor's browser); what people
// can actually do is controlled by the database's access rules
// (see supabase/schema.sql). Never put the secret / service_role key here.
export const SUPABASE_URL = "https://demlwtsrnlkiskcntbcc.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6Ts_XZUKA56m-izWdKPI_Q_dnvWnNC3";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    global: { fetch: offlineFetch },
    // (its own retries take about 7 seconds per request with no signal; saved
    // answers and the outbox cover for a failed request instead)
    db: { retry: false },
});

// The sign-in as Supabase keeps it on this phone, or null
const KEPT_SIGN_IN = `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
function keptSession() {
    try {
        const kept = JSON.parse(localStorage.getItem(KEPT_SIGN_IN));
        return kept?.user && kept.access_token ? kept : null;
    } catch {
        return null;
    }
}
export const savedSignIn = () => keptSession()?.user ?? null;

// A sign-in lasts an hour, then it's renewed, and Supabase keeps trying that
// for up to 30 seconds with nothing else happening meanwhile (every database
// request waits for it). With no signal, that'd hold up the whole app, so:
// still them, going by what's on this phone. (An old sign-in is no good for
// saving, but requests fall back on saved answers, and the outbox keeps
// trying until Supabase has renewed it.)
const RENEW_WAIT_MS = 1500;
let renewing = null;
const realGetSession = supabase.auth.getSession.bind(supabase.auth);
supabase.auth.getSession = async () => {
    const kept = keptSession();
    const expired = kept && kept.expires_at * 1000 < Date.now();
    if (!expired) return realGetSession();
    const stillThem = { data: { session: kept }, error: null };
    if (navigator.onLine === false) return stillThem;
    // (one wait while it's being renewed: the next request needn't wait too)
    if (renewing) return stillThem;
    renewing = realGetSession().finally(() => {
        renewing = null;
    });
    const answer = renewing.then((result) => (result.data.session || !result.error ? result : stillThem));
    return Promise.race([answer, new Promise((resolve) => setTimeout(() => resolve(stillThem), RENEW_WAIT_MS))]);
};
