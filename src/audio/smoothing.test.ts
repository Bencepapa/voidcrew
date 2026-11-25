// Run: npx tsx src/audio/smoothing.test.ts
import assert from "node:assert/strict";
import { MIN_GATE_SECONDS, Smoother, TAU, approach, approachLog, gateTimeConstant, smoothingAlpha } from "./smoothing";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

// ---- the share covered
near(smoothingAlpha(0, 0.2), 0);
near(smoothingAlpha(-1, 0.2), 0, 1e-12);
near(smoothingAlpha(1, 0), 1, 1e-12);
near(smoothingAlpha(0.2, 0.2), 1 - Math.exp(-1));
assert.ok(smoothingAlpha(0.1, 0.2) < smoothingAlpha(0.2, 0.2), "longer: more");
assert.ok(smoothingAlpha(100, 0.2) > 0.999999);

// ---- an approach: monotonic, never overshoots, frame-rate independent
{
  let v = 0;
  let last = 0;
  for (let i = 0; i < 100; i++) {
    v = approach(v, 1, 1 / 60, 0.2);
    assert.ok(v >= last && v <= 1, "monotonic, below the target");
    last = v;
  }
  assert.ok(v > 0.99, "after 1.7 s it has arrived");
  // (the same time in different steps ends in the same place)
  let a = 0;
  for (let i = 0; i < 60; i++) a = approach(a, 1, 1 / 60, 0.2);
  let b = 0;
  for (let i = 0; i < 10; i++) b = approach(b, 1, 0.1, 0.2);
  near(a, b, 1e-9);
  near(a, 1 - Math.exp(-5), 1e-9);
  // (about 95% of a jump in three time constants)
  near(approach(0, 1, 3 * 0.2, 0.2), 1 - Math.exp(-3));
}

// ---- in the log domain: a sweep through the octaves
{
  const mid = approachLog(20000, 1600, 0.2 * Math.LN2, 0.2);
  // (half-way in log terms after ln 2 time constants' worth... 1 - exp(-ln 2) = 0.5)
  near(mid, Math.sqrt(20000 * 1600), 1e-6);
  assert.ok(mid < 20000 && mid > 1600);
  // (the linear one is still near the top at that moment: the log one is what the ear wants)
  assert.ok(approach(20000, 1600, 0.2 * Math.LN2, 0.2) > mid);
  near(approachLog(1000, 1000, 1, 0.2), 1000);
  assert.ok(Number.isFinite(approachLog(0, 1000, 0.1, 0.2)), "a zero start is not a division by zero");
}

// ---- the smoother: the first call snaps, then each value follows its own curve
{
  const s = new Smoother({ pan: { tau: TAU.pan }, cutoff: { tau: TAU.cutoff, log: true } });
  assert.equal(s.values, null);
  assert.deepEqual(s.step({ pan: 0.5, cutoff: 20000 }, 0.016), { pan: 0.5, cutoff: 20000 }, "snaps first");
  const next = s.step({ pan: -0.5, cutoff: 1600 }, 0.016);
  assert.ok(next.pan < 0.5 && next.pan > 0, "pan moves, not jumps");
  assert.ok(next.cutoff < 20000 && next.cutoff > 10000, "so does the cutoff");
  // (the pan, with the shorter time constant, has covered a bigger share of its way, in its own scale)
  assert.ok((0.5 - next.pan) / 1.0 > 1 - Math.exp(-0.016 / TAU.cutoff) - 1e-9, "the shorter constant is the quicker");
  for (let i = 0; i < 400; i++) s.step({ pan: -0.5, cutoff: 1600 }, 0.016);
  near(s.values!.pan, -0.5, 1e-6);
  near(s.values!.cutoff, 1600, 1e-3);
  // snap puts values in at once
  assert.deepEqual(s.snap({ pan: 1, cutoff: 500 }), { pan: 1, cutoff: 500 });
  // a stalled clock (dt 0) changes nothing
  assert.deepEqual(s.step({ pan: 0, cutoff: 9000 }, 0), { pan: 1, cutoff: 500 });
}

// ---- the time constants are the ones asked for
assert.ok(TAU.level >= 0.15 && TAU.level <= 0.25 && TAU.cutoff >= 0.15 && TAU.wallGain >= 0.15 && TAU.rear >= 0.15);
// (the doorway's voice: about 0.35 s to be 95% there)
near(3 * TAU.fadePortal, 0.36, 0.02);
assert.ok(TAU.fadeDirect < TAU.fadePortal);

// ---- a pulse's gate
near(gateTimeConstant(0.3), 0.1);
near(gateTimeConstant(0.02), 0.02 / 3);
near(gateTimeConstant(0), MIN_GATE_SECONDS / 3, 1e-12);
near(gateTimeConstant(NaN), MIN_GATE_SECONDS / 3, 1e-12);

console.log("smoothing: ok");
