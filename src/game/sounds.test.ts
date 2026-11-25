// Run: npx tsx src/game/sounds.test.ts
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { NOISE_COLORS, SOUND_LIMITS, changePulse, newSound, pulseOn, readSound, readSounds, resolveSound, soundProblems, waveKey, type SoundSpec } from "./sounds";
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
assert.equal(limited.range, SOUND_LIMITS.range.max);
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
  assert.deepEqual(resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 2 } }).pulse, { on: 1, off: 2, attack: 0.02, release: 0.02 }, "a short edge unless it says");
  assert.deepEqual(resolveSound({ x: 0, y: 0, kind: "tone", volume: 0.5, range: 10, pulse: { on: 1, off: 2, attack: 0.3, release: 0 } }).pulse, { on: 1, off: 2, attack: 0.3, release: 0 });
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

// ---- the pulse's edges and a sound's name: read, limited, kept
{
  assert.deepEqual(readSound({ x: 1, y: 1, kind: "tone", pulse: { on: 1, off: 1, attack: 0.25, release: 0.5 } })!.pulse, { on: 1, off: 1, attack: 0.25, release: 0.5 });
  assert.deepEqual(readSound({ x: 1, y: 1, kind: "tone", pulse: { on: 1, off: 1, attack: 9, release: -3 } })!.pulse, { on: 1, off: 1, attack: 1, release: 0 }, "limited to 0..1 seconds");
  assert.deepEqual(readSound({ x: 1, y: 1, kind: "tone", pulse: { on: 1, off: 1, attack: "slow", release: NaN } })!.pulse, { on: 1, off: 1 }, "junk edges are left off");
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", pulse: { on: 1, off: 1 } })!.pulse!.attack, undefined, "not written when not given");
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", attack: 0.5 } as never)!.pulse, undefined, "an edge needs its pulse");
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", id: "  alarm " })!.id, "alarm");
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", id: "   " })!.id, undefined);
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", id: 7 })!.id, undefined);
  assert.equal(readSound({ x: 1, y: 1, kind: "tone", id: "x".repeat(200) })!.id!.length, 60);
  assert.equal(newSound(2, 3, { id: "alarm", volume: 0.2 }).id, undefined, "a name is not handed on to the next sound");
  assert.equal(newSound(2, 3, { id: "alarm", volume: 0.2 }).volume, 0.2);
  // what the panel writes: an edge left at the default is not written
  assert.deepEqual(changePulse({ on: 0.3, off: 0.7 }, { attack: 0.02 }), { on: 0.3, off: 0.7 });
  assert.deepEqual(changePulse({ on: 0.3, off: 0.7 }, { attack: 0.2 }), { on: 0.3, off: 0.7, attack: 0.2 });
  assert.deepEqual(changePulse({ on: 0.3, off: 0.7, attack: 0.2 }, { on: 1 }), { on: 1, off: 0.7, attack: 0.2 }, "the other edges stay");
  assert.deepEqual(changePulse({ on: 0.3, off: 0.7, attack: 0.2, release: 0.5 }, { attack: 0.02 }), { on: 0.3, off: 0.7, release: 0.5 });
  // (and it survives the map: a clean round trip)
  const spec = readSound({ x: 1, y: 1, kind: "tone", id: "alarm", pulse: changePulse({ on: 0.3, off: 0.7 }, { release: 0.4 }) })!;
  assert.deepEqual(readSound(JSON.parse(JSON.stringify(spec))), spec);
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

// ---- samples
{
  const base = { x: 1, y: 2, kind: "sample" } as const;
  assert.deepEqual(readSound({ ...base, sample: "hammer" }), { ...base, sample: "hammer", volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default });
  // a rate and a pause belong to a sample, limited; a rate of 1 is the default and not written
  assert.equal(readSound({ ...base, sample: "hammer", rate: 9 })!.rate, 2);
  assert.equal(readSound({ ...base, sample: "hammer", rate: 0.1 })!.rate, 0.5);
  assert.equal(readSound({ ...base, sample: "hammer", rate: 1 })!.rate, undefined);
  assert.equal(readSound({ ...base, sample: "hammer", rate: "fast" })!.rate, undefined);
  assert.deepEqual(readSound({ ...base, sample: "hammer", interval: { min: 3, max: 8 } })!.interval, { min: 3, max: 8 });
  assert.deepEqual(readSound({ ...base, sample: "hammer", interval: { min: -3, max: 9999 } })!.interval, { min: 0, max: 600 });
  assert.equal(readSound({ ...base, sample: "hammer", interval: { min: 3 } })!.interval, undefined);
  assert.deepEqual(readSound({ ...base, sample: "hammer", interval: { min: 8, max: 3 } })!.interval, { min: 8, max: 3 }, "kept as written: the problems list shows it");
  // a loop has no pause; a pulse is not for samples; tone and noise fields do not belong to a sample
  assert.equal(readSound({ ...base, sample: "fire-crackle", interval: { min: 3, max: 8 } })!.interval, undefined);
  const mixed = readSound({ ...base, sample: "hammer", pulse: { on: 1, off: 1 }, wave: "saw", pitch: 800, noise: "pink" })!;
  assert.deepEqual([mixed.pulse, mixed.wave, mixed.pitch, mixed.noise], [undefined, undefined, undefined, undefined]);
  // rate / interval / sample do not belong to a tone
  assert.deepEqual(readSound({ x: 1, y: 2, kind: "tone", sample: "hammer", rate: 2, interval: { min: 1, max: 2 } }), { x: 1, y: 2, kind: "tone", volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default });
  // an unknown id is kept (the file is not damaged for it) but warned of, and it does not sound; none at all, too
  assert.equal(readSound({ ...base, sample: "gong" })!.sample, "gong");
  assert.equal(readSound({ ...base })!.sample, undefined);
  assert.equal(readSound({ ...base, sample: 5 })!.sample, undefined);
  // a clean round trip
  const spec = readSound({ ...base, sample: "goblin-cackle", rate: 1.25, interval: { min: 3, max: 8 }, volume: 0.4, id: "g", active: false })!;
  assert.deepEqual(readSound(JSON.parse(JSON.stringify(spec))), spec);
  // resolved: defaults filled in; a loop's interval and a sample's pulse are not there
  const cackle = resolveSound(readSound({ ...base, sample: "goblin-cackle", interval: { min: 8, max: 3 } })!);
  assert.deepEqual([cackle.kind, cackle.sample, cackle.rate, cackle.interval, cackle.pulse], ["sample", "goblin-cackle", 1, { min: 3, max: 8 }, undefined], "min and max put in order");
  assert.equal(resolveSound({ ...base, sample: "hammer", volume: 1, range: 4 }).interval, undefined, "no interval: once");
  assert.equal(resolveSound({ ...base, sample: "fire-crackle", volume: 1, range: 4, interval: { min: 1, max: 2 } }).interval, undefined, "a loop never pauses");
  assert.equal(resolveSound({ ...base, sample: "fire-crackle", volume: 1, range: 4, pulse: { on: 1, off: 1 } }).pulse, undefined, "no pulse on a sample");
  assert.equal(resolveSound({ x: 0, y: 0, kind: "tone", volume: 1, range: 4 }).sample, "");
  assert.equal(resolveSound({ x: 0, y: 0, kind: "tone", volume: 1, range: 4 }).rate, 1);
  // what makes two samples the same voice: the file and the speed
  const key = (sample: string, rate?: number) => waveKey(resolveSound({ ...base, sample, volume: 1, range: 4, rate }));
  assert.equal(key("hammer"), key("hammer", 1));
  assert.notEqual(key("hammer"), key("hammer", 1.5));
  assert.notEqual(key("hammer"), key("goblin-death"));
  assert.notEqual(key("hammer"), waveKey({ kind: "noise", wave: "sine", pitch: 440, noise: "white" }));
  // the problems
  assert.deepEqual(
    soundProblems([
      { ...base, volume: 0.5, range: 5, sample: "hammer", interval: { min: 3, max: 8 } },
      { ...base, volume: 0.5, range: 5, sample: "gong" },
      { ...base, volume: 0.5, range: 5 },
      { ...base, volume: 0.5, range: 5, sample: "hammer", interval: { min: 8, max: 3 } },
    ]).map((p) => `${p.code}#${p.index}`),
    ["soundSampleUnknown#1", "soundSampleUnknown#2", "soundIntervalOrder#3"],
  );
  // a new sound from the editor's template
  assert.deepEqual(newSound(2, 2, { kind: "sample", sample: "hammer", interval: { min: 3, max: 8 } }), { x: 2, y: 2, kind: "sample", sample: "hammer", interval: { min: 3, max: 8 }, volume: SOUND_LIMITS.volume.default, range: SOUND_LIMITS.range.default });
  // (switching a template from a tone to a sample leaves its wave behind)
  assert.equal(newSound(2, 2, { kind: "sample", sample: "hammer", wave: "saw", pulse: { on: 1, off: 1 } }).pulse, undefined);
}

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
