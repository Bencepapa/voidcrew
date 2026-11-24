// Run: npx tsx src/editor/derivedCache.test.ts
import assert from "node:assert/strict";
import { THUMB_VERSION, isStoreUrl, thumbCacheKey, thumbKey, thumbSize, thumbSource, upgradeCacheKey } from "./derivedCache";

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

// thumbnail geometry
assert.deepEqual(thumbSize(512, 256), { width: 96, height: 48 });
assert.deepEqual(thumbSize(64, 64), { width: 64, height: 64 }, "never enlarged");
assert.deepEqual(thumbSize(2048, 1), { width: 96, height: 1 }, "never below 1 px");
assert.deepEqual(thumbSize(0, 0), { width: 1, height: 1 });
assert.deepEqual(thumbSource(100, 60), { x: 0, y: 0, width: 100, height: 60 });
// a sheet of 5 x 3 cells, the cell at column 2, row 1
assert.deepEqual(thumbSource(500, 300, { cols: 5, rows: 3, col: 2, row: 1 }), { x: 200, y: 100, width: 100, height: 100 });
assert.deepEqual(thumbSource(500, 300, { cols: 5, rows: 3, col: 9, row: -4 }), { x: 400, y: 0, width: 100, height: 100 }, "clamped");
assert.deepEqual(thumbSource(500, 300, { cols: 0, rows: 0, col: 0, row: 0 }), { x: 0, y: 0, width: 500, height: 300 });
assert.notEqual(thumbKey("https://x/r1/diffuse.png"), thumbKey("https://x/r1/diffuse.png", { cols: 5, rows: 3, col: 0, row: 0 }));
assert.notEqual(thumbKey("https://x/r1/diffuse.png", { cols: 5, rows: 3, col: 0, row: 0 }), thumbKey("https://x/r1/diffuse.png", { cols: 5, rows: 3, col: 1, row: 0 }));
assert.equal(thumbKey("https://x/r1/diffuse.png"), thumbCacheKey("https://x/r1/diffuse.png"));
// which URLs get a thumbnail
assert.ok(isStoreUrl("https://p.supabase.co/storage/v1/object/public/void-textures/a/r1/diffuse.png", "https://p.supabase.co"));
assert.ok(!isStoreUrl("/textures/stone/diffuse.png", "https://p.supabase.co"));
assert.ok(!isStoreUrl("blob:http://localhost/1", "https://p.supabase.co"));
assert.ok(!isStoreUrl("https://p.supabase.co.evil.example/x.png", "https://p.supabase.co"), "a host that only starts the same");
assert.ok(!isStoreUrl("https://p.supabase.co/x.png", undefined));

console.log("derivedCache: ok");
