// Run: npx tsx src/game/fenceMovement.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";

// (the game's modules read Vite's import.meta.env / import.meta.glob, which plain node lacks: stand-ins are put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");
const { passage } = await import("./heights");
const { lineOfSight } = await import("./visibility");
const { stepFreePose } = await import("./freeMovement");
const { propBlocks, propBoxes, PROP_TYPES, propRetexturable } = await import("./props");
const { assetInWorld } = await import("./worlds");

type Props = NonNullable<MapFile["props"]>;
// 11 x 9, walls round the edge, all open inside
const file = (props: Props): MapFile => ({
  name: "t",
  deck: 1,
  start: { x: 1, y: 1, facing: "E" },
  layout: Array.from({ length: 9 }, (_, y) => Array.from({ length: 11 }, (_, x) => (x === 0 || y === 0 || x === 10 || y === 8 ? "W" : ".")).join("")),
  props,
} as unknown as MapFile);

// ---- the three pieces are props like the roof's
assert.equal(PROP_TYPES.fence_block.kind, "fence");
assert.equal(PROP_TYPES.fence_edge.kind, "fence");
assert.equal(PROP_TYPES.fence_mid.kind, "fence");
assert.ok(propRetexturable(PROP_TYPES.fence_edge), "their texture is the prop's own texture field");
assert.ok(assetInWorld("fence_block", "fantasy"), "fantasy first, like the roof pieces");

// ---- the map file: additive and backward compatible
{
  const old = parseMap("old", file([{ prop: "crate1", x: 2, y: 2 }]));
  assert.equal(old.props![0].fence, undefined, "a map without fences parses as ever");
  const props: Props = [
    { prop: "fence_edge", x: 3, y: 3, at: "E", texture: "fantasywall1", fence: { thickness: 0.2, top: "wall4", height: 0.6, deco: { every: 3, post: true, texture: "wall5" }, opaque: true } },
    { prop: "fence_block", x: 5, y: 3 },
    { prop: "fence_mid", x: 3, y: 5, rotation: 90, fence: { opaque: false } },
  ];
  const map = parseMap("fences", file(props));
  assert.deepEqual(map.props![0].fence, props[0].fence, "everything the file holds is kept");
  assert.equal(map.props![0].at, "E");
  assert.equal(map.props![0].texture, "fantasywall1");
  assert.equal(map.props![1].fence, undefined);
  assert.equal(map.props![2].rotation, 90);
  // and writes out the same way: the parsed spec's settings are what the file had (a round trip)
  const again = parseMap("again", file(map.props!.map((p) => ({ prop: p.prop, x: p.cell.x, y: p.cell.y, at: p.at, rotation: p.rotation, texture: p.texture, fence: p.fence })) as Props));
  assert.deepEqual(again.props!.map((p) => p.fence), map.props!.map((p) => p.fence));
  // soft values are pulled in, not refused
  const soft = parseMap("soft", file([{ prop: "fence_mid", x: 3, y: 5, fence: { height: 99, thickness: -3, top: "bad id!" } as never }]));
  assert.deepEqual(soft.props![0].fence, { height: 3 });
  // hard errors
  assert.throws(() => parseMap("bad", file([{ prop: "crate1", x: 2, y: 2, fence: { height: 2 } }])), /no fence piece/);
  assert.throws(() => parseMap("bad", file([{ prop: "fence_edge", x: 2, y: 2 }])), /needs the side/);
  assert.throws(() => parseMap("bad", file([{ prop: "fence_edge", x: 2, y: 2, at: "center" }])), /needs the side/);
  assert.throws(() => parseMap("bad", file([{ prop: "fence_mid", x: 2, y: 2, fence: 5 as never }])), /must be an object/);
  assert.throws(() => parseMap("bad", file([{ prop: "fence_block", x: 0, y: 0 }])), /isn't in a floor cell/, "a fence stands in a floor cell");
}

// ---- grid movement and the AI's pathing (both go through `passage`)
{
  const map = parseMap("grid", file([
    { prop: "fence_edge", x: 3, y: 3, at: "E" },
    { prop: "fence_block", x: 6, y: 3 },
    { prop: "fence_mid", x: 3, y: 6 },
    { prop: "fence_edge", x: 7, y: 5, at: "N", fence: { height: 0.3 } },
  ]));
  const from = (x: number, y: number) => ({ x, y });
  const step = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dir = b.x > a.x ? "E" : b.x < a.x ? "W" : b.y > a.y ? "S" : "N";
    return passage(map, a, 0, b, dir);
  };
  // the edge: shut both ways, open all around it
  assert.deepEqual(step(from(3, 3), from(4, 3)), { kind: "blocked", reason: "prop" });
  assert.deepEqual(step(from(4, 3), from(3, 3)), { kind: "blocked", reason: "prop" });
  assert.equal(step(from(3, 3), from(3, 4)).kind, "walk", "both cells can be walked right up to it, and along it");
  assert.equal(step(from(3, 3), from(2, 3)).kind, "walk");
  assert.equal(step(from(4, 3), from(4, 4)).kind, "walk");
  assert.equal(step(from(3, 2), from(3, 3)).kind, "walk", "into the cell the fence stands on the edge of");
  // the same edge, named from the other cell
  const south = parseMap("south", file([{ prop: "fence_edge", x: 4, y: 3, at: "W" }]));
  assert.equal(passage(south, from(3, 3), 0, from(4, 3), "E").kind, "blocked");
  assert.equal(passage(south, from(4, 3), 0, from(3, 3), "W").kind, "blocked");
  // a block and a mid fence close their cells
  assert.deepEqual(step(from(5, 3), from(6, 3)), { kind: "blocked", reason: "prop" });
  assert.deepEqual(step(from(3, 5), from(3, 6)), { kind: "blocked", reason: "prop" });
  assert.equal(propBlocks(map, from(6, 3)), true);
  assert.equal(propBlocks(map, from(3, 6)), true);
  assert.equal(propBlocks(map, from(3, 3)), false, "an edge fence closes no cell");
  // a low fence still stops the grid (a step of 0.25 would be a ledge, not a fence)
  assert.equal(step(from(7, 5), from(7, 4)).kind, "blocked");
}

// ---- free movement: the bodies
{
  const map = parseMap("free", file([
    { prop: "fence_edge", x: 3, y: 3, at: "E" },
    { prop: "fence_mid", x: 3, y: 6 },
    { prop: "fence_block", x: 7, y: 3 },
    { prop: "fence_mid", x: 5, y: 5, rotation: 90 },
    { prop: "fence_edge", x: 8, y: 6, at: "S", fence: { thickness: 0.4 } },
  ]));
  const doors = { isOpen: () => false };
  const EAST = Math.PI / 2;
  const SOUTH = Math.PI;
  // walks from (x, z) heading `yaw` for a few seconds, returns where it ends
  const walk = (x: number, z: number, yaw: number, seconds = 3) => {
    let pose = { x, z, y: 0, fallSpeed: 0, yaw };
    for (let i = 0; i < seconds * 60; i++) pose = stepFreePose(pose, { moveX: 0, moveY: 1, turn: 0 }, 1 / 60, map, doors).pose;
    return pose;
  };
  // an edge fence: stops the body at the fence from either side, 0.2 radius from its 0.05 half-thickness
  const west = walk(3, 3, EAST);
  assert.ok(west.x > 3.2 && west.x < 3.26, `stopped at the edge fence from the west (${west.x})`);
  const east = walk(4.2, 3, -EAST);
  assert.ok(east.x < 3.8 && east.x > 3.74, `... and from the east (${east.x})`);
  // along it, a body passes (the cells beside the fence are open)
  const along = walk(3.2, 1.2, SOUTH);
  assert.ok(along.z > 4.9, `along the fence: ${along.z}`);
  // a mid fence along x through (3,6): both halves of the cell are walkable up to the bar
  const north = walk(3, 4.6, SOUTH);
  assert.ok(north.z > 5.7 && north.z < 5.76, `stopped at the mid fence from the north, inside its cell (${north.z})`);
  const below = walk(3, 7.2, 0);
  assert.ok(below.z < 6.3 && below.z > 6.24, `... and from the south (${below.z})`);
  // along the bar's length a body walks right through the cell, off the bar's line
  const through = walk(2.2, 6.3, EAST);
  assert.ok(through.x > 4.5, `along the mid fence, beside it: ${through.x}`);
  // a block: the whole cell
  const blocked = walk(5.2, 3, EAST);
  assert.ok(blocked.x > 6.2 && blocked.x < 6.3, `the block (${blocked.x})`);
  // a mid fence turned 90 degrees runs north-south
  const turned = walk(4.2, 5, EAST);
  assert.ok(turned.x > 4.7 && turned.x < 4.76, `the mid fence turned north-south (${turned.x})`);
  // a thick fence's body is its thickness: 0.4 -> 0.2 half
  const thick = walk(8, 5, SOUTH);
  assert.ok(thick.z > 6.05 && thick.z < 6.11, `thick edge fence: stops 0.2 + 0.2 before its line (${thick.z})`);
  // the boxes of a cell include the edge fences of its sides, and stay under their own height
  assert.equal(propBoxes(map, 3, 3).length, 1);
  assert.equal(propBoxes(map, 4, 3).length, 1);
  assert.equal(propBoxes(map, 5, 3).length, 0);
  // feet above a low fence's top go over it
  const low = parseMap("low", file([{ prop: "fence_edge", x: 3, y: 3, at: "E", fence: { height: 0.5 } }]));
  assert.ok(propBoxes(low, 3, 3)[0].height === 0.5);
}

// ---- line of sight: an opaque fence blocks it, a see-through one doesn't, both stop bodies
{
  const map = parseMap("sight", file([
    { prop: "fence_block", x: 4, y: 3 },
    { prop: "fence_block", x: 4, y: 5, fence: { opaque: false } },
    { prop: "fence_edge", x: 7, y: 3, at: "E", fence: { opaque: true } },
    { prop: "fence_edge", x: 7, y: 5, at: "E" },
    { prop: "fence_mid", x: 2, y: 7, fence: { opaque: true } },
    { prop: "fence_block", x: 8, y: 1, fence: { height: 0.5 } },
  ]));
  const open = () => false;
  const see = (a: [number, number], b: [number, number], heights?: { from: number; to: number }) => lineOfSight(map, { x: a[0], y: a[1] }, { x: b[0], y: b[1] }, open, heights);
  assert.equal(see([2, 3], [6, 3]), false, "an opaque block");
  assert.equal(see([2, 5], [6, 5]), true, "a transparent block (a hedge): seen through");
  assert.equal(see([6, 3], [9, 3]), false, "an opaque edge fence");
  assert.equal(see([6, 5], [9, 5]), true, "a see-through one");
  assert.equal(see([6, 2], [9, 2]), true, "clear ground");
  assert.equal(see([2, 6], [2, 8]), false, "an opaque mid fence across the line");
  assert.equal(see([1, 7], [3, 7]), false, "a line through the cell's centre runs inside the bar (it is the bar's own line)");
  assert.equal(see([1, 6.5], [3, 6.5]), true, "half a cell beside the bar it runs clear");
  // (heights: the party's eyes against a 1-high block)
  assert.equal(see([2, 3], [6, 3], { from: 0.5, to: 0.5 }), false);
  assert.equal(see([6, 1], [9, 1], { from: 0.4, to: 0.4 }), false, "a half-high block, seen at knee height");
  assert.equal(see([6, 1], [9, 1], { from: 0.8, to: 0.8 }), true, "looked over");
  // ... and the bodies of the see-through ones still stop movement
  assert.equal(passage(map, { x: 3, y: 5 }, 0, { x: 4, y: 5 }, "E").kind, "blocked");
  assert.equal(passage(map, { x: 7, y: 5 }, 0, { x: 8, y: 5 }, "E").kind, "blocked");
}

console.log("fenceMovement.test.ts: ok");
