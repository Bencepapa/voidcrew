// Run: npx tsx src/audio/meter.test.ts
import assert from "node:assert/strict";
import { dbText, rms, toDb } from "./meter";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

assert.equal(rms([]), 0);
assert.equal(rms([0, 0, 0]), 0);
near(rms([1, -1, 1, -1]), 1);
near(rms([0.5, 0.5]), 0.5);
// a sine of amplitude 1 has an RMS of 1/sqrt 2
{
  const n = 4800;
  const sine = Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 10 * i) / n));
  near(rms(sine), Math.SQRT1_2, 1e-9);
  near(toDb(rms(sine)), -3.0103, 1e-3);
}
near(toDb(1), 0);
near(toDb(0.1), -20);
assert.equal(toDb(0), -Infinity);
assert.equal(dbText(0), "-inf");
assert.equal(dbText(1e-7), "-inf", "below the floor");
assert.equal(dbText(0.5), "-6.0 dB");

console.log("meter: ok");
