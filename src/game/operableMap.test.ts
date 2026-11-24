// Run: npx tsx src/game/operableMap.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";

// (the game's modules read Vite's import.meta.glob / env: a stand-in is put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");
const { touchAt, interactionAt } = await import("./interactions");
const { PROP_TYPES, propBoxes, propPlacement, isFloorOperable } = await import("./props");
const { operableProblems, operableSources, sourceKeys } = await import("./operables");
const { assetInWorld } = await import("./worlds");

const file = (): MapFile =>
  ({
    name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
    layout: ["WWWWWWWW", "W..D...W", "W......W", "WWWWWWWW"],
    props: [
      { prop: "lever1", x: 1, y: 1, at: "N", operable: { targets: [{ kind: "door", x: 3, y: 1, action: "toggle", force: true }, { kind: "trap", x: 6, y: 2, side: "E" }, { kind: "bogus" }], junk: 1 } },
      { prop: "arrowslit1", x: 6, y: 2, at: "E", operable: { range: 5, damage: 4 } },
      { prop: "plate1", x: 2, y: 2, at: "NE", operable: { hold: false } },
      { prop: "button1", x: 5, y: 1, at: "N", interaction: { kind: "message", text: "Hi", modal: false, position: "top" } },
      { prop: "crate1", x: 4, y: 2, at: "center", operable: { targets: [{ kind: "door", x: 3, y: 1 }] } },
    ],
    decals: [{ decal: "stain", x: 4, y: 1, surface: "N", px: 10, py: 10, operable: { kind: "lever", targets: [{ kind: "door", x: 3, y: 1 }] } }, { decal: "stain", x: 5, y: 2, surface: "S", px: 10, py: 10 }],
  }) as unknown as MapFile;

// ---- the map file's blocks reach the parsed map (junk dropped); old maps without them parse as before
const map = parseMap("t", file());
assert.deepEqual(map.props![0].operable, { targets: [{ kind: "door", x: 3, y: 1, action: "toggle", force: true }, { kind: "trap", x: 6, y: 2, side: "E" }] });
assert.deepEqual(map.props![1].operable, { damage: 4, range: 5 });
assert.equal(map.props![3].operable, undefined);
assert.deepEqual(map.decals![0].operable, { kind: "lever", targets: [{ kind: "door", x: 3, y: 1 }] });
assert.equal(map.decals![1].operable, undefined);
const plain = parseMap("p", { ...file(), props: [{ prop: "crate1", x: 1, y: 1, at: "center" }], decals: undefined } as unknown as MapFile);
assert.equal(plain.props![0].operable, undefined);
// (a map that ends up as JSON again keeps nothing it does not use)
assert.equal(JSON.stringify(plain.props![0]).includes("operable"), false);

// ---- the operable props are known props, in both worlds
for (const id of ["lever1", "button1", "plate1", "trapcell1", "arrowslit1", "glyph1"]) {
  assert.equal(PROP_TYPES[id].kind, "operable", id);
  assert.ok(assetInWorld(id, "fantasy") && assetInWorld(id, "scifi"), `${id} is offered in both worlds`);
}
assert.ok(PROP_TYPES.lever1.wall && PROP_TYPES.button1.wall && PROP_TYPES.arrowslit1.wall && PROP_TYPES.glyph1.wall, "the wall ones hang on walls");
assert.ok(!PROP_TYPES.plate1.wall && !PROP_TYPES.trapcell1.wall && !PROP_TYPES.plate1.blocks);
assert.ok(isFloorOperable(PROP_TYPES.plate1) && isFloorOperable(PROP_TYPES.trapcell1) && !isFloorOperable(PROP_TYPES.lever1) && !isFloorOperable(undefined));

// ---- a plate lies in the middle of its cell whatever its anchor, and is walked over
const plate = propPlacement(map.props![2]);
assert.deepEqual([plate.x, plate.z], [2, 2]);
assert.equal(propBoxes(map, 2, 2).length, 0, "no box to bump into");
assert.equal(propBoxes(map, 1, 1).length, 1, "a lever on the wall is a box (against the wall)");

// ---- the click on a lever or button, or Use: the same event every time
const lever = touchAt(map, { kind: "prop", index: 0 });
assert.deepEqual(lever && { kind: lever.kind, from: lever.kind === "operate" && lever.from, index: lever.kind === "operate" && lever.index }, { kind: "operate", from: "prop", index: 0 });
assert.equal(touchAt(map, { kind: "prop", index: 0 }), lever, "(Use matches what it aimed at by identity)");
assert.equal(interactionAt(map, { kind: "prop", index: 0 }), undefined, "it is not one of the editor's events");
assert.equal(touchAt(map, { kind: "prop", index: 1 }), undefined, "a wall trap is not touched");
assert.equal(touchAt(map, { kind: "prop", index: 2 }), undefined, "nor is a plate");
assert.equal(touchAt(map, { kind: "prop", index: 3 })?.kind, "message", "a button with a message of its own shows that");
assert.equal(touchAt(map, { kind: "prop", index: 4 }), undefined, "a crate with a stray block is nothing");
assert.deepEqual(touchAt(map, { kind: "decal", index: 0 }) && { ...touchAt(map, { kind: "decal", index: 0 }) }, { kind: "operate", from: "decal", index: 0 });
assert.equal(touchAt(map, { kind: "decal", index: 1 }), undefined);

// ---- the sources and their keys are by place, not index
const keys = sourceKeys(map);
assert.equal(keys.props.get(0), "lever1@1,1:N");
assert.equal(keys.decals.get(0), "decal:stain@4,1:N:10,10");
assert.deepEqual(operableSources(map).map((s) => s.kind), ["lever", "emitter", "plate", "button", "lever"], "(the crate carries a block it does not use)");

// ---- problems of this map: the stray block on the crate is never read; the lever's trap is there; the plate has no target
{
  const codes = operableProblems(map).map((p) => `${p.code}@${p.cell.x},${p.cell.y}`).sort();
  assert.deepEqual(codes, ["operableNoTarget@2,2", "operableNoTarget@5,1"].sort());
}

console.log("operableMap: ok");
