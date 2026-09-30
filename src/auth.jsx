import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

// Who's signed in, shared with every page through <AuthProvider>.
//   user:     the signed-in account (null when signed out)
//   isEditor: whether that account may change monkeys (in the `editors` table)
//   ready:    false until we've checked for a saved sign-in
const AuthContext = createContext({
    user: null,
    isEditor: false,
    ready: true,
    signIn: async () => {},
    signOut: async () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

// Is this account listed as an editor? (The database only lets people see
// their own entry, so a row coming back means yes.)
async function checkEditor(user) {
    if (!user) return false;
    const { data, error } = await supabase
        .from("editors")
        .select("user_id")
        .eq("user_id", user.id)
        .maybeSingle();
    if (error) {
        console.error("Couldn't check editor status:", error);
        return false;
    }
    return Boolean(data);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isEditor, setIsEditor] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function update(session) {
            const nextUser = session?.user ?? null;
            const editor = await checkEditor(nextUser);
            if (cancelled) return;
            setUser(nextUser);
            setIsEditor(editor);
            setReady(true);
        }

        // Signed in on an earlier visit? (Supabase remembers it in this browser)
        supabase.auth.getSession().then(({ data }) => update(data.session));

        // Keep up to date when signing in or out (also in other tabs)
        const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
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

    return (
        <AuthContext.Provider value={{ user, isEditor, ready, signIn, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}
