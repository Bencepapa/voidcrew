// Run: npx tsx src/editor/loadGate.test.ts
import assert from "node:assert/strict";
import { isLoaded, loadOnce, resetLoadGate } from "./loadGate";

let calls = 0;
const slow = () => new Promise<void>(resolve => setTimeout(() => { calls++; resolve(); }, 5));

// two callers at once share one load
resetLoadGate();
await Promise.all([loadOnce("textures", "fantasy", slow), loadOnce("textures", "fantasy", slow)]);
assert.equal(calls, 1);
assert.ok(isLoaded("textures", "fantasy"));

// once loaded, later callers do nothing (the Assets window opened again)
await loadOnce("textures", "fantasy", slow);
assert.equal(calls, 1);

// another world / another kind is its own list
await loadOnce("textures", "scifi", slow);
await loadOnce("images", "fantasy", slow);
assert.equal(calls, 3);

// force (the Refresh button) loads again
await loadOnce("textures", "fantasy", slow, true);
assert.equal(calls, 4);

// a failed load is not remembered, and the failure reaches the caller
resetLoadGate();
let attempts = 0;
await assert.rejects(loadOnce("props", "fantasy", async () => { attempts++; throw new Error("offline"); }), /offline/);
assert.ok(!isLoaded("props", "fantasy"));
await loadOnce("props", "fantasy", async () => { attempts++; });
assert.equal(attempts, 2);
assert.ok(isLoaded("props", "fantasy"));

// callers joining a load that fails all see the failure, and a later call retries
resetLoadGate();
const failing = () => new Promise<void>((_, reject) => setTimeout(() => reject(new Error("timeout")), 5));
const results = await Promise.allSettled([loadOnce("doors", "scifi", failing), loadOnce("doors", "scifi", failing)]);
assert.deepEqual(results.map(r => r.status), ["rejected", "rejected"]);
await loadOnce("doors", "scifi", async () => {});
assert.ok(isLoaded("doors", "scifi"));

console.log("loadGate: ok");
