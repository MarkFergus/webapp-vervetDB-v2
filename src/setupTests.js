// Adds DOM matchers like toBeInTheDocument() to expect. Added straight to the
// global expect the tests use: "@testing-library/jest-dom/vitest" adds them
// to whichever copy of vitest it finds, which while the preview server is
// re-bundling packages can be a different one (then about 200 tests fail
// with "Invalid Chai property").
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// Tests never contact the real database: "loading" it just returns the
// built-in data with the sample monkeys (testMonkeys.js). BUILT_IN_DATA
// carries them too in tests, as the pages' defaults. (monkeyData.test.js
// checks the real loader.)
vi.mock("./monkeyData", async (importOriginal) => {
    const original = await importOriginal();
    const { default: testMonkeys } = await import("./testMonkeys");
    const BUILT_IN_DATA = { ...original.BUILT_IN_DATA, monkeys: testMonkeys };
    return {
        ...original,
        BUILT_IN_DATA,
        loadMonkeyData: vi.fn(async () => BUILT_IN_DATA),
        // (no Arrival Info: as if arrival-info.sql hasn't run)
        loadArrivalInfo: vi.fn(async () => {
            throw new Error("No database in tests");
        }),
        // (no Named By: as if named-by.sql hasn't run)
        loadNamedBy: vi.fn(async () => {
            throw new Error("No database in tests");
        }),
    };
});

// Each test starts at the plain page address: an open monkey's link
// (#monkey/…) left by one test would otherwise open its pop-up in the next
beforeEach(() => {
    window.history.replaceState(null, "", "/");
    // Each test starts with no copy of the monkeys saved on the "device"
    localStorage.removeItem("vervetdb-saved-data");
});
