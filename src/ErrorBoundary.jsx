import { Component } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";
import { logAppError } from "./appErrors";
import "./Modal.css"; // (the buttons' colours)
import "./ErrorBoundary.css";

// A safety net for a bug: instead of the whole app going blank, a short
// "Something went wrong" with Reload, and the error noted for Mark
// (appErrors.js). Used twice: round the whole app (index.jsx), and round
// each page (ShowPage.jsx: the top bar and bottom bar keep working, and going
// to another page clears it: resetOn, the page's address).
class ErrorBoundary extends Component {
    state = { error: null };

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidUpdate(before) {
        if (this.state.error && before.resetOn !== this.props.resetOn) this.setState({ error: null });
    }

    componentDidCatch(error, info) {
        logAppError(error, info?.componentStack);
    }

    render() {
        if (!this.state.error) return this.props.children;
        const { page } = this.props;
        return (
            <div className={page ? "ErrorBoundary is-page" : "ErrorBoundary"} role="alert">
                <IconAlertTriangle size={40} stroke={1.5} aria-hidden="true" />
                <h2>Something went wrong</h2>
                <p>
                    {page
                        ? "This page couldn't be shown. Reloading usually fixes it, or use the menu to go to another page."
                        : "vervetDB couldn't be shown. Reloading usually fixes it."}
                </p>
                <button type="button" className="Modal-edit is-blue" onClick={() => window.location.reload()}>
                    <IconRefresh size={16} aria-hidden="true" />
                    Reload
                </button>
            </div>
        );
    }
}

export default ErrorBoundary;
