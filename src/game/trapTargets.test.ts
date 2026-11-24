// Run: npx tsx src/game/trapTargets.test.ts
// The fire / poison / spawn targets of the operable props (see operables.ts): parsing, the state machine, problems, links.
import assert from "node:assert/strict";
import {
  evaluatePlates, initialOperableState, operableLinks, operableProblems, operate, readOperable, readTarget, relocateOperable, restoreFromFlags,
  rewardKey, tick,
  type OperableContext, type OperableEffect, type OperableMap, type OperableSpec, type OperableState,
} from "./operables";

// a 9x5 map: walls round the edge, a door at (4,1); fires at (2,3) (two there), (6,3) and (7,3) (inactive); a dormant guard at (6,1),
// a dormant (and a plain) item at (7,1)
const rows = ["WWWWWWWWW", "W...D...W", "W.......W", "W.......W", "WWWWWWWWW"];
const cells = rows.map((r) => r.split("").map((c) => (c === "W" ? "wall" : c === "D" ? "door" : "floor") as "wall" | "door" | "floor"));
const at = (x: number, y: number) => ({ x, y });
const prop = (name: string, x: number, y: number, side: string, operable?: OperableSpec) => ({ prop: name, cell: at(x, y), at: side, operable });
const smokes = [
  { cell: at(2, 3), id: "fireA" },
  { cell: at(2, 3), active: false },
  { cell: at(6, 3), active: false, id: "gas" },
  { cell: at(7, 3), active: false, id: "gas" },
];
const actors = [{ cell: at(1, 1) }, { cell: at(6, 1), dormant: true }, { cell: at(6, 1), dormant: true, id: "twin" }];
const items = [{ cell: at(7, 1), dormant: true }, { cell: at(7, 1) }, { cell: at(5, 1), dormant: true, id: "chest" }];
const mapOf = (props: OperableMap["props"], extra: Partial<OperableMap> = {}): OperableMap => ({ width: 9, height: 5, cells, props, smokes, actors, items, ...extra });
const ctx = (now = 0, party: { x: number; y: number } | null = null, over: Partial<OperableContext> = {}): OperableContext => ({ now, party, doorOpen: () => false, ...over });
const lever = (targets: unknown[], extra: Record<string, unknown> = {}) => readOperable({ targets, ...extra })!;
const leverMap = (spec: OperableSpec) => mapOf([prop("lever1", 1, 1, "N", spec)]);
const KEY = "lever1@1,1:N";

const emitters = (effects: OperableEffect[]) => effects.flatMap((e) => (e.type === "emitters" ? [`${e.on ? "+" : "-"}${e.keys.join("|")}`] : []));
const of = <T extends OperableEffect["type"]>(effects: OperableEffect[], type: T) => effects.filter((e) => e.type === type) as Extract<OperableEffect, { type: T }>[];

// ---- reading targets from a map file
assert.deepEqual(readTarget({ kind: "emitter", x: 2, y: 3 }), { kind: "emitter", x: 2, y: 3 });
assert.deepEqual(readTarget({ kind: "emitter", x: 2, y: 3, index: 1, action: "toggle" }), { kind: "emitter", x: 2, y: 3, index: 1, action: "toggle" });
assert.deepEqual(readTarget({ kind: "emitter", x: 2, y: 3, action: "on" }), { kind: "emitter", x: 2, y: 3 }, "on is the default: left out");
assert.deepEqual(readTarget({ kind: "emitter", x: 2, y: 3, action: "bogus" }), { kind: "emitter", x: 2, y: 3 });
assert.deepEqual(readTarget({ kind: "emitter", area: { x0: 3, y0: 3, x1: 1, y1: 2 }, action: "off" }), { kind: "emitter", area: { x0: 1, y0: 2, x1: 3, y1: 3 }, action: "off" });
assert.deepEqual(readTarget({ kind: "emitter", id: "gas" }), { kind: "emitter", id: "gas" });
assert.equal(readTarget({ kind: "emitter" }), undefined, "no address");
assert.equal(readTarget({ kind: "emitter", x: 2 }), undefined);
assert.deepEqual(readTarget({ kind: "spawn", x: 6, y: 1 }), { kind: "spawn", x: 6, y: 1 });
assert.deepEqual(readTarget({ kind: "spawn", x: 6, y: 1, index: 1, action: "toggle" }), { kind: "spawn", x: 6, y: 1, index: 1 }, "a spawn has no action");
assert.deepEqual(readTarget({ kind: "item", area: { x0: 1, y0: 1, x1: 2, y1: 2 } }), { kind: "item", area: { x0: 1, y0: 1, x1: 2, y1: 2 } });
assert.deepEqual(readTarget({ kind: "reward", credits: 50 }), { kind: "reward", credits: 50 });
assert.deepEqual(readTarget({ kind: "reward", credits: 49.6, items: [{ item: "medkit", qty: 2 }, { item: "", qty: 1 }, { item: "x", qty: 0 }, { item: "y" }, null], once: false }), { kind: "reward", credits: 50, items: [{ item: "medkit", qty: 2 }, { item: "x", qty: 1 }], once: false }, "an unnamed item, one without a quantity and null are dropped; a quantity is at least 1");
assert.deepEqual(readTarget({ kind: "reward", items: [{ item: "medkit", qty: 1000 }], once: true }), { kind: "reward", items: [{ item: "medkit", qty: 999 }] }, "once is the default: left out");
assert.equal(readTarget({ kind: "reward" }), undefined, "an empty reward is nothing");
assert.equal(readTarget({ kind: "reward", credits: 0 }), undefined);
assert.equal(readTarget({ kind: "reward", credits: -5, items: [] }), undefined);
// (round trip: what is written reads back the same)
{
  const targets = [
    { kind: "door", x: 4, y: 1 }, { kind: "emitter", x: 2, y: 3, index: 0, action: "toggle" }, { kind: "emitter", area: { x0: 1, y0: 1, x1: 3, y1: 3 } },
    { kind: "spawn", id: "twin" }, { kind: "item", x: 7, y: 1 }, { kind: "reward", credits: 10, items: [{ item: "medkit", qty: 1 }], once: false },
  ];
  assert.deepEqual(readOperable({ targets })!.targets, targets);
  assert.deepEqual(readOperable(JSON.parse(JSON.stringify({ targets })))!.targets, targets);
}

// ---- emitters: on / off / toggle through a lever
{
  const map = leverMap(lever([{ kind: "emitter", x: 6, y: 3 }]));
  let step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(step.effects), ["+6,3"], "pulled: the inactive emitter goes on");
  assert.equal(step.state.emit["6,3"], true);
  step = operate(map, step.state, KEY, ctx());
  assert.deepEqual(emitters(step.effects), ["-6,3"], "pushed back: it goes off again (a lever holds)");
  assert.equal(step.state.emit["6,3"], false);
}
{
  // only what really changes is reported: an emitter that is on already is not "switched on"
  const map = leverMap(lever([{ kind: "emitter", x: 2, y: 3 }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(step.effects), ["+2,3#2"], "(2,3): the first is on already, only the second changes");
  assert.equal(of(step.effects, "blocked").length, 0);
}
{
  // an index picks one of several in a cell
  const map = leverMap(lever([{ kind: "emitter", x: 2, y: 3, index: 0, action: "off" }, { kind: "emitter", x: 2, y: 3, index: 1 }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(step.effects), ["-2,3", "+2,3#2"]);
  const back = operate(map, step.state, KEY, ctx());
  assert.deepEqual(emitters(back.effects), ["+2,3", "-2,3#2"], "the inverse follows when the lever goes back");
}
{
  // toggle flips each emitter on its own; its inverse is a toggle again
  const map = leverMap(lever([{ kind: "emitter", x: 2, y: 3, action: "toggle" }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(step.effects), ["+2,3#2", "-2,3"], "one was on, one off: each flips (the ones turned on are told first)");
  const back = operate(map, step.state, KEY, ctx());
  assert.deepEqual(emitters(back.effects), ["+2,3", "-2,3#2"]);
}
{
  // by id, and by area: "a fire on every tile of a room"
  const byId = operate(leverMap(lever([{ kind: "emitter", id: "gas" }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(byId.effects), ["+6,3|7,3"], "both emitters named gas");
  const area = operate(leverMap(lever([{ kind: "emitter", area: { x0: 5, y0: 2, x1: 8, y1: 3 } }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(area.effects), ["+6,3|7,3"], "everything in the block (the others are outside)");
  const wide = operate(leverMap(lever([{ kind: "emitter", area: { x0: 1, y0: 1, x1: 7, y1: 3 } }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(emitters(wide.effects), ["+2,3#2|6,3|7,3"], "(the one that is on already is not reported)");
}
{
  // no emitter there: a blocked effect (and nothing else)
  const step = operate(leverMap(lever([{ kind: "emitter", x: 3, y: 1 }, { kind: "emitter", area: { x0: 1, y0: 1, x1: 2, y1: 1 } }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(of(step.effects, "blocked").map((e) => e.reason), ["noEmitter", "noEmitter"]);
  assert.equal(emitters(step.effects).length, 0);
}

// ---- emitters: plates and trap cells
{
  const plate = mapOf([prop("plate1", 3, 2, "center", lever([{ kind: "emitter", x: 6, y: 3 }]))]);
  let s: OperableState = initialOperableState();
  let step = evaluatePlates(plate, s, ctx(0, at(3, 2)));
  assert.deepEqual(emitters(step.effects), ["+6,3"], "stood on: the fire jets on");
  s = step.state;
  step = evaluatePlates(plate, s, ctx(1, at(3, 2)));
  assert.equal(step.effects.length, 0, "standing there: nothing new");
  step = evaluatePlates(plate, s, ctx(2, at(1, 2)));
  assert.deepEqual(emitters(step.effects), ["-6,3"], "stepped off: it goes off (a plate holds)");
  // latched
  const latch = mapOf([prop("plate1", 3, 2, "center", lever([{ kind: "emitter", x: 6, y: 3 }], { hold: false }))]);
  step = evaluatePlates(latch, initialOperableState(), ctx(0, at(3, 2)));
  assert.deepEqual(emitters(step.effects), ["+6,3"]);
  step = evaluatePlates(latch, step.state, ctx(1, null));
  assert.equal(emitters(step.effects).length, 0, "a latched plate leaves it on");
  assert.equal(step.state.emit["6,3"], true);
}
{
  const trap = mapOf([prop("trapcell1", 3, 2, "center", lever([{ kind: "emitter", area: { x0: 6, y0: 3, x1: 7, y1: 3 } }]))]);
  let step = evaluatePlates(trap, initialOperableState(), ctx(0, at(3, 2)));
  assert.deepEqual(emitters(step.effects), ["+6,3|7,3"], "a trap cell lights the fires");
  step = evaluatePlates(trap, step.state, ctx(1, at(0, 0)));
  assert.equal(emitters(step.effects).length, 0, "stepping off does not put them out: it is a trap");
  assert.equal(step.state.emit["7,3"], true);
}
{
  // a momentary button springs back and takes the fire with it
  const map = mapOf([prop("button1", 1, 1, "N", lever([{ kind: "emitter", x: 6, y: 3 }], { mode: "momentary", delay: 4 }))]);
  const pressed = operate(map, initialOperableState(), "button1@1,1:N", ctx(1000));
  assert.deepEqual(emitters(pressed.effects), ["+6,3"]);
  const sprung = tick(map, pressed.state, ctx(5000));
  assert.deepEqual(emitters(sprung.effects), ["-6,3"]);
}

// ---- spawn: dormant NPCs come in, once
{
  const map = leverMap(lever([{ kind: "spawn", x: 6, y: 1 }]));
  let step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(of(step.effects, "spawn")[0].actors, [1, 2], "both dormant guards of the cell");
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "spawn").length, 0, "pushed back: nobody goes away");
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "spawn").length, 0, "pulled again: they are in already");
  assert.equal(of(step.effects, "blocked").length, 0);
}
{
  const one = operate(leverMap(lever([{ kind: "spawn", x: 6, y: 1, index: 1 }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(of(one.effects, "spawn")[0].actors, [2], "the second of the cell");
  const byId = operate(leverMap(lever([{ kind: "spawn", id: "twin" }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(of(byId.effects, "spawn")[0].actors, [2]);
  const area = operate(leverMap(lever([{ kind: "spawn", area: { x0: 0, y0: 0, x1: 8, y1: 2 } }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(of(area.effects, "spawn")[0].actors, [1, 2], "in an area: the dormant ones only (the guard at 1,1 stands there already)");
  const plain = operate(leverMap(lever([{ kind: "spawn", x: 1, y: 1 }])), initialOperableState(), KEY, ctx());
  assert.equal(of(plain.effects, "spawn").length, 0);
  assert.deepEqual(of(plain.effects, "blocked").map((e) => e.reason), ["noSpawn"], "an NPC that is not dormant is no spawn target");
  // (a plate that is stepped on twice spawns once)
  const plate = mapOf([prop("plate1", 3, 2, "center", lever([{ kind: "spawn", x: 6, y: 1 }]))]);
  let s = evaluatePlates(plate, initialOperableState(), ctx(0, at(3, 2)));
  assert.equal(of(s.effects, "spawn").length, 1);
  s = evaluatePlates(plate, s.state, ctx(1, at(0, 0)));
  s = evaluatePlates(plate, s.state, ctx(2, at(3, 2)));
  assert.equal(of(s.effects, "spawn").length, 0, "stepping on it again brings nobody new");
}

// ---- item reveal
{
  const map = leverMap(lever([{ kind: "item", x: 7, y: 1 }, { kind: "item", id: "chest" }]));
  let step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(of(step.effects, "reveal").map((e) => e.items), [[0], [2]], "the dormant item of the cell (not the plain one next to it) and the chest");
  step = operate(map, step.state, KEY, ctx());
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "reveal").length, 0, "revealed once");
  const plain = operate(leverMap(lever([{ kind: "item", x: 3, y: 3 }])), initialOperableState(), KEY, ctx());
  assert.deepEqual(of(plain.effects, "blocked").map((e) => e.reason), ["noItem"]);
}

// ---- rewards
{
  const spec = lever([{ kind: "reward", credits: 50 }, { kind: "reward", items: [{ item: "medkit", qty: 2 }] }]);
  const map = leverMap(spec);
  let step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(of(step.effects, "reward").map((e) => [e.key, e.credits, e.items]), [[rewardKey(KEY, 0), 50, []], [rewardKey(KEY, 1), 0, [{ item: "medkit", qty: 2 }]]]);
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "reward").length, 0, "pushed back: nothing");
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "reward").length, 0, "pulled again: it does not pay twice (once is the default)");
  // remembered for the run: a new deck visit (state reset) does not pay again
  const again = operate(map, initialOperableState(), KEY, ctx(0, null, { rewarded: (k) => k === rewardKey(KEY, 0) }));
  assert.deepEqual(of(again.effects, "reward").map((e) => e.key), [rewardKey(KEY, 1)], "the paid one is skipped");
}
{
  // once: false pays every time it goes on
  const map = leverMap(lever([{ kind: "reward", credits: 5, once: false }]));
  let step = operate(map, initialOperableState(), KEY, ctx());
  step = operate(map, step.state, KEY, ctx());
  step = operate(map, step.state, KEY, ctx());
  assert.equal(of(step.effects, "reward").length, 1, "the third pull (the second time it goes on) pays again");
  // ...unless the source says once
  const once = leverMap(lever([{ kind: "reward", credits: 5, once: false }], { once: true }));
  let s2 = operate(once, initialOperableState(), KEY, ctx());
  s2 = operate(once, s2.state, KEY, ctx());
  s2 = operate(once, s2.state, KEY, ctx());
  assert.equal(of(s2.effects, "reward").length, 0, "the source's `once` wins");
  // a trap cell pays when stepped on
  const cell = mapOf([prop("trapcell1", 3, 2, "center", lever([{ kind: "reward", credits: 7 }]))]);
  const hit = evaluatePlates(cell, initialOperableState(), ctx(0, at(3, 2)));
  assert.deepEqual(of(hit.effects, "reward").map((e) => e.credits), [7]);
}

// ---- a source may list several targets of any kind
{
  const map = leverMap(lever([{ kind: "door", x: 4, y: 1 }, { kind: "emitter", x: 6, y: 3 }, { kind: "spawn", x: 6, y: 1, index: 0 }, { kind: "item", x: 7, y: 1 }, { kind: "reward", credits: 1 }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(step.effects.map((e) => e.type), ["changed", "door", "emitters", "spawn", "reveal", "reward"]);
}

// ---- restoring a flagged lever: its emitters are on again (the deck is loaded anew), a paid reward is not paid again
{
  const map = leverMap(lever([{ kind: "emitter", x: 6, y: 3 }, { kind: "reward", credits: 9 }], { flag: "story.gas" }));
  const restored = restoreFromFlags(map, (f) => f === "story.gas", ctx(0, null, { rewarded: () => true }));
  assert.equal(restored.state.emit["6,3"], true);
  assert.equal(of(restored.effects, "reward").length, 0);
  assert.equal(restoreFromFlags(map, () => false, ctx()).state.emit["6,3"], undefined);
}

// ---- problems for the editor's list
{
  const codes = (map: OperableMap) => operableProblems(map).map((p) => p.code);
  assert.deepEqual(codes(leverMap(lever([{ kind: "emitter", x: 6, y: 3 }, { kind: "spawn", x: 6, y: 1 }, { kind: "item", x: 7, y: 1 }, { kind: "item", id: "chest" }, { kind: "emitter", id: "fireA" }]))), [
    "operableInactiveUnused", "operableInactiveUnused",
  ], "the inactive emitters at 2,3 (the second) and 7,3 have no switch (6,3 has, the guards and items are all named)");
  assert.deepEqual(codes(leverMap(lever([{ kind: "spawn", x: 6, y: 1, index: 0 }, { kind: "item", id: "chest" }, { kind: "emitter", id: "gas" }, { kind: "emitter", x: 2, y: 3 }]))), [
    "operableDormantUnused", "operableDormantUnused",
  ], "a dormant guard (the twin) and a dormant item (at 7,1) nothing triggers");
  const bad = operableProblems(leverMap(lever([{ kind: "emitter", x: 3, y: 3 }, { kind: "spawn", x: 1, y: 1 }, { kind: "item", x: 7, y: 3 }, { kind: "emitter", area: { x0: 0, y0: 0, x1: 1, y1: 1 } }])));
  assert.deepEqual(bad.filter((p) => p.code.endsWith("Missing")).map((p) => [p.code, p.params?.at]), [
    ["operableEmitterMissing", "3,3"], ["operableSpawnMissing", "1,1"], ["operableItemMissing", "7,3"], ["operableEmitterMissing", "0,0-1,1"],
  ], "targets that address nothing are told where");
  assert.ok(bad.every((p) => p.cell.x === 1 && p.cell.y === 1 || !p.code.endsWith("Missing")), "...at the source");
  // a map that uses none of it has none of it (old maps)
  assert.deepEqual(operableProblems({ width: 9, height: 5, cells, props: [prop("lever1", 1, 1, "N", { targets: [{ kind: "door", x: 4, y: 1 }] })] }), []);
  // a plain emitter / NPC / item with no switch is no problem
  assert.deepEqual(operableProblems(mapOf([], { smokes: [{ cell: at(1, 1) }], actors: [{ cell: at(1, 1) }], items: [{ cell: at(1, 1) }] })), []);
}

// ---- links for the minimap, and copying with an area
{
  const map = leverMap(lever([{ kind: "door", x: 4, y: 1 }, { kind: "emitter", id: "gas" }, { kind: "spawn", x: 6, y: 1, index: 0 }, { kind: "item", x: 7, y: 1 }, { kind: "reward", credits: 3 }]));
  assert.deepEqual(operableLinks(map).map((l) => `${l.kind}>${l.to.x},${l.to.y}`), ["door>4,1", "emitter>6,3", "emitter>7,3", "spawn>6,1", "item>7,1"], "a reward has no place to draw a line to");
  const moved = relocateOperable(lever([{ kind: "emitter", x: 6, y: 3 }, { kind: "emitter", area: { x0: 6, y0: 2, x1: 7, y1: 3 } }, { kind: "emitter", area: { x0: 1, y0: 1, x1: 7, y1: 3 } }, { kind: "spawn", id: "twin" }, { kind: "reward", credits: 2 }]), { x0: 5, y0: 1, x1: 8, y1: 3 }, 0, 10);
  assert.deepEqual(moved!.targets, [
    { kind: "emitter", x: 6, y: 13 },
    { kind: "emitter", area: { x0: 6, y0: 12, x1: 7, y1: 13 } },
    { kind: "emitter", area: { x0: 1, y0: 1, x1: 7, y1: 3 } },
    { kind: "spawn", id: "twin" },
    { kind: "reward", credits: 2 },
  ], "inside the copied block it moves with it; an area half outside stays; an id stays");
}

console.log("trapTargets: ok");
