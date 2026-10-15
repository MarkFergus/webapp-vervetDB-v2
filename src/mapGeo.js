// Where a GPS position falls on the sanctuary map, for My Location on the
// Interactive Map (WholeMap.jsx). The map was traced from Google Earth, so a
// straight fit (stretch, turn, move) from a few points found on both lines
// it up: within a few metres. (The map is drawn with north roughly at the
// bottom.)
import { MAP_HEIGHT, MAP_WIDTH } from "./SanctuaryMap";

// 23°51'17.65"S → -23.854903
const dms = (degrees, minutes, seconds, south = false) =>
    (south ? -1 : 1) * (degrees + minutes / 60 + seconds / 3600);

// Corners found on both the map (its own units, as drawn in
// public/VMF_Sanctuary_Map.svg) and Google Earth. If the map file is
// redrawn or moved, these map points need measuring again.
export const REFERENCE_POINTS = [
    { what: "Camelot, northern (top) corner", map: [450.7, 173.8], lat: dms(23, 51, 17.65, true), lng: dms(30, 20, 12.7) },
    { what: "Camelot, eastern (right) tip", map: [573.0, 275.2], lat: dms(23, 51, 15.47, true), lng: dms(30, 20, 8.37) },
    { what: "Skunkey, southern (bottom) tip", map: [157.9, 771.6], lat: dms(23, 50, 59.44, true), lng: dms(30, 20, 18.21) },
    { what: "Holt & Barrington, bottom-left corner", map: [45.9, 664.1], lat: dms(23, 51, 1.71, true), lng: dms(30, 20, 22.24) },
    { what: "Sickbay building, top-left corner", map: [275.5, 475.0], lat: dms(23, 51, 8.21, true), lng: dms(30, 20, 16.44) },
];

// GPS in metres east / north of the reference points' middle (flat enough
// over a few hundred metres)
const LAT0 = REFERENCE_POINTS.reduce((sum, p) => sum + p.lat, 0) / REFERENCE_POINTS.length;
const LNG0 = REFERENCE_POINTS.reduce((sum, p) => sum + p.lng, 0) / REFERENCE_POINTS.length;
const METRES_PER_LAT = 110574;
const METRES_PER_LNG = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toMetres = (lat, lng) => [(lng - LNG0) * METRES_PER_LNG, (lat - LAT0) * METRES_PER_LAT];

// The best fit (least squares) of value = a·u + b·v + c over the points
function fit(points, value) {
    // The normal equations, solved by elimination
    const rows = points.map(({ u, v }) => [u, v, 1]);
    const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => rows.reduce((sum, r) => sum + r[i] * r[j], 0)));
    const b = [0, 1, 2].map((i) => rows.reduce((sum, r, k) => sum + r[i] * value(points[k]), 0));
    for (let i = 0; i < 3; i++) {
        for (let r = 0; r < 3; r++) {
            if (r === i) continue;
            const f = A[r][i] / A[i][i];
            for (let c = i; c < 3; c++) A[r][c] -= f * A[i][c];
            b[r] -= f * b[i];
        }
    }
    return b.map((x, i) => x / A[i][i]);
}

// GPS (as metres) → map: x = … , y = …
const asMetres = REFERENCE_POINTS.map((p) => {
    const [u, v] = toMetres(p.lat, p.lng);
    return { u, v, map: p.map };
});
const X = fit(asMetres, (p) => p.map[0]);
const Y = fit(asMetres, (p) => p.map[1]);

// Where a GPS position is on the map, in the map's own units
export function mapPointOf(lat, lng) {
    const [u, v] = toMetres(lat, lng);
    return [X[0] * u + X[1] * v + X[2], Y[0] * u + Y[1] * v + Y[2]];
}

// How many map units a metre is (for the accuracy circle)
export const UNITS_PER_METRE = Math.sqrt(Math.abs(X[0] * Y[1] - X[1] * Y[0]));

// Is a point on the map (the whole page: the sanctuary and a little around it)?
export const onMap = ([x, y]) => x >= 0 && y >= 0 && x <= MAP_WIDTH && y <= MAP_HEIGHT;
