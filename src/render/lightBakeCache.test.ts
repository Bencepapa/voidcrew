import assert from "node:assert/strict";
import { bakeCacheKey, createBakeCache, type BakeKeyInput } from "./lightBakeCache";

const base: BakeKeyInput = {
  width: 2, height: 2, cells: ["..", ".."], floorHeights: [[0, 0], [0, 0]], ceilingHeights: [[1, 1], [1, 1]],
  props: [{ prop: "torch1", x: 0, y: 0 }], lights: [{ x: 1, y: 1, intensity: 1 }], wallHeight: 1, options: { perCell: 3, mode: "directional" },
};

// the same inputs give the same key (a texture change is not an input, so it hits the cache)
assert.equal(bakeCacheKey({ ...base }), bakeCacheKey(JSON.parse(JSON.stringify(base))));
// every input that changes the light changes the key
assert.notEqual(bakeCacheKey(base), bakeCacheKey({ ...base, ceilingHeights: [[2, 1], [1, 1]] }));
assert.notEqual(bakeCacheKey(base), bakeCacheKey({ ...base, lights: [{ x: 1, y: 1, intensity: 2 }] }));
assert.notEqual(bakeCacheKey(base), bakeCacheKey({ ...base, options: { perCell: 1, mode: "directional" } }));
assert.notEqual(bakeCacheKey(base), bakeCacheKey({ ...base, ambientDensity: 2 }));
assert.notEqual(bakeCacheKey(base), bakeCacheKey({ ...base, wallHeight: 1.2 }));

// least recently used: a read keeps an entry, the oldest unread one goes
const cache = createBakeCache<number>(2);
cache.set("a", 1);
cache.set("b", 2);
assert.equal(cache.get("a"), 1);
cache.set("c", 3);
assert.equal(cache.get("b"), undefined);
assert.equal(cache.get("a"), 1);
assert.equal(cache.get("c"), 3);
assert.equal(cache.size, 2);
cache.clear();
assert.equal(cache.size, 0);
console.log("lightBakeCache ok");