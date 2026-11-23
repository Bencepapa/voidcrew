// Run: npx tsx src/game/doorTextures.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";

// (the game's modules read Vite's import.meta.env, which plain node lacks: an empty one is put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { doorTextureIds, readDoorTexture, unknownDoorTextures } = await import("./doorTextures");
const { parseMap } = await import("./mapFormat");

const base = (doors: NonNullable<MapFile["doors"]>): MapFile => ({
  name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
  layout: ["WWWWW", "W.D.W", "WWWWW"], doors,
} as unknown as MapFile);

// an old map (no door textures) stays valid and has none
{
  const map = parseMap("old", base([{ x: 2, y: 1, kind: "standard", facing: "E", offset: 0.3 }]));
  assert.equal(map.doors?.[0].leafTexture, undefined);
  assert.equal(map.doors?.[0].frameTexture, undefined);
  assert.equal(map.doors?.[0].offset, 0.3);
}

// the door's own textures load as written; a malformed one is dropped, not fatal
{
  const map = parseMap("own", base([{ x: 2, y: 1, kind: "standard", facing: "E", leafTexture: "door1", frameTexture: "fantasy_shared_0123abcd" }]));
  assert.equal(map.doors?.[0].leafTexture, "door1");
  assert.equal(map.doors?.[0].frameTexture, "fantasy_shared_0123abcd");
  const bad = parseMap("bad", base([{ x: 2, y: 1, kind: "standard", facing: "E", leafTexture: 5 as unknown as string, frameTexture: "../x" }]));
  assert.equal(bad.doors?.[0].leafTexture, undefined);
  assert.equal(bad.doors?.[0].frameTexture, undefined);
}

// file -> map -> file keeps them (JSON round trip of the file itself)
{
  const file = base([{ x: 2, y: 1, kind: "lift", facing: "W", leafTexture: "liftdoor1" }]);
  const again = JSON.parse(JSON.stringify(file)) as MapFile;
  assert.deepEqual(again.doors, file.doors);
  assert.equal(parseMap("rt", again).doors?.[0].leafTexture, "liftdoor1");
}

// the editor's door edit sets a texture and, with undefined, clears it back to the type's
{
  const { updateDoor } = await import("../editor/mapEdits");
  const file = base([]);
  delete file.doors;
  updateDoor(file, { x: 2, y: 1 }, { kind: "standard", facing: "E" }, { leafTexture: "door1", frameTexture: "doorframe1" });
  assert.deepEqual(file.doors, [{ x: 2, y: 1, kind: "standard", facing: "E", leafTexture: "door1", frameTexture: "doorframe1" }]);
  updateDoor(file, { x: 2, y: 1 }, { kind: "standard", facing: "E" }, { leafTexture: undefined });
  assert.deepEqual(file.doors, [{ x: 2, y: 1, kind: "standard", facing: "E", frameTexture: "doorframe1" }]);
}

// the structure key (what rebuilds the scene) differs when a door's texture does
{
  const a = parseMap("k", base([{ x: 2, y: 1, kind: "standard", facing: "E" }])).structureKey;
  const b = parseMap("k", base([{ x: 2, y: 1, kind: "standard", facing: "E", leafTexture: "door1" }])).structureKey;
  assert.notEqual(a, b);
}

// the ids to load, and the unknown ones to warn about
{
  const doors = [
    { cell: { x: 1, y: 1 }, leafTexture: "door1" },
    { cell: { x: 2, y: 1 }, leafTexture: "door1", frameTexture: "gone_shared_0123" },
    { cell: { x: 3, y: 1 } },
  ];
  assert.deepEqual(doorTextureIds(doors).sort(), ["door1", "gone_shared_0123"]);
  assert.deepEqual(doorTextureIds(undefined), []);
  assert.deepEqual(unknownDoorTextures(doors, id => id === "door1"), [{ cell: { x: 2, y: 1 }, field: "frameTexture", id: "gone_shared_0123" }]);
  assert.deepEqual(unknownDoorTextures(doors, () => true), []);
  assert.deepEqual(unknownDoorTextures(undefined, () => false), []);
}
assert.equal(readDoorTexture("a-b_9"), "a-b_9");
assert.equal(readDoorTexture(""), undefined);

console.log("doorTextures.test: ok");
