// Run: npx tsx src/game/sounds.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { NOISE_COLORS, SOUND_LIMITS, newSound, pulseOn, readSound, readSounds, resolveSound, soundProblems, waveKey, type SoundSpec } from "./sounds";
import { fixtureFile } from "../audio/soundFixture";

// (the map reader pulls in the game's props, which read Vite's import.meta.glob: a stand-in is put in its place)
register("data:text/javascript," + encodeURIComponent(`
export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context);
  if (result.source && !url.includes("node_modules")) {
    result.source = String(result.source).replaceAll("import.meta.env", "({BASE_URL:'/'})").replaceAll("import.meta.glob", "((..._)=>({}))");
  }
  return result;
}`), import.meta.url);
const { parseMap } = await import("./mapFormat");

// ---- reading one sound: junk dropped or limited
assert.equal(readSound(undefined), undefined);
assert.equal(readSound("tone"), undefined);
assert.equal(readSound([1, 2]), undefined);
assert.equal(readSound({ x: 1, y: 2 }), undefined, "no kind");
assert.equal(readSound({ x: 1, y: 2, kind: "bell" }), undefined, "unknown kind");
assert.equal(readSound({ x: 1.5, y: 2, kind: "tone" }), undefined, "not a cell");
assert.equal(readSound({ x: "1", y: 2, kind: "tone" }), undefined);
assert.equal(readSound({ x: NaN, y: 2, kind: "tone" }), undefined);
assert.deepEqual(readSound({ x: 1, y: 2, kind: "tone" }), { x: 1, y: 2, kind: "tone", volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default }, "defaults for what is missing");
assert.deepEqual(
  readSound({ x: 4, y: 3, kind: "tone", wave: "saw", pitch: 880, volume: 0.5, range: 9, rolloff: 2, pulse: { on: 0.3, off: 0.7 }, pos: [0.1, 0.4, -0.2], active: false }),
  { x: 4, y: 3, kind: "tone", wave: "saw", pitch: 880, volume: 0.5, range: 9, rolloff: 2, pulse: { on: 0.3, off: 0.7 }, pos: [0.1, 0.4, -0.2], active: false },
  "a whole one comes through as it is",
);
// limits
const limited = readSound({ x: 0, y: 0, kind: "tone", pitch: 5000, volume: 7, range: 1e6, rolloff: 99, pos: [3, 99, -3], pulse: { on: -1, off: 1e5 } })!;
assert.equal(limited.pitch, 2000);
assert.equal(limited.volume, 1);
assert.equal(limited.range, 100);
assert.equal(limited.rolloff, 3);
assert.deepEqual(limited.pos, [0.5, 8, -0.5]);
assert.deepEqual(limited.pulse, { on: 0, off: 60 });
const low = readSound({ x: 0, y: 0, kind: "tone", pitch: 1, volume: -1, range: -5, rolloff: 0 })!;
assert.equal(low.pitch, 55);
assert.equal(low.volume, 0);
assert.equal(low.range, SOUND_LIMITS.range.min);
assert.equal(low.rolloff, 0.5);
// junk values: the default, not a broken sound
const junk = readSound({ x: 0, y: 0, kind: "noise", wave: "saw", pitch: 440, noise: "purple", volume: "loud", range: NaN, rolloff: "x", pos: [1, 2], pulse: { on: 1 }, active: "no" })!;
assert.deepEqual(junk, { x: 0, y: 0, kind: "noise", volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default });
// a kind keeps only what is its own
assert.equal(readSound({ x: 0, y: 0, kind: "tone", noise: "pink" })!.noise, undefined);
assert.equal(readSound({ x: 0, y: 0, kind: "noise", wave: "saw", pitch: 300 })!.wave, undefined);
assert.equal(readSound({ x: 0, y: 0, kind: "noise", wave: "saw", pitch: 300 })!.pitch, undefined);
assert.equal(readSound({ x: 0, y: 0, kind: "noise", noise: "brown" })!.noise, "brown");
assert.equal(readSound({ x: 0, y: 0, kind: "tone", wave: "wobble" })!.wave, undefined);
// `active` is kept only when it switches the sound off
assert.equal("active" in readSound({ x: 0, y: 0, kind: "tone", active: true })!, false);
assert.equal(readSound({ x: 0, y: 0, kind: "tone", active: false })!.active, false);
// the list: the bad ones are left out
assert.deepEqual(readSounds(undefined), []);
assert.deepEqual(readSounds("sounds"), []);
assert.equal(readSounds([{ x: 0, y: 0, kind: "tone" }, null, { x: 1, y: 1, kind: "bell" }, { x: 2, y: 2, kind: "noise" }]).length, 2);
// a sound given back is not the object given
{
  const raw = { x: 0, y: 0, kind: "tone", pos: [0, 1, 0] };
  const out = readSound(raw)!;
  assert.notEqual(out.pos, raw.pos);
  assert.equal(raw.pos[1], 1);
}

// ---- resolved: every default filled in
{
  const r = resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10 });
  assert.equal(r.wave, "sine");
  assert.equal(r.pitch, 440);
  assert.equal(r.noise, "white");
  assert.equal(r.rolloff, 1);
  assert.equal(r.active, true);
  assert.deepEqual(r.pos, [0, 0.5, 0]);
  assert.equal(r.pulse, undefined);
  assert.equal(resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 0 } }).pulse, undefined, "an `off` of nothing never stops");
  assert.deepEqual(resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 2 } }).pulse, { on: 1, off: 2 });
  assert.equal(resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10, active: false }).active, false);
}

// ---- which sounds share a wave
{
  const base: SoundSpec = { x: 0, y: 0, kind: "tone", volume: 0.5, range: 10 };
  const key = (s: Partial<SoundSpec>) => waveKey(resolveSound({ ...base, ...s }));
  assert.equal(key({}), key({ volume: 1, range: 3, rolloff: 2, pulse: { on: 1, off: 1 }, x: 5, active: false }), "volume, range, pulse and the rest are not in the wave");
  assert.notEqual(key({}), key({ pitch: 441 }));
  assert.notEqual(key({}), key({ wave: "saw" }));
  assert.notEqual(key({}), key({ kind: "noise" }));
  assert.notEqual(key({ kind: "noise" }), key({ kind: "noise", noise: "pink" }));
  assert.equal(key({ kind: "noise", wave: "saw" }), key({ kind: "noise" }), "a noise has no wave form");
  assert.equal(NOISE_COLORS.map((c) => key({ kind: "noise", noise: c })).length, 3);
}

// ---- the pulse
{
  const pulse = { on: 0.5, off: 1.5 };
  assert.equal(pulseOn(undefined, 123.4), true);
  assert.equal(pulseOn(pulse, 0), true);
  assert.equal(pulseOn(pulse, 0.49), true);
  assert.equal(pulseOn(pulse, 0.5), false);
  assert.equal(pulseOn(pulse, 1.99), false);
  assert.equal(pulseOn(pulse, 2), true, "the next cycle");
  assert.equal(pulseOn(pulse, 4.2), true);
  assert.equal(pulseOn(pulse, 4.6), false);
  assert.equal(pulseOn(pulse, -0.1), false, "(before the clock's start the cycle runs backwards)");
  assert.equal(pulseOn({ on: 0, off: 0 }, 1), true);
}

// ---- a new one, as the Sound tool puts it in
assert.deepEqual(newSound(3, 4), { x: 3, y: 4, kind: "tone", volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default });
assert.deepEqual(newSound(1, 1, { kind: "noise", noise: "pink", wave: "saw", volume: 0.2 }), { x: 1, y: 1, kind: "noise", noise: "pink", volume: 0.2, range: SOUND_LIMITS.range.default });
assert.equal(newSound(7, 8, { x: 99, y: 99 }).x, 7, "the cell is the click's, not the template's");

// ---- what the editor warns of
assert.deepEqual(soundProblems(undefined), []);
assert.deepEqual(soundProblems([{ x: 1, y: 2, kind: "tone", volume: 0.5, range: 10 }]), []);
assert.deepEqual(
  soundProblems([
    { x: 1, y: 2, kind: "tone", volume: 0, range: 10 },
    { x: 3, y: 4, kind: "noise", volume: 0.5, range: 0.5 },
    { x: 5, y: 6, kind: "tone", volume: 0.5, range: 10, pulse: { on: 0, off: 1 } },
    { x: 7, y: 8, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 0 } },
    { x: 9, y: 9, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 1 } },
  ]).map((p) => `${p.code}@${p.cell.x},${p.cell.y}#${p.index}`),
  ["soundSilent@1,2#0", "soundNoRange@3,4#1", "soundPulseZero@5,6#2", "soundPulseZero@7,8#3"],
);
assert.deepEqual(soundProblems([{ x: 0, y: 0, kind: "tone", volume: 0, range: 0.5, pulse: { on: 0, off: 0 } }]).map((p) => p.code), ["soundSilent", "soundNoRange", "soundPulseZero"], "all three at once");

// ---- in a map file: parsed and cleaned
{
  const map = parseMap("t", fixtureFile([
    { x: 9, y: 1, kind: "tone", volume: 9, range: 20, pitch: 10 },
    // (off the map, and not a sound: both left out)
    { x: 99, y: 1, kind: "tone", volume: 1, range: 5 },
    { x: 2, y: 2, kind: "gong" } as unknown as SoundSpec,
    { x: 2, y: 3, kind: "noise", volume: 0.3, range: 6, noise: "brown" },
  ]));
  assert.equal(map.sounds!.length, 2);
  assert.deepEqual(map.sounds![0], { x: 9, y: 1, kind: "tone", volume: 1, range: 20, pitch: 55 });
  assert.deepEqual(map.sounds![1], { x: 2, y: 3, kind: "noise", volume: 0.3, range: 6, noise: "brown" });
}
{
  // a map with none has none: nothing changes for the old maps
  const file = fixtureFile();
  delete file.sounds;
  assert.equal(parseMap("t", file).sounds, undefined);
  assert.equal(parseMap("t", { ...file, sounds: [] }).sounds, undefined);
  // the scene's key does not hold the sounds: a sound edited does not rebuild the deck
  const withSound = parseMap("t", fixtureFile());
  const without = parseMap("t", file);
  assert.equal(withSound.structureKey, without.structureKey);
  const moved = parseMap("t", fixtureFile([{ ...fixtureFile().sounds![0], x: 8, pitch: 700, volume: 0.1 }]));
  assert.equal(moved.structureKey, withSound.structureKey);
  assert.ok(!withSound.structureKey!.includes("pitch"));
  // ... and a change to the cells still does
  const bigger = parseMap("t", { ...fixtureFile(), layout: fixtureFile().layout.map((r, y) => (y === 1 ? r.replace(".....", "..W..") : r)) });
  assert.notEqual(bigger.structureKey, withSound.structureKey);
}
// the maps as they are in the repo parse as before: none of them has sounds, and the key is what it was without them
{
  const folder = new URL("../maps/fantasy/", import.meta.url);
  const file = JSON.parse(readFileSync(new URL("Forest.json", folder), "utf8"));
  const map = parseMap("Forest", file);
  assert.equal(map.sounds, undefined);
  assert.equal(JSON.stringify(map).includes('"sounds"'), false);
}

console.log("sounds: ok");
