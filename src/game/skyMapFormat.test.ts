// Run: npx tsx src/game/skyMapFormat.test.ts
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

const base = (textures?: Record<string, unknown>): MapFile => ({
  name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout: ["WWWWW", "W...W", "WWWWW"], ...(textures ? { textures } : {}),
} as unknown as MapFile);

const shared = "fantasy_sky_0b8c1f6e-1111-4222-8333-444455556666";
// a built-in name and a shared sky id are both kept as they are
assert.equal(parseMap("a", base({ sky: "nappal" })).textures?.sky, "nappal");
assert.equal(parseMap("b", base({ sky: shared })).textures?.sky, shared);
// a different sky rebuilds the scene (the structure key changes), the same one does not
assert.notEqual(parseMap("k", base({ sky: shared })).structureKey, parseMap("k", base({ sky: "nappal" })).structureKey);
assert.equal(parseMap("k", base({ sky: shared })).structureKey, parseMap("k", base({ sky: shared })).structureKey);

console.log("skyMapFormat: ok");
