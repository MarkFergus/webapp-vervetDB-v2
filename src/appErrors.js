import { supabase } from "./supabase";
import { APP_VERSION } from "./changelog";

// Notes a crash in the database (app-errors.sql), for Mark: what went wrong,
// on which page, which version, which browser. Quietly: no signal, or
// app-errors.sql not run yet, and it's just skipped. At most a few per visit,
// so one bug that keeps happening doesn't fill the table.
const MAX_PER_VISIT = 5;
let sent = 0;

export function logAppError(error, componentStack = "") {
    if (sent >= MAX_PER_VISIT) return;
    sent += 1;
    try {
        const message = String(error?.message ?? error ?? "Unknown error");
        const stack = [error?.stack ?? "", componentStack ?? ""].filter(Boolean).join("\n--\n");
        supabase
            .rpc("log_app_error", {
                p_message: message.slice(0, 1000),
                p_stack: stack.slice(0, 8000),
                p_page: window.location.hash.slice(0, 200),
                p_version: APP_VERSION,
                p_browser: navigator.userAgent.slice(0, 300),
            })
            .then(
                () => {},
                () => {}
            );
    } catch {
        // (nothing: a safety net mustn't fall over itself)
    }
}
