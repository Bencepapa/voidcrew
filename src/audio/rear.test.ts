// Run: npx tsx src/audio/rear.test.ts
import assert from "node:assert/strict";
import { DEFAULT_REAR_STRENGTH, rearFilter, rearShadow } from "./rear";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);
const db = (gain: number) => 20 * Math.log10(gain);

// ---- the strengths: nothing, the default and the heavy one, straight behind
near(rearShadow(0).cutoff, 18000);
near(rearShadow(0).gain, 1);
near(rearShadow(DEFAULT_REAR_STRENGTH).cutoff, 4000, 1e-6);
near(db(rearShadow(DEFAULT_REAR_STRENGTH).gain), -2.5, 1e-9);
near(rearShadow(1).cutoff, 2000, 1e-6);
near(db(rearShadow(1).gain), -6, 1e-9);
assert.equal(DEFAULT_REAR_STRENGTH, 0.5);

// ---- it only gets heavier with the strength
let cutoff = Infinity;
let gain = Infinity;
for (let s = 0; s <= 1.0001; s += 0.05) {
  const shadow = rearShadow(s);
  assert.ok(shadow.cutoff <= cutoff + 1e-9 && shadow.gain <= gain + 1e-12, "monotonic");
  cutoff = shadow.cutoff;
  gain = shadow.gain;
}
// limited, and junk is no strength
near(rearShadow(7).cutoff, 2000, 1e-6);
near(rearShadow(-1).cutoff, 18000);
near(rearShadow(NaN).cutoff, 18000);

// ---- by how far behind: nothing in front or at the side, the whole shadow straight behind
for (const strength of [0, 0.25, 0.5, 1]) {
  near(rearFilter(0, strength).cutoff, 18000);
  near(rearFilter(0, strength).gain, 1);
  near(rearFilter(1, strength).cutoff, rearShadow(strength).cutoff, 1e-6);
  near(rearFilter(1, strength).gain, rearShadow(strength).gain);
}
assert.ok(rearFilter(0.5).cutoff < 18000 && rearFilter(0.5).cutoff > rearFilter(1).cutoff);
assert.ok(rearFilter(0.5).gain < 1 && rearFilter(0.5).gain > rearFilter(1).gain);
assert.equal(rearFilter(3).cutoff, rearFilter(1).cutoff, "limited");
assert.equal(rearFilter(-1).cutoff, 18000);
// strength 0 is off whatever is behind
near(rearFilter(1, 0).cutoff, 18000);
near(rearFilter(1, 0).gain, 1);
// the default is not the underwater one: a clear 4 kHz, not a few hundred Hz
assert.ok(rearFilter(1).cutoff >= 3500);

console.log("rear: ok");
