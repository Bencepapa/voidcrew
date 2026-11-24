// Run: npx tsx src/game/fences.test.ts
import assert from "node:assert/strict";
import {
  FENCE_PROP,
  cleanFenceStyle,
  edgeBetween,
  edgeCells,
  edgeFenceBetween,
  edgeId,
  edgeLine,
  edgeSegment,
  fenceBlocksSight,
  fenceBoxes,
  fenceClosesCell,
  fenceDecorated,
  fenceFaces,
  fenceFormOf,
  fenceIndex,
  fenceMarks,
  fenceModelSpec,
  fenceProblems,
  midArms,
  midSegments,
  sideFromPoint,
  yawAlong,
  yawFacing,
  type FenceProp,
  type FenceStyle,
} from "./fences";
import type { Direction, PropAnchor } from "./types";

const piece = (form: "block" | "edge" | "mid", x: number, y: number, extra: Partial<FenceProp> = {}): FenceProp => ({ prop: FENCE_PROP[form], cell: { x, y }, at: "center" as PropAnchor, ...extra });
const edge = (x: number, y: number, side: Direction, fence?: FenceStyle): FenceProp => piece("edge", x, y, { at: side, fence });
const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} is not ${b}`);
const nearAll = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => near(v, b[i]));

// ---- ids

assert.equal(fenceFormOf("fence_block"), "block");
assert.equal(fenceFormOf("fence_edge"), "edge");
assert.equal(fenceFormOf("fence_mid"), "mid");
assert.equal(fenceFormOf("crate1"), null);
assert.equal(fenceFormOf(undefined), null);

// ---- the style: out-of-range pulled in, defaults and junk left out, idempotent
{
  assert.equal(cleanFenceStyle(undefined), undefined);
  assert.equal(cleanFenceStyle("x"), undefined);
  assert.equal(cleanFenceStyle({}), undefined);
  assert.equal(cleanFenceStyle({ height: 1, thickness: 0, opaque: undefined }), undefined, "the defaults are left out");
  assert.deepEqual(cleanFenceStyle({ height: 9, thickness: 5, top: "wall4", opaque: false }), { height: 3, thickness: 0.8, top: "wall4", opaque: false });
  assert.deepEqual(cleanFenceStyle({ height: 0.01 }), { height: 0.25 });
  assert.deepEqual(cleanFenceStyle({ top: "../etc", thickness: -1, height: "tall" }), undefined, "a bad texture id, a negative thickness, a string height: nothing");
  assert.deepEqual(cleanFenceStyle({ deco: { every: 3.4, texture: "fantasywall1" } }), { deco: { every: 3, texture: "fantasywall1" } });
  assert.deepEqual(cleanFenceStyle({ deco: { every: 99, post: true } }), { deco: { every: 32, post: true } });
  assert.equal(cleanFenceStyle({ deco: { every: 3 } }), undefined, "a decoration with neither a texture nor a post is none");
  assert.equal(cleanFenceStyle({ deco: { texture: "wall4" } }), undefined, "nor one without a frequency");
  const once = cleanFenceStyle({ height: 2.345, thickness: 0.123, top: "a", opaque: true, deco: { every: 4, texture: "b", post: true } });
  assert.deepEqual(once, { height: 2.35, thickness: 0.12, top: "a", opaque: true, deco: { every: 4, texture: "b", post: true } });
  assert.deepEqual(cleanFenceStyle(JSON.parse(JSON.stringify(once))), once, "a round trip through the map file changes nothing");
}

// ---- edges: one id however it is named
{
  assert.equal(edgeId(3, 4, "N"), edgeId(3, 3, "S"));
  assert.equal(edgeId(3, 4, "W"), edgeId(2, 4, "E"));
  assert.notEqual(edgeId(3, 4, "N"), edgeId(3, 4, "S"));
  assert.deepEqual(edgeCells(edgeId(3, 4, "N")), [{ x: 3, y: 3 }, { x: 3, y: 4 }]);
  assert.deepEqual(edgeCells(edgeId(3, 4, "W")), [{ x: 2, y: 4 }, { x: 3, y: 4 }]);
  assert.deepEqual(edgeCells(edgeId(3, 4, "E")), [{ x: 3, y: 4 }, { x: 4, y: 4 }]);
  assert.deepEqual(edgeLine(edgeId(3, 4, "N")), { cx: 3, cz: 3.5, axis: "x" });
  assert.deepEqual(edgeLine(edgeId(3, 4, "S")), { cx: 3, cz: 4.5, axis: "x" });
  assert.deepEqual(edgeLine(edgeId(3, 4, "E")), { cx: 3.5, cz: 4, axis: "z" });
  assert.deepEqual(edgeLine(edgeId(3, 4, "W")), { cx: 2.5, cz: 4, axis: "z" });
  assert.equal(edgeBetween({ x: 3, y: 4 }, { x: 4, y: 4 }), edgeId(3, 4, "E"));
  assert.equal(edgeBetween({ x: 4, y: 4 }, { x: 3, y: 4 }), edgeId(3, 4, "E"), "either way across it");
  assert.equal(edgeBetween({ x: 3, y: 4 }, { x: 3, y: 3 }), edgeId(3, 4, "N"));
  assert.equal(edgeBetween({ x: 3, y: 4 }, { x: 4, y: 5 }), null, "diagonals share no edge");
  assert.equal(edgeBetween({ x: 3, y: 4 }, { x: 3, y: 4 }), null);
  // every edge's cells are the ones it joins, and its line lies halfway between them
  for (const side of ["N", "E", "S", "W"] as const) {
    const id = edgeId(5, 5, side);
    const [a, b] = edgeCells(id);
    const line = edgeLine(id);
    near(line.cx, (a.x + b.x) / 2);
    near(line.cz, (a.y + b.y) / 2);
  }
}

// ---- which side of its cell a click is nearest
{
  assert.equal(sideFromPoint(0.4, 0.1), "E");
  assert.equal(sideFromPoint(-0.4, 0.1), "W");
  assert.equal(sideFromPoint(0.1, 0.45), "S");
  assert.equal(sideFromPoint(0.1, -0.45), "N");
  assert.equal(sideFromPoint(0.05, -0.05), null, "the middle of the cell: ambiguous, the inspector decides");
  assert.equal(sideFromPoint(0.3, 0.3), "S", "a tie goes to the north-south pair, deterministically");
}

// ---- movement: the index
{
  const idx = fenceIndex([
    piece("block", 2, 2),
    piece("mid", 5, 5),
    edge(8, 3, "E"),
    edge(1, 1, "N"),
  ]);
  assert.equal(fenceClosesCell(idx, 2, 2), true, "a block closes its cell");
  assert.equal(fenceClosesCell(idx, 5, 5), true, "so does a mid fence (grid movement)");
  assert.equal(fenceClosesCell(idx, 8, 3), false, "an edge fence closes no cell");
  assert.equal(fenceClosesCell(idx, 3, 3), false);
  // the edge between (8,3) and (9,3) is shut both ways; the other edges of those cells are open
  assert.ok(edgeFenceBetween(idx, { x: 8, y: 3 }, { x: 9, y: 3 }));
  assert.ok(edgeFenceBetween(idx, { x: 9, y: 3 }, { x: 8, y: 3 }));
  assert.equal(edgeFenceBetween(idx, { x: 8, y: 3 }, { x: 8, y: 4 }), undefined);
  assert.equal(edgeFenceBetween(idx, { x: 8, y: 3 }, { x: 7, y: 3 }), undefined);
  // the same fence named from the other cell (S of the one above) is the same edge
  const same = fenceIndex([edge(1, 0, "S")]);
  assert.ok(edgeFenceBetween(same, { x: 1, y: 0 }, { x: 1, y: 1 }));
  assert.ok(edgeFenceBetween(same, { x: 1, y: 1 }, { x: 1, y: 0 }));
  // bodies: the edge's box is under both its cells, a block's under its own
  assert.equal(fenceBoxes(idx, 8, 3).length, 1);
  assert.equal(fenceBoxes(idx, 9, 3).length, 1);
  assert.equal(fenceBoxes(idx, 8, 3)[0], fenceBoxes(idx, 9, 3)[0], "(the one box)");
  assert.equal(fenceBoxes(idx, 7, 3).length, 0);
  const box = fenceBoxes(idx, 8, 3)[0];
  near(box.minX, 8.45);
  near(box.maxX, 8.55);
  near(box.minZ, 2.5);
  near(box.maxZ, 3.5);
  const wall = fenceBoxes(idx, 2, 2)[0];
  nearAll([wall.minX, wall.maxX, wall.minZ, wall.maxZ], [1.5, 2.5, 1.5, 2.5]);
  near(wall.height, 1);
  // a thick fence's box follows its thickness; a tall one its height; a raised one adds its elevation
  const thick = fenceIndex([edge(0, 0, "N", { thickness: 0.4, height: 0.5 })]);
  const t = fenceBoxes(thick, 0, 0)[0];
  near(t.minZ, -0.5 - 0.2);
  near(t.maxZ, -0.5 + 0.2);
  near(t.height, 0.5);
  const lifted = fenceIndex([piece("block", 0, 0, { elevation: 0.5, fence: { height: 2 } })]);
  near(fenceBoxes(lifted, 0, 0)[0].height, 2.5);
  // no fences: nothing, cheaply, and the same answer each time
  assert.equal(fenceIndex(undefined).pieces.length, 0);
  assert.equal(fenceIndex([]).pieces.length, 0);
  assert.equal(fenceIndex([{ prop: "crate1", cell: { x: 1, y: 1 } }]).pieces.length, 0);
  // two pieces on one edge: the first keeps it
  const twice = fenceIndex([edge(3, 3, "N", { height: 2 }), edge(3, 2, "S")]);
  assert.equal(twice.edges.size, 1);
  assert.equal(twice.edges.get(edgeId(3, 3, "N"))!.height, 2);
  // a block and a mid in one cell: the first keeps it
  const both = fenceIndex([piece("mid", 4, 4), piece("block", 4, 4)]);
  assert.equal(both.mids.size, 1);
  assert.equal(both.blocks.size, 0);
  // it is cached for as long as the list lives
  const list = [piece("block", 1, 1)];
  assert.equal(fenceIndex(list), fenceIndex(list));
}

// ---- mid fences: arms and segments
{
  // the arms come from mid pieces and blocks beside it
  const idx = fenceIndex([piece("mid", 5, 5), piece("mid", 6, 5), piece("block", 5, 4), piece("mid", 6, 6), piece("mid", 9, 9)]);
  const at = (x: number, y: number) => idx.mids.get(`${x},${y}`)!;
  assert.deepEqual(midArms(idx, at(5, 5)), ["N", "E"], "a block counts as a neighbour");
  assert.deepEqual(midArms(idx, at(6, 5)), ["S", "W"]);
  assert.deepEqual(midArms(idx, at(6, 6)), ["N"]);
  assert.deepEqual(midArms(idx, at(9, 9)), []);

  // alone: along its axis, the whole cell across; turned 90 degrees, the other way
  const lone = (rotation?: number) => midSegments([], fenceIndex([piece("mid", 0, 0, { rotation })]).mids.get("0,0")!.axis, 0);
  assert.equal(lone().length, 1);
  assert.equal(lone()[0].axis, "x");
  assert.equal(lone(90)[0].axis, "z");
  assert.equal(lone(180)[0].axis, "x");
  assert.equal(lone(270)[0].axis, "z");
  assert.equal(lone(0)[0].length, 1);

  // one neighbour, or two opposite ones: a straight run along their line, whatever the lone axis says
  for (const arms of [["N"], ["S"], ["N", "S"]] as Direction[][]) {
    const s = midSegments(arms, "x", 0);
    assert.equal(s.length, 1);
    assert.equal(s[0].axis, "z");
    assert.equal(s[0].length, 1);
  }
  for (const arms of [["E"], ["W"], ["E", "W"]] as Direction[][]) assert.equal(midSegments(arms, "z", 0)[0].axis, "x");

  // a corner: the two halves of one texture, joined at the bend, the picture going in and then out again
  for (const arms of [["N", "E"], ["E", "S"], ["S", "W"], ["N", "W"]] as Direction[][]) {
    const segs = midSegments(arms, "x", 0);
    assert.equal(segs.length, 2, arms.join());
    const [a, b] = segs;
    near(a.u0, 0);
    near(a.u1, 0.5);
    near(b.u0, 0.5);
    near(b.u1, 1);
    near(a.length, 0.5);
    near(b.length, 0.5);
    // where along its stretch the picture starts / ends, in the cell
    const startOf = (s: (typeof a)) => [s.cx - (s.du[0] * s.length) / 2, s.cz - (s.du[1] * s.length) / 2];
    const endOf = (s: (typeof a)) => [s.cx + (s.du[0] * s.length) / 2, s.cz + (s.du[1] * s.length) / 2];
    nearAll(endOf(a), [0, 0]);
    nearAll(startOf(b), [0, 0]);
    // the first half starts at the edge of its arm's side, the second ends at the edge of its
    const outer = (d: Direction) => (d === "N" ? [0, -0.5] : d === "S" ? [0, 0.5] : d === "E" ? [0.5, 0] : [-0.5, 0]);
    const order = ["N", "E", "S", "W"];
    const clockwise = (order.indexOf(arms[1]) - order.indexOf(arms[0]) + 4) % 4 === 1;
    const [first, second] = clockwise ? [arms[0], arms[1]] : [arms[1], arms[0]];
    nearAll(startOf(a), outer(first));
    nearAll(endOf(b), outer(second));
  }
  // (the order the arms are given in doesn't matter)
  assert.deepEqual(midSegments(["W", "N"], "x", 0), midSegments(["N", "W"], "x", 0));

  // a thick corner: each half reaches past the middle by half the thickness (the outer corner closes), its
  // picture running on with it
  {
    const [a, b] = midSegments(["N", "E"], "x", 0.2);
    near(a.length, 0.6);
    near(b.length, 0.6);
    near(a.u0, 0);
    near(a.u1, 0.6);
    near(b.u0, 0.4);
    near(b.u1, 1);
    // a runs from the north edge to 0.1 past the middle, b from 0.1 before it to the east edge
    near(a.cz + (a.du[1] * a.length) / 2, 0.1);
    near(b.cx - (b.du[0] * b.length) / 2, -0.1);
  }

  // a T: the straight line, and a half-length stub for the odd arm; a cross: two straight lines
  const t = midSegments(["N", "E", "S"], "x", 0);
  assert.equal(t.length, 2);
  assert.deepEqual(t.map((s) => [s.axis, s.length]), [["z", 1], ["x", 0.5]]);
  nearAll([t[1].cx, t[1].cz], [0.25, 0]);
  const cross = midSegments(["N", "E", "S", "W"], "x", 0);
  assert.deepEqual(cross.map((s) => [s.axis, s.length]), [["z", 1], ["x", 1]]);
}

// ---- the faces: orientation. A panel's picture runs along its local x and it looks along its local +z; with
// three.js's rotation.y = a, local x goes to (cos a, -sin a) and local z to (sin a, cos a) in (x, z).
{
  const localX = (yaw: number): [number, number] => [Math.cos(yaw), -Math.sin(yaw)];
  const localZ = (yaw: number): [number, number] => [Math.sin(yaw), Math.cos(yaw)];
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) nearAll(localX(yawAlong(dx, dz)), [dx, dz]);
  for (const [nx, nz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) nearAll(localZ(yawFacing(nx, nz)), [nx, nz]);

  // a block: four sides facing outward, each at its edge, the picture reading left to right as seen from outside
  const block = fenceFaces({ form: "block", height: 1, thickness: 0 });
  const sides = block.filter((f) => f.kind === "side");
  assert.equal(sides.length, 4);
  assert.equal(block.filter((f) => f.kind === "cap").length, 1);
  for (const f of sides) {
    if (f.kind !== "side") continue;
    const out = localZ(f.yaw);
    // it stands half a cell out in the direction it faces
    nearAll([f.x, f.z], [out[0] * 0.5, out[1] * 0.5]);
    assert.equal(f.mirror, false, "single-sided: a block's inside is not drawn");
    // seen from outside the picture reads left to right: its +x is the right hand of a viewer looking along -out
    // (looking along d, the right hand is (-d_z, d_x))
    const right = localX(f.yaw);
    const viewerRight: [number, number] = [out[1], -out[0]];
    nearAll(right, viewerRight);
    near(f.length, 1);
    near(f.y1, 1);
  }
  // south faces +z, its picture runs east (+x), so west to east for someone looking north at it
  const south = sides.find((f) => f.kind === "side" && Math.abs(f.z - 0.5) < 1e-9)!;
  nearAll(localZ((south as { yaw: number }).yaw), [0, 1]);
  nearAll(localX((south as { yaw: number }).yaw), [1, 0]);
  // the hidden sides are left out
  const hidden = fenceFaces({ form: "block", height: 1, thickness: 0, hide: ["N", "E"] });
  assert.equal(hidden.filter((f) => f.kind === "side").length, 2);
  assert.ok(hidden.every((f) => f.kind !== "side" || (f.x <= 0 && f.z >= 0)), "only the west and south faces are left");
  // the top: its own texture if it has one, else the piece's
  assert.equal(block.find((f) => f.kind === "cap")!.tex, "main");
  assert.equal(fenceFaces({ form: "block", height: 1, thickness: 0, top: "wall4" }).find((f) => f.kind === "cap")!.tex, "top");
  // a taller one
  assert.ok(fenceFaces({ form: "block", height: 2.5, thickness: 0 }).every((f) => (f.kind === "side" ? f.y1 === 2.5 : f.y === 2.5)));

  // an edge fence of thickness 0: the front and its mirrored back, in one place, looking opposite ways
  const flat = fenceFaces({ form: "edge", side: "N", height: 1, thickness: 0 });
  assert.equal(flat.length, 2);
  const [front, back] = flat as Extract<(typeof flat)[number], { kind: "side" }>[];
  nearAll([front.x, front.z], [0, -0.5]);
  nearAll([back.x, back.z], [0, -0.5]);
  assert.equal(front.mirror, false);
  assert.equal(back.mirror, true);
  nearAll(localZ(front.yaw), [0, 1]);
  nearAll(localZ(back.yaw), [0, -1]);
  // both show the same stretch of the picture at the same place
  near(front.u0, back.u0);
  near(front.u1, back.u1);
  // the back is mirrored (the panels' convention), so on the back local x flips and the mirror flips it back:
  // the picture lies the same way along the world on both faces
  nearAll(localX(front.yaw), [1, 0]);
  nearAll(localX(back.yaw), [-1, 0]);

  // with a thickness the faces move apart, either side of the edge, front toward its own facing
  const thick = fenceFaces({ form: "edge", side: "E", height: 1, thickness: 0.2 });
  const [tf, tb] = thick as Extract<(typeof thick)[number], { kind: "side" }>[];
  assert.equal(thick.length, 2, "no top texture: the gap is left open");
  nearAll([tf.x, tf.z].map((v) => v), [0.5 + localZ(tf.yaw)[0] * 0.1, localZ(tf.yaw)[1] * 0.1]);
  near(Math.abs(tf.x - tb.x), 0.2);
  near(tf.z, tb.z);
  // ... and the top texture covers the gap
  const capped = fenceFaces({ form: "edge", side: "E", height: 0.8, thickness: 0.2, top: "wall4" });
  const cap = capped.find((f) => f.kind === "cap")!;
  assert.ok(cap.kind === "cap" && cap.tex === "top");
  if (cap.kind === "cap") {
    nearAll([cap.x, cap.z, cap.y, cap.sx, cap.sz], [0.5, 0, 0.8, 0.2, 1]);
  }
  // a top texture with no thickness has nothing to cover
  assert.equal(fenceFaces({ form: "edge", side: "E", height: 1, thickness: 0, top: "wall4" }).some((f) => f.kind === "cap"), false);

  // a mid corner: four panels (two halves, front and back), every one standing on a half-axis
  const corner = fenceFaces({ form: "mid", height: 1, thickness: 0, arms: ["N", "E"], axis: "x" });
  assert.equal(corner.length, 4);
  // a lone mid fence: front and back through the middle
  const lone = fenceFaces({ form: "mid", height: 1, thickness: 0, arms: [], axis: "z" });
  assert.equal(lone.length, 2);
  nearAll(localX((lone[0] as { yaw: number }).yaw), [0, 1]);
  // a post: five more faces, all in its own texture, at the middle of the piece
  const withPost = fenceFaces({ form: "edge", side: "S", height: 1, thickness: 0, post: { texture: "wall5" } });
  assert.equal(withPost.length, 2 + 5);
  const posts = withPost.filter((f) => f.tex === "deco");
  assert.equal(posts.length, 5);
  assert.ok(posts.every((f) => Math.abs(f.x) <= 0.12 && Math.abs(f.z - 0.5) <= 0.12));
  assert.ok(posts.every((f) => (f.kind === "side" ? f.y1 : f.y) > 1), "the post stands above the fence");
  // the segment of an edge, all four sides
  assert.deepEqual(edgeSegment("N"), { cx: 0, cz: -0.5, length: 1, axis: "x", du: [1, 0], u0: 0, u1: 1 });
  assert.deepEqual(edgeSegment("E"), { cx: 0.5, cz: 0, length: 1, axis: "z", du: [0, 1], u0: 0, u1: 1 });
}

// ---- the model of a piece: its neighbours decide
{
  // blocks: a row of three hides the faces between them
  const idx = fenceIndex([piece("block", 1, 1), piece("block", 2, 1), piece("block", 3, 1), piece("block", 2, 2)]);
  const spec = (x: number, y: number) => fenceModelSpec(idx, idx.blocks.get(`${x},${y}`)!);
  assert.deepEqual(spec(1, 1).hide, ["E"]);
  assert.deepEqual(spec(2, 1).hide, ["E", "S", "W"]);
  assert.deepEqual(spec(3, 1).hide, ["W"]);
  assert.deepEqual(spec(2, 2).hide, ["N"]);
  assert.equal(fenceFaces(spec(2, 1)).filter((f) => f.kind === "side").length, 1, "the middle one of the row shows only its north face");
  // a block's key changes when a neighbour does (the renderer rebuilds it)
  const alone = fenceIndex([piece("block", 1, 1)]);
  assert.notEqual(JSON.stringify(fenceModelSpec(alone, alone.blocks.get("1,1")!)), JSON.stringify(spec(1, 1)));
  // a transparent and an opaque block hide the same faces: what is shared is shared
  const mixed = fenceIndex([piece("block", 1, 1, { fence: { opaque: false } }), piece("block", 2, 1)]);
  assert.deepEqual(fenceModelSpec(mixed, mixed.blocks.get("1,1")!).hide, ["E"]);
}

// ---- decoration: every Nth piece of a run
{
  // edges along the north side of x = 2..8 (7 pieces), every third carries it
  const style: FenceStyle = { deco: { every: 3, texture: "fantasywall1" } };
  const row = Array.from({ length: 7 }, (_, i) => edge(2 + i, 4, "N", style));
  const idx = fenceIndex(row);
  const decorated = idx.pieces.filter((p) => fenceDecorated(idx, p)).map((p) => p.x);
  assert.deepEqual(decorated, [4, 7], "the 3rd and the 6th of the run, counting from the west");
  // ... named from the other side of the line (S of the cells above) it is the same run
  const above = fenceIndex(Array.from({ length: 7 }, (_, i) => edge(2 + i, 3, "S", style)));
  assert.deepEqual(above.pieces.filter((p) => fenceDecorated(above, p)).map((p) => p.x), [4, 7]);
  // a gap starts a new run
  const gap = fenceIndex([...row.slice(0, 2), ...row.slice(3)]);
  assert.deepEqual(gap.pieces.filter((p) => fenceDecorated(gap, p)).map((p) => p.x), [7], "x=2,3 and x=5..8 are two runs: the 3rd of the second is x=7");
  // a texture swap changes the piece's own texture, a post adds faces
  const swapped = fenceModelSpec(idx, idx.pieces.find((p) => p.x === 4)!);
  assert.equal(swapped.texture, "fantasywall1");
  assert.equal(swapped.post, undefined);
  assert.equal(fenceModelSpec(idx, idx.pieces.find((p) => p.x === 3)!).texture, undefined);
  const posted = fenceIndex(Array.from({ length: 4 }, (_, i) => piece("mid", 1 + i, 1, { fence: { deco: { every: 2, post: true } } })));
  // a vertical edge run counts from the north
  const column = fenceIndex(Array.from({ length: 4 }, (_, i) => edge(5, 1 + i, "E", { deco: { every: 2, post: true } })));
  assert.deepEqual(column.pieces.filter((p) => fenceDecorated(column, p)).map((p) => p.y), [2, 4]);
  assert.deepEqual(fenceModelSpec(column, column.pieces.find((p) => p.y === 2)!).post, {});
  // mid pieces: a straight run along x, every 2nd from the west
  assert.deepEqual(posted.pieces.filter((p) => fenceDecorated(posted, p)).map((p) => p.x), [2, 4]);
  // a block carries none; a corner piece none
  const corner = fenceIndex([piece("mid", 1, 1, { fence: { deco: { every: 1, post: true } } }), piece("mid", 2, 1), piece("mid", 1, 2)]);
  assert.equal(fenceDecorated(corner, corner.mids.get("1,1")!), false);
  const decoBlock = fenceIndex([piece("block", 1, 1, { fence: { deco: { every: 1, post: true } } })]);
  assert.equal(fenceDecorated(decoBlock, decoBlock.blocks.get("1,1")!), false);
  // every = 1: all of them
  const all = fenceIndex([edge(0, 0, "N", { deco: { every: 1, post: true } }), edge(1, 0, "N", { deco: { every: 1, post: true } })]);
  assert.ok(all.pieces.every((p) => fenceDecorated(all, p)));
}

// ---- line of sight
{
  const idx = fenceIndex([
    piece("block", 5, 5, { fence: { opaque: true } }),
    edge(10, 5, "E", { opaque: true }),
    piece("block", 5, 8, { fence: { opaque: false } }),
    edge(12, 5, "E"),
  ]);
  // straight through the opaque block
  assert.equal(fenceBlocksSight(idx, 3, 5, 7, 5), true);
  // past it
  assert.equal(fenceBlocksSight(idx, 3, 6.6, 7, 6.6), false);
  // a transparent one (a block's default opacity can be switched off) and a fence that has no flag: see-through
  assert.equal(fenceBlocksSight(idx, 3, 8, 7, 8), false);
  assert.equal(fenceBlocksSight(idx, 11.5, 5, 13, 5), false);
  // a thin opaque edge fence is not stepped over by a coarse sampler: the line crosses it
  assert.equal(fenceBlocksSight(idx, 10, 5, 11, 5), true);
  assert.equal(fenceBlocksSight(idx, 10, 5, 10.4, 5), false, "stopping short of it");
  assert.equal(fenceBlocksSight(idx, 10.3, 4.6, 10.7, 5.4), true, "at a slant");
}
{
  // (the line along an edge's own axis, off to the side: clear; and at the edge's end: clear)
  const idx = fenceIndex([edge(10, 5, "E", { opaque: true })]);
  assert.equal(fenceBlocksSight(idx, 10.3, 4, 10.3, 6), false);
  // a line that starts inside a block (a viewer standing in it) looks out of it
  const b = fenceIndex([piece("block", 5, 5, { fence: { opaque: true } })]);
  assert.equal(fenceBlocksSight(b, 5, 5, 8, 5), false);
  assert.equal(fenceBlocksSight(b, 8, 5, 5, 5), false);
  // heights: a low fence is looked over, a tall block is not
  const low = fenceIndex([edge(10, 5, "E", { opaque: true, height: 0.5 })]);
  const floor = () => 0;
  assert.equal(fenceBlocksSight(low, 10, 5, 11, 5, () => 0.4, floor), true);
  assert.equal(fenceBlocksSight(low, 10, 5, 11, 5, () => 0.8, floor), false, "over the top of it");
  assert.equal(fenceBlocksSight(low, 10, 5, 11, 5, () => 0.8, (x, y) => (x === 10 && y === 5 ? 0.5 : 0)), true, "on a floor half a height higher the same fence is higher");
  // an opaque mid fence: its bars block, the half-cells either side of it do not
  const mid = fenceIndex([piece("mid", 3, 3, { fence: { opaque: true } })]);
  assert.equal(fenceBlocksSight(mid, 2, 3.3, 4, 3.3), false, "along it, a third of a cell off its line: clear");
  assert.equal(fenceBlocksSight(mid, 3.3, 2, 3.3, 4), true, "across it");
  assert.equal(fenceBlocksSight(mid, 2.5, 2.5, 3.5, 3.5), true, "diagonally");
  assert.equal(fenceBlocksSight(fenceIndex(undefined), 0, 0, 5, 5), false);
}

// ---- marks (the minimap, the editor's floor)
{
  const idx = fenceIndex([piece("block", 1, 1), edge(2, 2, "N"), edge(2, 2, "E"), piece("mid", 5, 5), piece("mid", 6, 5)]);
  const marks = fenceMarks(idx);
  assert.equal(marks.filter((m) => m.kind === "block").length, 1);
  assert.ok(marks.some((m) => m.kind === "line" && m.form === "edge" && m.x1 === 1.5 && m.x2 === 2.5 && m.y1 === 1.5 && m.y2 === 1.5), "N of (2,2): along z = 1.5");
  assert.ok(marks.some((m) => m.kind === "line" && m.form === "edge" && m.x1 === 2.5 && m.x2 === 2.5 && m.y1 === 1.5 && m.y2 === 2.5), "E of (2,2): along x = 2.5");
  // two mids side by side: each runs straight, end to end
  const mids = marks.filter((m) => m.kind === "line" && m.form === "mid");
  assert.equal(mids.length, 2);
  assert.ok(mids.some((m) => m.kind === "line" && m.x1 === 4.5 && m.x2 === 5.5 && m.y1 === 5 && m.y2 === 5));
  assert.ok(mids.some((m) => m.kind === "line" && m.x1 === 5.5 && m.x2 === 6.5));
}

// ---- problems
{
  assert.deepEqual(fenceProblems(undefined), []);
  assert.deepEqual(fenceProblems([piece("block", 1, 1), edge(1, 1, "N"), piece("mid", 2, 2)]), []);
  const bad = fenceProblems([edge(1, 1, "N"), edge(1, 0, "S"), piece("block", 4, 4), piece("mid", 4, 4), piece("edge", 3, 3)]);
  assert.deepEqual(bad.map((p) => p.kind).sort(), ["doubleCell", "doubleEdge", "noSide"]);
}

console.log("fences.test.ts: ok");
