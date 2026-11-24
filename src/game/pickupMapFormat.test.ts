// Run: npx tsx src/game/pickupMapFormat.test.ts
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

const base = (extra: Record<string, unknown>): MapFile => ({
  name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout: ["WWWWW", "W...W", "WWWWW"], ...extra,
} as unknown as MapFile);

// an old map says nothing: the player's choice and the world's default decide
assert.equal(parseMap("old", base({})).pickup, undefined);
// the two values are read
assert.equal(parseMap("a", base({ pickup: "auto" })).pickup, "auto");
assert.equal(parseMap("c", base({ pickup: "click" })).pickup, "click");
// a bad value is dropped, not fatal
assert.equal(parseMap("bad", base({ pickup: "never" })).pickup, undefined);
assert.equal(parseMap("bad2", base({ pickup: 3 })).pickup, undefined);
// it doesn't change the scene's structure key (the editor changing it rebuilds nothing)
assert.equal(parseMap("k1", base({})).structureKey, parseMap("k1", base({ pickup: "click" })).structureKey);

console.log("pickupMapFormat ok");
