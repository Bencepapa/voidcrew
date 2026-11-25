// Run: npx tsx src/game/soundTargets.test.ts
// Sound emitters as the targets of levers, buttons and plates (see operables.ts, soundOperables.ts): reading, the state
// machine, the sound system's view of it, problems, links, and the editor's edits that keep the targets right.
import assert from "node:assert/strict";
import { register } from "node:module";
import type { MapFile } from "./mapFormat";
import {
  evaluatePlates, initialOperableState, operableLinks, operableProblems, operate, readOperable, readTarget, relocateOperable, restoreFromFlags, tick,
  type OperableContext, type OperableEffect, type OperableMap, type OperableSpec,
} from "./operables";
import { emitterView } from "./emitterStore";
import { soundKeys, soundsOn } from "./soundOperables";

// (the map reader and the edits pull in the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");
const { addTarget, areaTarget, fixTargetsBeforeRemove, linkTargetFor, operableInfo } = await import("../editor/operableEdits");
const { removeSound } = await import("../editor/mapEdits");
const { createSoundSystem } = await import("../audio/soundSystem");

// a 9x5 map; sounds at (2,3) (two there, the second off from the start), (6,3) (off, named "alarm") and (7,3)
const rows = ["WWWWWWWWW", "W...D...W", "W.......W", "W.......W", "WWWWWWWWW"];
const cells = rows.map((r) => r.split("").map((c) => (c === "W" ? "wall" : c === "D" ? "door" : "floor") as "wall" | "door" | "floor"));
const at = (x: number, y: number) => ({ x, y });
const sounds = [
  { x: 2, y: 3, kind: "tone" as const },
  { x: 2, y: 3, kind: "tone" as const, active: false },
  { x: 6, y: 3, kind: "noise" as const, active: false, id: "alarm" },
  { x: 7, y: 3, kind: "tone" as const },
];
const prop = (name: string, x: number, y: number, side: string, operable?: OperableSpec) => ({ prop: name, cell: at(x, y), at: side, operable });
const mapOf = (props: OperableMap["props"], extra: Partial<OperableMap> = {}): OperableMap => ({ width: 9, height: 5, cells, props, sounds, ...extra });
const ctx = (now = 0, party: { x: number; y: number } | null = null, over: Partial<OperableContext> = {}): OperableContext => ({ now, party, doorOpen: () => false, ...over });
const lever = (targets: unknown[], extra: Record<string, unknown> = {}) => readOperable({ targets, ...extra })!;
const leverMap = (spec: OperableSpec) => mapOf([prop("lever1", 1, 1, "N", spec)]);
const KEY = "lever1@1,1:N";
const soundEffects = (effects: OperableEffect[]) => effects.flatMap((e) => (e.type === "sounds" ? [`${e.on ? "+" : "-"}${e.keys.join("|")}`] : []));

// ---- reading
assert.deepEqual(readTarget({ kind: "sound", x: 2, y: 3 }), { kind: "sound", x: 2, y: 3 });
assert.deepEqual(readTarget({ kind: "sound", x: 2, y: 3, index: 1, action: "toggle" }), { kind: "sound", x: 2, y: 3, index: 1, action: "toggle" });
assert.deepEqual(readTarget({ kind: "sound", x: 2, y: 3, action: "on" }), { kind: "sound", x: 2, y: 3 }, "on is the default: left out");
assert.deepEqual(readTarget({ kind: "sound", id: "alarm", action: "off" }), { kind: "sound", id: "alarm", action: "off" });
assert.deepEqual(readTarget({ kind: "sound", area: { x0: 3, y0: 3, x1: 1, y1: 2 } }), { kind: "sound", area: { x0: 1, y0: 2, x1: 3, y1: 3 } });
assert.equal(readTarget({ kind: "sound" }), undefined, "no address");
assert.equal(readTarget({ kind: "sound", x: 2 }), undefined);
{
  const targets = [{ kind: "sound", x: 2, y: 3, index: 0, action: "toggle" }, { kind: "sound", id: "alarm" }, { kind: "sound", area: { x0: 1, y0: 1, x1: 3, y1: 3 }, action: "off" }];
  assert.deepEqual(readOperable(JSON.parse(JSON.stringify({ targets })))!.targets, targets, "a round trip");
}

// ---- the keys the state knows the sounds by
assert.deepEqual(soundKeys(sounds), ["sound:2,3", "sound:2,3#2", "sound:6,3", "sound:7,3"]);

// ---- a lever switches a sound on and, as it goes back, off again
{
  const map = leverMap(lever([{ kind: "sound", id: "alarm" }]));
  const on = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(soundEffects(on.effects), ["+sound:6,3"]);
  assert.equal(on.state.emit["sound:6,3"], true);
  const off = operate(map, on.state, KEY, ctx());
  assert.deepEqual(soundEffects(off.effects), ["-sound:6,3"], "the lever back: the inverse");
  assert.equal(off.state.emit["sound:6,3"], false);
  assert.deepEqual(Object.keys(on.state.emit), ["sound:6,3"], "only that one is touched");
}
// off: a sound that is on goes silent; one that is silent already is not reported
{
  const map = leverMap(lever([{ kind: "sound", x: 2, y: 3, action: "off" }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(soundEffects(step.effects), ["-sound:2,3"], "the first (on) one goes off; the second is off already");
  const back = operate(map, step.state, KEY, ctx());
  assert.deepEqual(soundEffects(back.effects), ["+sound:2,3|sound:2,3#2"], "and the inverse switches everything it addresses on");
}
// toggle, by cell + index
{
  const map = leverMap(lever([{ kind: "sound", x: 2, y: 3, index: 1, action: "toggle" }]));
  const a = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(soundEffects(a.effects), ["+sound:2,3#2"], "the second sound of the cell, off by its own `active`, is flipped on");
  const b = operate(map, a.state, KEY, ctx());
  assert.deepEqual(soundEffects(b.effects), ["-sound:2,3#2"]);
}
// an area works every sound inside it
{
  const map = leverMap(lever([{ kind: "sound", area: { x0: 6, y0: 3, x1: 7, y1: 3 } }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(soundEffects(step.effects), ["+sound:6,3"], "(the one at 7,3 is on already)");
}
// a target that addresses nothing
{
  const map = leverMap(lever([{ kind: "sound", id: "nope" }]));
  const step = operate(map, initialOperableState(), KEY, ctx());
  assert.deepEqual(step.effects.filter((e) => e.type === "blocked").map((e) => e.type === "blocked" && e.reason), ["noSound"]);
}
// a map with no sounds at all
assert.ok(operate({ ...leverMap(lever([{ kind: "sound", x: 2, y: 3 }])), sounds: undefined }, initialOperableState(), KEY, ctx()).effects.some((e) => e.type === "blocked"));

// ---- plates hold it while stood on; momentary buttons spring back; a latch stays
{
  const plate = mapOf([prop("plate1", 3, 2, "center", lever([{ kind: "sound", id: "alarm" }]))]);
  const stepped = evaluatePlates(plate, initialOperableState(), ctx(0, at(3, 2)));
  assert.deepEqual(soundEffects(stepped.effects), ["+sound:6,3"]);
  const left = evaluatePlates(plate, stepped.state, ctx(0, at(1, 1)));
  assert.deepEqual(soundEffects(left.effects), ["-sound:6,3"], "off as the plate is left");
  const button = mapOf([prop("button1", 1, 1, "N", lever([{ kind: "sound", id: "alarm" }], { mode: "momentary", delay: 2 }))]);
  const pressed = operate(button, initialOperableState(), "button1@1,1:N", ctx(1000));
  assert.deepEqual(soundEffects(pressed.effects), ["+sound:6,3"]);
  assert.deepEqual(soundEffects(tick(button, pressed.state, ctx(4000)).effects), ["-sound:6,3"], "it springs back");
  const latched = mapOf([prop("plate1", 3, 2, "center", lever([{ kind: "sound", id: "alarm" }], { hold: false }))]);
  const first = evaluatePlates(latched, initialOperableState(), ctx(0, at(3, 2)));
  assert.deepEqual(soundEffects(first.effects), ["+sound:6,3"]);
  assert.deepEqual(soundEffects(evaluatePlates(latched, first.state, ctx(0, at(1, 1))).effects), [], "a latched one stays on");
}
// a flagged lever that was thrown: the sound is on again when the deck is loaded
{
  const map = leverMap(lever([{ kind: "sound", id: "alarm" }], { flag: "alarm.on" }));
  const restored = restoreFromFlags(map, (f) => f === "alarm.on", ctx());
  assert.deepEqual(soundEffects(restored.effects), ["+sound:6,3"]);
}
// smoke emitters and sounds share the state record without touching each other
{
  const smokes = [{ cell: at(2, 3), active: false }];
  const map = leverMap(lever([{ kind: "emitter", x: 2, y: 3 }, { kind: "sound", id: "alarm" }]));
  const step = operate({ ...map, smokes }, initialOperableState(), KEY, ctx());
  assert.deepEqual(step.effects.filter((e) => e.type === "emitters").map((e) => e.type === "emitters" && e.keys), [["2,3"]]);
  assert.deepEqual(soundEffects(step.effects), ["+sound:6,3"]);
  assert.deepEqual(Object.keys(step.state.emit).sort(), ["2,3", "sound:6,3"]);
}

// ---- what the sound system sees: a switch overrides the sound's own `active`
{
  const parsed = parseMap("t", { name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" }, layout: ["WWWWWWWWW", "W.......W", "W.......W", "W.......W", "WWWWWWWWW"], sounds } as unknown as MapFile);
  const on = soundsOn(parsed);
  emitterView.set({ mapId: "other", playing: true, on: { "sound:6,3": true } });
  assert.deepEqual([0, 1, 2, 3].map(on), [true, false, false, true], "another deck's switches are not this deck's");
  emitterView.set({ mapId: "t", playing: true, on: { "sound:6,3": true, "sound:2,3": false } });
  assert.deepEqual([0, 1, 2, 3].map(on), [false, false, true, true], "the function reads the view when asked: the lever on, another sound switched off");
  emitterView.set({ mapId: "t", playing: false, on: {} });
  assert.deepEqual([0, 1, 2, 3].map(on), [true, false, false, true], "nothing switched: the map's own `active`");
  assert.equal(on(9), false);
  // and the system plays by it, and takes the change when told (`invalidate`)
  const voices: { stopped: boolean }[] = [];
  const system = createSoundSystem(
    { start: () => { const v = { stopped: false }; voices.push(v); return v; }, set: () => {}, stop: (v) => { v.stopped = true; }, setListener: () => {} },
    { now: () => 0 },
  );
  system.setScene({ sounds: parsed.sounds!, blocked: () => false, floorHeight: () => 0, wallHeight: 1, isOn: soundsOn(parsed) });
  const ears = { x: 6, y: 0.5, z: 3, fx: 1, fz: 0 };
  system.frame(ears);
  assert.equal(voices.filter((v) => !v.stopped).length, 2, "the two that are on");
  emitterView.set({ mapId: "t", playing: true, on: { "sound:6,3": true } });
  system.invalidate();
  system.frame(ears);
  assert.equal(voices.filter((v) => !v.stopped).length, 3, "the lever was thrown: the alarm sounds");
  emitterView.set({ mapId: "t", playing: true, on: {} });
  system.invalidate();
  system.frame(ears);
  assert.equal(voices.filter((v) => !v.stopped).length, 2, "and back");
  emitterView.set({ mapId: "", playing: false, on: {} });
}

// ---- problems for the editor's list
{
  const codes = (map: OperableMap) => operableProblems(map).map((p) => p.code);
  assert.deepEqual(codes(leverMap(lever([{ kind: "sound", id: "alarm" }]))), ["operableSoundInactiveUnused"], "found, and it wakes the alarm; the other silent one (2,3 #2) is never switched");
  assert.deepEqual(codes(leverMap(lever([{ kind: "sound", id: "nope" }]))), ["operableSoundMissing", "operableSoundInactiveUnused", "operableSoundInactiveUnused"]);
  assert.deepEqual(codes(leverMap(lever([{ kind: "sound", id: "alarm" }, { kind: "sound", x: 2, y: 3, index: 1 }]))), []);
  const missing = operableProblems(leverMap(lever([{ kind: "sound", x: 1, y: 1 }])))[0];
  assert.deepEqual([missing.code, missing.params], ["operableSoundMissing", { at: "1,1" }]);
}

// ---- links for the minimap, and copying with an area
{
  const map = leverMap(lever([{ kind: "sound", id: "alarm" }, { kind: "sound", x: 2, y: 3 }, { kind: "sound", id: "nope" }]));
  assert.deepEqual(operableLinks(map).map((l) => `${l.kind}>${l.to.x},${l.to.y}`), ["sound>6,3", "sound>2,3", "sound>2,3"], "a line to each sound addressed; none to a missing one");
  const moved = relocateOperable(lever([{ kind: "sound", x: 6, y: 3 }, { kind: "sound", area: { x0: 6, y0: 2, x1: 7, y1: 3 } }, { kind: "sound", id: "alarm" }]), { x0: 5, y0: 1, x1: 8, y1: 3 }, 0, 10);
  assert.deepEqual(moved!.targets, [{ kind: "sound", x: 6, y: 13 }, { kind: "sound", area: { x0: 6, y0: 12, x1: 7, y1: 13 } }, { kind: "sound", id: "alarm" }]);
}

// ---- the editor: a click on a sound's sign in link mode, panel info, and removing a sound keeps the targets right
{
  const file = (): MapFile =>
    ({
      name: "t", deck: 1, start: { x: 1, y: 1, facing: "E" },
      layout: ["WWWWWWWWW", "W.......W", "W.......W", "W.......W", "WWWWWWWWW"],
      sounds: sounds.map((s) => ({ ...s })),
      props: [{ prop: "lever1", x: 1, y: 1, at: "N", operable: { targets: [{ kind: "sound", x: 2, y: 3, index: 0 }, { kind: "sound", x: 2, y: 3, index: 1 }, { kind: "sound", id: "alarm" }, { kind: "sound", x: 7, y: 3 }] } }],
    }) as unknown as MapFile;
  const m = parseMap("t", file());
  assert.deepEqual(linkTargetFor(m, { cell: { x: 6, y: 3 }, sound: 2 }), { kind: "sound", x: 6, y: 3 });
  assert.deepEqual(linkTargetFor(m, { cell: { x: 2, y: 3 }, sound: 1 }), { kind: "sound", x: 2, y: 3, index: 1 }, "two in a cell: the second is told apart by its place");
  assert.equal(linkTargetFor(m, { cell: { x: 2, y: 3 }, sound: 9 }), undefined, "no such sound");
  assert.deepEqual(areaTarget("sound", { x0: 1, y0: 1, x1: 3, y1: 2 }), { kind: "sound", area: { x0: 1, y0: 1, x1: 3, y1: 2 } });
  // (the panel marks a target that addresses nothing)
  const info = operableInfo({ prop: "lever1", at: "N", operable: { targets: [{ kind: "sound", id: "alarm" }, { kind: "sound", id: "gone" }] } }, 0, m);
  assert.deepEqual(info!.missing, [1]);
  // adding a target: the same one twice is once
  const f = file();
  const ref = { from: "prop", index: 0 } as const;
  addTarget(f, ref, { kind: "sound", x: 7, y: 3 });
  assert.equal(f.props![0].operable!.targets!.length, 4, "already there");
  addTarget(f, ref, { kind: "sound", x: 7, y: 3, action: "off" });
  assert.equal(f.props![0].operable!.targets!.length, 4, "(an action does not make it another address)");
  addTarget(f, ref, { kind: "sound", id: "other" });
  assert.equal(f.props![0].operable!.targets!.length, 5);
  // the first sound of the cell (2,3) is taken out: the target that named it by its place goes, the second one moves up
  const g = file();
  removeSound(g, 0);
  assert.deepEqual(g.props![0].operable!.targets, [{ kind: "sound", x: 2, y: 3, index: 0 }, { kind: "sound", id: "alarm" }, { kind: "sound", x: 7, y: 3 }], "(the second became the first)");
  assert.equal(g.sounds!.length, 3);
  // one by id or by a cell alone needs nothing
  const h = file();
  fixTargetsBeforeRemove(h, "sound", 2);
  assert.equal(h.props![0].operable!.targets!.length, 4);
  removeSound(h, 3);
  assert.equal(h.props![0].operable!.targets!.length, 4, "a target by cell alone stays (it shows up as a warning)");
}

console.log("soundTargets: ok");
