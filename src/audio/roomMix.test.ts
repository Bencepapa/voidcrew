// Run: npx tsx src/audio/roomMix.test.ts
import assert from "node:assert/strict";
import { DEFAULT_REVERB_AMOUNT, INSULATION_STRENGTH, WET_FAR, WET_FAR_DISTANCE, WET_NEAR, createRoomTracker, insulationFactor, masterSend, wallInsulation, wetRatio, wetSend } from "./roomMix";
import { MUFFLE_CUTOFFS, muffle, voiceTargets } from "./soundField";
import { NO_PLACE, type Place } from "./acoustics";
import { resolveSound } from "../game/sounds";

// ---- a far sound is more echo than a near one
assert.equal(wetRatio(0), WET_NEAR);
assert.equal(wetRatio(1), WET_NEAR, "within a cell: the least");
assert.equal(wetRatio(WET_FAR_DISTANCE), WET_FAR);
assert.equal(wetRatio(500), WET_FAR, "no more beyond");
assert.ok(Math.abs(WET_NEAR - 0.2) < 1e-12 && Math.abs(WET_FAR - 0.8) < 1e-12);
{
  let last = -1;
  for (let d = 0; d <= 20; d += 0.25) {
    const r = wetRatio(d);
    assert.ok(r >= last - 1e-12, `grows with the distance: ${d}`);
    last = r;
  }
  assert.ok(wetRatio(8) > 0.4 && wetRatio(8) < 0.6, "about the middle half way");
}
// the send: the zone's reverb times the distance's share
assert.equal(wetSend(0, 5), 0, "no echo in the room: no send");
assert.ok(Math.abs(wetSend(0.5, 1) - 0.1) < 1e-12);
assert.ok(Math.abs(wetSend(0.5, 16) - 0.4) < 1e-12);
assert.ok(wetSend(0.5, 10) > wetSend(0.5, 2));
assert.equal(wetSend(9, 1), WET_NEAR, "the reverb is limited to 1");
assert.equal(wetSend(-1, 1), 0);

// ---- the master slider
assert.equal(masterSend(DEFAULT_REVERB_AMOUNT), 1, "the default plays the zones' numbers as they are");
assert.equal(masterSend(0), 0);
assert.ok(Math.abs(masterSend(1) - 1 / 0.6) < 1e-12);
assert.equal(masterSend(0.9, false), 0, "the switch off: none");
assert.equal(masterSend(5), masterSend(1), "limited");
assert.equal(DEFAULT_REVERB_AMOUNT, 0.6);

// ---- insulation: each wall counts for 1 .. 1.6 walls
assert.equal(insulationFactor(0), 1);
assert.ok(Math.abs(insulationFactor(1) - 1.6) < 1e-12);
assert.ok(Math.abs(insulationFactor(0.5) - 1.3) < 1e-12);
assert.equal(insulationFactor(9), 1 + INSULATION_STRENGTH);
assert.equal(wallInsulation(0.2, 0.7), 0.7, "the stronger end counts");
assert.equal(wallInsulation(0, 0), 0);
// the muffling: unchanged at factor 1, steeper with a higher one
for (const walls of [0, 1, 2, 3, 5]) {
  const plain = muffle(walls);
  assert.deepEqual(muffle(walls, 1), plain);
  assert.equal(plain.gain, 0.5 ** Math.min(3, walls));
}
assert.deepEqual([0, 1, 2, 3].map((n) => muffle(n).cutoff), [...MUFFLE_CUTOFFS], "the old table");
{
  const one = muffle(1);
  const insulated = muffle(1, 1.6);
  assert.ok(insulated.cutoff < one.cutoff && insulated.cutoff > muffle(2).cutoff, "1.6 walls: between one and two");
  assert.ok(insulated.gain < one.gain && insulated.gain > muffle(2).gain);
  assert.ok(Math.abs(insulated.gain - 0.5 ** 1.6) < 1e-12);
  assert.equal(muffle(0, 1.6).cutoff, 20000, "no wall, nothing to insulate");
  assert.equal(muffle(0, 1.6).gain, 1);
  // it never gets worse than the table's end and one more step
  assert.ok(muffle(3, 1.6).cutoff >= 200 && muffle(3, 1.6).gain >= 0.5 ** 4);
  // the factor never makes it milder
  assert.deepEqual(muffle(2, 0.2), muffle(2));
}
// ... through the voices of a sound with a wall in the way
{
  const sound = resolveSound({ x: 9, y: 1, kind: "tone", volume: 1, range: 20 });
  const emitter = { id: 0, sound, x: 9, y: 0.5, z: 1 };
  const listener = { x: 3, y: 0.5, z: 3 };
  const plain = voiceTargets(listener, emitter, { id: 0, walls: 1 })[0];
  const insulated = voiceTargets(listener, emitter, { id: 0, walls: 1, insulation: 1 })[0];
  assert.equal(plain.cutoff, 1600);
  assert.ok(insulated.cutoff < plain.cutoff && insulated.wallGain < plain.wallGain);
  assert.equal(voiceTargets(listener, emitter, { id: 0, walls: 1, insulation: 0 })[0].cutoff, 1600);
  // no wall: nothing changes
  assert.deepEqual(voiceTargets(listener, emitter, { id: 0, walls: 0, insulation: 1 }), voiceTargets(listener, emitter, { id: 0, walls: 0 }));
}

// ---- following the listener's room: no flicker on a border
{
  const place = (key: string, decay = 1): Place => ({ acoustics: { reverb: 0.3, decay, softness: 0.5, insulation: 0 }, source: "zone", key });
  const tracker = createRoomTracker(0.3);
  assert.equal(tracker.update(0, place("a")).key, "a", "the first room is taken at once");
  assert.equal(tracker.update(0.1, place("b")).key, "a", "another room: not yet");
  assert.equal(tracker.update(0.3, place("b")).key, "a");
  assert.equal(tracker.update(0.45, place("b")).key, "b", "after 0.3 s in it");
  // back and forth over a border: it stays where it was
  const flick = createRoomTracker(0.3);
  flick.update(0, place("a"));
  for (let i = 1; i <= 20; i++) assert.equal(flick.update(i * 0.05, place(i % 2 ? "b" : "a")).key, "a", `flicker ${i}`);
  // a zone being edited (the same room, other numbers): at once
  const live = createRoomTracker(0.3);
  live.update(0, place("a", 1));
  assert.equal(live.update(0.01, place("a", 3)).acoustics.decay, 3);
  // a reset: the next is taken at once
  live.reset();
  assert.equal(live.update(0.02, place("z")).key, "z");
  assert.equal(createRoomTracker().update(0, NO_PLACE).key, "none");
}

console.log("roomMix: ok");
