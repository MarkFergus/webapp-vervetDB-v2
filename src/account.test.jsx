// Signing in and out. Supabase is replaced with a pretend version here, so no
// real accounts are involved.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider } from "./auth";
import ShowPage from "./ShowPage";

const EDITOR = { id: "editor-1", email: "editor@example.com" };
const VIEWER = { id: "viewer-1", email: "viewer@example.com" };
const PASSWORD = "correct horse battery staple";

let authListener;
function fakeSupabase({ savedUser = null, editors = [EDITOR.id] } = {}) {
    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
        data: { session: savedUser ? { user: savedUser } : null },
    });
    vi.spyOn(supabase.auth, "onAuthStateChange").mockImplementation((callback) => {
        authListener = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
    });
    vi.spyOn(supabase.auth, "signInWithPassword").mockImplementation(async ({ email, password }) => {
        const user = [EDITOR, VIEWER].find((u) => u.email === email);
        if (!user || password !== PASSWORD) {
            return { error: { status: 400, message: "Invalid login credentials" } };
        }
        authListener("SIGNED_IN", { user });
        return { error: null };
    });
    vi.spyOn(supabase.auth, "signOut").mockImplementation(async () => {
        authListener("SIGNED_OUT", null);
        return { error: null };
    });
    // The editors table: a row comes back only for editors
    vi.spyOn(supabase, "from").mockImplementation(() => ({
        select: () => ({
            eq: (_, id) => ({
                maybeSingle: async () => ({
                    data: editors.includes(id) ? { user_id: id } : null,
                    error: null,
                }),
            }),
        }),
    }));
}

afterEach(() => vi.restoreAllMocks());

// The nav bar's account button. (While a pop-up is open the nav is `inert`,
// which real browsers hide from screen readers but the test browser doesn't,
// so "the Sign in button" could also match the one in the form.)
const navAccountButton = () => document.querySelector(".Nav-account");

function setup(options) {
    fakeSupabase(options);
    const user = userEvent.setup();
    render(
        <AuthProvider>
            <ShowPage />
        </AuthProvider>
    );
    const dialog = () => screen.getByRole("dialog", { name: /Sign in|Signed in/ });
    return { user, dialog };
}

async function signIn(user, email, password) {
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await user.type(screen.getByLabelText("Email"), email);
    await user.type(screen.getByLabelText("Password"), password);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Sign in" }));
}

test("the Sign in button opens a form, ready to type your email", async () => {
    const { user, dialog } = setup();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    expect(dialog()).toHaveAccessibleName("Sign in");
    expect(screen.getByLabelText("Email")).toHaveFocus();
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "password");
});

test("a wrong password shows a clear message and keeps you signed out", async () => {
    const { user } = setup();
    await signIn(user, EDITOR.email, "wrong");
    expect(await screen.findByRole("alert")).toHaveTextContent(
        "That email and password don't match"
    );
    expect(screen.getByLabelText("Password")).toHaveValue(""); // cleared
    expect(navAccountButton()).toHaveAccessibleName("Sign in");
});

test("the editor signs in: told they can edit, and the nav icon turns green", async () => {
    const { user, dialog } = setup();
    await signIn(user, EDITOR.email, PASSWORD);

    await waitFor(() => expect(dialog()).toHaveAccessibleName("Signed in"));
    expect(within(dialog()).getByText(EDITOR.email)).toBeInTheDocument();
    expect(within(dialog()).getByText("You can edit monkeys.")).toBeInTheDocument();
    const accountButton = screen.getByRole("button", { name: "Account (signed in)" });
    expect(accountButton).toHaveClass("is-signed-in");
});

test("an account that isn't an editor is told it can only view", async () => {
    const { user, dialog } = setup();
    await signIn(user, VIEWER.email, PASSWORD);
    await waitFor(() =>
        expect(within(dialog()).getByText("This account can view but not edit monkeys.")).toBeInTheDocument()
    );
});

test("signing out goes back to the Sign in form", async () => {
    const { user, dialog } = setup();
    await signIn(user, EDITOR.email, PASSWORD);
    await user.click(await within(dialog()).findByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(dialog()).toHaveAccessibleName("Sign in"));
    expect(navAccountButton()).toHaveAccessibleName("Sign in");
    expect(navAccountButton()).not.toHaveClass("is-signed-in");
});

test("a sign-in from an earlier visit is remembered", async () => {
    setup({ savedUser: EDITOR });
    expect(await screen.findByRole("button", { name: "Account (signed in)" })).toBeInTheDocument();
});

test("Escape closes the pop-up", async () => {
    const { user } = setup();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("after signing in, Continue (focused) closes the pop-up; Sign out is below it", async () => {
    const { user, dialog } = setup();
    await signIn(user, EDITOR.email, PASSWORD);
    const continueButton = await within(dialog()).findByRole("button", { name: "Continue" });
    await waitFor(() => expect(continueButton).toHaveFocus());

    // Continue comes before Sign out
    const buttons = within(dialog())
        .getAllByRole("button")
        .map((b) => b.textContent)
        .filter((t) => t === "Continue" || t === "Sign out");
    expect(buttons).toEqual(["Continue", "Sign out"]);
    expect(within(dialog()).getByRole("button", { name: "Sign out" })).toHaveClass("is-signOut");

    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(navAccountButton()).toHaveClass("is-signed-in"); // still signed in
});
