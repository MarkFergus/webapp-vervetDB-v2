// Signing in and out. Supabase is replaced with a pretend version here, so no
// real accounts are involved.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { supabase } from "./supabase";
import { AuthProvider, passwordSetupFromLink } from "./auth";
import ShowPage from "./ShowPage";

const EDITOR = { id: "editor-1", email: "editor@example.com" };
const VIEWER = { id: "viewer-1", email: "viewer@example.com" };
const PASSWORD = "correct horse battery staple";

let authListener;
let resetEmails;
function fakeSupabase({
    savedUser = null,
    editors = [EDITOR.id],
    admins = [],
    maintenance = [],
    noRoleColumn = false,
    names = {},
    resetError = null,
    updateError = null,
} = {}) {
    resetEmails = [];
    vi.spyOn(supabase.auth, "resetPasswordForEmail").mockImplementation(async (email, options) => {
        resetEmails.push({ email, options });
        return { error: resetError };
    });
    vi.spyOn(supabase.auth, "updateUser").mockResolvedValue({ error: updateError });
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
    // The editors table: a row comes back only for editors. profiles: the
    // names given.
    vi.spyOn(supabase, "from").mockImplementation((table) => table === "profiles" ? ({
        select: () => ({
            eq: (_, id) => ({
                maybeSingle: async () => ({ data: names[id] ? { full_name: names[id] } : null, error: null }),
            }),
        }),
    }) : ({
        select: () => ({
            eq: (_, id) => ({
                maybeSingle: async () => ({
                    data: editors.includes(id)
                        ? {
                              user_id: id,
                              is_admin: admins.includes(id),
                              ...(!noRoleColumn && {
                                  role: admins.includes(id) ? "admin" : maintenance.includes(id) ? "maintenance" : "editor",
                              }),
                          }
                        : null,
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
    expect(within(dialog()).getByText("You can edit monkeys, upload photos, log maintenance, and download all photos for offline use.")).toBeInTheDocument();
    const accountButton = screen.getByRole("button", { name: "Account (signed in)" });
    expect(accountButton).toHaveClass("is-signed-in");
});

test("an admin sees a pink ADMIN badge, and that they can add and delete monkeys", async () => {
    const { user, dialog } = setup({ admins: [EDITOR.id] });
    await signIn(user, EDITOR.email, PASSWORD);
    await waitFor(() => expect(within(dialog()).getByText("Admin")).toHaveClass("is-admin"));
    expect(
        within(dialog()).getByText(
            "You can add, edit and delete monkeys, upload photos, edit enclosures, log maintenance, and download all photos for offline use."
        )
    ).toBeInTheDocument();
});

test("a maintenance account: an amber MAINTENANCE badge, and that it can log maintenance", async () => {
    const { user, dialog } = setup({ maintenance: [EDITOR.id] });
    await signIn(user, EDITOR.email, PASSWORD);
    await waitFor(() => expect(within(dialog()).getByText("Maintenance")).toHaveClass("is-maintenance"));
    expect(
        within(dialog()).getByText(
            "You can log maintenance on enclosures and introcages, and download all photos for offline use."
        )
    ).toBeInTheDocument();
});

test("before roles.sql (no role column): an editor, or an admin from is_admin", async () => {
    const { user, dialog } = setup({ admins: [EDITOR.id], noRoleColumn: true });
    await signIn(user, EDITOR.email, PASSWORD);
    await waitFor(() => expect(within(dialog()).getByText("Admin")).toHaveClass("is-admin"));
});

test("an account with a name: shown above the email", async () => {
    const { user, dialog } = setup({ names: { [EDITOR.id]: "Mark Fergus Ashcroft" } });
    await signIn(user, EDITOR.email, PASSWORD);
    expect(await within(dialog()).findByText("Mark Fergus Ashcroft")).toHaveClass("AccountModal-name");
    expect(within(dialog()).getByText(EDITOR.email)).toBeInTheDocument();
});

test("no name yet: just the email", async () => {
    const { user, dialog } = setup();
    await signIn(user, EDITOR.email, PASSWORD);
    await waitFor(() => expect(within(dialog()).getByText("Editor")).toBeInTheDocument());
    expect(dialog().querySelector(".AccountModal-name")).toBeNull();
});

test("an editor's badge says Editor; a viewer's says Viewer", async () => {
    const { user, dialog } = setup();
    await signIn(user, EDITOR.email, PASSWORD);
    await waitFor(() => expect(within(dialog()).getByText("Editor")).toHaveClass("is-editor"));
});

test("an account that isn't an editor is told it can only view", async () => {
    const { user, dialog } = setup();
    await signIn(user, VIEWER.email, PASSWORD);
    await waitFor(() =>
        expect(within(dialog()).getByText("This account can download all photos for offline use, but can't edit monkeys.")).toBeInTheDocument()
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

test("Request access shows who to email", async () => {
    const { user, dialog } = setup();
    await user.click(await screen.findByRole("button", { name: "Sign in" }));
    const button = within(dialog()).getByRole("button", { name: "Request access" });
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(within(dialog()).getByRole("status")).toHaveTextContent("Please email mark@vervet.za.org");
    expect(within(dialog()).getByRole("link", { name: "mark@vervet.za.org" })).toHaveAttribute(
        "href",
        "mailto:mark@vervet.za.org?subject=vervetDB access"
    );
});

describe("passwords", () => {
    test("links in Supabase emails are recognised", () => {
        expect(passwordSetupFromLink("#access_token=x&type=recovery")).toBe("recovery");
        expect(passwordSetupFromLink("#access_token=x&type=invite")).toBe("invite");
        expect(
            passwordSetupFromLink("#error=access_denied&error_code=otp_expired&error_description=x")
        ).toBe("expired");
        expect(passwordSetupFromLink("#access_token=x&type=signup")).toBeNull();
        expect(passwordSetupFromLink("#game")).toBeNull();
        expect(passwordSetupFromLink("")).toBeNull();
    });

    test("Forgot password? emails a link back to this site", async () => {
        const { user, dialog } = setup();
        await user.click(await screen.findByRole("button", { name: "Sign in" }));
        await user.click(within(dialog()).getByRole("button", { name: "Forgot password?" }));

        expect(screen.getByRole("dialog")).toHaveAccessibleName("Forgot password");
        const email = screen.getByLabelText("Email");
        expect(email).toHaveFocus();
        await user.type(email, " new@example.com ");
        await user.click(screen.getByRole("button", { name: "Send link" }));

        expect(await within(screen.getByRole("dialog")).findByRole("status")).toHaveTextContent(
            "If new@example.com has a vervetDB account, a link to choose a new password is on its way."
        );
        expect(resetEmails[0].email).toBe("new@example.com");
        // Sent: the button now offers to send it again
        expect(screen.queryByRole("button", { name: "Send link" })).toBeNull();
        await user.click(screen.getByRole("button", { name: "Send again" }));
        await waitFor(() => expect(resetEmails).toHaveLength(2));
        expect(resetEmails[0].options.redirectTo).toBe(window.location.origin + import.meta.env.BASE_URL);

        await user.click(screen.getByRole("button", { name: "Back to sign in" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleName("Sign in");
    });

    test("too many reset emails: explains to wait", async () => {
        const { user, dialog } = setup({ resetError: { status: 429, message: "rate limit" } });
        await user.click(await screen.findByRole("button", { name: "Sign in" }));
        await user.click(within(dialog()).getByRole("button", { name: "Forgot password?" }));
        await user.type(screen.getByLabelText("Email"), "new@example.com");
        await user.click(screen.getByRole("button", { name: "Send link" }));
        expect(await screen.findByText(/Too many emails have been sent recently/)).toBeInTheDocument();
    });

    test("the link in the email opens Choose a new password; saving it signs you in", async () => {
        const { user } = setup();
        await screen.findByRole("button", { name: "Sign in" });
        // What Supabase does when someone arrives from the reset email
        authListener("PASSWORD_RECOVERY", { user: EDITOR });
        authListener("SIGNED_IN", { user: EDITOR });

        const dialog = await screen.findByRole("dialog", { name: "Choose a new password" });
        expect(within(dialog).getByText(EDITOR.email)).toBeInTheDocument();
        await waitFor(() => expect(screen.getByLabelText("New password")).toHaveFocus());
        // No Cancel: they came here to set a password
        expect(within(dialog).queryByRole("button", { name: "Cancel" })).toBeNull();

        await user.type(screen.getByLabelText("New password"), "a-new-password");
        await user.type(screen.getByLabelText("Type it again"), "a-new-password");
        await user.click(screen.getByRole("button", { name: "Save password" }));

        expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: "a-new-password" });
        expect(await screen.findByRole("dialog", { name: "Signed in" })).toBeInTheDocument();
        expect(within(screen.getByRole("dialog")).getByRole("status")).toHaveTextContent("Password saved.");
    });

    test("Change password: checks the length and that both match", async () => {
        const { user, dialog } = setup({ savedUser: EDITOR });
        await user.click(await screen.findByRole("button", { name: "Account (signed in)" }));
        await user.click(within(dialog()).getByRole("button", { name: "Change password" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleName("Change password");
        await waitFor(() => expect(screen.getByLabelText("New password")).toHaveFocus());

        await user.type(screen.getByLabelText("New password"), "short");
        await user.type(screen.getByLabelText("Type it again"), "short");
        await user.click(screen.getByRole("button", { name: "Save password" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Please use at least 8 characters.");

        await user.type(screen.getByLabelText("New password"), "-but-longer");
        await user.click(screen.getByRole("button", { name: "Save password" }));
        expect(screen.getByRole("alert")).toHaveTextContent("The two passwords don't match.");
        expect(supabase.auth.updateUser).not.toHaveBeenCalled();

        // Cancel goes back without changing anything
        await user.click(screen.getByRole("button", { name: "Cancel" }));
        expect(screen.getByRole("dialog")).toHaveAccessibleName("Signed in");
    });

    test("choosing the same password as before is explained", async () => {
        const { user, dialog } = setup({
            savedUser: EDITOR,
            updateError: { status: 422, code: "same_password", message: "same" },
        });
        await user.click(await screen.findByRole("button", { name: "Account (signed in)" }));
        await user.click(within(dialog()).getByRole("button", { name: "Change password" }));
        await user.type(screen.getByLabelText("New password"), PASSWORD);
        await user.type(screen.getByLabelText("Type it again"), PASSWORD);
        await user.click(screen.getByRole("button", { name: "Save password" }));
        expect(await screen.findByText(/That's your current password/)).toBeInTheDocument();
        expect(screen.getByRole("dialog")).toHaveAccessibleName("Change password");
    });
});
