import { useEffect, useRef, useState } from "react";
import { IconSquareRoundedX } from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { useAuth } from "./auth";
import "./AccountModal.css";

// Sign in (email + password), or when signed in: who you are and Sign out.
// Only accounts created in Supabase exist; there's no public sign-up.
function AccountModal({ isOpen, onClose }) {
    const { user, isEditor, signIn, signOut } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);

    // Focus starts in the email box (or on Sign out when signed in)
    const firstFieldRef = useRef(null);
    useDialog(isOpen, firstFieldRef, { onClose: handleClose });

    // Just signed in or out: the form swaps over, so move focus to the new
    // first control (Continue, or the email box)
    useEffect(() => {
        if (isOpen) firstFieldRef.current?.focus();
    }, [user]);

    function handleClose() {
        setError(null);
        setPassword("");
        onClose();
    }

    async function handleSignIn(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const problem = await signIn(email, password);
        setBusy(false);
        setPassword("");
        if (problem) setError(problem);
    }

    async function handleSignOut() {
        setBusy(true);
        await signOut();
        setBusy(false);
    }

    return (
        <AnimatePresence>
            {isOpen && (
                <div
                    className="AccountModal"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="AccountModal-title"
                >
                    <motion.div
                        className="AccountModal-overlay"
                        onClick={handleClose}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: 0.2 } }}
                        exit={{ opacity: 0 }}
                    ></motion.div>
                    <motion.div
                        className="AccountModal-windowbox"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1, transition: { duration: 0.2 } }}
                        exit={{ scale: 0, opacity: 0 }}
                    >
                        <div className="AccountModal-window">
                            <div className="AccountModal-close">
                                <button type="button" onClick={handleClose} aria-label="Close">
                                    <IconSquareRoundedX />
                                </button>
                            </div>

                            {user ? (
                                <div className="AccountModal-content">
                                    <h1 className="AccountModal-title" id="AccountModal-title">
                                        Signed in
                                    </h1>
                                    <p className="AccountModal-email">{user.email}</p>
                                    <p
                                        className={
                                            isEditor
                                                ? "AccountModal-role is-editor"
                                                : "AccountModal-role"
                                        }
                                    >
                                        {isEditor
                                            ? "You can edit monkeys."
                                            : "This account can view but not edit monkeys."}
                                    </p>
                                    <button
                                        type="button"
                                        className="AccountModal-button"
                                        ref={firstFieldRef}
                                        onClick={handleClose}
                                    >
                                        Continue
                                    </button>
                                    <button
                                        type="button"
                                        className="AccountModal-button is-signOut"
                                        onClick={handleSignOut}
                                        disabled={busy}
                                    >
                                        {busy ? "Signing out…" : "Sign out"}
                                    </button>
                                </div>
                            ) : (
                                <form className="AccountModal-content" onSubmit={handleSignIn}>
                                    <h1 className="AccountModal-title" id="AccountModal-title">
                                        Sign in
                                    </h1>
                                    <p className="AccountModal-note">
                                        For vervetDB editors. Anyone can browse the
                                        monkeys without signing in.
                                    </p>
                                    <label className="AccountModal-field">
                                        Email
                                        <input
                                            ref={firstFieldRef}
                                            type="email"
                                            autoComplete="username"
                                            required
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                        />
                                    </label>
                                    <label className="AccountModal-field">
                                        Password
                                        <input
                                            type="password"
                                            autoComplete="current-password"
                                            required
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                        />
                                    </label>
                                    <p className="AccountModal-error" role="alert">
                                        {error}
                                    </p>
                                    <button
                                        type="submit"
                                        className="AccountModal-button"
                                        disabled={busy}
                                    >
                                        {busy ? "Signing in…" : "Sign in"}
                                    </button>
                                </form>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default AccountModal;
