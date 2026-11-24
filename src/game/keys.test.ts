// Run: npx tsx src/game/keys.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
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

// ---- one key for a door and a chest (see propLocks.test.ts for the chest's own lock)
{
  // (propLocks reads the prop types, which read Vite's import.meta.glob: a stand-in is put in its place)
  register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
  const { lockStep } = await import("./propLocks");
  const door = { key: keyFlagFor("keycard") };
  const chest = { key: keyFlagFor("keycard") };
  assert.equal(lockKeyMissing(door, map), false);
  const given = new Set<string>();
  const st = () => ({ unlocked: false, hasFlag: (f: string) => given.has(f), countItem: () => 0, map });
  assert.equal(lockStep(chest, st()).kind, "locked", "no keycard yet: the chest is shut");
  given.add("key.keycard"); // (the keycard picked up raises it)
  assert.equal(lockStep(chest, st()).kind, "unlock", "the same flag that opens the door opens the chest");
}

console.log("keys: ok");
