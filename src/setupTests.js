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
