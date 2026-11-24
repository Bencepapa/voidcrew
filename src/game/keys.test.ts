// Run: npx tsx src/game/keys.test.ts
import assert from "node:assert/strict";
import { keyFlagFor, keyFlags, lockKeyMissing, lockedMessage } from "./keys";

// ---- the flags a map raises
const map = {
  items: [{ item: "keycard", name: "Red keycard", sets: "key.keycard" }, { item: "crate", name: "no flag" }, { item: "coin" }, { item: "key", sets: "key.rusty" }],
  triggers: [{ do: ["set:alarm", "log:hi", "open:3,4"] }, { do: ["set: story.gate "] }],
  terminals: { t1: { do: ["set:code_read", "set:key.rusty"] }, t2: {} },
};
assert.deepEqual(keyFlags(map), [
  { flag: "key.keycard", from: "item", name: "Red keycard" },
  { flag: "key.rusty", from: "item", name: undefined },
  { flag: "alarm", from: "action" },
  { flag: "story.gate", from: "action" },
  { flag: "code_read", from: "action" },
]);
assert.deepEqual(keyFlags({}), []);
assert.equal(keyFlagFor("keycard"), "key.keycard");

// ---- a lock whose key nothing raises
assert.equal(lockKeyMissing({ key: "key.keycard" }, map), false);
assert.equal(lockKeyMissing({ key: "key.blue" }, map), true);
assert.equal(lockKeyMissing({}, map), false, "a lock with no key (a code, a hack) needs none");
assert.equal(lockKeyMissing(undefined, map), false);

// ---- what a locked door says
assert.equal(lockedMessage({}), "It's locked.");
assert.equal(lockedMessage({ message: "A red light blinks: keycard needed." }), "A red light blinks: keycard needed.");
assert.equal(lockedMessage({ message: "  " }), "It's locked.", "an empty message is the default one");
assert.equal(lockedMessage({ hack: 1 }, "Ada"), "It's locked. Ada could hack it (Use).");
assert.equal(lockedMessage({ hack: 1 }), "It's locked.", "no hacker: no hint");
assert.equal(lockedMessage({}, "Ada"), "It's locked.", "a lock that can't be hacked: no hint");
assert.equal(lockedMessage({ message: "Nope.", hack: 2 }, "Ada"), "Nope. Ada could hack it (Use).");

console.log("keys: ok");
