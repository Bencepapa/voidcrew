// Run: npx tsx src/game/operables.test.ts
import assert from "node:assert/strict";
import {
  doorBlocked, emittersAt, evaluatePlates, facingOf, initialOperableState, operableLinks, operableProblems, operableSources, operate,
  pickVictim, readOperable, relocateOperable, restoreFromFlags, sourceKeys, tick, traceLine,
  type OperableContext, type OperableEffect, type OperableMap, type OperableSpec, type OperableState,
} from "./operables";

// a 9x5 map: walls round the edge, a door at (4,1) and (6,3), a corridor along y=3
const rows = [
  "WWWWWWWWW",
  "W...D...W",
  "W.......W",
  "W.....D.W",
  "WWWWWWWWW",
];
const cells = rows.map((r) => r.split("").map((c) => (c === "W" ? "wall" : c === "D" ? "door" : "floor") as "wall" | "door" | "floor"));
const mapOf = (props: OperableMap["props"], decals?: OperableMap["decals"]): OperableMap => ({ width: 9, height: 5, cells, props, decals });
const at = (x: number, y: number) => ({ x, y });
const prop = (name: string, x: number, y: number, side: string, operable?: OperableSpec) => ({ prop: name, cell: at(x, y), at: side, operable });

// the doors that are open, as a set of "x,y"
function world(open: string[] = []) {
  const doors = new Set(open);
  const ctx = (now: number, party: { x: number; y: number } | null = null, itemsOn?: (c: { x: number; y: number }) => number): OperableContext => ({
    now, party, doorOpen: (c) => doors.has(`${c.x},${c.y}`), itemsOn,
  });
  // applies the door effects to the set, like the runtime does
  const apply = (effects: OperableEffect[]) => {
    for (const e of effects) if (e.type === "door") (e.action === "open" ? doors.add(`${e.cell.x},${e.cell.y}`) : doors.delete(`${e.cell.x},${e.cell.y}`));
  };
  return { doors, ctx, apply };
}
const doorEffects = (effects: OperableEffect[]) => effects.flatMap((e) => (e.type === "door" ? [`${e.action}@${e.cell.x},${e.cell.y}${e.force ? "!" : ""}`] : []));

// ---- reading a map file's block: junk is dropped
assert.equal(readOperable(undefined), undefined);
assert.equal(readOperable("lever"), undefined);
assert.equal(readOperable({}), undefined);
assert.equal(readOperable({ targets: [{ kind: "door" }] }), undefined, "a target without a cell");
assert.deepEqual(
  readOperable({
    targets: [{ kind: "door", x: 4, y: 1, action: "close", force: true }, { kind: "door", x: 2.5, y: 1 }, { kind: "trap", x: 3, y: 2, side: "N" }, { kind: "trap", x: 3, y: 2, side: "up" }, { kind: "x", x: 1, y: 1 }, null],
    mode: "momentary", delay: 4, hold: false, once: true, projectile: "spell", damage: 12.4, range: 5.6, cooldown: 1.5, flag: " story.lever1 ", junk: 1,
  }),
  {
    targets: [{ kind: "door", x: 4, y: 1, action: "close", force: true }, { kind: "trap", x: 3, y: 2, side: "N" }, { kind: "trap", x: 3, y: 2 }],
    mode: "momentary", delay: 4, hold: false, once: true, projectile: "spell", damage: 12, range: 6, cooldown: 1.5, flag: "story.lever1",
  },
);
assert.deepEqual(readOperable({ targets: [{ kind: "door", x: 1, y: 1, action: "open" }] }), { targets: [{ kind: "door", x: 1, y: 1 }] }, "open is the default action: left out");
assert.equal(readOperable({ delay: -3 })?.delay, 0.2, "limits");
assert.equal(readOperable({ mode: "weird" }), undefined);

// ---- the sources: only the operable props, with stable keys
{
  const map = mapOf([prop("crate1", 1, 1, "center"), prop("lever1", 2, 1, "N"), prop("lever1", 2, 1, "N"), prop("arrowslit1", 5, 2, "E")], [
    { decal: "button_red", cell: at(1, 2), surface: "W", x: 10, y: 20, operable: { targets: [{ kind: "door", x: 4, y: 1 }] } },
    { decal: "stain", cell: at(1, 2), surface: "W", x: 10, y: 20 },
  ]);
  const sources = operableSources(map);
  assert.deepEqual(sources.map((s) => [s.key, s.kind, s.from, s.index]), [
    ["lever1@2,1:N", "lever", "prop", 1],
    ["lever1@2,1:N#2", "lever", "prop", 2],
    ["arrowslit1@5,2:E", "emitter", "prop", 3],
    ["decal:button_red@1,2:W:10,20", "button", "decal", 0],
  ]);
  const keys = sourceKeys(map);
  assert.equal(keys.props.get(1), "lever1@2,1:N");
  assert.equal(keys.decals.get(0), "decal:button_red@1,2:W:10,20");
  assert.equal(keys.props.has(0), false);
}

// ---- which way a wall trap fires: away from the wall it hangs on
assert.equal(facingOf("N"), "S");
assert.equal(facingOf("S"), "N");
assert.equal(facingOf("E"), "W");
assert.equal(facingOf("W"), "E");
assert.equal(facingOf("NE"), "S", "a corner: as the wall prop faces");
assert.equal(facingOf("N", 90), "W", "turned on");
assert.equal(facingOf("N", 270), "E");
assert.equal(facingOf("N", -90), "E");

// ---- a shot's line stops at walls and shut doors
{
  const open = () => false;
  assert.deepEqual(traceLine(mapOf([]), at(1, 2), "E", 20, open).map((c) => c.x), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(traceLine(mapOf([]), at(1, 2), "E", 3, open).map((c) => c.x), [1, 2, 3, 4], "its range");
  assert.deepEqual(traceLine(mapOf([]), at(4, 2), "N", 5, open), [at(4, 2)], "a shut door ends it at once");
  assert.deepEqual(traceLine(mapOf([]), at(4, 2), "N", 5, () => true), [at(4, 2), at(4, 1)], "an open one lets it through, the wall behind ends it");
  assert.deepEqual(traceLine(mapOf([]), at(1, 1), "N", 5, open), [at(1, 1)], "facing a wall: only its own cell");
}

// ---- a lever: each pull flips it, and the doors follow
{
  const w = world();
  const map = mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1 }, { kind: "door", x: 6, y: 3, action: "open", force: true }] })]);
  const key = "lever1@2,1:N";
  let state: OperableState = initialOperableState();
  let step = operate(map, state, key, w.ctx(0));
  assert.equal(step.state.on[key], true);
  assert.deepEqual(doorEffects(step.effects), ["open@4,1", "open@6,3!"]);
  assert.deepEqual(step.effects.filter((e) => e.type === "changed"), [{ type: "changed", source: key, kind: "lever", on: true }]);
  w.apply(step.effects);
  assert.ok(w.doors.has("4,1") && w.doors.has("6,3"));
  assert.equal(state.on[key], undefined, "the old state is not touched");
  state = step.state;
  step = operate(map, state, key, w.ctx(1000));
  assert.equal(step.state.on[key], false);
  assert.deepEqual(doorEffects(step.effects), ["close@4,1", "close@6,3!"], "pulled back: the doors shut again");
  w.apply(step.effects);
  assert.equal(w.doors.size, 0);
  // an unknown key, or a source one cannot pull
  assert.equal(operate(map, state, "nothing", w.ctx(0)).effects.length, 0);
  const plate = mapOf([prop("plate1", 2, 2, "center", { targets: [{ kind: "door", x: 4, y: 1 }] })]);
  assert.equal(operate(plate, initialOperableState(), "plate1@2,2:center", w.ctx(0)).effects.length, 0, "a plate is not pulled");
}

// ---- a toggle action is resolved against the door as it is now
{
  const w = world(["4,1"]);
  const map = mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1, action: "toggle" }, { kind: "door", x: 6, y: 3, action: "toggle" }] })]);
  const step = operate(map, initialOperableState(), "lever1@2,1:N", w.ctx(0));
  assert.deepEqual(doorEffects(step.effects), ["close@4,1", "open@6,3"]);
  // a close action: pulling closes, pulling back opens
  const closer = mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1, action: "close" }] })]);
  const a = operate(closer, initialOperableState(), "lever1@2,1:N", w.ctx(0));
  const b = operate(closer, a.state, "lever1@2,1:N", w.ctx(0));
  assert.deepEqual([doorEffects(a.effects), doorEffects(b.effects)], [["close@4,1"], ["open@4,1"]]);
}

// ---- a target that is no door
{
  const w = world();
  const map = mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 3, y: 1 }, { kind: "trap", x: 5, y: 2 }] })]);
  const step = operate(map, initialOperableState(), "lever1@2,1:N", w.ctx(0));
  assert.deepEqual(step.effects.filter((e) => e.type === "blocked").map((e) => e.type === "blocked" && e.reason), ["noDoor", "noTrap"]);
  assert.equal(doorEffects(step.effects).length, 0);
}

// ---- a toggle button is a lever; a momentary one springs back
{
  const w = world();
  const toggle = mapOf([prop("button1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1 }] })]);
  const t1 = operate(toggle, initialOperableState(), "button1@2,1:N", w.ctx(0));
  const t2 = operate(toggle, t1.state, "button1@2,1:N", w.ctx(0));
  assert.deepEqual([doorEffects(t1.effects), doorEffects(t2.effects)], [["open@4,1"], ["close@4,1"]]);

  const spec: OperableSpec = { mode: "momentary", delay: 2, targets: [{ kind: "door", x: 4, y: 1 }] };
  const map = mapOf([prop("button1", 2, 1, "N", spec)]);
  const key = "button1@2,1:N";
  const pressed = operate(map, initialOperableState(), key, w.ctx(10_000));
  assert.deepEqual(doorEffects(pressed.effects), ["open@4,1"]);
  assert.equal(pressed.state.springAt[key], 12_000);
  assert.equal(operate(map, pressed.state, key, w.ctx(10_500)).effects.length, 0, "pressed already");
  assert.equal(tick(map, pressed.state, w.ctx(11_999)).effects.length, 0, "not yet");
  assert.equal(tick(map, pressed.state, w.ctx(11_999)).state, pressed.state, "nothing changed: the same state back");
  const back = tick(map, pressed.state, w.ctx(12_000));
  assert.equal(back.state.on[key], false);
  assert.deepEqual(doorEffects(back.effects), ["close@4,1"], "the door goes with it");
  assert.equal(back.state.springAt[key], undefined);
  assert.equal(operate(map, back.state, key, w.ctx(12_100)).state.on[key], true, "it can be pressed again");
  // latching: the button springs back but the door stays
  const latch = mapOf([prop("button1", 2, 1, "N", { ...spec, hold: false })]);
  const p = operate(latch, initialOperableState(), key, w.ctx(0));
  const b = tick(latch, p.state, w.ctx(2000));
  assert.equal(b.state.on[key], false);
  assert.equal(doorEffects(b.effects).length, 0);
  // default delay
  const dflt = mapOf([prop("button1", 2, 1, "N", { mode: "momentary" })]);
  assert.equal(operate(dflt, initialOperableState(), key, w.ctx(0)).state.springAt[key], 3000);
}

// ---- a plate: held while stood on
{
  const w = world();
  const map = mapOf([prop("plate1", 2, 2, "center", { targets: [{ kind: "door", x: 4, y: 1 }] })]);
  const key = "plate1@2,2:center";
  let s = initialOperableState();
  let step = evaluatePlates(map, s, w.ctx(0, at(1, 2)));
  assert.equal(step.state, s, "not on it: nothing happens");
  step = evaluatePlates(map, s, w.ctx(0, at(2, 2)));
  assert.deepEqual(doorEffects(step.effects), ["open@4,1"]);
  assert.equal(step.state.on[key], true);
  w.apply(step.effects);
  s = step.state;
  assert.equal(evaluatePlates(map, s, w.ctx(10, at(2, 2))).effects.length, 0, "still standing on it");
  step = evaluatePlates(map, s, w.ctx(20, at(3, 2)));
  assert.deepEqual(doorEffects(step.effects), ["close@4,1"], "stepping off closes it");
  assert.equal(step.state.on[key], false);
  // an item on it counts; the party need not be there
  const items = (c: { x: number; y: number }) => (c.x === 2 && c.y === 2 ? 1 : 0);
  step = evaluatePlates(map, initialOperableState(), w.ctx(0, null, items));
  assert.deepEqual(doorEffects(step.effects), ["open@4,1"]);
  step = evaluatePlates(map, step.state, w.ctx(1, null, () => 0));
  assert.deepEqual(doorEffects(step.effects), ["close@4,1"], "the item taken away");
  // nobody anywhere (the editor)
  assert.equal(evaluatePlates(map, initialOperableState(), w.ctx(0, null)).effects.length, 0);
}

// ---- a latching plate stays pressed
{
  const w = world();
  const map = mapOf([prop("plate1", 2, 2, "center", { hold: false, targets: [{ kind: "door", x: 4, y: 1 }] })]);
  const key = "plate1@2,2:center";
  let step = evaluatePlates(map, initialOperableState(), w.ctx(0, at(2, 2)));
  assert.deepEqual(doorEffects(step.effects), ["open@4,1"]);
  step = evaluatePlates(map, step.state, w.ctx(1, at(3, 2)));
  assert.equal(step.effects.length, 0);
  assert.equal(step.state.on[key], true, "still down");
  const again = evaluatePlates(map, step.state, w.ctx(2, at(2, 2)));
  assert.equal(again.effects.length, 0, "stepping on it again does nothing more");
}

// ---- a two-plate puzzle: both plates feed their own doors
{
  const w = world();
  const map = mapOf([
    prop("plate1", 2, 2, "center", { targets: [{ kind: "door", x: 4, y: 1 }] }),
    prop("plate1", 3, 2, "center", { targets: [{ kind: "door", x: 6, y: 3 }] }),
  ]);
  const a = evaluatePlates(map, initialOperableState(), w.ctx(0, at(2, 2)));
  const b = evaluatePlates(map, a.state, w.ctx(1, at(3, 2)));
  assert.deepEqual(doorEffects(b.effects), ["close@4,1", "open@6,3"]);
}

// ---- a trap cell fires each time (or once)
{
  const w = world();
  const targets: OperableSpec["targets"] = [{ kind: "trap", x: 5, y: 2 }];
  const slit = prop("arrowslit1", 5, 2, "E", { damage: 7, range: 3, cooldown: 0 });
  const every = mapOf([prop("trapcell1", 2, 2, "center", { targets }), slit]);
  let s = evaluatePlates(every, initialOperableState(), w.ctx(0, at(2, 2)));
  const shot = s.effects.find((e) => e.type === "shot");
  assert.ok(shot && shot.type === "shot");
  assert.equal(shot.damage, 7);
  assert.equal(shot.dir, "W", "a trap on the east wall shoots west");
  assert.deepEqual(shot.cells.map((c) => c.x), [5, 4, 3, 2], "its range of 3 reaches the cell stepped on");
  assert.equal(shot.hit, true);
  s = evaluatePlates(every, s.state, w.ctx(1000, at(3, 2)));
  assert.equal(s.effects.some((e) => e.type === "shot"), false, "stepping off fires nothing");
  s = evaluatePlates(every, s.state, w.ctx(2000, at(2, 2)));
  assert.equal(s.effects.some((e) => e.type === "shot"), true, "again");
  const once = mapOf([prop("trapcell1", 2, 2, "center", { once: true, targets }), slit]);
  s = evaluatePlates(once, initialOperableState(), w.ctx(0, at(2, 2)));
  assert.equal(s.effects.some((e) => e.type === "shot"), true);
  s = evaluatePlates(once, s.state, w.ctx(1000, at(3, 2)));
  s = evaluatePlates(once, s.state, w.ctx(2000, at(2, 2)));
  assert.equal(s.effects.some((e) => e.type === "shot"), false, "only the first time");
  assert.equal(s.state.on["trapcell1@2,2:center"], true, "(it still shows as stepped on)");
  // an item dropped on a trap cell does not fire it (only a plate answers to items)
  const lying = evaluatePlates(every, initialOperableState(), w.ctx(0, null, (c) => (c.x === 2 && c.y === 2 ? 1 : 0)));
  assert.equal(lying.effects.length, 0, "an item on a trap cell: nothing");
}

// ---- a wall trap: reach, misses, cooling, sides, doors
{
  const w = world();
  const slit = prop("arrowslit1", 1, 2, "W", { range: 4 });
  const map = mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "trap", x: 1, y: 2 }] }), slit]);
  const pull = (state: OperableState, now: number, party: { x: number; y: number }) => operate(map, state, "lever1@2,1:N", w.ctx(now, party));
  const shotOf = (effects: OperableEffect[]) => effects.find((e): e is Extract<OperableEffect, { type: "shot" }> => e.type === "shot");
  let step = pull(initialOperableState(), 0, at(4, 2));
  let shot = shotOf(step.effects);
  assert.ok(shot && shot.hit, "the party stands in the line");
  assert.equal(shot.damage, 6, "an arrow's usual damage");
  // (the lever pulled back fires nothing)
  step = pull(step.state, 100, at(4, 2));
  assert.equal(shotOf(step.effects), undefined);
  // the party out of the line
  step = pull(step.state, 5000, at(4, 1));
  shot = shotOf(step.effects);
  assert.ok(shot && !shot.hit);
  step = pull(step.state, 5100, at(4, 1));
  // out of range
  step = pull(step.state, 9000, at(7, 2));
  shot = shotOf(step.effects);
  assert.ok(shot && !shot.hit, "range 4 does not reach x=7");
  step = pull(step.state, 9100, at(4, 2));
  // cooling: pulled again before its 2 s are up
  step = pull(step.state, 9500, at(4, 2));
  assert.equal(shotOf(step.effects), undefined);
  assert.deepEqual(step.effects.filter((e) => e.type === "blocked").map((e) => e.type === "blocked" && e.reason), ["cooling"]);
  // a spell glyph does more
  const glyph = mapOf([prop("glyph1", 1, 2, "W"), prop("plate1", 3, 2, "center", { targets: [{ kind: "trap", x: 1, y: 2, side: "W" }] })]);
  const g = evaluatePlates(glyph, initialOperableState(), w.ctx(0, at(3, 2)));
  const gs = g.effects.find((e) => e.type === "shot");
  assert.ok(gs && gs.type === "shot" && gs.projectile === "spell" && gs.damage === 8);
  // a side that matches nothing
  const wrong = mapOf([prop("glyph1", 1, 2, "W"), prop("plate1", 3, 2, "center", { targets: [{ kind: "trap", x: 1, y: 2, side: "N" }] })]);
  assert.deepEqual(evaluatePlates(wrong, initialOperableState(), w.ctx(0, at(3, 2))).effects.filter((e) => e.type === "blocked").map((e) => e.type === "blocked" && e.reason), ["noTrap"]);
  assert.equal(emittersAt(operableSources(glyph), { x: 1, y: 2 }).length, 1);
  assert.equal(emittersAt(operableSources(glyph), { x: 1, y: 2, side: "E" }).length, 0);
  // a shut door in the line stops the shot short of the party
  const blocked = mapOf([prop("arrowslit1", 4, 2, "N", {}), prop("plate1", 4, 1, "center")]);
  const closed = operableSources(blocked).find((s) => s.kind === "emitter")!;
  assert.deepEqual(traceLine(blocked, closed.cell, "S", 8, () => false).map((c) => c.y), [2, 3]);
}

// ---- story flags: raised with the source, and bringing it back on when the deck is loaded
{
  const w = world();
  const map = mapOf([
    prop("lever1", 2, 1, "N", { flag: "story.bridge", targets: [{ kind: "door", x: 4, y: 1 }] }),
    prop("button1", 3, 1, "N", { mode: "momentary", flag: "x", targets: [{ kind: "door", x: 6, y: 3 }] }),
    prop("plate1", 2, 2, "center", { hold: false, flag: "story.plate", targets: [{ kind: "door", x: 6, y: 3 }] }),
  ]);
  const pulled = operate(map, initialOperableState(), "lever1@2,1:N", w.ctx(0));
  assert.deepEqual(pulled.effects.filter((e) => e.type === "flag"), [{ type: "flag", flag: "story.bridge", value: true }]);
  const back = operate(map, pulled.state, "lever1@2,1:N", w.ctx(0));
  assert.deepEqual(back.effects.filter((e) => e.type === "flag"), [{ type: "flag", flag: "story.bridge", value: false }]);
  const restored = restoreFromFlags(map, (f) => f === "story.bridge" || f === "story.plate" || f === "x", w.ctx(0));
  assert.deepEqual(Object.keys(restored.state.on).sort(), ["lever1@2,1:N", "plate1@2,2:center"], "a momentary button does not come back");
  assert.deepEqual(doorEffects(restored.effects), ["open@4,1", "open@6,3"]);
  assert.equal(restored.state.fired["plate1@2,2:center"], true);
  assert.equal(restored.effects.some((e) => e.type === "flag"), false, "(the flags are up already)");
  assert.deepEqual(Object.keys(restoreFromFlags(map, () => false, w.ctx(0)).state.on), []);
}

// ---- a door is never shut on the party
assert.equal(doorBlocked({ type: "door", cell: at(4, 1), action: "close", force: false, source: "s" }, at(4, 1)), true);
assert.equal(doorBlocked({ type: "door", cell: at(4, 1), action: "close", force: false, source: "s" }, at(3, 1)), false);
assert.equal(doorBlocked({ type: "door", cell: at(4, 1), action: "open", force: false, source: "s" }, at(4, 1)), false);
assert.equal(doorBlocked({ type: "door", cell: at(4, 1), action: "close", force: false, source: "s" }, null), false);

// ---- who is hit: a random one still standing
{
  const crew = [{ id: "a", hp: 0 }, { id: "b", hp: 5 }, { id: "c", hp: 9 }];
  assert.equal(pickVictim(crew, 0)?.id, "b");
  assert.equal(pickVictim(crew, 0.99)?.id, "c");
  assert.equal(pickVictim(crew, 1)?.id, "c", "a roll of exactly 1 stays in range");
  assert.equal(pickVictim([{ id: "a", hp: 0 }], 0.5), undefined);
}

// ---- problems for the editor
{
  const map = mapOf([
    prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1 }, { kind: "door", x: 3, y: 1 }, { kind: "trap", x: 7, y: 2 }] }),
    prop("button1", 3, 1, "N"),
    prop("arrowslit1", 1, 1, "S"),
    prop("arrowslit1", 5, 2, "E", {}),
    prop("plate1", 2, 2, "center", { targets: [{ kind: "trap", x: 5, y: 2 }] }),
  ]);
  const codes = operableProblems(map).map((p) => `${p.code}@${p.cell.x},${p.cell.y}`);
  assert.deepEqual(codes.sort(), [
    "operableDoorMissing@2,1",
    "operableFacesWall@1,1",
    "operableNoTarget@3,1",
    "operableTrapMissing@2,1",
    "operableUnused@1,1",
  ].sort());
  assert.deepEqual(operableProblems(mapOf([])), []);
}

// ---- links for the editor's lines
assert.deepEqual(operableLinks(mapOf([prop("lever1", 2, 1, "N", { targets: [{ kind: "door", x: 4, y: 1 }, { kind: "trap", x: 5, y: 2 }] })])), [
  { from: at(2, 1), to: at(4, 1), kind: "door" },
  { from: at(2, 1), to: at(5, 2), kind: "trap" },
]);

// ---- area copy: the targets inside the copied area go with it
{
  const spec: OperableSpec = { targets: [{ kind: "door", x: 4, y: 1, action: "close" }, { kind: "door", x: 20, y: 1 }, { kind: "trap", x: 5, y: 2, side: "E" }] };
  const moved = relocateOperable(spec, { x0: 0, y0: 0, x1: 9, y1: 4 }, 10, 3);
  assert.deepEqual(moved?.targets, [{ kind: "door", x: 14, y: 4, action: "close" }, { kind: "door", x: 20, y: 1 }, { kind: "trap", x: 15, y: 5, side: "E" }]);
  assert.deepEqual(spec.targets![0], { kind: "door", x: 4, y: 1, action: "close" }, "the original is untouched");
  assert.equal(relocateOperable(undefined, { x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 1), undefined);
  assert.deepEqual(relocateOperable({ mode: "toggle" }, { x0: 0, y0: 0, x1: 1, y1: 1 }, 1, 1), { mode: "toggle" });
}

console.log("operables: ok");
