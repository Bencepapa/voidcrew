// Run: npx tsx src/game/emitters.test.ts
import assert from "node:assert/strict";
import { EMITTER_PRESETS, jetYawFor, presetPatch, wallSideOf } from "./emitterPresets";
import { emitterView, emittersOn, emittersShown } from "./emitterStore";
import {
  HARM_DEFAULTS, emitterOn, harmCells, harmTick, indexInCell, inArea, readAddress, readArea, readHarm, resolveAddress, smokeKeys,
  type HarmInput,
} from "./emitters";
import { fireCells } from "./fire";
import type { GameMap } from "./types";

const at = (x: number, y: number) => ({ x, y });

// ---- harm: read from a map file, junk dropped and limited
assert.equal(readHarm(undefined), undefined);
assert.equal(readHarm("poison"), undefined);
assert.equal(readHarm({ damage: 0 }), undefined, "no damage is no harm");
assert.equal(readHarm({ damage: 0.4 }), undefined, "rounds to nothing");
assert.deepEqual(readHarm({ damage: 2 }), { damage: 2 });
assert.deepEqual(readHarm({ damage: 3.6, every: 0.1, reach: 9, label: "  burns  " }), { damage: 4, every: 0.25, reach: 3, label: "burns" }, "limits: every >= 0.25 s, reach <= 3");
assert.deepEqual(readHarm({ damage: 500, reach: -2, label: " " }), { damage: 99, reach: 0 });
assert.deepEqual(readHarm({ damage: 2, junk: 1 }), { damage: 2 });

// ---- areas and addresses
assert.deepEqual(readArea({ x0: 4, y0: 3, x1: 1, y1: 1 }), { x0: 1, y0: 1, x1: 4, y1: 3 }, "any corner order");
assert.equal(readArea({ x0: 1.5, y0: 1, x1: 2, y1: 2 }), undefined);
assert.equal(readArea(null), undefined);
assert.ok(inArea({ x0: 1, y0: 1, x1: 3, y1: 2 }, at(3, 2)) && !inArea({ x0: 1, y0: 1, x1: 3, y1: 2 }, at(4, 2)));
assert.deepEqual(readAddress({ x: 2, y: 3 }), { x: 2, y: 3 });
assert.deepEqual(readAddress({ x: 2, y: 3, index: 1 }), { x: 2, y: 3, index: 1 });
assert.deepEqual(readAddress({ x: 2, y: 3, index: -1 }), { x: 2, y: 3 }, "a bad index is dropped");
assert.deepEqual(readAddress({ id: " fire-a " }), { id: "fire-a" });
assert.deepEqual(readAddress({ area: { x0: 2, y0: 1, x1: 1, y1: 1 } }), { area: { x0: 1, y0: 1, x1: 2, y1: 1 } });
assert.equal(readAddress({ x: 2 }), undefined, "half a cell is nothing");
assert.equal(readAddress({}), undefined);

const list = [
  { cell: at(2, 2), id: "a" },
  { cell: at(5, 1), id: "b" },
  { cell: at(2, 2), id: "c" },
  { cell: at(3, 2) },
];
assert.deepEqual(resolveAddress(list, { x: 2, y: 2 }), [0, 2], "a cell: all in it");
assert.deepEqual(resolveAddress(list, { x: 2, y: 2, index: 1 }), [2], "the n-th in the cell");
assert.deepEqual(resolveAddress(list, { x: 2, y: 2, index: 2 }), [], "there is no third");
assert.deepEqual(resolveAddress(list, { id: "b" }), [1]);
assert.deepEqual(resolveAddress(list, { id: "b", x: 2, y: 2 }), [1], "an id beats the cell");
assert.deepEqual(resolveAddress(list, { area: { x0: 2, y0: 2, x1: 3, y1: 2 } }), [0, 2, 3], "an area: everything inside");
assert.deepEqual(resolveAddress(list, { area: { x0: 2, y0: 2, x1: 3, y1: 2 } }, (e) => e.id !== "c"), [0, 3], "narrowed by the kind");
assert.deepEqual(resolveAddress(list, { x: 2, y: 2, index: 1 }, (e) => e.id === "a"), [], "the n-th counts all of them, then narrows");
assert.deepEqual(resolveAddress(undefined, { x: 1, y: 1 }), []);
assert.equal(indexInCell(list, 2), 1);
assert.equal(indexInCell(list, 1), undefined, "alone in its cell: no index");
assert.equal(indexInCell(list, 9), undefined);

// ---- keys and on / off
assert.deepEqual(smokeKeys([{ cell: at(1, 1) }, { cell: at(2, 1) }, { cell: at(1, 1) }, { cell: at(1, 1) }]), ["1,1", "2,1", "1,1#2", "1,1#3"]);
assert.deepEqual(smokeKeys(undefined), []);
assert.equal(emitterOn({}, "1,1", {}), true, "on unless it says otherwise");
assert.equal(emitterOn({ active: false }, "1,1", {}), false, "inactive until switched on");
assert.equal(emitterOn({ active: false }, "1,1", { "1,1": true }), true, "the runtime's word wins");
assert.equal(emitterOn({}, "1,1", { "1,1": false }), false);

// ---- the smoke's reach: over walkable cells, walls stop it
const rows = [
  "WWWWWWWW",
  "W..W...W",
  "W..D...W",
  "W......W",
  "WWWWWWWW",
];
const cells = rows.map((r) => r.split("").map((c) => (c === "W" ? "wall" : c === "D" ? "door" : "floor") as "wall" | "door" | "floor"));
const grid = { width: 8, height: 5, cells };
const keyOf = (c: { x: number; y: number }) => `${c.x},${c.y}`;
const cellSet = (list: { x: number; y: number }[]) => list.map(keyOf).sort();
assert.deepEqual(cellSet(harmCells(grid, at(1, 1), 0)), ["1,1"], "reach 0: its own cell");
assert.deepEqual(cellSet(harmCells(grid, at(1, 1), 1)), ["1,1", "1,2", "2,1"], "reach 1: the cells next to it (not through the wall)");
assert.deepEqual(cellSet(harmCells(grid, at(1, 1), 2)), ["1,1", "1,2", "1,3", "2,1", "2,2"], "reach 2: two steps, over the floor");
assert.ok(!cellSet(harmCells(grid, at(2, 2), 3)).includes("4,2"), "a shut door stops it");
assert.ok(cellSet(harmCells(grid, at(2, 2), 3, (c) => c.x === 3 && c.y === 2)).includes("4,2"), "an open one lets it through");
assert.ok(cellSet(harmCells(grid, at(1, 1), 99)).length < 20, "reach is capped at 3");

// ---- the damage cadence
const poison = { cell: at(1, 1), harm: { damage: 2 } };
const input = (over: Partial<HarmInput> = {}): HarmInput => ({
  map: { ...grid, smokes: [poison] }, on: {}, party: at(1, 1), now: 0, last: {}, armed: true, ...over,
});
{
  let step = harmTick(input());
  assert.deepEqual(step.hits, [{ key: "1,1", damage: 2 }], "hurts at once on entering");
  step = harmTick(input({ now: 500, last: step.last }));
  assert.equal(step.hits.length, 0, "not again before `every` seconds");
  step = harmTick(input({ now: 1000, last: step.last }));
  assert.equal(step.hits.length, 1, "every second (the default)");
  step = harmTick(input({ now: 1200, party: at(6, 3), last: step.last }));
  assert.equal(step.hits.length, 0, "out of its reach");
  step = harmTick(input({ now: 1300, party: at(2, 1), last: step.last }));
  assert.equal(step.hits.length, 0, "back in (reach 1) - but leaving and coming back does not reset the count");
  step = harmTick(input({ now: 2100, party: at(2, 1), last: step.last }));
  assert.equal(step.hits.length, 1);
  // (the input is not changed)
  const before = { a: 1 };
  harmTick(input({ last: before }));
  assert.deepEqual(before, { a: 1 });
}
assert.equal(harmTick(input({ armed: false })).hits.length, 0, "traps not armed (wander mode): nothing");
assert.deepEqual(harmTick(input({ armed: false })).last, {}, "...and nothing is counted");
assert.equal(harmTick(input({ party: null })).hits.length, 0, "the party is nowhere (editor, ride, above the floor)");
assert.equal(harmTick(input({ map: { ...grid, smokes: [{ ...poison, active: false }] } })).hits.length, 0, "an inactive emitter does nothing");
assert.equal(harmTick(input({ map: { ...grid, smokes: [{ ...poison, active: false }] }, on: { "1,1": true } })).hits.length, 1, "...until a switch turns it on");
assert.equal(harmTick(input({ on: { "1,1": false } })).hits.length, 0, "...and again when one turns it off");
assert.equal(harmTick(input({ map: { ...grid, smokes: [{ cell: at(1, 1) }] } })).hits.length, 0, "no harm block: harmless");
{
  // its own `every`, `reach` and line
  const slow = { cell: at(1, 1), harm: { damage: 5, every: 3, reach: 0, label: "is scorched" } };
  const map = { ...grid, smokes: [slow] };
  const first = harmTick(input({ map }));
  assert.deepEqual(first.hits, [{ key: "1,1", damage: 5, label: "is scorched" }]);
  assert.equal(harmTick(input({ map, now: 2900, last: first.last })).hits.length, 0);
  assert.equal(harmTick(input({ map, now: 3000, last: first.last })).hits.length, 1);
  assert.equal(harmTick(input({ map, party: at(2, 1) })).hits.length, 0, "reach 0: only its own cell");
}
{
  // two emitters in one cell are two keys; both can hurt
  const both = harmTick(input({ map: { ...grid, smokes: [poison, { cell: at(1, 1), harm: { damage: 1 } }] } }));
  assert.deepEqual(both.hits.map((h) => [h.key, h.damage]), [["1,1", 2], ["1,1#2", 1]]);
}
assert.equal(HARM_DEFAULTS.reach, 1);

// ---- presets: each is a full patch (nothing of the last one is left)
for (const id of EMITTER_PRESETS) {
  const patch = presetPatch(id);
  assert.ok("harm" in patch && "blow" in patch && "color" in patch, `${id} sets or clears every part of the look`);
}
assert.equal(presetPatch("fire").effect, "fire");
assert.equal(presetPatch("fire").color, undefined);
assert.equal(presetPatch("blueFire").effect, "fire");
assert.match(String(presetPatch("blueFire").color), /^#[0-9a-f]{6}$/i);
assert.match(String(presetPatch("greenFire").color), /^#[0-9a-f]{6}$/i);
assert.notEqual(presetPatch("blueFire").color, presetPatch("greenFire").color);
assert.equal(presetPatch("smoke").effect, "smoke");
assert.equal(presetPatch("steam").color, "#ffffff");
assert.deepEqual((presetPatch("poison").harm as { damage: number }).damage, 2);
assert.equal(presetPatch("poison").effect, "smoke");
assert.ok(readHarm(presetPatch("poison").harm), "the poison preset's harm reads back");
assert.ok(readHarm(presetPatch("flameJet").harm));
assert.equal(presetPatch("flameJet").effect, "fire");
assert.equal(presetPatch("flameJet").decorative, true, "the jet does not burn its own cell: its harm does the work");
assert.equal((presetPatch("flameJet", 90).blow as { yaw: number }).yaw, 90);

// ---- the flame jet blows away from the wall the emitter sits against
{
  // the cell (1,1) has walls north and west; (3,1) is open everywhere around
  const walls = { cells: [["wall", "wall", "wall", "wall", "wall"], ["wall", "floor", "floor", "floor", "wall"], ["wall", "floor", "floor", "floor", "wall"], ["wall", "wall", "wall", "wall", "wall"]] };
  assert.equal(wallSideOf(walls, at(1, 1), [0, 0.5, -0.45]), "N", "pushed toward the north wall");
  assert.equal(wallSideOf(walls, at(1, 1), [-0.45, 0.5, 0]), "W");
  assert.equal(wallSideOf(walls, at(1, 1), [-0.3, 0.5, 0.45]), "W", "(the south side is open: only a wall counts, however near)");
  assert.equal(wallSideOf(walls, at(2, 2), [0, 0.5, 0.4]), "S");
  assert.equal(wallSideOf({ cells: [["floor", "floor", "floor"], ["floor", "floor", "floor"], ["floor", "floor", "floor"]] }, at(1, 1), [0, 0, 0.4]), null);
  assert.equal(jetYawFor(walls, at(1, 1), [0, 0.5, -0.45]), 180, "against the north wall: blows south");
  assert.equal(jetYawFor(walls, at(1, 1), [-0.45, 0.5, 0]), 90, "against the west wall: blows east");
  assert.equal(jetYawFor(walls, at(2, 2), [0, 0.5, 0.4]), 0, "against the south wall: blows north");
  assert.equal(jetYawFor(walls, at(3, 1), [0.4, 0.5, 0]), 270, "against the east wall: blows west");
}

// ---- the store: what the viewport shows and the fire burns
{
  const map = { id: "m", smokes: [{ cell: at(1, 1), active: false }, { cell: at(2, 1) }, { cell: at(1, 1) }] } as unknown as GameMap;
  emitterView.set({ mapId: "m", playing: false, on: {} });
  assert.deepEqual(emittersShown(map), [true, true, true], "the editor shows all of them");
  emitterView.set({ mapId: "m", playing: true, on: {} });
  assert.deepEqual(emittersShown(map), [false, true, true], "playing: the inactive one is hidden");
  emitterView.set({ mapId: "m", playing: true, on: { "1,1": true, "2,1": false } });
  assert.deepEqual(emittersShown(map), [true, false, true], "a switch turned one on and one off");
  emitterView.set({ mapId: "other", playing: true, on: { "1,1": true } });
  assert.deepEqual(emittersShown(map), [true, true, true], "state about another deck says nothing here");
  assert.deepEqual([0, 1, 2].map(emittersOn(map)), [false, true, true], "(what burns follows `active` then)");
  emitterView.set({ mapId: "m", playing: true, on: { "1,1": true } });
  assert.deepEqual([0, 1, 2].map(emittersOn(map)), [true, true, true]);
  let heard = 0;
  const off = emitterView.subscribe(() => heard++);
  emitterView.set({ mapId: "m", playing: true, on: {} });
  off();
  emitterView.set({ mapId: "m", playing: true, on: {} });
  assert.equal(heard, 1);
}

// ---- fire: only an emitter that is on burns its cell
{
  const map = { id: "m", smokes: [{ cell: at(1, 1), fire: true }, { cell: at(2, 2), fire: true, decorative: true }, { cell: at(3, 3), fire: true }, { cell: at(4, 4) }] } as unknown as GameMap;
  assert.deepEqual([...fireCells(map)].sort(), ["1,1", "3,3"], "as before: a torch (decorative) and plain smoke do not burn");
  assert.deepEqual([...fireCells(map, (i) => i !== 2)], ["1,1"], "a fire switched off does not burn");
}

console.log("emitters: ok");
