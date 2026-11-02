// Deworming's Schedule: Outlook's titles read into groups and sessions,
// and what's due or overdue (dewormingSchedule.js)
import { readEvent, readTitle, relativeDay, scheduleBuckets, scheduleOf } from "./dewormingSchedule";

// (tests of overdue before vervetDB's lists started: from an earlier day)
const EARLY = "2026-01-01";

const GROUPS = [
    { key: "troop:1", name: "D&D Troop" },
    { key: "troop:2", name: "H&B Troop" },
    { key: "troop:3", name: "Jalamango Troop" },
    { key: "troop:4", name: "Gismo Troop" },
    { key: "troop:5", name: "Robert Troop" },
    { key: "ics:Top", name: "Top Section ICs" },
    { key: "ics:Middle", name: "Middle Section ICs" },
    { key: "ics:Bottom", name: "Bottom Section ICs" },
    { key: "enclosure:6", name: "Global Troop" },
    { key: "enclosure:7", name: "James Troop" },
];

test("titles as written in Outlook", () => {
    expect(readTitle("Gismo 6m deworming", GROUPS)).toEqual({ groupKeys: ["troop:4"], session: "6_month" });
    expect(readTitle("Robert 3m F/U deworming", GROUPS)).toEqual({ groupKeys: ["troop:5"], session: "3_month_fu" });
    expect(readTitle("Top Section IC 6m deworming", GROUPS)).toEqual({ groupKeys: ["ics:Top"], session: "6_month" });
    expect(readTitle("D&D 3m deworming", GROUPS)).toEqual({ groupKeys: ["troop:1"], session: "3_month" });
    // (done together: each group)
    expect(readTitle("Top & Middle IC 3m deworming", GROUPS)).toEqual({
        groupKeys: ["ics:Top", "ics:Middle"],
        session: "3_month",
    });
    expect(readTitle("H&B & Jala 6m deworming", GROUPS)).toEqual({
        groupKeys: ["troop:2", "troop:3"],
        session: "6_month",
    });
    expect(readTitle("Global & James 6m F/U Deworming", GROUPS)).toEqual({
        groupKeys: ["enclosure:6", "enclosure:7"],
        session: "6_month_fu",
    });
});

test('a slash: both, the same as "&" (F/U unaffected)', () => {
    expect(readTitle("H&B/Jala 3m deworming", GROUPS)).toEqual({
        groupKeys: ["troop:2", "troop:3"],
        session: "3_month",
    });
    expect(readTitle("Top/Middle IC 6m F/U deworming", GROUPS)).toEqual({
        groupKeys: ["ics:Top", "ics:Middle"],
        session: "6_month_fu",
    });
    expect(readTitle("Global / James 3m F/U deworming", GROUPS)).toEqual({
        groupKeys: ["enclosure:6", "enclosure:7"],
        session: "3_month_fu",
    });
});

test("3-month, 6 Month: the same as 3m, 6m", () => {
    expect(readTitle("Gismo 3-month deworming", GROUPS)).toEqual({ groupKeys: ["troop:4"], session: "3_month" });
    expect(readTitle("Robert 6 Month F/U deworming", GROUPS)).toEqual({
        groupKeys: ["troop:5"],
        session: "6_month_fu",
    });
    expect(readTitle("D&D 3months deworming", GROUPS)).toEqual({ groupKeys: ["troop:1"], session: "3_month" });
});

test("special dewormings (no session) are left out, not Couldn't Read", () => {
    const events = [
        { uid: "1", title: "Bobo deworming", startsOn: "2026-11-10" },
        { uid: "2", title: "Gismoo 6m deworming", startsOn: "2026-11-11" },
    ];
    const { due, unread } = scheduleOf(events, GROUPS, [], "2026-11-02");
    expect(due).toEqual([]);
    expect(unread.map((u) => u.title)).toEqual(["Gismoo 6m deworming"]);
});

test("anything else isn't guessed", () => {
    expect(readTitle("Global & James 33m deworming", GROUPS)).toBeNull();
    expect(readTitle("Gismoo 6m deworming", GROUPS)).toBeNull();
    expect(readTitle("H&B deworming", GROUPS)).toBeNull();
    expect(readTitle("Gis 6m deworming", GROUPS)).toBeNull();
    expect(readTitle("Top & Middle 3m deworming", GROUPS)).toBeNull();
});

test("the schedule: due soonest first (with its list once prepared), overdue, and what couldn't be read", () => {
    const events = [
        { uid: "1", title: "H&B & Jala 6m deworming", startsOn: "2026-11-20" },
        { uid: "2", title: "Gismo 3m deworming", startsOn: "2026-11-10" },
        // (passed: no list → overdue; a list near it → done; moved later → not overdue)
        { uid: "3", title: "Robert 3m deworming", startsOn: "2026-10-20" },
        { uid: "4", title: "D&D 6m deworming", startsOn: "2026-10-15" },
        { uid: "5", title: "Top IC 6m F/U deworming", startsOn: "2026-10-25" },
        { uid: "6", title: "Top IC 6m F/U deworming", startsOn: "2026-11-12" },
        { uid: "7", title: "Global & James 33m deworming", startsOn: "2026-11-15" },
    ];
    const sheets = [
        { id: 1, groupKey: "troop:1", session: "6_month", startDate: "2026-10-16" },
        { id: 2, groupKey: "troop:4", session: "3_month", startDate: "2026-11-11" },
    ];
    const { due, overdue, unread } = scheduleOf(events, GROUPS, sheets, "2026-11-02", EARLY);
    expect(due.map((e) => [e.date, e.groupName, e.session, e.sheet?.id ?? null])).toEqual([
        ["2026-11-10", "Gismo Troop", "3_month", 2],
        ["2026-11-12", "Top Section ICs", "6_month_fu", null],
        ["2026-11-20", "H&B Troop", "6_month", null],
        ["2026-11-20", "Jalamango Troop", "6_month", null],
    ]);
    expect(overdue.map((e) => [e.date, e.groupName])).toEqual([["2026-10-20", "Robert Troop"]]);
    expect(unread).toEqual([{ title: "Global & James 33m deworming", startsOn: "2026-11-15" }]);
});

test("overdue: not once the group's had a later list (it's moved on)", () => {
    const events = [{ uid: "1", title: "Robert 3m deworming", startsOn: "2026-08-01" }];
    const sheets = [{ id: 1, groupKey: "troop:5", session: "3_month_fu", startDate: "2026-09-01" }];
    expect(scheduleOf(events, GROUPS, sheets, "2026-11-02", EARLY).overdue).toEqual([]);
    expect(scheduleOf(events, GROUPS, [], "2026-11-02", EARLY).overdue).toHaveLength(1);
});

test('entered over several days ("… due this week"): once, from its first day', () => {
    const events = ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13"].map((d, i) => ({
        uid: `${i}`,
        title: "H&B & Jala 3m deworming due this week",
        startsOn: d,
    }));
    const { due } = scheduleOf(events, GROUPS, [], "2026-11-02");
    expect(due.map((e) => [e.date, e.groupName])).toEqual([
        ["2026-11-09", "H&B Troop"],
        ["2026-11-09", "Jalamango Troop"],
    ]);
    // (started yesterday, no list yet: overdue from its first day, not shown again for the days after)
    const late = scheduleOf(events, GROUPS, [], "2026-11-10", EARLY);
    expect(late.due).toEqual([]);
    expect(late.overdue.map((e) => e.date)).toEqual(["2026-11-09", "2026-11-09"]);
});

test("before lists started in vervetDB (done on paper): never overdue", () => {
    const events = [
        { uid: "1", title: "Robert 3m deworming", startsOn: "2026-10-20" },
        { uid: "2", title: "Gismo 6m deworming", startsOn: "2026-11-02" },
    ];
    const { overdue } = scheduleOf(events, GROUPS, [], "2026-11-05");
    expect(overdue.map((e) => [e.date, e.groupName])).toEqual([["2026-11-02", "Gismo Troop"]]);
});

test("unscheduled: each group with nothing in Outlook or in progress, its next and when it's due", () => {
    const groups = [
        { key: "troop:1", name: "D&D Troop" },
        { key: "troop:2", name: "H&B Troop" },
        { key: "troop:3", name: "Jalamango Troop" },
        { key: "troop:4", name: "Gismo Troop" },
        { key: "troop:5", name: "Robert Troop" },
        { key: "ics:Top", name: "Top Section ICs", monkeys: [] },
    ];
    const events = [
        // (on paper, before vervetDB: Robert's 3-Month, so its F/U's due 14 days after its last day)
        { uid: "1", title: "Robert 3m deworming", startsOn: "2026-10-01" },
        // (Gismo's 6-Month F/U on paper: its 3-Month's due 3 months after the 6-Month started)
        { uid: "2", title: "Gismo 6m deworming", startsOn: "2026-08-20" },
        { uid: "3", title: "Gismo 6m F/U deworming", startsOn: "2026-09-05" },
        // (scheduled: not unscheduled)
        { uid: "4", title: "Jala 6m deworming", startsOn: "2026-11-20" },
    ];
    const sheets = [
        // (D&D: in progress → not unscheduled; H&B: approved 6-Month F/U with a Day 4 → its 3-Month from the 6-Month)
        { id: 1, groupKey: "troop:1", session: "3_month", startDate: "2026-11-01", status: "ready" },
        { id: 2, groupKey: "troop:2", session: "6_month", startDate: "2026-07-01", status: "approved" },
        {
            id: 3,
            groupKey: "troop:2",
            session: "6_month_fu",
            startDate: "2026-07-20",
            startedOn: "2026-07-21",
            status: "approved",
            lines: [{ day4: true }],
        },
    ];
    const { unscheduled } = scheduleOf(events, groups, sheets, "2026-11-02");
    expect(unscheduled.map((u) => [u.groupName, u.session, u.date, u.late])).toEqual([
        // (overdue first: H&B's 3-Month was due 1 Oct; Robert's F/U due 17 Oct)
        ["H&B Troop", "3_month", "2026-10-01", true],
        ["Robert Troop", "3_month_fu", "2026-10-17", true],
        ["Gismo Troop", "3_month", "2026-11-20", false],
    ]);
});

test("unscheduled: no past deworming found → its 6-Month, no date", () => {
    const { unscheduled } = scheduleOf([], [{ key: "troop:9", name: "Koko Troop" }], [], "2026-11-02");
    expect(unscheduled).toEqual([
        { groupKey: "troop:9", groupName: "Koko Troop", session: "6_month", date: null, late: false },
    ]);
});

test("at a glance: Overdue, This Week (Monday to Sunday), each month, then No Date Yet", () => {
    const item = (date, groupName, extra = {}) => ({
        date,
        groupKey: groupName,
        groupName,
        session: "3_month",
        ...extra,
    });
    const buckets = scheduleBuckets(
        {
            overdue: [item("2026-11-01", "Robert Troop")],
            due: [
                item("2026-11-08", "Gismo Troop", { sheet: null }),
                item("2026-11-09", "D&D Troop", { sheet: null }),
                item("2027-01-04", "H&B Troop", { sheet: null }),
            ],
            unscheduled: [
                item("2026-10-20", "Koko Troop", { late: true }),
                item("2026-12-01", "Jalamango Troop", { late: false }),
                item(null, "Top Section ICs", { late: false }),
            ],
        },
        "2026-11-02"
    );
    expect(buckets.map((b) => [b.label, b.items.map((i) => `${i.groupName} ${i.kind}`)])).toEqual([
        ["Overdue", ["Koko Troop estimate", "Robert Troop outlook"]],
        ["This Week", ["Gismo Troop outlook"]],
        ["November 2026", ["D&D Troop outlook"]],
        ["December 2026", ["Jalamango Troop estimate"]],
        ["January 2027", ["H&B Troop outlook"]],
        ["No Date Yet", ["Top Section ICs estimate"]],
    ]);
});

test("how long until (or since)", () => {
    const today = "2026-11-02";
    expect(
        ["2026-11-02", "2026-11-03", "2026-11-01", "2026-11-05", "2026-10-28", "2026-11-20", "2026-12-01"].map((d) =>
            relativeDay(d, today)
        )
    ).toEqual(["Today", "Tomorrow", "Yesterday", "In 3 days", "5 days ago", "In 3 weeks", "In 4 weeks"]);
});

test("This Week runs to Sunday", () => {
    const item = (date) => ({ date, groupKey: date, groupName: date, session: "3_month", sheet: null });
    const due = ["2026-11-06", "2026-11-08", "2026-11-09"].map(item);
    const labels = (today) =>
        scheduleBuckets({ due: due.filter((e) => e.date >= today), overdue: [], unscheduled: [] }, today).map((b) => [
            b.label,
            b.items.length,
        ]);
    // (Wednesday: to Sunday the 8th; Monday the 9th is next week)
    expect(labels("2026-11-04")).toEqual([
        ["This Week", 2],
        ["November 2026", 1],
    ]);
    // (on Sunday: just that day)
    expect(labels("2026-11-08")).toEqual([
        ["This Week", 1],
        ["November 2026", 1],
    ]);
});

test('"+": together, each with its own session', () => {
    expect(readEvent("Global 3m + James 3m F/U deworming", GROUPS)).toEqual([
        { groupKeys: ["enclosure:6"], session: "3_month" },
        { groupKeys: ["enclosure:7"], session: "3_month_fu" },
    ]);
    // (with "&" in a part, and words after)
    expect(readEvent("H&B & Jala 6m + Top IC 6m F/U deworming due this week", GROUPS)).toEqual([
        { groupKeys: ["troop:2", "troop:3"], session: "6_month" },
        { groupKeys: ["ics:Top"], session: "6_month_fu" },
    ]);
    // (or a comma)
    expect(readEvent("Gismo 3m, Robert 6m deworming", GROUPS)).toEqual([
        { groupKeys: ["troop:4"], session: "3_month" },
        { groupKeys: ["troop:5"], session: "6_month" },
    ]);
    // (one part unreadable: the whole title's Couldn't Read)
    expect(readEvent("Global 3m + Jamess 3m F/U deworming", GROUPS)).toBeNull();
    const { due, unread } = scheduleOf(
        [
            { uid: "1", title: "Global 3m + James 3m F/U deworming", startsOn: "2026-11-10" },
            { uid: "2", title: "Global 3m + Jamess 3m F/U deworming", startsOn: "2026-11-11" },
        ],
        GROUPS,
        [],
        "2026-11-02"
    );
    expect(due.map((e) => [e.date, e.groupName, e.session])).toEqual([
        ["2026-11-10", "Global Troop", "3_month"],
        ["2026-11-10", "James Troop", "3_month_fu"],
    ]);
    expect(unread.map((u) => u.title)).toEqual(["Global 3m + Jamess 3m F/U deworming"]);
});
