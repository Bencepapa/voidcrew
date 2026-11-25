// Run: npx tsx src/editor/acousticEdit.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";
import { PRESETS, cellsOfRuns, runKeys } from "../game/acousticZones";

// (the editor's modules read the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const E = await import("./acousticEdits");
const { clearCells, fillCells, resizeMap, fill } = await import("./mapEdits");
const { collectArea, clipThings, flipClip, orientClip, parseClip, pasteArea, rotateClip, saveClip, loadClip } = await import("./areaClipboard");
const { parseMap } = await import("../game/mapFormat");
const { validateMap } = await import("./validate");

function room(): MapFile {
  const W = 12;
  const H = 9;
  const layout = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".")).join(""));
  return { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout, exits: [{ x: 2, y: 1 }] } as unknown as MapFile;
}
const keys = (file: MapFile, i: number) => [...runKeys(file.acoustics![i].cells)].sort();

// ---- make, change, take out
{
  const file = room();
  const a = E.createZone(file, [[2, 2, 5], [3, 2, 5]], { name: "Lab" });
  assert.equal(a, 0);
  assert.deepEqual(file.acoustics![0], { name: "Lab", cells: [[2, 2, 5], [3, 2, 5]], preset: "room" }, "a room unless told");
  // another zone over some of the same cells: they leave the first
  const b = E.createZone(file, [[3, 4, 7]], { preset: "hall" });
  assert.equal(b, 1);
  assert.deepEqual(file.acoustics![0].cells, [[2, 2, 5], [3, 2, 3]], "a cell is in one zone only");
  assert.deepEqual(file.acoustics![1].cells, [[3, 4, 7]]);
  // cells added and taken off
  E.addZoneCells(file, 0, [[3, 4, 4]]);
  assert.deepEqual(file.acoustics![0].cells, [[2, 2, 5], [3, 2, 4]]);
  assert.deepEqual(file.acoustics![1].cells, [[3, 5, 7]], "the other one lost it");
  E.removeZoneCells(file, 0, [[2, 3, 4], [9, 0, 0]]);
  assert.deepEqual(file.acoustics![0].cells, [[2, 2, 2], [2, 5, 5], [3, 2, 4]]);
  // not a zone: nothing
  E.addZoneCells(file, 7, [[1, 1, 1]]);
  E.removeZoneCells(file, 7, [[1, 1, 1]]);
  assert.equal(file.acoustics!.length, 2);
  // the name
  E.renameZone(file, 0, "  Big lab ");
  assert.equal(file.acoustics![0].name, "Big lab");
  E.renameZone(file, 0, "  ");
  assert.equal("name" in file.acoustics![0], false);
  // a preset: its four numbers are written
  E.setZonePreset(file, 0, "cave");
  assert.deepEqual({ ...file.acoustics![0], cells: undefined }, { cells: undefined, preset: "cave", ...PRESETS.cave });
  // a number moved: custom, the others as they were
  E.setZoneValues(file, 0, { decay: 9 });
  assert.equal(file.acoustics![0].preset, "custom");
  assert.equal(file.acoustics![0].decay, 8, "limited");
  assert.equal(file.acoustics![0].reverb, PRESETS.cave.reverb);
  // ... also for a zone that only named a preset (no numbers written): what it sounded like stays
  const bare = room();
  E.createZone(bare, [[1, 1, 1]], { preset: "hall" });
  E.setZoneValues(bare, 0, { reverb: 0.1 });
  assert.deepEqual({ ...bare.acoustics![0], cells: undefined }, { cells: undefined, preset: "custom", ...PRESETS.hall, reverb: 0.1 });
  E.setZonePreset(bare, 0, "custom");
  assert.equal(bare.acoustics![0].reverb, 0.1, "custom keeps what it has");
  // taking one out: the last takes the list
  E.removeZone(file, 0);
  assert.equal(file.acoustics!.length, 1);
  E.removeZone(file, 0);
  assert.equal("acoustics" in file, false);
  E.removeZone(file, 0);
  E.setZonePreset(file, 3, "hall");
  assert.equal("acoustics" in file, false, "nothing made of nothing");
}

// ---- a wall built over a zone's cells takes them; the map grown or cut moves them
{
  const file = room();
  E.createZone(file, [[2, 2, 6], [3, 2, 6]]);
  fill(file, { x: 3, y: 2 });
  assert.deepEqual(file.acoustics![0].cells, [[2, 2, 2], [2, 4, 6], [3, 2, 6]], "one wall: one cell less");
  fillCells(file, [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 6, y: 2 }]);
  assert.deepEqual(file.acoustics![0].cells, [[2, 2, 2], [2, 4, 4], [3, 2, 4], [3, 6, 6]]);
  clearCells(file, [{ x: 2, y: 2 }, { x: 4, y: 3 }]);
  assert.deepEqual(file.acoustics![0].cells, [[2, 4, 4], [3, 2, 3], [3, 6, 6]]);
  const before = file.acoustics![0].cells.map((r) => [...r]);
  resizeMap(file, "N", true);
  resizeMap(file, "W", true);
  assert.deepEqual(file.acoustics![0].cells, before.map(([y, a, b]) => [y + 1, a + 1, b + 1]), "moved with the map");
  resizeMap(file, "W", false);
  resizeMap(file, "N", false);
  assert.deepEqual(file.acoustics![0].cells, before);
  // a zone with no cells left stays (the editor's list keeps its places)
  const all = room();
  E.createZone(all, [[2, 2, 2]]);
  clearCells(all, [{ x: 2, y: 2 }]);
  assert.deepEqual(all.acoustics, [{ cells: [], preset: "room" }]);
  // shifted off the left edge: gone
  E.shiftZones(all, 0, 0);
  const edge = room();
  E.createZone(edge, [[2, 0, 3]]);
  E.shiftZones(edge, -1, 0);
  assert.deepEqual(edge.acoustics![0].cells, [[2, 0, 2]]);
}

// ---- the area clipboard: copied, turned, mirrored and pasted with the rest
{
  const file = room();
  E.createZone(file, [[2, 3, 5], [3, 3, 5]], { name: "A", preset: "hall", decay: 3 });
  E.createZone(file, [[2, 6, 8], [6, 8, 8]], { name: "B", preset: "cave" });
  const clip = collectArea(file, { x0: 3, y0: 2, x1: 7, y1: 4 })!;
  assert.equal(clip.zones!.length, 2, "both have cells inside");
  assert.deepEqual(clip.zones![0], { name: "A", preset: "hall", decay: 3, cells: [[0, 0, 2], [1, 0, 2]] }, "relative to the corner");
  assert.deepEqual(clip.zones![1].cells, [[0, 3, 4]], "only what is inside the area");
  assert.equal(clipThings(clip), 2);
  assert.equal(file.acoustics!.length, 2, "copying takes nothing");
  assert.notEqual(clip.zones![0], file.acoustics![0]);
  // no zone in the area: none in the clip
  assert.equal(collectArea(file, { x0: 9, y0: 5, x1: 10, y1: 7 })!.zones, undefined);

  // turned a quarter clockwise: w 5, h 3 -> 3 x 5; a cell (x, y) goes to (h - 1 - y, x)
  const turned = rotateClip(clip);
  const turnedCells = cellsOfRuns(turned.zones![0].cells).map((c) => c.join()).sort();
  assert.deepEqual(turnedCells, [[2, 0], [2, 1], [2, 2], [1, 0], [1, 1], [1, 2]].map((c) => c.join()).sort());
  assert.equal(turned.zones![0].preset, "hall", "settings come along");
  let again = clip;
  for (let i = 0; i < 4; i++) again = rotateClip(again);
  assert.deepEqual(again.zones, clip.zones, "four turns are the clip again");
  assert.deepEqual(orientClip(clip, 4, false).zones, clip.zones);
  // mirrored: x -> w - 1 - x
  const mirrored = flipClip(clip);
  assert.deepEqual(mirrored.zones![0].cells, [[0, 2, 4], [1, 2, 4]]);
  assert.deepEqual(flipClip(mirrored).zones, clip.zones);

  // kept in the browser's storage and read back
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  assert.ok(saveClip(clip, storage));
  assert.deepEqual(loadClip(storage)!.zones, clip.zones);
  const damaged = JSON.parse(JSON.stringify(clip));
  damaged.zones.push({ cells: [[99, 0, 1]] }, "no zone", { cells: [[0, 0, 99]], preset: "room" });
  const parsed = parseClip(damaged)!;
  assert.equal(parsed.zones!.length, 3, "one off the clip and one that is no zone are dropped; one is cut to the clip");
  assert.deepEqual(parsed.zones![2].cells, [[0, 0, 4]]);

  // pasted into another map: new zones there, the area's old zone cells gone
  const target = room();
  E.createZone(target, [[3, 7, 10], [4, 7, 10]], { name: "old" });
  const report = pasteArea(target, turned, { x: 7, y: 3 });
  assert.equal(report.things, 2);
  assert.equal(target.acoustics!.length, 3, "two new zones");
  assert.equal(target.acoustics![0].name, "old");
  assert.ok(target.acoustics![0].cells.length > 0 && !keys(target, 0).some((k) => keys(target, 1).includes(k)), "no cell in two zones");
  assert.equal(target.acoustics![1].name, "A");
  assert.deepEqual(keys(target, 1), [[2, 0], [2, 1], [2, 2], [1, 0], [1, 1], [1, 2]].map(([x, y]) => `${7 + x},${3 + y}`).sort());
  assert.equal("lost" in target.acoustics![1], false);
  assert.equal(clip.zones![0].cells.length, 2, "the clip itself is not changed by pasting");
  // pasted where part falls outside the map: left out
  const edge = room();
  pasteArea(edge, clip, { x: 9, y: 6 });
  assert.ok((edge.acoustics ?? []).every((z) => z.cells.every(([y, , x1]) => x1 < 12 && y < 9)));
  assert.ok(edge.acoustics!.length > 0);
  // pasted into the same map: new zones, the old ones lose the cells
  const same = room();
  E.createZone(same, [[2, 3, 5], [3, 3, 5]], { name: "A" });
  pasteArea(same, collectArea(same, { x0: 3, y0: 2, x1: 5, y1: 3 })!, { x: 3, y: 2 });
  assert.equal(same.acoustics!.length, 2);
  assert.equal(same.acoustics![0].cells.length, 0, "the old zone's cells are the new zone's now");
}

// ---- what the editor says of them
{
  const file = room();
  E.createZone(file, [[2, 2, 3]], { name: "ok" });
  E.createZone(file, [[2, 4, 4]]);
  file.acoustics!.push({ cells: [[3, 0, 2]] });
  file.acoustics!.push({ cells: [] });
  const problems = validateMap(parseMap("t", file)).filter((p) => p.code.startsWith("zone"));
  assert.deepEqual(problems.map((p) => `${p.code}#${p.params!.index}`), ["zoneWalls#3", "zoneEmpty#4"]);
  assert.equal(problems[0].params!.count, 1, "the wall at x 0");
  assert.equal(problems[0].severity, "warning");
  assert.equal(problems[0].key, "minimap.problem.zoneWalls");
  assert.deepEqual(problems[0].cell, { x: 1, y: 3 });
  // a clean one says nothing
  const clean = room();
  E.createZone(clean, [[2, 2, 3]]);
  assert.deepEqual(validateMap(parseMap("t", clean)).filter((p) => p.code.startsWith("zone")), []);
}

console.log("acousticEdit: ok");
