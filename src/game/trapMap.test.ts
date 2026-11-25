// Run: npx tsx src/game/trapMap.test.ts
// The map file side of the fire / poison / spawn traps: parsing and cleaning `active`, `harm`, `dormant` and the new targets,
// the actors and items that wait for a trigger, and the editor's edits that keep the targets right.
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
const { ACTOR_TYPES, createActors, spawnActors } = await import("./actors");
const { operableProblems, operate, initialOperableState } = await import("./operables");
const { addTarget, areaTarget, fixTargetsBeforeRemove, linkTargetFor, operableInfo, removeTarget, updateTarget } = await import("../editor/operableEdits");
const { removeActor, removeItem, removeSmoke, updateActor, updateItem, updateSmoke } = await import("../editor/mapEdits");

const robot = Object.keys(ACTOR_TYPES)[0];
const file = (): MapFile =>
  ({
    name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
    layout: ["WWWWWWWW", "W......W", "W......W", "W......W", "WWWWWWWW"],
    smokes: [
      { x: 2, y: 3, pos: [0, 0.5, 0], fire: true, active: false },
      { x: 5, y: 3, pos: [0, 0.5, 0], effect: "smoke", color: "#6fd23c", harm: { damage: 2.4, every: 0.1, reach: 7, label: " chokes ", junk: 1 } },
      { x: 5, y: 3, pos: [0, 0.5, 0], harm: { damage: 0 } },
      { x: 6, y: 3, pos: [0, 0.5, 0], active: true },
    ],
    actors: [
      { actor: robot, x: 3, y: 1, patrol: [] },
      { actor: robot, x: 6, y: 1, dormant: true },
      { actor: robot, x: 6, y: 1, dormant: true, friendly: true },
      { actor: robot, x: 6, y: 2, dormant: false },
    ],
    items: [{ item: "medkit", x: 2, y: 2, dormant: true }, { item: "medkit", x: 3, y: 2, dormant: false }, { item: "medkit", x: 4, y: 2 }],
    props: [
      { prop: "lever1", x: 1, y: 1, at: "N", operable: { targets: [
        { kind: "emitter", x: 2, y: 3 }, { kind: "emitter", area: { x0: 5, y0: 3, x1: 6, y1: 3 }, action: "toggle" },
        { kind: "spawn", x: 6, y: 1, index: 1 }, { kind: "item", x: 2, y: 2 },
        { kind: "reward", credits: 50, items: [{ item: "medkit", qty: 2 }] }, { kind: "emitter" }, { kind: "reward" },
      ] } },
    ],
  }) as unknown as MapFile;

// ---- parsing: what is written is read back, junk is dropped, the rest of a map is as before
const map = parseMap("t", file());
assert.equal(map.smokes![0].active, false);
assert.equal(map.smokes![1].active, undefined, "active is the default: nothing kept");
assert.equal(map.smokes![3].active, undefined, "`active: true` is the default too");
assert.deepEqual(map.smokes![1].harm, { damage: 2, every: 0.25, reach: 3, label: "chokes" });
assert.equal(map.smokes![2].harm, undefined, "no damage: no harm");
assert.equal(map.smokes![0].fire, true, "(an inactive fire is still a fire)");
assert.deepEqual(map.actors!.map((a) => a.dormant), [undefined, true, true, undefined]);
assert.deepEqual(map.items!.map((i) => i.dormant), [true, undefined, undefined]);
assert.deepEqual(map.props![0].operable!.targets, [
  { kind: "emitter", x: 2, y: 3 }, { kind: "emitter", area: { x0: 5, y0: 3, x1: 6, y1: 3 }, action: "toggle" },
  { kind: "spawn", x: 6, y: 1, index: 1 }, { kind: "item", x: 2, y: 2 },
  { kind: "reward", credits: 50, items: [{ item: "medkit", qty: 2 }] },
], "the two junk targets are dropped");
const plain = parseMap("p", { ...file(), smokes: [{ x: 2, y: 3, pos: [0, 0.5, 0], fire: true }], actors: [{ actor: robot, x: 3, y: 1 }], items: [{ item: "medkit", x: 2, y: 2 }], props: [] } as unknown as MapFile);
for (const [name, entry] of [["smoke", plain.smokes![0]], ["actor", plain.actors![0]], ["item", plain.items![0]]] as const) {
  const json = JSON.stringify(entry);
  assert.ok(!json.includes("dormant") && !json.includes("active") && !json.includes("harm"), `${name}: an old map keeps nothing of it`);
}
// (the structure key does not change with them: no scene rebuild)
assert.equal(parseMap("t", file()).structureKey, parseMap("t", { ...file(), smokes: [], actors: [], items: [] } as unknown as MapFile).structureKey, "smokes, actors and items are not in the structure");

// ---- dormant NPCs: not in the world until spawned; the editor shows them (as ghosts)
{
  const now = 1000;
  const world = createActors(map, now);
  assert.deepEqual(world.map((a) => a.id), [0, 3], "the dormant ones are left out");
  assert.ok(world.every((a) => !a.ghost));
  const editor = createActors(map, now, 0, true);
  assert.deepEqual(editor.map((a) => [a.id, !!a.ghost]), [[0, false], [1, true], [2, true], [3, false]], "the map editor shows them all, the dormant ones faded");
  const spawned = spawnActors(map, [2, 1], now, 0);
  assert.deepEqual(spawned.map((a) => a.id), [2, 1], "each with its own index as its id (the killed-wreck bookkeeping works by it)");
  assert.deepEqual([spawned[0].cell, spawned[0].hp > 0, spawned[0].diedAt, spawned[0].friendly], [{ x: 6, y: 1 }, true, null, true], "friendly ones spawn too, as they are");
  assert.equal(spawned[1].dormant, false, "on guard (the word `dormant` of an actor's state is the powered-down one)");
  assert.deepEqual(spawnActors(map, [9], now), [], "no such actor");
  // an explicit wake level still holds a spawned one back; the ship's stance does not
  const waiting = parseMap("w", { ...file(), actors: [{ actor: robot, x: 6, y: 1, dormant: true, wake: { level: 2, mode: "dormant" } }] } as unknown as MapFile);
  assert.equal(spawnActors(waiting, [0], now, 0)[0].dormant, true);
  assert.equal(spawnActors(waiting, [0], now, 2)[0].dormant, false);
  const arrive = parseMap("a", { ...file(), actors: [{ actor: robot, x: 6, y: 1, dormant: true, wake: { level: 3, mode: "arrive" } }] } as unknown as MapFile);
  assert.equal(spawnActors(arrive, [0], now, 0).length, 1, "a spawn trigger brings it in at once whatever its reinforcement wake says");
}

// ---- the whole chain from a parsed map: a lever -> effects
{
  const step = operate(map, initialOperableState(), "lever1@1,1:N", { now: 0, party: null, doorOpen: () => false });
  const kinds = step.effects.map((e) => e.type);
  assert.deepEqual(kinds, ["changed", "emitters", "emitters", "spawn", "reveal", "reward"]);
  const spawn = step.effects.find((e) => e.type === "spawn");
  assert.deepEqual(spawn && spawn.type === "spawn" && spawn.actors, [2], "the second dormant NPC of the cell, in the played map's numbering");
  assert.deepEqual(operableProblems(map).map((p) => p.code), ["operableDormantUnused"], "the first dormant guard is never triggered");
}

// ---- the editor: links by a click, removing things keeps the targets right
{
  const m = parseMap("t", file());
  assert.deepEqual(linkTargetFor(m, { cell: { x: 2, y: 3 }, smoke: 0 }), { kind: "emitter", x: 2, y: 3 });
  assert.deepEqual(linkTargetFor(m, { cell: { x: 5, y: 3 }, smoke: 2 }), { kind: "emitter", x: 5, y: 3, index: 1 }, "two in a cell: the second is told apart by its place");
  assert.deepEqual(linkTargetFor(m, { cell: { x: 6, y: 1 }, actor: 2 }), { kind: "spawn", x: 6, y: 1, index: 1 });
  assert.equal(linkTargetFor(m, { cell: { x: 3, y: 1 }, actor: 0 }), undefined, "an NPC that is not dormant is no target");
  assert.deepEqual(linkTargetFor(m, { cell: { x: 2, y: 2 }, item: 0 }), { kind: "item", x: 2, y: 2 });
  assert.equal(linkTargetFor(m, { cell: { x: 3, y: 2 }, item: 1 }), undefined, "nor an item that is not dormant");
  assert.deepEqual(areaTarget("emitter", { x0: 1, y0: 1, x1: 3, y1: 2 }), { kind: "emitter", area: { x0: 1, y0: 1, x1: 3, y1: 2 } });
}
{
  const f = file();
  const ref = { from: "prop", index: 0 } as const;
  const before = f.props![0].operable!.targets!.length;
  addTarget(f, ref, { kind: "emitter", x: 2, y: 3 });
  assert.equal(f.props![0].operable!.targets!.length, before, "the same address twice: once");
  addTarget(f, ref, { kind: "emitter", x: 2, y: 3, index: 1 });
  addTarget(f, ref, { kind: "emitter", id: "x" });
  addTarget(f, ref, areaTarget("item", { x0: 1, y0: 1, x1: 2, y1: 2 }));
  addTarget(f, ref, areaTarget("item", { x0: 1, y0: 1, x1: 2, y1: 2 }));
  assert.equal(f.props![0].operable!.targets!.length, before + 3);
  addTarget(f, ref, { kind: "reward", credits: 50 });
  addTarget(f, ref, { kind: "reward", credits: 50 });
  assert.equal(f.props![0].operable!.targets!.length, before + 5, "two equal rewards are two rewards");
  const rewardAt = f.props![0].operable!.targets!.findIndex((t) => t.kind === "reward");
  updateTarget(f, ref, rewardAt, { credits: 80, once: false });
  assert.deepEqual(f.props![0].operable!.targets![rewardAt], { kind: "reward", credits: 80, items: [{ item: "medkit", qty: 2 }], once: false });
  updateTarget(f, ref, 1, { action: "off" });
  assert.equal((f.props![0].operable!.targets![1] as { action?: string }).action, "off");
  removeTarget(f, ref, 0);
  assert.equal(f.props![0].operable!.targets![0].kind, "emitter");
  // the panel flags the ones that address nothing
  const info = operableInfo(f.props![0] as never, 0, parseMap("t", f));
  const second = f.props![0].operable!.targets!.findIndex((t) => t.kind === "emitter" && t.x === 2 && t.index === 1);
  assert.ok(second >= 0 && info!.missing!.includes(second), "(2,3 index 1: only one emitter there)");
  assert.ok(!info!.missing!.includes(second - 1) || second - 1 < 0, "(the others find their place)");
}
{
  // deleting what a target names by its place: the one that pointed at it goes, the later ones move up
  const f = {
    ...file(),
    smokes: [{ x: 5, y: 3, pos: [0, 0.5, 0] }, { x: 5, y: 3, pos: [0, 0.5, 0] }, { x: 5, y: 3, pos: [0, 0.5, 0] }, { x: 2, y: 2, pos: [0, 0.5, 0] }],
    props: [{ prop: "lever1", x: 1, y: 1, at: "N", operable: { targets: [
      { kind: "emitter", x: 5, y: 3 }, { kind: "emitter", x: 5, y: 3, index: 0 }, { kind: "emitter", x: 5, y: 3, index: 1 }, { kind: "emitter", x: 5, y: 3, index: 2 },
      { kind: "emitter", id: "q" }, { kind: "emitter", x: 2, y: 2, index: 0 }, { kind: "spawn", x: 6, y: 1, index: 1 },
    ] } }],
  } as unknown as MapFile;
  removeSmoke(f, 1);
  assert.deepEqual(f.props![0].operable!.targets, [
    { kind: "emitter", x: 5, y: 3 }, { kind: "emitter", x: 5, y: 3, index: 0 }, { kind: "emitter", x: 5, y: 3, index: 1 },
    { kind: "emitter", id: "q" }, { kind: "emitter", x: 2, y: 2, index: 0 }, { kind: "spawn", x: 6, y: 1, index: 1 },
  ], "the second of the three (index 1) is gone: its target is dropped, the third (index 2) became index 1");
  assert.equal(f.smokes!.length, 3);
  removeSmoke(f, 0);
  removeSmoke(f, 0);
  assert.equal(f.smokes!.length, 1);
  // (nothing is left at 5,3: the target by cell alone is still there, and shows up as a problem)
  assert.ok(f.props![0].operable!.targets!.some((t) => t.kind === "emitter" && t.x === 5 && t.index === undefined));
  assert.ok(operableProblems(parseMap("t", f)).some((p) => p.code === "operableEmitterMissing"), "a target left pointing at nothing is flagged");
}
{
  // actors and items the same way; an area or an id is left alone
  const f = file();
  const spawnTarget = () => f.props![0].operable!.targets!.find((t) => t.kind === "spawn");
  removeActor(f, 1);
  assert.deepEqual(spawnTarget(), { kind: "spawn", x: 6, y: 1, index: 0 }, "the first of the cell went: the lever's second became its first");
  removeActor(f, 1);
  assert.equal(spawnTarget(), undefined, "the NPC the lever named is gone: so is the target");
}
{
  const f = file();
  removeItem(f, 0);
  assert.equal(f.props![0].operable!.targets!.some((t) => t.kind === "item"), true, "named by cell alone: it stays (and is flagged as pointing at nothing)");
  const g = file();
  fixTargetsBeforeRemove(g, "emitter", 99);
  assert.deepEqual(g, file(), "nothing to remove: nothing changes");
}
{
  // editing the flags: dormant / active are patches like the others
  const f = file();
  updateActor(f, 0, { dormant: true });
  assert.equal(f.actors![0].dormant, true);
  updateActor(f, 0, { dormant: undefined });
  assert.equal("dormant" in f.actors![0], false);
  updateItem(f, 2, { dormant: true });
  assert.equal(f.items![2].dormant, true);
  updateSmoke(f, 3, { active: false, harm: { damage: 3 } });
  assert.deepEqual([f.smokes![3].active, f.smokes![3].harm], [false, { damage: 3 }]);
  updateSmoke(f, 3, { active: undefined, harm: undefined });
  assert.equal("active" in f.smokes![3] || "harm" in f.smokes![3], false);
  // (and it all survives being written out and read again)
  const again = parseMap("t", JSON.parse(JSON.stringify(file())) as MapFile);
  assert.deepEqual(again.smokes!.map((s) => [s.active, s.harm?.damage]), map.smokes!.map((s) => [s.active, s.harm?.damage]));
}

console.log("trapMap: ok");
