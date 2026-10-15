// Where a GPS position falls on the sanctuary map (mapGeo.js)
import { REFERENCE_POINTS, UNITS_PER_METRE, mapPointOf, onMap } from "./mapGeo";

test("each reference point lands within a few metres of its spot on the map", () => {
    for (const point of REFERENCE_POINTS) {
        const [x, y] = mapPointOf(point.lat, point.lng);
        const metresOff = Math.hypot(x - point.map[0], y - point.map[1]) / UNITS_PER_METRE;
        expect(metresOff, point.what).toBeLessThan(5);
    }
});

test("a map unit is a little under a metre", () => {
    expect(1 / UNITS_PER_METRE).toBeGreaterThan(0.8);
    expect(1 / UNITS_PER_METRE).toBeLessThan(0.95);
});

test("the sanctuary is on the map; a few kilometres away isn't", () => {
    const sickbay = REFERENCE_POINTS.find((p) => p.what.startsWith("Sickbay"));
    expect(onMap(mapPointOf(sickbay.lat, sickbay.lng))).toBe(true);
    expect(onMap(mapPointOf(sickbay.lat + 0.03, sickbay.lng))).toBe(false);
});
