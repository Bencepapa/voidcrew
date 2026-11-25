// Run: npx tsx src/editor/soundEdit.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";

// (the editor's modules read the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { addSound, updateSound, removeSound, clearCells, fillCells, resizeMap, digCells } = await import("./mapEdits");
const { collectArea, clipThings, flipClip, orientClip, parseClip, pasteArea, rotateClip, saveClip, loadClip } = await import("./areaClipboard");
const { parseMap } = await import("../game/mapFormat");
const { validateMap, removeDuplicates, validateMapFilePlacements } = await import("./validate");

function room(): MapFile {
  const W = 12;
  const H = 9;
  const layout = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".")).join(""));
  return { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout, exits: [{ x: 2, y: 1 }] } as unknown as MapFile;
}
const tone = { x: 4, y: 4, kind: "tone" as const, volume: 0.5, range: 10 };

// ---- add, change, take out
{
  const file = room();
  addSound(file, tone);
  addSound(file, { x: 6, y: 6, kind: "noise", volume: 1, range: 5, noise: "pink" });
  assert.equal(file.sounds!.length, 2);
  updateSound(file, 0, { pitch: 660, wave: "saw", pos: [0.2, 0.3, 0] });
  assert.deepEqual(file.sounds![0], { ...tone, pitch: 660, wave: "saw", pos: [0.2, 0.3, 0] });
  updateSound(file, 0, { wave: undefined, pulse: { on: 0.2, off: 0.8 } });
  assert.equal("wave" in file.sounds![0], false, "an undefined value takes the setting off");
  assert.deepEqual(file.sounds![0].pulse, { on: 0.2, off: 0.8 });
  updateSound(file, 0, { pulse: undefined });
  assert.equal("pulse" in file.sounds![0], false);
  // a change of kind leaves what belongs to the other behind
  updateSound(file, 0, { kind: "noise" });
  assert.equal("pitch" in file.sounds![0], false);
  updateSound(file, 1, { kind: "tone", wave: "square", pitch: 300 });
  assert.equal("noise" in file.sounds![1], false);
  assert.equal(file.sounds![1].wave, "square");
  updateSound(file, 5, { volume: 0 });
  assert.equal(file.sounds!.length, 2, "a sound that isn't there: nothing");
  removeSound(file, 0);
  assert.equal(file.sounds!.length, 1);
  assert.equal(file.sounds![0].x, 6);
  removeSound(file, 0);
  assert.equal("sounds" in file, false, "the last one takes the list with it");
  removeSound(file, 0);
}

// ---- a wall built over a sound takes it; the map grown or cut at the north / west moves it
{
  const file = room();
  addSound(file, tone);
  addSound(file, { ...tone, x: 7, y: 2 });
  fillCells(file, [{ x: 4, y: 4 }]);
  assert.deepEqual(file.sounds!.map((s) => s.x), [7]);
  clearCells(file, [{ x: 7, y: 2 }]);
  assert.equal(file.sounds, undefined);
  addSound(file, tone);
  resizeMap(file, "N", true);
  resizeMap(file, "W", true);
  assert.deepEqual([file.sounds![0].x, file.sounds![0].y], [5, 5], "moved with the map");
  resizeMap(file, "W", false);
  assert.deepEqual([file.sounds![0].x, file.sounds![0].y], [4, 5]);
  // a sound in the strip being cut: refused
  const edge = room();
  addSound(edge, { ...tone, x: 0, y: 3 });
  assert.throws(() => resizeMap(edge, "W", false));
  void digCells;
}

// ---- the area clipboard: copied, turned, mirrored and pasted with the rest
{
  const file = room();
  // (a lone sound, one with a spot in its cell, and one outside the area)
  addSound(file, { x: 3, y: 2, kind: "tone", volume: 0.5, range: 8, wave: "triangle", pitch: 500 });
  addSound(file, { x: 5, y: 3, kind: "noise", volume: 0.7, range: 6, noise: "brown", pos: [0.25, 0.4, -0.1], pulse: { on: 0.5, off: 0.5 }, active: false });
  addSound(file, { x: 9, y: 7, kind: "tone", volume: 1, range: 4 });
  const clip = collectArea(file, { x0: 2, y0: 1, x1: 6, y1: 4 })!;
  assert.equal(clip.sounds!.length, 2, "the two inside");
  assert.deepEqual(clip.sounds![0], { x: 1, y: 1, kind: "tone", volume: 0.5, range: 8, wave: "triangle", pitch: 500 }, "relative to the corner");
  assert.deepEqual(clip.sounds![1].pos, [0.25, 0.4, -0.1]);
  assert.equal(clipThings(clip), 2);
  assert.equal(file.sounds!.length, 3, "copying takes nothing");
  assert.notEqual(clip.sounds![1], file.sounds![1]);

  // turned a quarter clockwise (w 5, h 4 -> 4 x 5): a cell (x, y) goes to (h - 1 - y, x); the spot's (dx, dz) to (-dz, dx)
  const turned = rotateClip(clip);
  assert.equal(turned.w, 4);
  assert.equal(turned.h, 5);
  assert.deepEqual([turned.sounds![0].x, turned.sounds![0].y], [4 - 1 - 1, 1]);
  assert.deepEqual([turned.sounds![1].x, turned.sounds![1].y], [4 - 1 - 2, 3]);
  const spot = turned.sounds![1].pos!;
  assert.ok(Math.abs(spot[0] - 0.1) < 1e-9 && spot[1] === 0.4 && Math.abs(spot[2] - 0.25) < 1e-9, `the spot turns with the cell: ${spot}`);
  assert.deepEqual(turned.sounds![0].pos, undefined, "a sound with no spot stays in the middle");
  assert.equal(turned.sounds![1].active, false, "settings come along");
  assert.deepEqual(turned.sounds![1].pulse, { on: 0.5, off: 0.5 });
  // four turns are the clip again
  let again = clip;
  for (let i = 0; i < 4; i++) again = rotateClip(again);
  assert.deepEqual(again.sounds, clip.sounds);
  assert.deepEqual(orientClip(clip, 4, false).sounds, clip.sounds);

  // mirrored: across the middle - the spot's `across` flips, its `along` stays
  const mirrored = flipClip(clip);
  assert.deepEqual([mirrored.sounds![0].x, mirrored.sounds![0].y], [5 - 1 - 1, 1]);
  assert.deepEqual(mirrored.sounds![1].pos, [-0.25, 0.4, -0.1]);
  assert.deepEqual(flipClip(mirrored).sounds, clip.sounds);

  // kept in the browser's storage and read back (only what is of the right shape)
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };
  assert.ok(saveClip(clip, storage));
  assert.deepEqual(loadClip(storage)!.sounds, clip.sounds);
  const damaged = JSON.parse(JSON.stringify(clip));
  damaged.sounds.push({ x: 99, y: 0 }, "not a sound");
  assert.equal(parseClip(damaged)!.sounds!.length, 2, "one outside the clip and one that is no object are dropped");

  // pasted: into another place, replacing what stood there; the ones outside the map left out
  const target = room();
  addSound(target, { x: 8, y: 5, kind: "noise", volume: 1, range: 3 });
  const report = pasteArea(target, turned, { x: 7, y: 3 });
  assert.equal(report.things, 2);
  assert.equal(target.sounds!.length, 2, "the old one in the area went with the cells' contents");
  const [a, b] = target.sounds!;
  assert.deepEqual([a.x, a.y, a.kind], [7 + 2, 3 + 1, "tone"]);
  assert.deepEqual([b.x, b.y, b.kind], [7 + 1, 3 + 3, "noise"]);
  assert.equal(clip.sounds![0].x, 1, "the clip itself is not changed by pasting");
  // pasted so that a sound falls outside the map: left out
  const edge = room();
  const cut = pasteArea(edge, clip, { x: 9, y: 6 });
  assert.ok((cut.clipped ?? 0) > 0);
  assert.ok((edge.sounds ?? []).every((s) => s.x < 11 && s.y < 8));
}

// ---- what the editor says of them
{
  const file = room();
  addSound(file, { x: 4, y: 4, kind: "tone", volume: 0, range: 10 });
  addSound(file, { x: 5, y: 4, kind: "tone", volume: 0.5, range: 0.5 });
  addSound(file, { x: 6, y: 4, kind: "tone", volume: 0.5, range: 5, pulse: { on: 0, off: 1 } });
  addSound(file, { x: 7, y: 4, kind: "noise", volume: 0.5, range: 5 });
  const map = parseMap("t", file);
  const problems = validateMap(map).filter((p) => p.code.startsWith("sound"));
  assert.deepEqual(problems.map((p) => `${p.code}@${p.cell!.x},${p.cell!.y}`), ["soundSilent@4,4", "soundNoRange@5,4", "soundPulseZero@6,4"]);
  assert.deepEqual(problems.map((p) => p.severity), ["warning", "warning", "warning"]);
  assert.deepEqual(problems.map((p) => p.params!.index), [1, 2, 3]);
  assert.equal(problems[0].key, "minimap.problem.soundSilent");
  // a clean one says nothing
  const clean = room();
  addSound(clean, tone);
  assert.deepEqual(validateMap(parseMap("t", clean)).filter((p) => p.code.startsWith("sound")), []);
  // two of the same in one spot: a duplicate; a beep and a hiss there: not
  const twins = room();
  addSound(twins, tone);
  addSound(twins, { ...tone });
  addSound(twins, { ...tone, kind: "noise" });
  const dup = validateMapFilePlacements(twins).filter((p) => p.code === "duplicate");
  assert.equal(dup.length, 1);
  assert.equal(dup[0].params!.kind, "sound");
  assert.equal(dup[0].params!.indexes, "1, 2");
  assert.equal(removeDuplicates(twins).sounds!.length, 2);
  // one buried in a wall
  const buried = room();
  addSound(buried, { ...tone, x: 0, y: 0 });
  const walled = validateMapFilePlacements(buried).filter((p) => p.code === "inWall.sound");
  assert.equal(walled.length, 1);
  assert.equal(walled[0].severity, "warning", "only a warning: it is no gameplay thing");
}

console.log("soundEdit: ok");
