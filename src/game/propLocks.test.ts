// Run: npx tsx src/game/propLocks.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";

// (the game's modules read Vite's import.meta.glob / env: a stand-in is put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");
const {
  DEFAULT_LOCKED, keyChoices, keyHeld, keyItemOf, keySources, lockStep, lockableProp, patchPropLock, propLockMessage, propLockProblems,
  propUnlockedFlag, readPropLock, suggestKeyFlag,
} = await import("./propLocks");

// ---- the block of a map file: junk dropped, a block of its own is a lock
assert.deepEqual(readPropLock({ key: " key.vault ", message: "  Padlocked.  ", consumeKey: true, junk: 1 }), { key: "key.vault", message: "Padlocked.", consumeKey: true });
assert.deepEqual(readPropLock({}), {}, "an empty block is still a lock (it never opens)");
assert.deepEqual(readPropLock({ key: 5, message: "", consumeKey: "yes" }), {});
assert.equal(readPropLock(undefined), undefined);
assert.equal(readPropLock(null), undefined);
assert.equal(readPropLock("locked"), undefined);
assert.equal(readPropLock([1]), undefined);
assert.equal(readPropLock({ message: "x".repeat(500) })!.message!.length, 300, "a message is kept short");

// ---- changing a lock: what is unset, empty or false is dropped, the block stays
assert.deepEqual(patchPropLock(undefined, {}), {});
assert.deepEqual(patchPropLock({}, { key: "k" }), { key: "k" });
assert.deepEqual(patchPropLock({ key: "k", message: "m", consumeKey: true }, { message: "", consumeKey: false }), { key: "k" });
assert.deepEqual(patchPropLock({ key: "k" }, { key: undefined }), {});

// ---- what can be locked: containers, levers, buttons - not plates, traps, torches, nothing
assert.ok(lockableProp("crate1"), "a crate");
assert.ok(lockableProp("lever1") && lockableProp("button1"));
assert.ok(!lockableProp("plate1") && !lockableProp("trapcell1") && !lockableProp("arrowslit1"), "what works by itself or fires");
assert.ok(!lockableProp("nonsense") && !lockableProp("toString") && !lockableProp(""));

// ---- the run's flag of an opened lock
assert.equal(propUnlockedFlag("deck1", 3), "unlocked:deck1:prop 3");

// ---- the decision
const has = (...flags: string[]) => (f: string) => flags.includes(f);
const carries = (counts: Record<string, number>) => (item: string) => counts[item] ?? 0;
const state = (over: Partial<Parameters<typeof lockStep>[1]> = {}) => ({ unlocked: false, hasFlag: has(), countItem: carries({}), map: {}, ...over });

assert.deepEqual(lockStep(undefined, state()), { kind: "open" }, "no lock: nothing in the way");
assert.deepEqual(lockStep({ key: "key.vault" }, state({ unlocked: true })), { kind: "open" }, "opened before: stays open, key or no key");
// shut: the message - its own, else the default (or the language's)
assert.deepEqual(lockStep({ key: "key.vault" }, state()), { kind: "locked", message: DEFAULT_LOCKED });
assert.equal(DEFAULT_LOCKED, "It's locked.");
assert.deepEqual(lockStep({ key: "key.vault", message: "A heavy padlock." }, state()), { kind: "locked", message: "A heavy padlock." });
assert.deepEqual(lockStep({ key: "key.vault", message: "  " }, state({ fallback: "Locked here." })), { kind: "locked", message: "Locked here." }, "an empty message is the default one");
assert.equal(propLockMessage({ message: "Nope." }, "Locked here."), "Nope.");
// the key: its flag is up
assert.deepEqual(lockStep({ key: "key.vault" }, state({ hasFlag: has("key.vault") })), { kind: "unlock" });
assert.deepEqual(lockStep({ key: "key.vault" }, state({ hasFlag: has("key.other") })), { kind: "locked", message: DEFAULT_LOCKED }, "another key does not do");
// a lock with no key never opens (the editor warns); a blank key is none
assert.deepEqual(lockStep({}, state({ hasFlag: () => true })), { kind: "locked", message: DEFAULT_LOCKED });
assert.deepEqual(lockStep({ key: "" }, state({ hasFlag: () => true })), { kind: "locked", message: DEFAULT_LOCKED });
// a key flag `key.<item>` is also a key carried: an item found in a chest, bought
assert.deepEqual(lockStep({ key: "key.keycard" }, state({ countItem: carries({ keycard: 1 }) })), { kind: "unlock" });
assert.deepEqual(lockStep({ key: "key.keycard" }, state({ countItem: carries({ keycard: 0, scrap: 5 }) })), { kind: "locked", message: DEFAULT_LOCKED });
assert.equal(keyHeld("story.gate", { hasFlag: has(), countItem: () => 9 }), false, "only the key. flags are items");
assert.equal(keyHeld("key.", { hasFlag: has(), countItem: () => 9 }), false);
assert.equal(keyHeld(undefined, { hasFlag: () => true, countItem: () => 9 }), false);
// consuming the key: the flag, and the item it stands for
const mapItems = { items: [{ item: "keycard", sets: "key.red" }, { item: "coin" }] };
assert.deepEqual(lockStep({ key: "key.red", consumeKey: true }, state({ hasFlag: has("key.red"), map: mapItems })), { kind: "unlock", consume: { flag: "key.red", item: "keycard" } }, "an item that sets the flag");
assert.deepEqual(lockStep({ key: "key.rusty", consumeKey: true }, state({ hasFlag: has("key.rusty") })), { kind: "unlock", consume: { flag: "key.rusty", item: "rusty" } }, "by the key.<item> convention");
assert.deepEqual(lockStep({ key: "alarm", consumeKey: true }, state({ hasFlag: has("alarm") })), { kind: "unlock", consume: { flag: "alarm", item: undefined } }, "a flag no item stands for: only the flag goes");
assert.deepEqual(lockStep({ key: "key.red" }, state({ hasFlag: has("key.red"), map: mapItems })), { kind: "unlock" }, "without consumeKey nothing is used up");
assert.deepEqual(lockStep({ key: "key.red", consumeKey: true }, state({ unlocked: true })), { kind: "open" }, "opened already: the key is not used up again");
assert.equal(keyItemOf("key.red", mapItems), "keycard");
assert.equal(keyItemOf("key.coin", mapItems), "coin");
assert.equal(keyItemOf("gate", mapItems), undefined);
assert.equal(keyItemOf("key.", {}), undefined);
// shared keys: two locks, one flag - both open for the same key; used up by the first, the second shuts the party out
{
  const flags = new Set(["key.red"]);
  const a = { key: "key.red", consumeKey: true }, b = { key: "key.red" };
  assert.equal(lockStep(a, state({ hasFlag: (f) => flags.has(f) })).kind, "unlock");
  assert.equal(lockStep(b, state({ hasFlag: (f) => flags.has(f) })).kind, "unlock", "shared");
  flags.delete("key.red"); // (what the runtime does after the first one used it up)
  assert.equal(lockStep(b, state({ hasFlag: (f) => flags.has(f) })).kind, "locked");
  assert.equal(lockStep(b, state({ unlocked: true, hasFlag: (f) => flags.has(f) })).kind, "open", "(a lock opened already stays open)");
}

// ---- the editor's key list
const world = {
  items: [{ item: "keycard", name: "Red keycard", sets: "key.red" }, { item: "coin" }],
  triggers: [{ do: ["set:alarm"] }],
  terminals: { t1: { do: ["set:code_read"] } },
  doors: [{ lock: { key: "key.blue" } }, { lock: {} }, {}],
  props: [
    { prop: "crate1", cell: { x: 1, y: 1 }, loot: [{ item: "rusty_key" }, { item: "scrap" }], lock: { key: "key.red" } },
    { prop: "crate1", cell: { x: 2, y: 1 }, lock: { key: "key.vault" } },
    { prop: "lever1", cell: { x: 3, y: 1 }, lock: {} },
  ],
};
assert.deepEqual(keyChoices(world).map((k) => [k.flag, k.from]), [
  ["key.red", "item"], ["alarm", "action"], ["code_read", "action"],
  ["key.rusty_key", "contents"], ["key.scrap", "contents"],
  ["key.blue", "door"], ["key.vault", "lock"],
], "marked items, story flags, items in containers, a door's key, another lock's key - each flag once");
assert.equal(keyChoices(world)[0].name, "Red keycard");
assert.deepEqual([...keySources(world)].sort(), ["alarm", "code_read", "key.coin", "key.keycard", "key.red", "key.rusty_key", "key.scrap"].sort());
assert.equal(suggestKeyFlag("chest1", { x: 3, y: 4 }, []), "key.chest1_3_4");
assert.equal(suggestKeyFlag("Big Chest", { x: 3, y: 4 }, ["key.big_chest_3_4", "key.big_chest_3_4_2"]), "key.big_chest_3_4_3", "one nobody uses yet");
assert.equal(suggestKeyFlag("%%", { x: 0, y: 0 }, []), "key.lock_0_0");

// ---- the problem list: no key, a key nobody gives, a prop that cannot be locked
assert.deepEqual(propLockProblems(world), [
  { code: "lockKeyNobody", cell: { x: 2, y: 1 }, params: { id: "key.vault" } },
  { code: "lockNoKey", cell: { x: 3, y: 1 } },
]);
assert.deepEqual(propLockProblems({ props: [{ prop: "torch1", cell: { x: 1, y: 1 }, lock: { key: "k" } }, { prop: "crate1", cell: { x: 1, y: 2 } }] }), [{ code: "lockNotLockable", cell: { x: 1, y: 1 }, params: { prop: "torch1" } }]);
assert.deepEqual(propLockProblems({ props: [{ prop: "crate1", cell: { x: 1, y: 1 }, lock: { key: "key.coin" } }], items: [{ item: "coin" }] }), [], "a key.<item> of an item lying on the map is given");
assert.deepEqual(propLockProblems({}), []);

// ---- the map file: the block reaches the parsed map, old maps parse as before
const file = (): MapFile =>
  ({
    name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
    layout: ["WWWWWWWW", "W..D...W", "W......W", "WWWWWWWW"],
    props: [
      { prop: "crate1", x: 1, y: 2, at: "center", lock: { key: "key.red", message: "Padlocked.", consumeKey: true, junk: 1 } },
      { prop: "lever1", x: 1, y: 1, at: "N", lock: { key: "key.red" } },
      { prop: "crate1", x: 4, y: 2, at: "center", lock: "yes" },
      { prop: "crate1", x: 5, y: 2, at: "center" },
    ],
    items: [{ item: "scrap", x: 2, y: 2, name: "Red keycard", sets: "key.red" }],
  }) as unknown as MapFile;
const map = parseMap("t", file());
assert.deepEqual(map.props![0].lock, { key: "key.red", message: "Padlocked.", consumeKey: true });
assert.deepEqual(map.props![1].lock, { key: "key.red" });
assert.equal(map.props![2].lock, undefined, "junk is no lock");
assert.equal(map.props![3].lock, undefined);
assert.equal(JSON.stringify(map.props![3]).includes("lock"), false, "an unlocked prop carries nothing of it");
assert.deepEqual(propLockProblems(map), [], "the parsed map: its key is given by the keycard");
assert.deepEqual(keyChoices(map).map((k) => k.flag), ["key.red"]);
// a locked prop in the file is as the editor left it: only the lock block is there
assert.deepEqual(file().props![0].lock, { key: "key.red", message: "Padlocked.", consumeKey: true, junk: 1 } as never, "(the file itself is untouched by parsing)");

console.log("propLocks: ok");

