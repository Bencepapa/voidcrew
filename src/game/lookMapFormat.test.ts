// Run: npx tsx src/game/lookMapFormat.test.ts
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
const { parseMap } = await import("./mapFormat");
const { WORLDS } = await import("./worlds");
const { resolveLook } = await import("./look");
const { blankMap } = await import("../editor/mapEdits");

const base = (look?: unknown): MapFile => ({
  name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout: ["WWWWW", "W...W", "WWWWW"], ...(look !== undefined ? { look } : {}),
} as unknown as MapFile);

// an old map has no look: nothing changes
assert.equal(parseMap("a", base()).look, undefined);

// a good look is kept, a bad one cleaned
assert.deepEqual(parseMap("a", base({ preset: "cold-mystic", strength: 0.5 })).look, { preset: "cold-mystic", strength: 0.5 });
assert.deepEqual(parseMap("a", base({ preset: "none" })).look, { preset: "none" });
assert.deepEqual(
  parseMap("a", base({ preset: "cinder", strength: 3, grade: { contrast: 9, shadowHue: -20, junk: 1, tint: "x" }, extra: true })).look,
  { preset: "cinder", strength: 1, grade: { contrast: 1.5, shadowHue: 0 } },
);
assert.equal(parseMap("a", base({ preset: "bogus" })).look, undefined, "an invalid preset is dropped");
assert.equal(parseMap("a", base("warm")).look, undefined);
assert.equal(parseMap("a", base([])).look, undefined);
assert.equal(parseMap("a", base({ grade: { junk: 1 } })).look, undefined);

// the look is a pass over the finished picture: changing it never rebuilds the scene
assert.equal(
  parseMap("k", base({ preset: "cold-mystic" })).structureKey,
  parseMap("k", base()).structureKey,
  "the structure key leaves the look out",
);
assert.equal(
  parseMap("k", base({ preset: "cold-mystic", grade: { contrast: 1.2 } })).structureKey,
  parseMap("k", base({ preset: "cinder", strength: 0.3 })).structureKey,
);

// the worlds have no default look (nothing changes for the old maps)
for (const world of Object.values(WORLDS)) assert.equal(world.defaultLook, undefined, `${world.id} has no default look`);
for (const world of Object.values(WORLDS)) assert.equal(resolveLook(parseMap("a", base()).look, world.defaultLook), null);

// a new map made like another has its look
const like = base({ preset: "warm-film", grade: { contrast: 1.2 } });
assert.deepEqual(blankMap("n", 1, 8, 8, like).look, { preset: "warm-film", grade: { contrast: 1.2 } });
assert.notEqual(blankMap("n", 1, 8, 8, like).look, like.look, "a copy, not the same object");
assert.equal(blankMap("n", 1, 8, 8, base()).look, undefined);

console.log("lookMapFormat ok");
