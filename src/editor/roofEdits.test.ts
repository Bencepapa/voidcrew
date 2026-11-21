// Run: npx tsx src/editor/roofEdits.test.ts
import assert from "node:assert/strict";
import type { MapFile } from "../game/mapFormat";
import { eraseRoof, eraseRoofGroup, paintRoof, reevaluateRoofs, roofFootprint, roofGroupFor, roofGroups, roofPieceEdited, setRoofDetached } from "./roofEdits";

// a 12x9 map, walls round the edge; a raised block (floor 1) at x 3..7, y 2..6 when `raised`
function mapOf(raised = true): MapFile {
  const W = 12;
  const H = 9;
  const layout = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".")).join(""));
  const floor = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (raised && x >= 3 && x <= 7 && y >= 2 && y <= 6 ? "1" : ".")).join(""));
  return { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout, layers: { floor: { legend: { "1": 1 }, default: 0, rows: floor } } } as unknown as MapFile;
}
const block = (x0: number, y0: number, x1: number, y1: number) => {
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push({ x, y });
  return cells;
};
const at = (file: MapFile, x: number, y: number) => file.props?.find((p) => p.x === x && p.y === y);
const roofs = (file: MapFile) => file.props?.filter((p) => p.auto) ?? [];

// painting a block: the edge and corner pieces turn out as autotiled, at the floor's height
{
  const file = mapOf();
  const group = roofGroupFor(file, { x: 3, y: 2 }, "slope");
  assert.equal(group, "slope-1");
  paintRoof(file, block(3, 2, 5, 4), group);
  assert.equal(roofs(file).length, 9);
  assert.deepEqual(at(file, 3, 4), { prop: "roof_corner", x: 3, y: 4, at: "center", auto: "slope-1" }, "SW corner: rotation 0 is left out; the floor is the eave's height");
  assert.equal(at(file, 3, 2)!.rotation, 90);
  assert.equal(at(file, 4, 4)!.prop, "roof_slope");
  assert.equal(at(file, 4, 3)!.prop, "roof_flat");
  assert.equal(at(file, 4, 3)!.elevation, 1);
  // every piece has its elevation relative to its own floor (the raised block: the same relative numbers)
  assert.ok(roofs(file).every((p) => !p.detached));

  // painting more re-evaluates the neighbours: the right edge of the 3x3 is inside a longer roof now
  paintRoof(file, block(6, 2, 6, 4), group);
  assert.equal(at(file, 5, 3)!.prop, "roof_flat");
  assert.equal(at(file, 6, 3)!.prop, "roof_slope");
  assert.equal(at(file, 6, 3)!.rotation, 270);
  // erasing it again restores them
  eraseRoof(file, block(6, 2, 6, 4));
  assert.equal(roofs(file).length, 9);
  assert.equal(at(file, 5, 3)!.prop, "roof_slope");
  assert.equal(at(file, 5, 3)!.rotation, 270);
  // erasing the middle cell leaves a ring one cell thick: nothing to climb, all flat at the eave's level
  eraseRoof(file, [{ x: 4, y: 3 }]);
  assert.equal(roofs(file).length, 8);
  assert.ok(roofs(file).every((p) => p.prop === "roof_flat" && p.elevation === undefined && p.rotation === undefined));
}

// the group a stroke joins: the roof beside it (same form), else a new one
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 4, 3), roofGroupFor(file, { x: 3, y: 2 }, "flat"));
  assert.equal(roofGroupFor(file, { x: 5, y: 2 }, "flat"), "flat-1", "next to it: the same roof");
  assert.equal(roofGroupFor(file, { x: 5, y: 2 }, "flat", true), "flat-2", "Ctrl: a new one");
  assert.equal(roofGroupFor(file, { x: 5, y: 2 }, "slope"), "slope-2", "another form: its own roof (numbers are never reused)");
  assert.equal(roofGroupFor(file, { x: 7, y: 6 }, "flat"), "flat-2", "away from it: a new one");
  // two roofs side by side keep their eaves between them
  paintRoof(file, block(5, 2, 7, 3), roofGroupFor(file, { x: 5, y: 2 }, "flat", true));
  assert.equal(roofGroups(file).size, 2);
  assert.deepEqual([at(file, 4, 2)!.prop, at(file, 4, 2)!.rotation], ["roof_corner", 180], "the first roof's north east corner: its east side is an eave");
  assert.deepEqual([at(file, 5, 2)!.prop, at(file, 5, 2)!.rotation], ["roof_corner", 90], "the second roof's north west corner");
}

// two forms: repainting a cell with the other form takes it into that group
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 5, 4), "slope-1");
  paintRoof(file, [{ x: 4, y: 3 }], "bent-2");
  assert.equal(at(file, 4, 3)!.auto, "bent-2");
  // (the same form, another roof: left alone)
  paintRoof(file, [{ x: 3, y: 2 }], "slope-3");
  assert.equal(at(file, 3, 2)!.auto, "slope-1");
}

// levels: roofing across a step makes two roofs' worth of eaves
{
  const file = mapOf();
  paintRoof(file, block(2, 2, 4, 4), "slope-1"); // x 2 is the low ground, 3 and 4 the block
  const lowEdge = at(file, 2, 3)!;
  assert.equal(lowEdge.prop, "roof_flat", "a one wide strip at the low level: flat");
  assert.equal(at(file, 3, 3)!.prop, "roof_slope", "the block's own edge is an eave, one step above the ground's");
}

// walls and doors can't be roofed; a hand-placed roof is left alone
{
  const file = mapOf();
  file.layout[3] = file.layout[3].slice(0, 5) + "D" + file.layout[3].slice(6);
  file.props = [{ prop: "roof_slope", x: 3, y: 2, at: "center", rotation: 180 }];
  paintRoof(file, block(0, 2, 4, 3), "slope-1");
  assert.equal(at(file, 0, 2), undefined, "a wall");
  assert.equal(file.props.filter((p) => p.x === 3 && p.y === 2).length, 1);
  assert.equal(file.props.find((p) => p.x === 3 && p.y === 2)!.auto, undefined, "the hand placed one is untouched");
  assert.equal(roofs(file).some((p) => p.x === 5), false);
}

// detaching: the piece keeps what it is, and still counts as part of the roof
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 5, 4), "slope-1");
  const index = file.props!.findIndex((p) => p.x === 4 && p.y === 4);
  setRoofDetached(file, index, true);
  file.props![index].rotation = 90;
  paintRoof(file, block(6, 2, 6, 4), "slope-1");
  assert.equal(file.props![index].rotation, 90, "kept");
  assert.equal(file.props![index].detached, true);
  // (its neighbours were worked out as if it were still part of the roof's edge)
  assert.equal(at(file, 5, 4)!.prop, "roof_slope");
  setRoofDetached(file, index, false);
  assert.equal(file.props![index].rotation, undefined, "taken back: the tool sets it again");
  assert.equal(file.props![index].prop, "roof_slope");

  // a hand change detaches (updateProp does this through roofPieceEdited)
  const prop = file.props![index];
  const next: Record<string, unknown> = { ...prop, rotation: 180 };
  roofPieceEdited(file, prop, next, { rotation: 180 });
  assert.equal(next.detached, true);
  const same: Record<string, unknown> = { ...prop, chance: 0.5 };
  roofPieceEdited(file, prop, same, { chance: 0.5 });
  assert.equal(same.detached, undefined, "a chance is no shape");
  // a texture is the whole roof's
  const tex: Record<string, unknown> = { ...prop, texture: "wall5" };
  roofPieceEdited(file, prop, tex, { texture: "wall5" });
  assert.ok(roofs(file).filter((p) => p !== prop).every((p) => p.texture === "wall5"));
  assert.equal(tex.detached, undefined);
}

// a new piece wears the texture of its roof; a floor's height changing re-evaluates
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 4, 3), "slope-1");
  for (const p of roofs(file)) p.texture = "wall5";
  paintRoof(file, [{ x: 5, y: 2 }], "slope-1");
  assert.equal(at(file, 5, 2)!.texture, "wall5");
  // the whole roof's floor raised one step: nothing changes (the pieces are relative to their floors)
  const before = JSON.stringify(roofs(file));
  const rows = file.layers!.floor!.rows;
  for (let y = 2; y <= 3; y++) rows[y] = rows[y].slice(0, 3) + "11" + rows[y].slice(5);
  reevaluateRoofs(file);
  assert.equal(JSON.stringify(roofs(file)), before);
  // one cell of it raised: it is a level of its own - a lone cell, flat
  rows[2] = rows[2].slice(0, 3) + "." + rows[2].slice(4);
  reevaluateRoofs(file);
  assert.equal(at(file, 3, 2)!.prop, "roof_flat");
  assert.equal(at(file, 3, 2)!.elevation, undefined);
  // (and the rest, a thin L at its level, changed with it: the 2x2 had slopes and corners, an L has none)
  assert.ok(roofs(file).every((p) => p.prop === "roof_flat"));
}

// a cell turned into a wall takes its roof piece away; the rest close up
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 5, 4), "slope-1");
  file.layout[2] = file.layout[2].slice(0, 3) + "W" + file.layout[2].slice(4);
  reevaluateRoofs(file);
  assert.equal(at(file, 3, 2), undefined);
  assert.equal(roofs(file).length, 8);
}

// erasing a whole roof; nothing left: the list goes
{
  const file = mapOf();
  paintRoof(file, block(3, 2, 5, 4), "slope-1");
  paintRoof(file, block(6, 5, 7, 6), "slope-2");
  eraseRoofGroup(file, "slope-1");
  assert.deepEqual([...roofGroups(file).keys()], ["slope-2"]);
  eraseRoofGroup(file, "slope-2");
  assert.equal(file.props, undefined);
}

// the raised block's footprint
{
  const file = mapOf();
  const cells = roofFootprint(file, { x: 5, y: 4 })!;
  assert.equal(cells.length, 25);
  assert.equal(roofFootprint(file, { x: 1, y: 1 }), null, "the ground isn't a block");
  assert.equal(roofFootprint(file, { x: 0, y: 0 }), null, "a wall");
  // roofing it: one roof, the outline of the block
  paintRoof(file, cells, "flat-1");
  assert.equal(roofs(file).length, 25);
  assert.equal(at(file, 5, 4)!.prop, "roof_flat");
  assert.equal(at(file, 5, 4)!.elevation, 1);
  assert.equal(at(file, 3, 2)!.prop, "roof_corner");
  // idempotent
  const once = JSON.stringify(file.props);
  reevaluateRoofs(file);
  assert.equal(JSON.stringify(file.props), once);
}

console.log("roofEdits ok");
