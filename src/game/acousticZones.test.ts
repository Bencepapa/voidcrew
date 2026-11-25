// Run: npx tsx src/game/acousticZones.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { PRESETS, ZONE_LIMITS, cellsOfRuns, countRunCells, readZone, readZones, resolveZone, runKeys, runsOfCells, runsOfKeys, zoneProblems, type AcousticZone } from "./acousticZones";
import { fixtureFile } from "../audio/soundFixture";

// (the map reader pulls in the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");

// ---- cells as runs

assert.deepEqual(runsOfCells([[3, 1], [1, 1], [2, 1], [5, 1], [0, 0]]), [[0, 0, 0], [1, 1, 3], [1, 5, 5]], "sorted, touching cells joined");
assert.deepEqual(runsOfCells([[1, 1], [1, 1]]), [[1, 1, 1]], "duplicates are one");
assert.deepEqual(runsOfCells([]), []);
assert.deepEqual(cellsOfRuns([[2, 3, 5]]), [[3, 2], [4, 2], [5, 2]]);
assert.equal(countRunCells([[2, 3, 5], [4, 0, 0]]), 4);
{
  const cells: [number, number][] = [[1, 1], [2, 1], [4, 1], [1, 2], [2, 2], [3, 2], [9, 7]];
  assert.deepEqual(new Set(cellsOfRuns(runsOfCells(cells)).map((c) => c.join())), new Set(cells.map((c) => c.join())), "cells to runs and back");
  assert.deepEqual(runsOfKeys(runKeys([[1, 2, 4]])), [[1, 2, 4]], "keys and runs go both ways");
}

// ---- reading one zone: cleaned

const open = (x: number, y: number) => x >= 1 && x <= 5 && y >= 1 && y <= 5;
{
  const zone = readZone({ name: "  Hall  ", cells: [[1, 1, 3], [2, 5, 9], [9, 1, 2]], preset: "hall", reverb: 5, decay: 99, softness: -1, insulation: 0.3333333 }, open);
  assert.equal(zone.name, "Hall", "the name is trimmed");
  assert.deepEqual(zone.cells, [[1, 1, 3], [2, 5, 5]], "off the map and in walls: dropped");
  assert.equal(zone.lost, 6, "... and counted");
  assert.equal(zone.reverb, ZONE_LIMITS.reverb.max);
  assert.equal(zone.decay, ZONE_LIMITS.decay.max);
  assert.equal(zone.softness, 0);
  assert.equal(zone.insulation, 0.333);
  assert.equal(zone.preset, "hall");
  // not a zone at all: empty, so the list keeps its places
  assert.deepEqual(readZone("x", open), { cells: [] });
  assert.deepEqual(readZone(null, open), { cells: [] });
  assert.deepEqual(readZone({ cells: "no" }, open), { cells: [] });
  // junk in the fields is not kept
  const junk = readZone({ cells: [[1, 1, 1], [1.5, 1, 2], [1, 1], "no", [1, 1, 99999]], preset: "cathedral", reverb: "loud", decay: NaN }, open);
  assert.deepEqual(junk.cells, [[1, 1, 1]]);
  assert.equal(junk.preset, undefined);
  assert.equal("reverb" in junk, false);
  assert.equal("decay" in junk, false);
  // a run written backwards
  assert.deepEqual(readZone({ cells: [[2, 4, 2]] }, open).cells, [[2, 2, 4]]);
}

// ---- the list: the last zone wins a cell

{
  const cells = Array.from({ length: 6 }, () => Array.from({ length: 7 }, () => "floor" as const));
  const zones = readZones([{ name: "a", cells: [[1, 1, 4]] }, { name: "b", cells: [[1, 3, 5]] }, { name: "c", cells: [[1, 4, 4]] }], cells)!;
  assert.deepEqual(zones.map((z) => z.cells), [[[1, 1, 2]], [[1, 3, 3], [1, 5, 5]], [[1, 4, 4]]], "a cell is in one zone: the later");
  assert.equal(readZones(undefined, cells), undefined);
  assert.equal(readZones([], cells), undefined);
}

// ---- values: a preset's, with the zone's own over them

assert.deepEqual(resolveZone({}), PRESETS.room, "no preset: the room's");
assert.deepEqual(resolveZone({ preset: "cave" }), PRESETS.cave);
assert.deepEqual(resolveZone({ preset: "custom" }), PRESETS.room);
assert.deepEqual(resolveZone({ preset: "hall", decay: 4 }), { ...PRESETS.hall, decay: 4 });
assert.ok(PRESETS.hall.decay > PRESETS.room.decay && PRESETS.cave.decay > PRESETS.hall.decay, "the presets ring longer as they get bigger");
assert.ok(PRESETS.corridor.decay > PRESETS.room.decay, "a corridor rings a little longer than a room");
assert.ok(Math.abs(PRESETS.corridor.decay - 0.6) < 1e-9 && Math.abs(PRESETS.room.decay - 0.5) < 1e-9 && Math.abs(PRESETS.hall.decay - 2.2) < 1e-9 && Math.abs(PRESETS.cave.decay - 3.5) < 1e-9);
assert.equal(PRESETS.outdoor.reverb, 0, "outdoors there is no echo");
assert.ok(PRESETS.cave.softness > PRESETS.hall.softness, "a cave is dark");

// ---- what the editor says

{
  const zones: AcousticZone[] = [{ cells: [] }, { cells: [[1, 1, 2]], lost: 3 }, { cells: [[2, 2, 2]] }];
  assert.deepEqual(zoneProblems(zones).map((p) => `${p.code}#${p.index}`), ["zoneEmpty#0", "zoneWalls#1"]);
  assert.deepEqual(zoneProblems(zones)[1].cell, { x: 1, y: 1 });
  assert.equal(zoneProblems(zones)[1].count, 3);
  assert.deepEqual(zoneProblems(undefined), []);
}

// ---- in a map file: parsed and cleaned; the scene is not rebuilt for it

{
  const base = fixtureFile();
  delete base.sounds;
  const plain = parseMap("t", base);
  assert.equal(plain.acoustics, undefined, "a map with none has none");
  assert.equal(parseMap("t", { ...base, acoustics: [] }).acoustics, undefined);
  const file = { ...base, acoustics: [{ name: "west", cells: [[1, 1, 5], [2, 0, 6], [3, 1, 5]], preset: "hall", decay: 3 }, { cells: [[1, 7, 11]], preset: "cave" }] as never };
  const map = parseMap("t", file);
  assert.equal(map.acoustics!.length, 2);
  // (the wall at x 0 and the door at x 6 are not zone cells: row 2 has x 1..5 only; row 3 loses the door's... it is not in 1..5)
  assert.deepEqual(map.acoustics![0].cells, [[1, 1, 5], [2, 1, 5], [3, 1, 5]]);
  assert.equal(map.acoustics![0].lost, 2, "the wall at 0 and the wall at 6");
  assert.equal(map.acoustics![0].decay, 3);
  assert.equal(map.acoustics![1].preset, "cave");
  // a damaged one does not break the map
  assert.equal(parseMap("t", { ...base, acoustics: ["x", { cells: 5 }, 3] as never }).acoustics!.length, 3);
  // the scene's key does not hold the zones: a zone edited does not rebuild the deck
  assert.equal(map.structureKey, plain.structureKey);
  assert.ok(!map.structureKey!.includes("cave"));
  assert.notEqual(parseMap("t", { ...base, layout: base.layout.map((r, y) => (y === 1 ? r.replace(".....", "..W..") : r)) }).structureKey, plain.structureKey, "a change to the cells still does");
}
// the maps as they are in the repo parse as before: none of them has zones
{
  const folder = new URL("../maps/fantasy/", import.meta.url);
  const map = parseMap("Forest", JSON.parse(readFileSync(new URL("Forest.json", folder), "utf8")));
  assert.equal(map.acoustics, undefined);
  assert.equal(JSON.stringify(map).includes('"acoustics"'), false);
}

console.log("acousticZones: ok");
