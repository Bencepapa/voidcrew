// Run: npx tsx src/editor/derivedCache.test.ts
import assert from "node:assert/strict";
import { THUMB_VERSION, thumbCacheKey, upgradeCacheKey } from "./derivedCache";

const base = {
  id: "fantasy_shared_0b8c1f6e-1111-4222-8333-444455556666", rev: 3,
  transparency: { source: "alpha", colorKey: "#ff00ff" }, auto: { normal: true, depth: false }, recipe: 1,
};
const key = upgradeCacheKey(base);
assert.equal(key, "up:fantasy_shared_0b8c1f6e-1111-4222-8333-444455556666:r3:alpha:#ff00ff:n-:g1");
// everything the result depends on is part of the key
assert.notEqual(upgradeCacheKey({ ...base, rev: 4 }), key, "another revision");
assert.notEqual(upgradeCacheKey({ ...base, id: base.id.replace("0b8c", "0b8d") }), key, "another texture");
assert.notEqual(upgradeCacheKey({ ...base, transparency: { source: "colorKey", colorKey: "#ff00ff" } }), key);
assert.notEqual(upgradeCacheKey({ ...base, transparency: { source: "alpha", colorKey: "#00ff00" } }), key);
assert.notEqual(upgradeCacheKey({ ...base, auto: { normal: true, depth: true } }), key);
assert.notEqual(upgradeCacheKey({ ...base, auto: { normal: false, depth: true } }), key);
assert.notEqual(upgradeCacheKey({ ...base, recipe: 2 }), key, "a new generator");
// the same input, the same key
assert.equal(upgradeCacheKey({ ...base }), key);
// never collides with derive()'s own keys (those start with the id)
assert.ok(key.startsWith("up:"));

assert.equal(thumbCacheKey("https://x/r2/diffuse.png"), `thumb${THUMB_VERSION}:https://x/r2/diffuse.png`);
assert.notEqual(thumbCacheKey("https://x/r2/diffuse.png"), thumbCacheKey("https://x/r3/diffuse.png"));

console.log("derivedCache: ok");
