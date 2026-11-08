// The Job List's Copy for WhatsApp text
import { jobListText } from "./issueRules";

const enclosures = [
    { id: 1, name: "Dreamland" },
    { id: 2, name: "D&D" },
];
const issue = (id, enclosureId, details, reportedAt, more = {}) => ({ id, enclosureId, details, reportedAt, status: "open", urgent: false, ...more });
const now = new Date(2026, 10, 8, 9, 0);

test("bold dated title, urgent first, then the longest waiting, numbered", () => {
    const text = jobListText(
        [
            issue(1, 1, "Tap dripping", new Date(2026, 10, 8, 7).toISOString()),
            issue(2, 2, "Fence wire loose", new Date(2026, 10, 5, 7).toISOString(), { urgent: true }),
            issue(3, 1, "Gate sticks", new Date(2026, 10, 7, 7).toISOString()),
            issue(4, 1, "Done already", new Date(2026, 10, 1, 7).toISOString(), { status: "fixed" }),
        ],
        enclosures,
        now,
    );
    expect(text).toBe(
        [
            "*Maintenance List 08.11*",
            "",
            "1. ⚠️ Dino & Daniel: Fence wire loose (3 days ago)",
            "2. Dreamland: Gate sticks (Yesterday)",
            "3. Dreamland: Tap dripping (Today)",
        ].join("\n"),
    );
});

test("details over several lines go on one line", () => {
    const text = jobListText([issue(1, 1, "Tap dripping\n\nby the gate", now.toISOString())], enclosures, now);
    expect(text).toContain("1. Dreamland: Tap dripping by the gate (Today)");
});

test("nothing open", () => {
    expect(jobListText([], enclosures, now)).toBe("*Maintenance List 08.11*\n\nNo open jobs");
});
