// For tests: signed in as a member of staff (any role: maintenance here),
// who can make PDFs. Use in a test file with:
//   vi.mock("./auth", async (importOriginal) => (await import("./testStaff")).staffAuth(await importOriginal()));
export const STAFF = {
    user: { id: "staff-1", email: "staff@example.com" },
    role: "maintenance",
    isEditor: false,
    isAdmin: false,
    canLogMaintenance: true,
    name: null,
    avatarUrl: null,
    setAvatarUrl: () => {},
    ready: true,
    passwordSetup: null,
    signIn: async () => {},
    signOut: async () => {},
};

export const staffAuth = (actual) => ({ ...actual, useAuth: () => STAFF });
