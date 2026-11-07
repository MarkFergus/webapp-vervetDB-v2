// What's saved ahead of time, so the daily forms work for a troop nobody's opened
import { prefillMonitoring } from "./offlinePrefill";
import * as data from "./monkeyData";

vi.mock("./monkeyData", () => ({
    keepInjurySnapshot: vi.fn(),
    loadAllMaintenance: vi.fn(async () => []),
    loadMaintenanceIssues: vi.fn(async () => []),
    loadBabyRecords: vi.fn(async () => []),
    loadConditions: vi.fn(async () => []),
    loadCurrentInjuries: vi.fn(async () => [{ id: 1, monkeyId: 2 }]),
    loadDewormingCalendar: vi.fn(async () => []),
    loadDewormingSheets: vi.fn(async () => []),
    loadLastMoves: vi.fn(async () => ({})),
    loadMonitoringFor: vi.fn(async () => ({})),
    loadMonitoringSessions: vi.fn(async () => []),
    loadMoves: vi.fn(async () => []),
    loadSpotSightings: vi.fn(async () => []),
}));

const enclosures = [{ id: 1, name: "Goliath", type: "troop" }, { id: 2, name: "Sickbay", type: "care_unit" }];
const monkeys = [
    { id: 2, name: "Bilbo", troop: "Goliath", enclosure: "Goliath", img: [] },
    { id: 1, name: "Aroha", troop: "Goliath", enclosure: "Goliath", img: [] },
];

beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
});

test("each troop's briefing, asked for exactly as its page asks (same monkeys, same order)", async () => {
    expect(await prefillMonitoring(monkeys, enclosures)).toBe(true);
    expect(data.loadCurrentInjuries).toHaveBeenCalledTimes(1);
    expect(data.loadCurrentInjuries).toHaveBeenCalledWith([1, 2]);
    expect(data.loadConditions).toHaveBeenCalledWith([1, 2]);
    expect(data.keepInjurySnapshot).toHaveBeenCalledWith([{ id: 1, monkeyId: 2 }], [1, 2]);
    for (const list of [data.loadMonitoringSessions, data.loadAllMaintenance, data.loadDewormingSheets, data.loadMoves]) {
        expect(list).toHaveBeenCalled();
    }
    expect(data.loadBabyRecords.mock.calls.map(([kind]) => kind)).toEqual(["milk", "weights"]);
});

test("not more than every half hour; and a failure doesn't stop the rest", async () => {
    const now = Date.now();
    data.loadMonitoringSessions.mockRejectedValueOnce(new Error("no"));
    expect(await prefillMonitoring(monkeys, enclosures, now)).toBe(true);
    expect(await prefillMonitoring(monkeys, enclosures, now + 60000)).toBe(false);
    expect(await prefillMonitoring(monkeys, enclosures, now + 31 * 60000)).toBe(true);
});
