// Buildings (buildings.sql): places for maintenance only, tappable on the map
import { readFileSync } from "node:fs";
import enclosuresArr from "./enclosuresArr";
import { placeCard, placesByLabel } from "./mapPlaces";
import { TYPE_NAMES, isBuilding } from "./enclosures";
import { maintenancePlaces } from "./maintenanceRecords";

const SQL = readFileSync(`${process.cwd()}/supabase/buildings.sql`, "utf8");
const MAP = readFileSync(`${process.cwd()}/public/VMF_Sanctuary_Map.svg`, "utf8");
const NAMES = [...SQL.matchAll(/^\s*\(\d+, '([^']+)'\)/gm)].map((m) => m[1]);
// Shapes' labels (not the names written on the map)
const SHAPE_LABELS = new Set(
    [...MAP.matchAll(/<(?!text)(\w+)\b[^>]*inkscape:label="([^"]*)"/g)].map((m) => m[2].replace(/&amp;/g, "&")),
);
const buildings = NAMES.map((name, i) => ({ id: 9000 + i, name, type: "building", parentId: null, section: null, photos: [] }));

test("the 20 buildings, Dave's House and Surgery left out", () => {
    expect(NAMES).toHaveLength(20);
    expect(NAMES).toContain("Private Shower/Toilet");
    expect(NAMES).not.toContain("Dave's House");
    expect(NAMES).not.toContain("Surgery");
});

test("each building has a shape on the map with its name, to tap", () => {
    for (const name of NAMES) expect(SHAPE_LABELS.has(name), name).toBe(true);
    const labels = placesByLabel([...enclosuresArr, ...buildings]);
    for (const b of buildings) expect(labels.get(b.name)).toBe(b);
});

test("Mainfeed is written as one word on the map", () => {
    expect(MAP).toContain(">Mainfeed</text>");
    expect(MAP).not.toMatch(/>feed<\/text>/);
});

test("Surgery is part of the Sickbay care unit on the map", () => {
    const labels = placesByLabel(enclosuresArr);
    const sickbay = enclosuresArr.find((e) => e.name === "Sickbay" && e.type === "care_unit");
    expect(labels.get("Sickbay building")).toBe(sickbay);
    expect(MAP).toMatch(/id="g9312-9"[^>]*inkscape:label="Sickbay building"/);
});

test("a building's card: no monkeys and no page", () => {
    expect(placeCard(buildings[0], enclosuresArr, [])).toEqual({ photo: null, name: "Office & Gift Shop", kind: "Building", count: null });
    expect(TYPE_NAMES.building).toBe("Building");
    expect(isBuilding(buildings[0])).toBe(true);
});

test("buildings can be picked for maintenance", () => {
    const places = maintenancePlaces([...enclosuresArr, ...buildings]);
    expect(places.map((p) => p.name)).toContain("Staff Village");
});
