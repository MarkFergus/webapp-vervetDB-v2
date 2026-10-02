import { useEffect, useRef, useState } from "react";
import {
    IconEye,
    IconKey,
    IconLogout,
    IconPencil,
    IconSquareRoundedX,
    IconUser,
} from "@tabler/icons-react";
import { motion, AnimatePresence } from "motion/react";
import useDialog from "./useDialog";
import { useAuth, MIN_PASSWORD_LENGTH } from "./auth";
import "./AccountModal.css";

// Who to ask for an account
const ACCESS_EMAIL = "mark@vervet.za.org";

// The account pop-up. Only accounts created in Supabase exist; there's no
// public sign-up. What it shows:
//   signed out:  sign in (email + password), or "Forgot password?"
//   forgot:      email a link for choosing a new password
//   newPassword: choose a password (from an email link, or Change password)
//   signed in:   who you are, Continue, Change password, Sign out
function AccountModal({ isOpen, onClose }) {
    const {
        user,
        isEditor,
        passwordSetup,
        signIn,
        signOut,
        sendPasswordReset,
        updatePassword,
        clearPasswordSetup,
    } = useAuth();
    const [view, setView] = useState("main");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // A message shown in green, e.g. "Password saved."
    const [notice, setNotice] = useState(null);
    // "Request access" clicked: show who to email
    const [showAccessHelp, setShowAccessHelp] = useState(false);

    // Arrived from an email link: straight to choosing a password, or (if the
    // link had expired) to signing in with an explanation
    useEffect(() => {
        if (passwordSetup === "recovery" || passwordSetup === "invite") {
            setView("newPassword");
        } else if (passwordSetup === "expired") {
            setView("main");
            setError(
                "That link has expired or was already used. Use “Forgot password?” to get a new one."
            );
        }
    }, [passwordSetup]);

    // Focus starts on the first box or button of what's showing
    const firstFieldRef = useRef(null);
    useDialog(isOpen, firstFieldRef, { onClose: handleClose });

    // The pop-up swapped to something else (signed in or out, another view):
    // move focus to its first control
    useEffect(() => {
        if (isOpen) firstFieldRef.current?.focus();
    }, [user, view]);

    function show(nextView) {
        setView(nextView);
        setShowAccessHelp(false);
        setError(null);
        setNotice(null);
        setPassword("");
        setConfirm("");
    }

    function handleClose() {
        show("main");
        if (passwordSetup) clearPasswordSetup();
        onClose();
    }

    async function handleSignIn(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        setNotice(null);
        const problem = await signIn(email, password);
        setBusy(false);
        setPassword("");
        if (problem) setError(problem);
    }

    async function handleSendReset(event) {
        event.preventDefault();
        setBusy(true);
        setError(null);
        const problem = await sendPasswordReset(email);
        setBusy(false);
        if (problem) {
            setError(problem);
        } else {
            setNotice(
                `If ${email.trim()} has a vervetDB account, a link to choose a new password is on its way. It can take a few minutes, so check your junk folder too.`
            );
        }
    }

    async function handleNewPassword(event) {
        event.preventDefault();
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Please use at least ${MIN_PASSWORD_LENGTH} characters.`);
            return;
        }
        if (password !== confirm) {
            setError("The two passwords don't match.");
            return;
        }
        setBusy(true);
        setError(null);
        const problem = await updatePassword(password);
        setBusy(false);
        if (problem) {
            setError(problem);
        } else {
            show("main");
            setNotice("Password saved.");
        }
    }

    async function handleSignOut() {
        setBusy(true);
        await signOut();
        setBusy(false);
        show("main");
    }

    const messages = (
        <>
            {notice && (
                <p className="AccountModal-notice" role="status">
                    {notice}
                </p>
            )}
            <p className="AccountModal-error" role="alert">
                {error}
            </p>
        </>
    );

    let content;
    if (view === "newPassword" && user) {
        const title =
            passwordSetup === "invite"
                ? "Welcome! Choose a password"
                : passwordSetup === "recovery"
                  ? "Choose a new password"
                  : "Change password";
        content = (
            <form className="AccountModal-content" onSubmit={handleNewPassword}>
                <h1 className="AccountModal-title" id="AccountModal-title">
                    {title}
                </h1>
                <p className="AccountModal-email">{user.email}</p>
                <label className="AccountModal-field">
                    <span>New password</span>
                    <input
                        ref={firstFieldRef}
                        type="password"
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        aria-describedby="AccountModal-passwordHint"
                    />
                </label>
                <p className="AccountModal-hint" id="AccountModal-passwordHint">
                    At least {MIN_PASSWORD_LENGTH} characters.
                </p>
                <label className="AccountModal-field">
                    <span>Type it again</span>
                    <input
                        type="password"
                        autoComplete="new-password"
                        required
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                    />
                </label>
                {messages}
                <button type="submit" className="AccountModal-button" disabled={busy}>
                    {busy ? "Saving…" : "Save password"}
                </button>
                {!passwordSetup && (
                    <button
                        type="button"
                        className="AccountModal-link"
                        onClick={() => show("main")}
                    >
                        Cancel
                    </button>
                )}
            </form>
        );
    } else if (user) {
        content = (
            <div className="AccountModal-content">
                {/* Like an account page: picture, who you are, what you can do */}
                <div className="AccountModal-profile">
                    <span className="AccountModal-avatar" aria-hidden="true">
                        <IconUser stroke={1.75} />
                    </span>
                    <h1 className="AccountModal-title" id="AccountModal-title">
                        Signed in
                    </h1>
                    <p className="AccountModal-email">{user.email}</p>
                    <span className={isEditor ? "AccountModal-badge is-editor" : "AccountModal-badge"}>
                        {isEditor ? (
                            <IconPencil stroke={2} aria-hidden="true" />
                        ) : (
                            <IconEye stroke={2} aria-hidden="true" />
                        )}
                        {isEditor ? "Editor" : "Viewer"}
                    </span>
                    <p className="AccountModal-role">
                        {isEditor
                            ? "You can edit monkeys, upload photos, and download all photos for offline use."
                            : "This account can download all photos for offline use, but can't edit monkeys."}
                    </p>
                </div>
                {notice && (
                    <p className="AccountModal-notice" role="status">
                        {notice}
                    </p>
                )}
                <button
                    type="button"
                    className="AccountModal-button"
                    ref={firstFieldRef}
                    onClick={handleClose}
                >
                    Continue
                </button>
                <div className="AccountModal-actions">
                    <button
                        type="button"
                        className="AccountModal-button is-quiet"
                        onClick={() => show("newPassword")}
                    >
                        <IconKey stroke={2} aria-hidden="true" />
                        Change password
                    </button>
                    <button
                        type="button"
                        className="AccountModal-button is-signOut"
                        onClick={handleSignOut}
                        disabled={busy}
                    >
                        <IconLogout stroke={2} aria-hidden="true" />
                        {busy ? "Signing out…" : "Sign out"}
                    </button>
                </div>
            </div>
        );
    } else if (view === "forgot") {
        content = (
            <form className="AccountModal-content" onSubmit={handleSendReset}>
                <h1 className="AccountModal-title" id="AccountModal-title">
                    Forgot password
                </h1>
                <p className="AccountModal-note">
                    Enter your email and we'll send you a link to choose a new
                    password.
                </p>
                <label className="AccountModal-field">
                    <span>Email</span>
                    <input
                        ref={firstFieldRef}
                        type="email"
                        autoComplete="username"
                        required
                        value={email}
                        onChange={(e) => {
                            setEmail(e.target.value);
                            setNotice(null);
                        }}
                    />
                </label>
                {messages}
                <button type="submit" className="AccountModal-button" disabled={busy}>
                    {/* Once sent: "Send again", in case the email doesn't arrive */}
                    {busy ? "Sending…" : notice ? "Send again" : "Send link"}
                </button>
                <button
                    type="button"
                    className="AccountModal-link"
                    onClick={() => show("main")}
                >
                    Back to sign in
                </button>
            </form>
        );
    } else {
        content = (
            <form className="AccountModal-content" onSubmit={handleSignIn}>
                <h1 className="AccountModal-title" id="AccountModal-title">
                    Sign in
                </h1>
                <p className="AccountModal-note">
                    For vervetDB staff: sign in to edit monkeys and download all
                    photos for offline use. Anyone can browse the monkeys without
                    signing in.
                </p>
                <label className="AccountModal-field">
                    <span>Email</span>
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
                    <span>Password</span>
                    <input
                        type="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </label>
                {messages}
                <button type="submit" className="AccountModal-button" disabled={busy}>
                    {busy ? "Signing in…" : "Sign in"}
                </button>
                <button
                    type="button"
                    className="AccountModal-link"
                    onClick={() => show("forgot")}
                >
                    Forgot password?
                </button>
                <button
                    type="button"
                    className="AccountModal-link"
                    aria-expanded={showAccessHelp}
                    onClick={() => setShowAccessHelp((shown) => !shown)}
                >
                    Request access
                </button>
                {showAccessHelp && (
                    <p className="AccountModal-access" role="status">
                        Please email{" "}
                        <a href={`mailto:${ACCESS_EMAIL}?subject=vervetDB access`}>
                            {ACCESS_EMAIL}
                        </a>
                    </p>
                )}
            </form>
        );
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
                            {content}
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}

export default AccountModal;
