// Run: npx tsx src/editor/areaClipboard.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";
import type { AreaClip } from "./areaClipboard";

// (the editor's modules read the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("../game/mapFormat");
const { collectArea, clipThings, clipSkipped, dropUnstable, flipClip, loadClip, orientClip, parseClip, pasteArea, pasteRect, rotateClip, saveClip, CLIP_STORAGE_KEY } = await import("./areaClipboard");
const { setLayerCell } = await import("./mapEdits");
const { paintRoof } = await import("./roofEdits");
const { paintFence } = await import("./fenceEdits");

// ---- a map with a house in it

const SIZES: Record<string, [number, number]> = { stain: [32, 16], crack: [20, 20] };
const decalSize = (name: string) => SIZES[name];

// a W x H map, walls round the edge, open floor inside
function blank(W = 24, H = 16): MapFile {
  const layout = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (x === 0 || y === 0 || x === W - 1 || y === H - 1 ? "W" : ".")).join(""));
  return { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout } as unknown as MapFile;
}
const setCell = (file: MapFile, x: number, y: number, char: string) => {
  file.layout[y] = file.layout[y].slice(0, x) + char + file.layout[y].slice(x + 1);
};

// The 5 x 4 house at x 4..8, y 3..6: walls round, three by two inside (x 5..7, y 4..5), a door in the south wall.
// (what the tests pick out is in the clip: a floor raised by half a wall, a ceiling, textures, a ladder, a bridge,
// a window, a wall decal and a floor decal, props - one hung on a wall, a chamfer, a crate - an item, lights,
// a smoke, an actor with its route, a fence run, a roof, a restricted cell, a chance wall, a riser's texture)
const HOUSE: Parameters<typeof collectArea>[1] = { x0: 4, y0: 3, x1: 8, y1: 6 };
function houseMap(): MapFile {
  const file = blank();
  for (let x = 4; x <= 8; x++) {
    setCell(file, x, 3, "W");
    setCell(file, x, 6, "W");
  }
  for (const y of [4, 5]) {
    setCell(file, 4, y, "W");
    setCell(file, 8, y, "W");
  }
  setCell(file, 6, 6, "D");
  file.doors = [{ x: 6, y: 6, kind: "standard", facing: "S", offset: 0.25, label: "A1", id: "front" }];
  setLayerCell(file, "floor", { x: 5, y: 5 }, 0.5);
  setLayerCell(file, "ceiling", { x: 6, y: 4 }, 2);
  for (const [x, y] of [[5, 4], [6, 4], [7, 4], [5, 5], [6, 5], [7, 5]]) setLayerCell(file, "floorTexture", { x, y }, "wood");
  setLayerCell(file, "wallTexture", { x: 5, y: 4 }, "brick");
  setLayerCell(file, "ceilingTexture", { x: 7, y: 5 }, "plaster");
  file.faceTextures = [{ x: 6, y: 5, face: "W", texture: "brick" }];
  file.ladders = [{ x: 6, y: 5, wall: "W" }];
  file.bridges = [{ x: 7, y: 4, height: 0.5, axis: "EW" }];
  file.windows = [{ x: 5, y: 4, wall: "N", width: 2 }];
  file.chanceWalls = [{ x: 8, y: 4, chance: 0.5 }];
  file.restricted = [[6, 5]];
  file.decals = [
    { decal: "stain", x: 5, y: 4, surface: "W", px: 100, py: 40, rotation: 15, id: "stain1" },
    { decal: "stain", x: 6, y: 5, surface: "floor", px: 60, py: 90, rotation: 30 },
    { decal: "crack", x: 7, y: 5, surface: "ceiling", px: 10, py: 200 },
  ];
  file.props = [
    { prop: "crate1", x: 5, y: 4, at: "center", offset: [0.2, -0.1], rotation: 30, id: "crate" },
    { prop: "torch1", x: 6, y: 4, at: "N" },
    { prop: "chamfer1", x: 5, y: 5, at: "SW", rotation: 15 },
    { prop: "barrel1", x: 7, y: 5, at: "NE", with: "crate" },
  ];
  file.items = [{ item: "medkit", x: 6, y: 5, offset: [0.2, -0.3], elevation: 0.25 }];
  file.lights = [{ x: 6, y: 4 }, { x: 7, y: 5, pos: [0.2, 0.5, -0.1], color: "#ff0000" }];
  file.smokes = [{ x: 7, y: 4, pos: [0.1, 0.2, 0.3], blow: { speed: 1, yaw: 45 } }];
  file.actors = [{ actor: "robot1", x: 5, y: 4, facing: "E", patrol: [[5, 4], [7, 4]] }];
  file.wallInteractions = [{ x: 6, y: 4, side: "N", interaction: { kind: "message", text: "hi", modal: false, position: "center" } }];
  // a fence run along the inside (a block, a mid fence, an edge piece) and a roof over all six cells
  paintFence(file, "block", [{ x: 7, y: 4 }], { texture: "wall4" });
  paintFence(file, "mid", [{ x: 6, y: 5 }], { rotation: 90 });
  paintFence(file, "edge", [{ x: 7, y: 5 }], {}, "E");
  paintRoof(file, [5, 6, 7].flatMap((x) => [4, 5].map((y) => ({ x, y }))), "slope-1");
  parseMap("t", file);
  return file;
}

// a clip without the things a roof's re-evaluation or an id's renaming changes, for comparing
const plain = (clip: AreaClip) => {
  const copy = structuredClone(clip) as AreaClip & Record<string, unknown>;
  delete copy.source;
  // (a roof piece of the autotile is worked out again where it lands: its cell and group are what has to agree)
  for (const p of copy.props ?? []) {
    if (!p.auto) continue;
    p.auto = "G";
    if (!p.detached) {
      p.prop = "roof";
      delete p.rotation;
      delete p.elevation;
    }
  }
  return copy;
};
const clipOf = (file: MapFile, rect = HOUSE) => collectArea(file, rect, { source: "t", decalSize })!;

// ---- copying

{
  const file = houseMap();
  const clip = clipOf(file);
  assert.equal(clip.w, 5);
  assert.equal(clip.h, 4);
  assert.deepEqual(clip.layout, ["WWWWW", "W...W", "W...W", "WWDWW"]);
  assert.deepEqual(clip.doors, [{ x: 2, y: 3, kind: "standard", facing: "S", offset: 0.25, label: "A1", id: "front" }], "its cell is relative to the clip");
  assert.equal(clip.props!.filter((p) => p.auto).length, 6, "the roof pieces");
  assert.ok(clip.props!.some((p) => p.prop === "fence_edge" && p.at === "E" && p.x === 3 && p.y === 2));
  assert.deepEqual(clip.layers.floor, Array.from({ length: 20 }, (_, i) => (i === 11 ? 0.5 : null)), "row-major: (1, 2) is the 12th");
  assert.equal(clip.layers.ceiling![1 * 5 + 2], 2);
  assert.equal(clip.layers.floorTexture![1 * 5 + 1], "wood");
  assert.deepEqual(clip.restricted, [[2, 2]]);
  assert.deepEqual(clip.decalSizes, { stain: [32, 16], crack: [20, 20] });
  assert.deepEqual(clip.actors![0].patrol, [[1, 1], [3, 1]]);
  assert.ok(clipThings(clip) > 25, "counted: " + clipThings(clip));
  assert.equal(clipSkipped(clip), 0);
  // nothing outside the rectangle comes along, and the file is not touched
  assert.deepEqual(clipOf(file, { x0: 12, y0: 8, x1: 14, y1: 9 }).props, undefined);
  assert.equal(JSON.stringify(file), JSON.stringify(houseMap()));
  // a rectangle half outside the map is cut to it; entirely outside: nothing
  const cut = collectArea(file, { x0: 20, y0: 10, x1: 30, y1: 30 })!;
  assert.deepEqual([cut.w, cut.h], [4, 6]);
  assert.equal(collectArea(file, { x0: 30, y0: 3, x1: 40, y1: 5 }), null);
}

// what is not copied, and how it is told
{
  const file = houseMap();
  file.start = { x: 6, y: 4, facing: "N" };
  file.exits = [{ x: 5, y: 5, name: "Gate", to: { map: "other" } }];
  file.stairs = [{ x: 7, y: 5, direction: "up" }];
  file.lifts = [{ x: 7, y: 4, button: "N", to: "deck2" }];
  file.triggers = [{ on: "enter", x: 6, y: 4, do: ["set:x"] }, { on: "enter", x: 15, y: 4, do: ["set:y"] }, { on: "start", do: [] }];
  file.decals!.push({ decal: "stain", x: 6, y: 4, surface: "N", px: 0, py: 0, action: "lift" });
  setCell(file, 8, 5, "D");
  file.doors!.push({ x: 8, y: 5, kind: "lift", facing: "W" });
  const clip = collectArea(file, HOUSE, { decalSize })!;
  assert.deepEqual(clip.skipped, { start: 1, exits: 1, stairs: 1, lifts: 3, triggers: 1 }, "the lift: cabin, door and button; a trigger of a cell outside is not counted");
  assert.equal(clipSkipped(clip), 7);
  // a ladder whose ledge is outside the rectangle is left out (counted)
  const ledge = collectArea(houseMap(), { x0: 6, y0: 3, x1: 8, y1: 6 })!;
  assert.equal(ledge.ladders, undefined);
  assert.equal(ledge.skipped.ladders, 1);
  assert.equal((clip as Record<string, unknown>).exits, undefined);
  assert.equal(clip.layout[2][4], ".", "a lift's door is a floor in the clip");
  assert.equal(clip.doors!.length, 1);
  assert.ok(!clip.decals!.some((d) => d.action === "lift"));
  // a window with a panel outside the rectangle is left out (counted), as is a route that leaves it (the actor stays)
  const half = collectArea(houseMap(), { x0: 4, y0: 3, x1: 5, y1: 6 })!;
  assert.equal(half.windows, undefined);
  assert.equal(half.skipped.windows, 1);
  const narrow = collectArea(houseMap(), { x0: 4, y0: 3, x1: 6, y1: 6 })!;
  assert.equal(narrow.actors![0].patrol, undefined);
  assert.equal(narrow.actors!.length, 1);
}

// ---- turning and mirroring: the maths, kind by kind

// a 3 x 2 clip with one thing in it, to look at how it turns
const one = (list: string, entry: Record<string, unknown>, extra: Partial<AreaClip> = {}): AreaClip =>
  ({ version: 1, w: 3, h: 2, layout: ["W.D", "..."], layers: {}, skipped: {}, [list]: [{ x: 0, y: 0, ...entry }], ...extra }) as unknown as AreaClip;
const turned = (clip: AreaClip) => rotateClip(clip);

{
  // layout "W.D" over "..." turned a quarter clockwise: each column, read from the bottom up, is a row (3 x 2 -> 2 x 3)
  const r = rotateClip(one("doors", { kind: "standard", facing: "N" }));
  assert.deepEqual([r.w, r.h], [2, 3]);
  assert.deepEqual(r.layout, [".W", "..", ".D"]);
  assert.deepEqual(r.doors, [{ x: 1, y: 0, kind: "standard", facing: "E" }], "the top-left cell is the top-right, the north side is the east");
  const f = flipClip(one("doors", { kind: "standard", facing: "E", offset: 0.25 }));
  assert.deepEqual(f.layout, ["D.W", "..."]);
  assert.deepEqual(f.doors, [{ x: 2, y: 0, kind: "standard", facing: "W", offset: 0.25 }]);
}

// the sides, anchors and steps follow a turn clockwise: N E S W
{
  const faces = (list: string, key: string, values: string[]) => values.map((v) => (turned(one(list, { [key]: v, ...(list === "ladders" ? {} : {}) })) as unknown as Record<string, Record<string, unknown>[]>)[list][0][key]);
  assert.deepEqual(faces("ladders", "wall", ["N", "E", "S", "W"]), ["E", "S", "W", "N"]);
  assert.deepEqual(faces("faceTextures", "face", ["N", "E", "S", "W"]), ["E", "S", "W", "N"]);
  assert.deepEqual(faces("wallInteractions", "side", ["N", "E", "S", "W"]), ["E", "S", "W", "N"]);
  const flipped = (list: string, key: string, values: string[]) => values.map((v) => (flipClip(one(list, { [key]: v })) as unknown as Record<string, Record<string, unknown>[]>)[list][0][key]);
  assert.deepEqual(flipped("ladders", "wall", ["N", "E", "S", "W"]), ["N", "W", "S", "E"]);
}

// actors: facing, route; items: offset; lights and smokes: position and the wind
{
  const a = turned(one("actors", { actor: "r", facing: "N", patrol: [[0, 0], [2, 1]] }));
  assert.deepEqual(a.actors, [{ x: 1, y: 0, actor: "r", facing: "E", patrol: [[1, 0], [0, 2]] }]);
  const noFacing = turned(one("actors", { actor: "r" }));
  assert.equal(noFacing.actors![0].facing, "W", "no facing means south: the west after a turn");
  assert.equal(rotateClip(rotateClip(rotateClip(noFacing))).actors![0].facing, "S", "(and south it is, said out, after four)");
  assert.equal(orientClip(one("actors", { actor: "r" }), 4, false).actors![0].facing, undefined, "(four turns asked for is no turn at all)");
  assert.deepEqual(turned(one("items", { item: "medkit", offset: [0.3, -0.1] })).items![0].offset, [0.1, 0.3], "(across, along) -> (-along, across)");
  assert.deepEqual(flipClip(one("items", { item: "medkit", offset: [0.3, -0.1] })).items![0].offset, [-0.3, -0.1]);
  assert.deepEqual(turned(one("lights", { pos: [0.2, 0.5, -0.1] })).lights![0].pos, [0.1, 0.5, 0.2]);
  const smoke = turned(one("smokes", { pos: [0.1, 0.2, 0.3], blow: { speed: 1, yaw: 270 } })).smokes![0];
  assert.deepEqual(smoke.pos, [-0.3, 0.2, 0.1]);
  assert.equal(smoke.blow!.yaw, 0, "the wind heading 270 (west) turns to 0 (north)");
  assert.equal(flipClip(one("smokes", { pos: [0.1, 0.2, 0.3], blow: { speed: 1, yaw: 45 } })).smokes![0].blow!.yaw, 315);
  assert.deepEqual(turned(one("bridges", { height: 0.5, axis: "EW" })).bridges![0].axis, "NS");
  assert.deepEqual(flipClip(one("bridges", { height: 0.5, axis: "EW" })).bridges![0].axis, "EW");
}

// props: a free-standing one turns by itself, one hung on a wall keeps its own rotation (its anchor turns)
{
  const prop = (p: Record<string, unknown>, fn = turned) => fn(one("props", p)).props![0];
  assert.deepEqual(prop({ prop: "crate1", at: "center", rotation: 30, offset: [0.2, -0.1] }), { prop: "crate1", x: 1, y: 0, at: "center", rotation: 120, offset: [0.1, 0.2] });
  assert.deepEqual(prop({ prop: "crate1", at: "NE" }), { prop: "crate1", x: 1, y: 0, at: "SE", rotation: 90 });
  assert.deepEqual(prop({ prop: "torch1", at: "N", rotation: 15 }), { prop: "torch1", x: 1, y: 0, at: "E", rotation: 15 }, "a wall prop faces away from its wall");
  assert.deepEqual(prop({ prop: "torch1", at: "W" }), { prop: "torch1", x: 1, y: 0, at: "N" });
  // a chamfer cuts the corner its anchor names: that corner turns; a middle one is given its corner (NE) first
  assert.deepEqual(prop({ prop: "chamfer1", at: "SW", rotation: 15 }), { prop: "chamfer1", x: 1, y: 0, at: "NW", rotation: 15 });
  assert.equal(prop({ prop: "chamfer1", at: "center" }).at, "SE");
  assert.equal(prop({ prop: "chamfer1", at: "E" }).at, "S");
  // mirrored: the rotation is negated, a chamfer's side is spelled out
  assert.deepEqual(prop({ prop: "crate1", at: "NE", rotation: 30 }, flipClip), { prop: "crate1", x: 2, y: 0, at: "NW", rotation: 330 });
  assert.deepEqual(prop({ prop: "torch1", at: "E", rotation: 15 }, flipClip), { prop: "torch1", x: 2, y: 0, at: "W", rotation: 345 });
  assert.deepEqual(prop({ prop: "chamfer1", at: "N" }, flipClip), { prop: "chamfer1", x: 2, y: 0, at: "NW" });
  // a roof piece detached by hand is a prop that turns; a roof piece of the autotile is worked out again after the paste
  assert.equal(prop({ prop: "roof_slope", at: "center", rotation: 90, auto: "slope-1", detached: true }).rotation, 180);
}

// fences: an edge piece keeps standing on the same edge, a mid fence turns, a block just moves
{
  const prop = (p: Record<string, unknown>, fn = turned) => fn(one("props", p)).props![0];
  assert.deepEqual(prop({ prop: "fence_edge", at: "N" }), { prop: "fence_edge", x: 1, y: 0, at: "E" });
  assert.deepEqual(prop({ prop: "fence_edge", at: "N" }, flipClip), { prop: "fence_edge", x: 2, y: 0, at: "N" });
  assert.deepEqual(prop({ prop: "fence_edge", at: "E" }, flipClip), { prop: "fence_edge", x: 2, y: 0, at: "W" });
  assert.deepEqual(prop({ prop: "fence_mid", at: "center" }), { prop: "fence_mid", x: 1, y: 0, at: "center", rotation: 90 });
  assert.deepEqual(prop({ prop: "fence_mid", at: "center", rotation: 90 }), { prop: "fence_mid", x: 1, y: 0, at: "center", rotation: 180 });
  assert.deepEqual(prop({ prop: "fence_block", at: "center" }), { prop: "fence_block", x: 1, y: 0, at: "center" });
}

// windows: the panels stay the same cells, in the same order for the turn, the other end first for a mirror
{
  const win = { wall: "N", width: 2 };
  const clip = { ...one("windows", win, { w: 4, h: 3, layout: ["WWWW", "W..W", "WWWW"] }) };
  // north wall, panels (0,0) and (1,0) (to the east): after a turn they are (2,0) and (2,1), facing east
  const r = turned(clip);
  assert.deepEqual([r.w, r.h], [3, 4]);
  assert.deepEqual(r.windows, [{ x: 2, y: 0, wall: "E", width: 2 }]);
  assert.deepEqual(flipClip(clip).windows, [{ x: 2, y: 0, wall: "N", width: 2 }], "the panel that was last (1,0) is first: (4-1-1, 0) = (2, 0)");
}

// decals: a wall decal keeps its place on its wall (the wall is the one that turns), a floor decal turns about
// its cell's middle with its picture, a ceiling one the other way (it is seen from below)
{
  const clip = (surface: string, extra: Record<string, unknown> = {}) => one("decals", { decal: "stain", surface, px: 100, py: 40, rotation: 15, ...extra }, { decalSizes: { stain: [32, 16] } });
  const wall = turned(clip("N")).decals![0];
  assert.deepEqual(wall, { decal: "stain", x: 1, y: 0, surface: "E", px: 100, py: 40, rotation: 15 });
  // floor: the centre (116, 48) goes to (256 - 48, 116) = (208, 116); the picture's corner is half its size back
  const floor = turned(clip("floor")).decals![0];
  assert.deepEqual([floor.px, floor.py, floor.rotation], [208 - 16, 116 - 8, 105]);
  const ceiling = turned(clip("ceiling")).decals![0];
  assert.deepEqual([ceiling.px, ceiling.py, ceiling.rotation], [48 - 16, 256 - 116 - 8, 285]);
  const mirrored = flipClip(clip("floor")).decals![0];
  assert.deepEqual([mirrored.px, mirrored.py, mirrored.rotation], [256 - 116 - 16, 40, 345]);
  const mirroredWall = flipClip(clip("E")).decals![0];
  assert.deepEqual([mirroredWall.surface, mirroredWall.px, mirroredWall.rotation], ["W", 256 - 100 - 32, 345]);
  // a decal that was not turned has no rotation to write
  assert.equal(turned(clip("N", { rotation: undefined })).decals![0].rotation, undefined);
}

// layers and the layout move with the cells
{
  const clip: AreaClip = { version: 1, w: 3, h: 2, layout: ["WDW", "..."], layers: { floor: [1, 2, 3, 4, 5, 6], floorTexture: ["a", null, null, null, null, "b"] }, skipped: {}, restricted: [[2, 1]] };
  const r = rotateClip(clip);
  assert.deepEqual(r.layout, [".W", ".D", ".W"]);
  assert.deepEqual(r.layers.floor, [4, 1, 5, 2, 6, 3]);
  assert.deepEqual(r.layers.floorTexture, [null, "a", null, null, "b", null]);
  assert.deepEqual(r.restricted, [[0, 2]]);
  const f = flipClip(clip);
  assert.deepEqual(f.layout, ["WDW", "..."]);
  assert.deepEqual(f.layers.floor, [3, 2, 1, 6, 5, 4]);
}

// four turns, or two mirrors, are the identity - on the whole house; the eight ways of standing are all different
{
  const clip = clipOf(houseMap());
  let c = clip;
  for (let i = 0; i < 4; i++) c = rotateClip(c);
  assert.deepEqual(c, clip, "four quarter turns");
  assert.deepEqual(flipClip(flipClip(clip)), clip, "two mirrors");
  assert.deepEqual(orientClip(clip, 4, false), clip);
  assert.deepEqual(orientClip(clip, 0, true), flipClip(clip));
  assert.deepEqual(orientClip(clip, 1, false), rotateClip(clip));
  assert.deepEqual(orientClip(clip, 5, false), rotateClip(clip), "turns count modulo four");
  assert.deepEqual(orientClip(clip, -1, false), rotateClip(rotateClip(rotateClip(clip))));
  const all = new Set<string>();
  for (const flip of [false, true]) for (let turns = 0; turns < 4; turns++) all.add(JSON.stringify(orientClip(clip, turns, flip).layout));
  assert.equal(all.size >= 4, true);
  // turning does not change the count of things, nor touch the clip it was made from
  assert.equal(clipThings(rotateClip(clip)), clipThings(clip));
  assert.equal(JSON.stringify(clip), JSON.stringify(clipOf(houseMap())));
  // a mirror then a turn is a turn then a mirror turned back: (flip, turn) = (turn back, flip)
  assert.deepEqual(rotateClip(flipClip(clip)), flipClip(rotateClip(rotateClip(rotateClip(clip)))));
}

// ---- pasting

// pasted again, a clip reads back as it was (with roofs and ids made new), turned or not, mirrored or not
{
  const source = houseMap();
  const clip = clipOf(source);
  for (const flip of [false, true]) {
    for (let turns = 0; turns < 4; turns++) {
      const oriented = orientClip(clip, turns, flip);
      const target = blank();
      const at = { x: 12, y: 7 };
      const report = pasteArea(target, oriented, at);
      assert.equal(report.clipped, 0);
      assert.equal(report.kept, 0);
      assert.equal(report.cells, oriented.w * oriented.h);
      assert.equal(report.dropped, 0, `nothing drops (turns ${turns}, flip ${flip})`);
      // (it is a map the game takes)
      parseMap("t", target);
      const back = collectArea(target, pasteRect(oriented, at), { decalSize })!;
      assert.deepEqual(plain(back), plain(oriented), `turns ${turns}, flip ${flip}`);
    }
  }
  // the source file is as it was, and the target has the house only where it was put
  assert.equal(JSON.stringify(source), JSON.stringify(houseMap()));
}

// the pasted house in an unturned place reads as the house itself
{
  const clip = clipOf(houseMap());
  const target = blank();
  const report = pasteArea(target, clip, { x: 12, y: 7 });
  assert.equal(report.things, clipThings(clip));
  assert.equal(target.layout[7], "W" + ".".repeat(11) + "WWWWW" + ".".repeat(6) + "W");
  assert.equal(target.layout[10][14], "D");
  assert.deepEqual(target.doors, [{ x: 14, y: 10, kind: "standard", facing: "S", offset: 0.25, label: "A1", id: "front" }]);
  assert.deepEqual(target.restricted, [[14, 9]]);
  assert.deepEqual(target.actors![0].patrol, [[13, 8], [15, 8]]);
  assert.deepEqual(target.windows, [{ x: 13, y: 8, wall: "N", width: 2 }]);
  assert.deepEqual(collectArea(target, { x0: 13, y0: 9, x1: 13, y1: 9 })!.layers.floor, [0.5], "the raised floor of the house");
  parseMap("t", target);
}

// replacing the area: what stood in it goes, nothing outside is touched
{
  const target = blank();
  target.props = [{ prop: "crate1", x: 13, y: 8, at: "center" }, { prop: "crate1", x: 3, y: 3, at: "center" }];
  target.items = [{ item: "scrap", x: 13, y: 9 }];
  target.lights = [{ x: 14, y: 9 }, { x: 2, y: 2 }];
  target.decals = [{ decal: "stain", x: 13, y: 8, surface: "floor", px: 0, py: 0 }];
  target.windows = [{ x: 12, y: 9, wall: "N", width: 1 }, { x: 2, y: 1, wall: "N", width: 1 }];
  setCell(target, 12, 8, "W");
  setLayerCell(target, "floor", { x: 15, y: 9 }, 1.25);
  pasteArea(target, clipOf(houseMap()), { x: 12, y: 7 });
  assert.ok(!target.props!.some((p) => p.prop === "crate1" && p.x === 13 && p.y === 8 && !p.id), "the old crate is gone (the house has its own, with its id)");
  assert.ok(target.props!.some((p) => p.x === 3 && p.y === 3), "a prop outside stays");
  assert.ok(!target.items!.some((i) => i.item === "scrap"));
  assert.ok(target.lights!.some((l) => l.x === 2 && l.y === 2), "a light outside stays");
  assert.ok(!target.decals!.some((d) => d.px === 0 && d.x === 13));
  assert.ok(!target.windows!.some((w) => w.x === 12), "a window of the old cells is gone");
  assert.ok(target.windows!.some((w) => w.x === 2), "a window outside stays");
  const floors = collectArea(target, { x0: 15, y0: 9, x1: 15, y1: 9 })!.layers.floor;
  assert.equal(floors, undefined, "the old raised floor was overwritten with the house's floor (level)");
  parseMap("t", target);
}

// clipping at the edge: only the part inside is put, and what that needs is still valid
{
  const clip = clipOf(houseMap());
  for (const at of [{ x: 21, y: 5 }, { x: -2, y: -1 }, { x: 20, y: 14 }, { x: -10, y: 3 }]) {
    const target = blank();
    target.start = { x: 10, y: 8, facing: "E" };
    const report = pasteArea(target, clip, at);
    const inside = Math.max(0, Math.min(24, at.x + 5) - Math.max(0, at.x)) * Math.max(0, Math.min(16, at.y + 4) - Math.max(0, at.y));
    assert.equal(report.cells, inside, JSON.stringify(at));
    assert.equal(report.clipped, 20 - inside);
    parseMap("t", target);
  }
  const far = blank();
  assert.deepEqual(pasteArea(far, clip, { x: 40, y: 2 }), { things: 0, cells: 0, clipped: 20, kept: 0, dropped: 0 });
  assert.equal(JSON.stringify(far), JSON.stringify(blank()), "nothing at all: nothing changes");
  // (the door at the bottom edge)
  const edge = blank();
  pasteArea(edge, clip, { x: 3, y: 13 });
  assert.equal(edge.layout[15][5], ".", "the part inside the map is the house's");
  assert.equal(edge.layout.length, 16);
  parseMap("t", edge);
}

// the party's start, a gate, stairs and a lift stay where they are, and so do their cells
{
  const target = blank();
  target.start = { x: 14, y: 8, facing: "N" };
  target.exits = [{ x: 13, y: 9, name: "Gate" }];
  target.stairs = [{ x: 15, y: 9, direction: "down" }];
  target.lifts = [{ x: 12, y: 8, button: "S", to: "deck2" }];
  const report = pasteArea(target, clipOf(houseMap()), { x: 12, y: 7 });
  assert.equal(report.kept, 4);
  assert.equal(report.cells, 16);
  assert.deepEqual(target.exits, [{ x: 13, y: 9, name: "Gate" }]);
  assert.equal(target.layout[8][14], ".", "the start's cell is not turned into a wall");
  assert.equal(target.layout[8][12], ".", "the lift's neither");
  assert.deepEqual(target.start, { x: 14, y: 8, facing: "N" });
  assert.ok(!target.props!.some((p) => p.x === 13 && p.y === 9), "nothing is put on a gate's cell");
  parseMap("t", target);
}

// ids: a map that has an id already gets the copy another one, and the pasted `with` follows it
{
  const source = houseMap();
  const clip = clipOf(source);
  // pasted into the same map beside the house
  const same = structuredClone(source);
  pasteArea(same, clip, { x: 12, y: 3 });
  assert.deepEqual(same.doors!.map((d) => d.id), ["front", "front-2"]);
  assert.deepEqual(same.props!.filter((p) => p.id).map((p) => p.id), ["crate", "crate-2"]);
  assert.deepEqual(same.props!.filter((p) => p.with).map((p) => p.with), ["crate", "crate-2"], "the pasted barrel depends on the pasted crate");
  assert.deepEqual(same.decals!.filter((d) => d.id).map((d) => d.id), ["stain1", "stain1-2"]);
  pasteArea(same, clip, { x: 12, y: 8 });
  assert.deepEqual(same.doors!.map((d) => d.id), ["front", "front-2", "front-3"]);
  // pasted over itself: the old ones go first, the ids are free again
  const over = structuredClone(source);
  pasteArea(over, clip, { x: 4, y: 3 });
  assert.deepEqual(over.doors!.map((d) => d.id), ["front"]);
  // into another map that has none of them: as they are
  const other = blank();
  pasteArea(other, clip, { x: 4, y: 3 });
  assert.deepEqual(other.doors!.map((d) => d.id), ["front"]);
}

// roofs: a pasted roof has a group of its own, and does not join the one beside it
{
  const source = houseMap();
  const clip = clipOf(source);
  const target = blank();
  // a roof of slope-1 and flat-2 already stands beside where the house goes
  paintRoof(target, [{ x: 10, y: 8 }, { x: 11, y: 8 }], "slope-1");
  paintRoof(target, [{ x: 10, y: 12 }], "flat-2");
  pasteArea(target, clip, { x: 12, y: 7 });
  const groups = (xs: number[]) => new Set(target.props!.filter((p) => p.auto && xs.includes(p.x) && p.y !== 12).map((p) => p.auto));
  assert.deepEqual([...groups([10, 11])], ["slope-1"]);
  assert.deepEqual([...groups([13, 14, 15])], ["slope-3"], "the next free number, one group for the pasted roof");
  const again = pasteArea(target, clip, { x: 12, y: 1 });
  assert.equal(again.dropped, 0);
  assert.deepEqual([...new Set(target.props!.filter((p) => p.auto && p.y < 6).map((p) => p.auto))], ["slope-4"]);
  // the pieces are worked out afresh on the new floor: a turned house is a roof turned
  const turnedTarget = blank();
  pasteArea(turnedTarget, orientClip(clip, 1, false), { x: 12, y: 7 });
  const kinds = (file: MapFile) => (file.props ?? []).filter((p) => p.auto).map((p) => `${p.prop}:${p.rotation ?? 0}:${p.elevation ?? 0}`).sort();
  const plainTarget = blank();
  pasteArea(plainTarget, clip, { x: 12, y: 7 });
  assert.equal(kinds(turnedTarget).length, kinds(plainTarget).length);
  const cellsOf = (file: MapFile) => (file.props ?? []).filter((p) => p.auto).map((p) => `${p.x},${p.y}`).sort();
  assert.deepEqual(cellsOf(plainTarget), ["13,8", "13,9", "14,8", "14,9", "15,8", "15,9"], "3 across, 2 down");
  assert.deepEqual(cellsOf(turnedTarget), ["13,10", "13,8", "13,9", "14,10", "14,8", "14,9"], "2 across, 3 down");
  // (every corner of the roof still has its corner piece, turned to face its own corner: no two the same turn)
  assert.deepEqual(kinds(turnedTarget).filter((k) => k.startsWith("roof_corner")).sort(), ["roof_corner:0:0", "roof_corner:180:0", "roof_corner:270:0", "roof_corner:90:0"]);
}

// what a pasted wall takes from its neighbours (and what it can't leave standing)
{
  // opening a wall that had a decal on its face: from the cell beside it
  const target = blank();
  setCell(target, 12, 8, "W");
  target.decals = [{ decal: "stain", x: 11, y: 8, surface: "E", px: 1, py: 1 }];
  target.props = [{ prop: "torch1", x: 11, y: 8, at: "E" }, { prop: "torch1", x: 11, y: 9, at: "E" }];
  const open: AreaClip = { version: 1, w: 1, h: 1, layout: ["."], layers: {}, skipped: {} };
  pasteArea(target, open, { x: 12, y: 8 });
  assert.equal(target.decals, undefined, "its face is gone, and the decal with it");
  assert.deepEqual(target.props!.map((p) => p.y), [9], "the prop on that face goes");
  // a window whose wall behind was dug open, a ladder whose ledge went down, a route over a new wall
  const t2 = blank();
  setCell(t2, 12, 7, "W");
  t2.windows = [{ x: 12, y: 8, wall: "N", width: 1 }];
  setLayerCell(t2, "floor", { x: 13, y: 8 }, 0.5);
  t2.ladders = [{ x: 12, y: 8, wall: "E" }];
  t2.actors = [{ actor: "r", x: 5, y: 5, patrol: [[5, 5], [5, 9]] }];
  parseMap("t", t2);
  const dig = pasteArea(t2, open, { x: 12, y: 7 });
  assert.equal(dig.dropped, 1, "the window has no wall behind it now");
  assert.equal(t2.windows, undefined);
  const lower = pasteArea(t2, open, { x: 13, y: 8 });
  assert.equal(lower.dropped, 1, "the ledge went down, the ladder leads nowhere");
  assert.equal(t2.ladders, undefined);
  const route = pasteArea(t2, { ...open, layout: ["W"] }, { x: 5, y: 9 });
  assert.equal(route.dropped, 1);
  assert.equal(t2.actors![0].patrol, undefined, "the actor stays, its route goes");
  assert.equal(dropUnstable(t2), 0, "nothing more to drop");
  parseMap("t", t2);
  // a bridge with no room under the ceiling
  const t3 = blank();
  t3.bridges = [{ x: 5, y: 5, height: 0.5, axis: "NS" }];
  setLayerCell(t3, "ceiling", { x: 5, y: 5 }, 0.5);
  assert.equal(dropUnstable(t3), 1);
  assert.equal(t3.bridges, undefined);
}

// a chance wall and a door in the old cells give way to the clip's
{
  const target = blank();
  target.chanceWalls = [{ x: 13, y: 8, chance: 0.3 }];
  setCell(target, 13, 8, "W");
  setCell(target, 14, 9, "D");
  target.doors = [{ x: 14, y: 9, kind: "standard", facing: "N" }];
  pasteArea(target, clipOf(houseMap()), { x: 12, y: 7 });
  parseMap("t", target);
  assert.deepEqual(target.chanceWalls, [{ x: 16, y: 8, chance: 0.5 }]);
  assert.equal(target.layout[9][14], ".");
  assert.deepEqual(target.doors!.map((d) => [d.x, d.y]), [[14, 10]]);
}

// ---- keeping it

{
  const clip = clipOf(houseMap());
  const back = parseClip(JSON.parse(JSON.stringify(clip)));
  assert.deepEqual(back, clip);
  // damaged or foreign values are no clip
  assert.equal(parseClip(null), null);
  assert.equal(parseClip("x"), null);
  assert.equal(parseClip({ ...clip, version: 2 }), null);
  assert.equal(parseClip({ ...clip, w: 4 }), null, "a row of the wrong width");
  assert.equal(parseClip({ ...clip, h: 0 }), null);
  assert.equal(parseClip({ ...clip, layout: ["WWWWW", "W...W", "W.x.W", "WWDWW"] }), null, "a character no map has");
  assert.equal(parseClip({ ...clip, layers: { floor: [1, 2] } }), null, "a layer of the wrong size");
  assert.equal(parseClip({ ...clip, w: 100000, h: 100000 }), null);
  // entries outside the clip are dropped one by one, the rest is kept
  const mixed = parseClip({ ...clip, props: [...clip.props!, { prop: "crate1", x: 99, y: 0 }, { prop: "crate1", x: "a", y: 0 }, null] })!;
  assert.equal(mixed.props!.length, clip.props!.length);
  assert.deepEqual(parseClip({ version: 1, w: 1, h: 1, layout: ["."] }), { version: 1, w: 1, h: 1, layout: ["."], layers: {}, skipped: {} }, "the optional parts may be missing");
  // the browser's storage: written, read back, forgotten; refused or damaged: no clip, no error
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) };
  assert.equal(loadClip(store), null);
  assert.equal(saveClip(clip, store), true);
  assert.ok(data.has(CLIP_STORAGE_KEY));
  assert.deepEqual(loadClip(store), clip);
  assert.equal(saveClip(null, store), true);
  assert.equal(loadClip(store), null);
  data.set(CLIP_STORAGE_KEY, "{not json");
  assert.equal(loadClip(store), null);
  data.set(CLIP_STORAGE_KEY, JSON.stringify({ ...clip, version: 0 }));
  assert.equal(loadClip(store), null);
  assert.equal(saveClip(clip, { getItem: () => null, setItem: () => { throw new Error("quota"); }, removeItem: () => {} }), false);
  assert.equal(saveClip(clip, null), false);
  // pasting into another map: the round trip through the storage is the same as the clip itself
  const other = blank(30, 20);
  pasteArea(other, loadClip(store) ?? clip, { x: 3, y: 3 });
  const viaStore = blank(30, 20);
  saveClip(clip, store);
  pasteArea(viaStore, loadClip(store)!, { x: 3, y: 3 });
  assert.deepEqual(viaStore, other);
}

console.log("areaClipboard: ok");
