// Run: npx tsx src/audio/impulse.test.ts
import assert from "node:assert/strict";
import { IMPULSE_MAX_DECAY, PREDELAY, impulseParams, makeImpulse, softnessCutoff } from "./impulse";

const SR = 48000;
const energy = (x: Float32Array, from = 0, to = x.length) => {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return e;
};
// the share of the energy that is in the highs: the first difference of a signal is its highs, boosted
const brightness = (x: Float32Array) => {
  let d = 0;
  for (let i = 1; i < x.length; i++) d += (x[i] - x[i - 1]) ** 2;
  return d / energy(x);
};

// ---- length: about the decay (and the silence before the echo)
for (const decay of [0.1, 0.5, 2.2, 3.5, 8]) {
  const [left, right] = makeImpulse(decay, 0.5, SR);
  assert.equal(left.length, right.length);
  const seconds = left.length / SR;
  assert.ok(seconds >= decay && seconds <= decay * 1.3 + PREDELAY + 1e-6, `${decay} s decay: ${seconds} s long`);
  assert.equal(makeImpulse(decay, 0.5, SR).length, 2, "two channels");
}
assert.equal(makeImpulse(99, 0, 8000)[0].length, Math.round(PREDELAY * 8000) + 8 * 8000, "no longer than the longest decay");
assert.equal(makeImpulse(0.001, 0, 8000)[0].length, Math.round(PREDELAY * 8000) + Math.round(0.1 * 8000), "no shorter than the shortest");
assert.equal(IMPULSE_MAX_DECAY, 8);

// ---- energy: 1 in each channel, silent before the echo starts
{
  const [left, right] = makeImpulse(1.5, 0.3, SR);
  assert.ok(Math.abs(energy(left) - 1) < 1e-4, `left energy ${energy(left)}`);
  assert.ok(Math.abs(energy(right) - 1) < 1e-4);
  assert.equal(energy(left, 0, Math.round(PREDELAY * SR)), 0, "the pre-delay is silent");
  // the two ears hear different echoes (a wide room)
  let same = 0;
  for (let i = 0; i < 2000; i++) if (left[i + 1000] === right[i + 1000]) same++;
  assert.ok(same < 20, "left and right are different noise");
  // the same room always rings the same
  assert.deepEqual(makeImpulse(1.5, 0.3, SR)[0], left);
}

// ---- the energy falls away: every tenth of a second has less than the one before
for (const [decay, softness] of [[0.6, 0.3], [2.2, 0.3], [3.5, 0.75], [8, 0.5], [2.2, 0]] as const) {
  const [left] = makeImpulse(decay, softness, SR);
  const window = Math.round(0.1 * SR);
  let last = Infinity;
  const start = Math.round(PREDELAY * SR);
  for (let from = start; from + window <= left.length; from += window) {
    const e = energy(left, from, from + window);
    assert.ok(e < last, `${decay} s, softness ${softness}: ${from / SR} s has ${e}, the window before ${last}`);
    last = e;
  }
}
// ... and by 60 dB over the decay: the last tenth holds a very small part
{
  const [left] = makeImpulse(1, 0.4, SR);
  const early = energy(left, 0, Math.round(0.2 * SR));
  const late = energy(left, Math.round(0.8 * SR), left.length);
  assert.ok(late < early * 1e-3, `late ${late} vs early ${early}`);
}

// ---- softness: the highs fall away
{
  const hard = brightness(makeImpulse(1.5, 0, SR)[0]);
  const mid = brightness(makeImpulse(1.5, 0.5, SR)[0]);
  const soft = brightness(makeImpulse(1.5, 1, SR)[0]);
  assert.ok(hard > mid && mid > soft, `brightness ${hard} > ${mid} > ${soft}`);
  assert.ok(soft < hard * 0.5, `a soft room has far fewer highs: ${soft} vs ${hard}`);
  // the highs fall faster later in the echo: the tail of a soft room is darker than its start
  const [left] = makeImpulse(2, 0.9, SR);
  const head = left.subarray(Math.round(0.05 * SR), Math.round(0.35 * SR));
  const tail = left.subarray(Math.round(1.2 * SR), Math.round(1.5 * SR));
  assert.ok(brightness(Float32Array.from(tail)) < brightness(Float32Array.from(head)), "darker as it goes");
}

// ---- the numbers rounded: a slider being dragged does not make an impulse for every step
assert.equal(impulseParams(1.51, 0.52).key, impulseParams(1.49, 0.5).key);
assert.notEqual(impulseParams(1.5, 0.5).key, impulseParams(1.6, 0.5).key);
assert.equal(impulseParams(0, 0).decay, 0.1, "limited");
assert.equal(impulseParams(50, 5).decay, 8);
assert.equal(impulseParams(1, 5).softness, 1);

// ---- the high cut of the bus
assert.ok(Math.abs(softnessCutoff(0) - 16000) < 1e-6);
assert.ok(Math.abs(softnessCutoff(1) - 2500) < 1e-6);
assert.ok(softnessCutoff(0.3) > softnessCutoff(0.6), "softer: lower");
assert.equal(softnessCutoff(-3), 16000);
assert.equal(softnessCutoff(9), softnessCutoff(1));

console.log("impulse: ok");
