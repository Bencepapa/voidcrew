// Run: npx tsx src/game/worldPause.test.ts
import assert from "node:assert/strict";
import { worldPause } from "./worldPause";

const dialogue = { kind: "dialogue", library: "l", entry: "e" } as const;

// nothing open: nothing paused
assert.deepEqual(worldPause(null, false), { pausesWorld: false, blocksParty: false, blocksView: false });
// a dialogue (and so the shop window over it) pauses, blocks the party and the view
assert.deepEqual(worldPause(dialogue, false), { pausesWorld: true, blocksParty: true, blocksView: true });
// the simple shop does the same
assert.deepEqual(worldPause({ kind: "shop", shop: "s" }, false), { pausesWorld: true, blocksParty: true, blocksView: true });
// the inventory does the same
assert.deepEqual(worldPause(null, true), { pausesWorld: true, blocksParty: true, blocksView: true });
// a modal message blocks, a plain one only takes the mouse
assert.equal(worldPause({ kind: "message", text: "", modal: true, position: "center" }, false).blocksParty, true);
assert.deepEqual(worldPause({ kind: "message", text: "", modal: false, position: "center" }, false),
  { pausesWorld: false, blocksParty: false, blocksView: true });
// an image pauses the world
assert.equal(worldPause({ kind: "image", text: "" }, false).pausesWorld, true);
console.log("worldPause ok");
