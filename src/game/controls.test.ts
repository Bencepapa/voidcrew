// Run: npx tsx src/game/controls.test.ts
import assert from "node:assert/strict";
import { keysFor, moveActionForKey } from "./controls";

assert.equal(moveActionForKey("w"), "forward");
assert.equal(moveActionForKey("W"), "forward");
assert.equal(moveActionForKey("s"), "back");
assert.equal(moveActionForKey("a"), "strafeLeft");
assert.equal(moveActionForKey("d"), "strafeRight");
assert.equal(moveActionForKey("q"), "turnLeft");
assert.equal(moveActionForKey("e"), "turnRight");
assert.equal(moveActionForKey("ArrowUp"), "forward");
assert.equal(moveActionForKey("ArrowDown"), "back");
assert.equal(moveActionForKey("ArrowLeft"), "turnLeft");
assert.equal(moveActionForKey("ArrowRight"), "turnRight");
assert.equal(moveActionForKey("x"), undefined);
assert.deepEqual(keysFor("strafeLeft"), ["a"]);
assert.deepEqual(keysFor("turnLeft").sort(), ["arrowleft", "q"]);
console.log("controls ok");
