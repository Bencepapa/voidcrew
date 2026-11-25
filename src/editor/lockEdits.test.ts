// Run: npx tsx src/editor/lockEdits.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "../game/mapFormat";

// (the game's modules read Vite's import.meta.glob / env: a stand-in is put in their place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("../game/mapFormat");
const { propLockInfo, setPropLock } = await import("./lockEdits");
const { removePropIndex } = await import("./mapEdits");
const { collectArea, pasteArea } = await import("./areaClipboard");
const { validateMap } = await import("./validate");

const file = (): MapFile =>
  ({
    name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
    layout: ["WWWWWWWWWW", "W..D.....W", "W........W", "W........W", "WWWWWWWWWW"],
    props: [{ prop: "crate1", x: 2, y: 2, at: "center" }, { prop: "lever1", x: 1, y: 1, at: "N" }, { prop: "plate1", x: 4, y: 2, at: "NE" }, { prop: "torch1", x: 5, y: 1, at: "N" }],
    items: [{ item: "scrap", x: 3, y: 3, name: "Red keycard", sets: "key.red" }],
  }) as unknown as MapFile;

// ---- setting, changing and taking off a lock
{
  const f = file();
  setPropLock(f, 0, {});
  assert.deepEqual(f.props![0].lock, {}, "locked, with no key yet");
  setPropLock(f, 0, { key: "key.red", message: "Padlocked." });
  setPropLock(f, 0, { consumeKey: true });
  assert.deepEqual(f.props![0].lock, { key: "key.red", message: "Padlocked.", consumeKey: true });
  setPropLock(f, 0, { message: undefined, consumeKey: false });
  assert.deepEqual(f.props![0].lock, { key: "key.red" });
  setPropLock(f, 0, null);
  assert.equal("lock" in f.props![0], false, "taken off: nothing of it in the file");
  // a lever too; what cannot be locked stays as it is
  setPropLock(f, 1, { key: "key.red" });
  assert.deepEqual(f.props![1].lock, { key: "key.red" });
  setPropLock(f, 2, { key: "key.red" });
  setPropLock(f, 3, { key: "key.red" });
  assert.equal("lock" in f.props![2] || "lock" in f.props![3], false, "a plate and a torch have no lock");
  assert.equal(setPropLock(f, 9, {}), f, "no such prop: nothing happens");
  parseMap("t", f);
}

// ---- deleting the prop takes its lock with it
{
  const f = file();
  setPropLock(f, 0, { key: "key.red" });
  removePropIndex(f, 0);
  assert.ok(!JSON.stringify(f.props).includes("key.red"));
}

// ---- copy and paste keep the lock, each copy its own
{
  const f = file();
  setPropLock(f, 0, { key: "key.red", consumeKey: true });
  const clip = collectArea(f, { x0: 2, y0: 2, x1: 2, y1: 2 })!;
  pasteArea(f, clip, { x: 6, y: 2 });
  const copies = f.props!.filter((p) => p.prop === "crate1");
  assert.equal(copies.length, 2);
  assert.deepEqual(copies.map((p) => p.lock), [{ key: "key.red", consumeKey: true }, { key: "key.red", consumeKey: true }]);
  assert.notEqual(copies[0].lock, copies[1].lock, "separate objects: editing one leaves the other");
  setPropLock(f, f.props!.indexOf(copies[1]), { message: "Mine." });
  assert.equal(copies[0].lock!.message, undefined);
  parseMap("t", f);
}

// ---- what the panel shows
{
  const f = file();
  setPropLock(f, 0, { key: "key.blue" });
  const map = parseMap("t", f);
  const info = propLockInfo(map, map.props![0])!;
  assert.deepEqual(info.lock, { key: "key.blue" });
  assert.equal(info.nobody, true, "nothing raises key.blue");
  assert.deepEqual(info.keys.map((k) => k.flag), ["key.red", "key.blue"], "the marked item, and the key the lock uses (it is listed too)");
  assert.equal(info.suggested, "key.crate1_2_2");
  const lever = propLockInfo(map, map.props![1])!;
  assert.equal(lever.lock, undefined);
  assert.equal(lever.nobody, false);
  assert.equal(propLockInfo(map, map.props![2]), undefined, "a plate: no lock block");
  assert.equal(propLockInfo(map, map.props![3]), undefined, "a torch: none either");
  setPropLock(f, 0, { key: "key.red" });
  const ok = parseMap("t", f);
  assert.equal(propLockInfo(ok, ok.props![0])!.nobody, false);
}

// ---- the Problems panel: a key nobody gives, no key at all
{
  const f = file();
  setPropLock(f, 0, { key: "key.blue" });
  setPropLock(f, 1, {});
  const problems = validateMap(parseMap("t", f)).filter((p) => p.code.startsWith("lock"));
  assert.deepEqual(problems.map((p) => [p.code, p.severity, p.cell, p.params]), [
    ["lockKeyNobody", "warning", { x: 2, y: 2 }, { id: "key.blue" }],
    ["lockNoKey", "warning", { x: 1, y: 1 }, undefined],
  ]);
  setPropLock(f, 0, { key: "key.red" });
  setPropLock(f, 1, { key: "key.red" });
  assert.deepEqual(validateMap(parseMap("t", f)).filter((p) => p.code.startsWith("lock")), [], "both keyed to the keycard on the map");
}

console.log("lockEdits: ok");
