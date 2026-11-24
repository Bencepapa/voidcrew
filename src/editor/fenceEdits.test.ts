// Run: npx tsx src/editor/fenceEdits.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";

// (mapEdits reads the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { edgeId } = await import("../game/fences");
const { eraseFence, fenceEditing, fenceIndexAt, fencePieceEdited, fenceRun, paintFence, reevaluateFences } = await import("./fenceEdits");
const { updateProp } = await import("./mapEdits");

// a 12x9 map, walls round the edge
function mapOf(): MapFile {
  const W = 12;
  const H = 9;
  const layout = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".")).join(""));
  return { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout } as unknown as MapFile;
}
const row = (x0: number, x1: number, y: number) => Array.from({ length: x1 - x0 + 1 }, (_, i) => ({ x: x0 + i, y }));
const col = (x: number, y0: number, y1: number) => Array.from({ length: y1 - y0 + 1 }, (_, i) => ({ x, y: y0 + i }));
const forms = (file: MapFile) => (file.props ?? []).map((p) => `${p.prop.replace("fence_", "")}@${p.x},${p.y}${p.prop === "fence_edge" ? p.at : ""}`);

// ---- placing: blocks and mid fences, a cell each
{
  const file = mapOf();
  const placed = { count: 0 };
  paintFence(file, "block", row(2, 4, 3), { texture: "fantasywall1", style: { height: 1.5, opaque: false } }, undefined, placed);
  assert.equal(placed.count, 3);
  assert.deepEqual(file.props![0], { prop: "fence_block", x: 2, y: 3, at: "center", texture: "fantasywall1", fence: { height: 1.5, opaque: false } });
  // painting over them again changes nothing
  const before = JSON.stringify(file);
  paintFence(file, "block", row(3, 5, 3), { texture: "wall4" });
  assert.equal(file.props!.length, 4, "only the new cell got a piece");
  assert.equal(file.props![0].texture, "fantasywall1", "the ones there are left as they are");
  assert.equal(file.props![3].texture, "wall4");
  assert.notEqual(JSON.stringify(file), before);
  // a wall, a door and the map's edge: nothing
  paintFence(file, "block", [{ x: 0, y: 3 }, { x: 99, y: 3 }, { x: 5, y: 0 }], {});
  assert.equal(file.props!.length, 4);
  // a mid fence takes the cell of a block (they can't share one), and carries the turn
  paintFence(file, "mid", [{ x: 2, y: 3 }], { rotation: 90 });
  assert.deepEqual(forms(file), ["block@3,3", "block@4,3", "block@5,3", "mid@2,3"]);
  assert.equal(file.props![3].rotation, 90);
  // no style, no texture: a bare piece
  const bare = mapOf();
  paintFence(bare, "mid", [{ x: 4, y: 4 }]);
  assert.deepEqual(bare.props, [{ prop: "fence_mid", x: 4, y: 4, at: "center" }]);
}

// ---- placing: edges, a side each, named once however it is reached
{
  const file = mapOf();
  paintFence(file, "edge", row(2, 4, 3), { texture: "fantasywall1" }, "N");
  assert.deepEqual(forms(file), ["edge@2,3N", "edge@3,3N", "edge@4,3N"]);
  assert.deepEqual(file.props![0], { prop: "fence_edge", x: 2, y: 3, at: "N", texture: "fantasywall1" });
  // the same edges named from the cells above (their south sides): they are there already
  paintFence(file, "edge", row(2, 4, 2), {}, "S");
  assert.equal(file.props!.length, 3);
  // no side: nothing to put (the tool asks)
  paintFence(file, "edge", [{ x: 6, y: 6 }], {});
  assert.equal(file.props!.length, 3);
  // an edge between a wall and a floor: the floor's piece (the border of the map)
  paintFence(file, "edge", [{ x: 5, y: 1 }], {}, "N");
  assert.deepEqual(file.props![3], { prop: "fence_edge", x: 5, y: 1, at: "N" }, "the edge of the map: the floor cell holds it");
  // from the wall's side, the floor next to it takes the piece on the opposite side
  paintFence(file, "edge", [{ x: 0, y: 4 }], {}, "E");
  assert.deepEqual(file.props![4], { prop: "fence_edge", x: 1, y: 4, at: "W" });
  // the lone corner cells: both sides of a vertical run
  paintFence(file, "edge", col(7, 2, 4), {}, "E");
  assert.equal(file.props!.length, 8);
  assert.equal(fenceIndexAt(file, "edge", { x: 7, y: 3 }, "E"), 6);
  assert.equal(fenceIndexAt(file, "edge", { x: 8, y: 3 }, "W"), 6, "from the other cell");
  assert.equal(fenceIndexAt(file, "edge", { x: 7, y: 3 }, "N"), -1);
  // an edge fence and a block can share a cell, and an edge fence and a mid fence too
  paintFence(file, "block", [{ x: 7, y: 3 }]);
  paintFence(file, "mid", [{ x: 7, y: 6 }]);
  paintFence(file, "edge", [{ x: 7, y: 6 }], {}, "S");
  assert.equal(file.props!.length, 11);
}

// ---- erasing
{
  const file = mapOf();
  paintFence(file, "edge", row(2, 4, 3), {}, "N");
  paintFence(file, "block", row(2, 4, 5), {});
  paintFence(file, "mid", row(2, 4, 7), {});
  const gone = { count: 0 };
  eraseFence(file, "edge", [{ x: 3, y: 2 }], "S", gone);
  assert.equal(gone.count, 1, "named from the other side of the edge");
  assert.deepEqual(forms(file).slice(0, 2), ["edge@2,3N", "edge@4,3N"]);
  eraseFence(file, "edge", [{ x: 2, y: 3 }], "E", gone);
  assert.equal(gone.count, 1, "another side of that cell: nothing there");
  eraseFence(file, "edge", [{ x: 2, y: 3 }]);
  assert.equal(file.props!.length, 8, "an edge needs its side");
  eraseFence(file, "block", [{ x: 3, y: 5 }, { x: 4, y: 5 }]);
  assert.deepEqual(forms(file).filter((f) => f.startsWith("block")), ["block@2,5"]);
  eraseFence(file, "block", [{ x: 3, y: 7 }]);
  assert.ok(forms(file).includes("mid@3,7"), "a block eraser leaves the mid fences");
  eraseFence(file, "mid", row(2, 4, 7));
  eraseFence(file, "block", [{ x: 2, y: 5 }]);
  eraseFence(file, "edge", [{ x: 4, y: 3 }], "N");
  eraseFence(file, "edge", [{ x: 2, y: 3 }], "N");
  assert.equal(file.props, undefined, "the list goes when it is empty");
}

// ---- tidying: pieces that can't stand any more
{
  const file = mapOf();
  paintFence(file, "block", [{ x: 3, y: 3 }]);
  paintFence(file, "mid", [{ x: 4, y: 3 }]);
  paintFence(file, "edge", [{ x: 5, y: 3 }], {}, "E");
  file.props!.push({ prop: "crate1", x: 3, y: 3, at: "center" });
  // the cell of a block turns into a wall (Fill) and the mid fence's into a door (the door tool): the pieces go, a crate stays (that is the map's to refuse)
  const chars = file.layout[3].split("");
  chars[3] = "W";
  chars[4] = "D";
  file.layout[3] = chars.join("");
  reevaluateFences(file);
  assert.deepEqual(forms(file), ["edge@5,3E", "crate1@3,3"]);
  // duplicates (two on one edge, two in one cell), an edge with no side
  const messy = mapOf();
  messy.props = [
    { prop: "fence_edge", x: 3, y: 3, at: "N" },
    { prop: "fence_edge", x: 3, y: 2, at: "S" },
    { prop: "fence_block", x: 5, y: 5 },
    { prop: "fence_mid", x: 5, y: 5 },
    { prop: "fence_edge", x: 6, y: 6 },
  ];
  reevaluateFences(messy);
  assert.deepEqual(messy.props!.map((p) => `${p.prop}${p.x},${p.y}${p.at ?? ""}`), ["fence_edge3,3N", "fence_block5,5", "fence_edge6,6N"]);
  // a map without fences is left alone (the same object, untouched)
  const plain = mapOf();
  plain.props = [{ prop: "crate1", x: 2, y: 2 }];
  const copy = JSON.stringify(plain);
  assert.equal(reevaluateFences(plain), plain);
  assert.equal(JSON.stringify(plain), copy);
}

// ---- runs
{
  const file = mapOf();
  paintFence(file, "edge", row(2, 4, 3), {}, "N");
  paintFence(file, "edge", col(5, 3, 5), {}, "W");
  paintFence(file, "edge", row(8, 9, 6), {}, "N");
  // (the three along the north side, the turn at x=5 (its west edge at x=4.5 meets the run's end), and the far one apart)
  const run = fenceRun(file, 0).map((i) => `${file.props![i].x},${file.props![i].y}${file.props![i].at}`);
  assert.deepEqual(run, ["2,3N", "3,3N", "4,3N", "5,3W", "5,4W", "5,5W"]);
  assert.deepEqual(fenceRun(file, file.props!.length - 1).length, 2);
  // blocks and mid fences join through the cells beside them (not diagonally)
  const cells = mapOf();
  paintFence(cells, "block", [{ x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 3 }, { x: 6, y: 6 }]);
  assert.deepEqual(fenceRun(cells, 0), [0, 1]);
  assert.deepEqual(fenceRun(cells, 2), [2], "diagonal: not joined");
  // different forms don't join
  paintFence(cells, "mid", [{ x: 3, y: 3 }]);
  assert.deepEqual(fenceRun(cells, 0), [0, 1]);
  assert.deepEqual(fenceRun(cells, 4), [4]);
  assert.deepEqual(fenceRun(cells, 99), []);
  assert.deepEqual(fenceRun(cells, -1), []);
}

// ---- editing one piece of a run reaches the others that look the same
{
  const file = mapOf();
  paintFence(file, "edge", row(2, 6, 3), { texture: "fantasywall1", style: { thickness: 0.1 } }, "N");
  // one piece set apart (with the switch off)
  fenceEditing.spread = false;
  updateProp(file, 4, { texture: "wall5" });
  fenceEditing.spread = true;
  assert.deepEqual(file.props!.map((p) => p.texture), ["fantasywall1", "fantasywall1", "fantasywall1", "fantasywall1", "wall5"]);
  // a change to the first reaches the three that look as it does, not the one set apart
  updateProp(file, 0, { fence: { thickness: 0.3, top: "wall4" } });
  const changed = { thickness: 0.3, top: "wall4" };
  assert.deepEqual(file.props!.map((p) => p.fence), [changed, changed, changed, changed, { thickness: 0.1 }]);
}
{
  const file = mapOf();
  paintFence(file, "block", [...row(2, 4, 3), ...row(2, 4, 4)], { texture: "wall4", style: { height: 2 } });
  paintFence(file, "block", [{ x: 8, y: 6 }], { texture: "wall4", style: { height: 2 } });
  // one edit: the texture reaches the 6 joined blocks and not the one standing apart
  updateProp(file, 0, { texture: "fantasywall1" });
  assert.deepEqual(file.props!.map((p) => p.texture), ["fantasywall1", "fantasywall1", "fantasywall1", "fantasywall1", "fantasywall1", "fantasywall1", "wall4"]);
  // settings the same way; cleaned (a default height is left out, junk too)
  updateProp(file, 3, { fence: { height: 1, opaque: false, top: "bad id!" } as never });
  assert.deepEqual(file.props!.slice(0, 6).map((p) => p.fence), Array(6).fill({ opaque: false }));
  assert.deepEqual(file.props![6].fence, { height: 2 });
  // clearing them
  updateProp(file, 1, { fence: undefined });
  assert.ok(file.props!.slice(0, 6).every((p) => p.fence === undefined));
  // the turn, the height off the floor and the chance are the piece's own: they don't spread
  updateProp(file, 0, { elevation: 0.5, chance: 0.5 });
  assert.equal(file.props![1].elevation, undefined);
  // with the switch off, a change is the piece's alone
  fenceEditing.spread = false;
  updateProp(file, 0, { texture: "wall5" });
  fenceEditing.spread = true;
  assert.deepEqual(file.props!.map((p) => p.texture).slice(0, 3), ["wall5", "fantasywall1", "fantasywall1"]);
}
{
  // an edge piece can't be moved onto an edge another piece holds
  const file = mapOf();
  paintFence(file, "edge", [{ x: 3, y: 3 }], {}, "N");
  paintFence(file, "edge", [{ x: 3, y: 3 }], {}, "E");
  updateProp(file, 0, { at: "E" });
  assert.equal(file.props![0].at, "N", "the east edge is taken");
  updateProp(file, 0, { at: "S" });
  assert.equal(file.props![0].at, "S");
  updateProp(file, 0, { at: "center" });
  assert.equal(file.props![0].at, "S", "an edge piece stands on a side");
  // an ordinary prop is none of this
  const plain = mapOf();
  plain.props = [{ prop: "crate1", x: 2, y: 2, at: "center" }];
  updateProp(plain, 0, { at: "N", texture: "wall4" });
  assert.deepEqual(plain.props[0], { prop: "crate1", x: 2, y: 2, at: "N", texture: "wall4" });
}
{
  const file = mapOf();
  // (the edit hook alone, for a piece standing alone)
  paintFence(file, "mid", [{ x: 3, y: 3 }]);
  const next: Record<string, unknown> = { ...file.props![0] };
  fencePieceEdited(file, 0, file.props![0], next, { fence: { height: 0.5 } });
  assert.deepEqual(next.fence, { height: 0.5 });
  assert.equal(edgeId(3, 3, "N"), "H3,3");
}

console.log("fenceEdits.test.ts: ok");
