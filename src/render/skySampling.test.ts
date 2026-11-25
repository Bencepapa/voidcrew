import assert from "node:assert/strict";
import { QUICK_SKY_DOME_DIRECTIONS, SKY_DOME_DIRECTIONS, sampleSkyDome, sunDirection } from "./skySampling";

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-12);
const north = sunDirection(0, 0);
near(north[2], -1);
const east = sunDirection(90, 30);
near(east[0], Math.sqrt(3) / 2);
near(east[1], 0.5);
near(east[2], 0);
near(sunDirection(180, 90)[1], 1);

assert.equal(QUICK_SKY_DOME_DIRECTIONS.length, 8);
assert.equal(SKY_DOME_DIRECTIONS.length, 12);
for (const directions of [QUICK_SKY_DOME_DIRECTIONS, SKY_DOME_DIRECTIONS]) {
  for (const ray of directions) {
    near(Math.hypot(...ray), 1);
    assert.ok(ray[1] > 0);
  }
  assert.deepEqual(sampleSkyDome(directions, () => false), { fraction: 0, x: 0, y: 0, z: 0 });
  const open = sampleSkyDome(directions, () => true);
  assert.equal(open.fraction, 1);
  near(open.x, 0);
  near(open.y, 0.5);
  near(open.z, 0);
  const upperRing = sampleSkyDome(directions, (i) => i >= directions.length / 2);
  assert.equal(upperRing.fraction, 0.5);
  near(upperRing.y, 0.75);
  const one = sampleSkyDome(directions, (i) => i === 0);
  assert.deepEqual([one.x, one.y, one.z], directions[0]);
}
