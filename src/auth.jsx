import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";
import { loadAvatar } from "./accountPhoto";

// Who's signed in, shared with every page through <AuthProvider>.
//   user:          the signed-in account (null when signed out)
//   role:          "admin", "editor", "maintenance", or null (signed out, or
//                  an account without a role: view only). See supabase/roles.sql.
//   isEditor:      whether that account may change monkeys (admins and editors)
//   isAdmin:       whether it may also add and delete them, and change
//                  enclosure details
//   canLogMaintenance: whether it may add to the maintenance log (any role)
//   name:          the account's full name (set by admins), or null
//   avatarUrl:     the account's photo (staff add their own), or null;
//                  setAvatarUrl(url) after changing it
//   ready:         false until we've checked for a saved sign-in
//   passwordSetup: why the account pop-up should open by itself (see below)
const AuthContext = createContext({
    user: null,
    role: null,
    isEditor: false,
    isAdmin: false,
    canLogMaintenance: false,
    name: null,
    avatarUrl: null,
    setAvatarUrl: () => {},
    ready: true,
    passwordSetup: null,
    signIn: async () => {},
    signOut: async () => {},
    sendPasswordReset: async () => {},
    updatePassword: async () => {},
    clearPasswordSetup: () => {},
});

// Arrived from a link in a Supabase email? The link's details are after the
// "#", and Supabase clears them once it has signed the person in, so they're
// read straight away, when the site first loads.
//   "recovery": a "reset your password" link → choose a new password
//   "invite":   an invitation → choose a password
//   "expired":  the link had expired or was already used
export function passwordSetupFromLink(hash) {
    const params = new URLSearchParams(hash.replace(/^#/, ""));
    if (params.get("error_code") || params.get("error")) return "expired";
    const type = params.get("type");
    return type === "recovery" || type === "invite" ? type : null;
}
const ARRIVED_FROM_LINK = passwordSetupFromLink(window.location.hash);

// Where email links bring people back to: this site's front page
const SITE_ADDRESS = window.location.origin + import.meta.env.BASE_URL;

// Supabase needs at least 6; 8 is a sensible minimum
export const MIN_PASSWORD_LENGTH = 8;

export function useAuth() {
    return useContext(AuthContext);
}

// The account's full name (set by admins, supabase/set-name.sql), or null:
// none set yet, or the database hasn't got names (names.sql not run)
async function loadName(user) {
    try {
        const { data, error } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        return error ? null : data?.full_name ?? null;
    } catch {
        return null; // a name is a nice-to-have: never stops signing in
    }
}

// This account's role: its entry in the editors table (the database only
// lets people see their own entry). No entry: view only. All columns, so it
// works before roles.sql too (no role column: an editor, or an admin).
const NO_ROLE = { role: null, isEditor: false, isAdmin: false, canLogMaintenance: false, name: null, avatarUrl: null };
async function checkRole(user) {
    if (!user) return NO_ROLE;
    const { data, error } = await supabase.from("editors").select("*").eq("user_id", user.id).maybeSingle();
    if (error) {
        console.error("Couldn't check editor status:", error);
        return NO_ROLE;
    }
    if (!data) return NO_ROLE;
    const role = data.role ?? (data.is_admin ? "admin" : "editor");
    const [name, avatarUrl] = await Promise.all([loadName(user), loadAvatar(user)]);
    return {
        name,
        avatarUrl,
        role,
        isEditor: role === "admin" || role === "editor",
        isAdmin: role === "admin",
        canLogMaintenance: true,
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [roles, setRoles] = useState(NO_ROLE);
    const [ready, setReady] = useState(false);
    const [passwordSetup, setPasswordSetup] = useState(ARRIVED_FROM_LINK);

    useEffect(() => {
        let cancelled = false;

        // An expired link leaves its error in the address: tidy it away
        if (ARRIVED_FROM_LINK === "expired") {
            window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }

        async function update(session) {
            const nextUser = session?.user ?? null;
            const nextRoles = await checkRole(nextUser);
            if (cancelled) return;
            setUser(nextUser);
            setRoles(nextRoles);
            setReady(true);
        }

        // Signed in on an earlier visit? (Supabase remembers it in this browser)
        supabase.auth.getSession().then(({ data }) => update(data.session));

        // Keep up to date when signing in or out (also in other tabs)
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === "PASSWORD_RECOVERY") setPasswordSetup("recovery");
            // Defer: Supabase advises not calling it again from inside this callback
            if (event !== "INITIAL_SESSION") setTimeout(() => update(session), 0);
        });

        return () => {
            cancelled = true;
            listener.subscription.unsubscribe();
        };
    }, []);

    // Returns an error message to show, or null if it worked
    async function signIn(email, password) {
        const { error } = await supabase.auth.signInWithPassword({
            email: email.trim(),
            password,
        });
        if (!error) return null;
        if (error.status === 400 || /invalid/i.test(error.message)) {
            return "That email and password don't match. Please try again.";
        }
        return "Couldn't sign in right now. Please try again in a moment.";
    }

    async function signOut() {
        await supabase.auth.signOut();
    }

    // Emails a link for choosing a new password. Returns an error message to
    // show, or null. (Supabase doesn't say whether the email has an account,
    // so nobody can use this to find out who's an editor.)
    async function sendPasswordReset(email) {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: SITE_ADDRESS,
        });
        if (!error) return null;
        console.error("Password reset email failed:", error);
        if (error.status === 429) {
            return "Too many emails have been sent recently. Please try again in an hour.";
        }
        return "Couldn't send the email right now. Please try again in a moment.";
    }

    // Sets a new password for the signed-in account. Returns an error
    // message to show, or null.
    async function updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        if (!error) {
            setPasswordSetup(null);
            return null;
        }
        console.error("Password change failed:", error);
        if (error.code === "same_password") {
            return "That's your current password. Please choose a different one.";
        }
        if (error.code === "weak_password") {
            return "That password is too easy to guess. Please choose a longer one.";
        }
        if (error.status === 401 || error.code === "session_not_found") {
            return "Your link has expired. Please use “Forgot password?” to get a new one.";
        }
        return "Couldn't save your password right now. Please try again in a moment.";
    }

    const clearPasswordSetup = () => setPasswordSetup(null);
    const setAvatarUrl = (avatarUrl) => setRoles((r) => ({ ...r, avatarUrl }));

    return (
        <AuthContext.Provider
            value={{
                user,
                ...roles,
                ready,
                passwordSetup,
                signIn,
                signOut,
                sendPasswordReset,
                updatePassword,
                clearPasswordSetup,
                setAvatarUrl,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}
