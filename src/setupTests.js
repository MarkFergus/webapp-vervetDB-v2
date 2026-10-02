// Adds DOM matchers like toBeInTheDocument() to expect
import "@testing-library/jest-dom/vitest";

// Tests never contact the real database: "loading" it just returns the
// built-in copy of the data. (monkeyData.test.js checks the real loader.)
vi.mock("./monkeyData", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original,
        loadMonkeyData: vi.fn(async () => original.BUILT_IN_DATA),
    };
});

// Each test starts at the plain page address: an open monkey's link
// (#monkey/…) left by one test would otherwise open its pop-up in the next
beforeEach(() => {
    window.history.replaceState(null, "", "/");
    // Each test starts with no copy of the monkeys saved on the "device"
    localStorage.removeItem("vervetdb-saved-data");
});
