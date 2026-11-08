// Last Seen from records (last-seen.sql): the database notes a sighting for
// each record that shows a monkey was seen, with what it came from
import { render, screen } from "@testing-library/react";
import { LastSeen, SEEN_SOURCES, missingText } from "./MarkSeen";
import { timelineMonths } from "./timelineRules";

const monkey = { id: 7, name: "Malawi" };

test("the Full Profile says what they were last seen in: (Dewormed)", () => {
    const spot = { id: 1, monkeyId: 7, date: "2026-11-04", note: "", source: "dewormed", by: "Al" };
    render(<LastSeen monkey={monkey} record={{ lastSeen: "2026-11-04", missed: 0, spot }} canMark={false} />);
    expect(screen.getByText(/4th Nov 2026 \(Dewormed\)/)).toBeInTheDocument();
});

test("Mark As Seen: no source, just who", () => {
    const spot = { id: 1, monkeyId: 7, date: "2026-11-04", note: "", source: null, by: "Sam" };
    render(<LastSeen monkey={monkey} record={{ lastSeen: "2026-11-04", missed: 0, spot }} canMark={false} />);
    expect(screen.queryByText(/\(/)).toBeNull();
    expect(screen.getByText(/by Sam/)).toBeInTheDocument();
});

test("every kind of record has its words, Trapped and Escape too", () => {
    expect(SEEN_SOURCES.trapped).toBe("Trapped");
    expect(SEEN_SOURCES.escape).toBe("Escape");
    expect(SEEN_SOURCES.injury_update).toBe("Injury Update");
});

test("Monitoring's missing line: no year, to keep it on one line", () => {
    expect(missingText({ missed: 2, lastSeen: "2026-10-12" })).toBe("Not seen last 2 sessions · last seen 12th Oct");
});

test("the Timeline: a record's own sighting isn't counted again as a sighting", () => {
    const spots = [
        { id: 1, monkeyId: 7, date: "2026-11-04", source: "dewormed" },
        { id: 2, monkeyId: 7, date: "2026-11-05", source: null },
    ];
    const entries = timelineMonths(monkey, { spots }).flatMap((m) => m.entries);
    const seen = entries.filter((e) => e.kind === "seen");
    expect(seen).toHaveLength(1);
    expect(seen[0].date).toBe("2026-11-05");
});
