// Run: npx tsx src/audio/stereo.test.ts
import assert from "node:assert/strict";
import { STEREO, earGains, panWidth, sideOf, stereoPan } from "./stereo";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} is not ${b}`);

// the listener at the origin, looking north (x east, z south: north is -z); its right hand is east
const north = { x: 0, z: 0, fx: 0, fz: -1 };
const east = { x: 0, z: 0, fx: 1, fz: 0 };

// ---- which side
near(sideOf(north, 5, 0), 1);
near(sideOf(north, -5, 0), -1);
near(sideOf(north, 0, -5), 0, 1e-9);
near(sideOf(north, 0, 5), 0, 1e-9);
assert.ok(sideOf(north, 3, -3) > 0.7 && sideOf(north, 3, -3) < 0.72, "ahead and to the right: the sine of 45 degrees");
assert.ok(sideOf(north, 3, 3) > 0.7, "behind and to the right: the same side as ahead (the sine does not know front from back)");
near(sideOf(east, 0, 5), 1, 1e-9); // (turned east, south is on the right)
near(sideOf(east, 0, -5), -1, 1e-9);
// the facing vector need not be a unit
near(sideOf({ x: 0, z: 0, fx: 0, fz: -3 }, 5, 0), 1);
// right on top of the listener: no side, and no flip as it is passed
assert.equal(sideOf(north, 0, 0), 0);
assert.ok(Math.abs(sideOf(north, 0.05, 0)) < 0.1);
assert.ok(sideOf(north, 0.5, 0) >= 0.99);

// ---- the width: from a wide, diffuse near sound to a point-like far one
near(panWidth(0.2, 0), STEREO.nearWidth);
near(panWidth(1, 0), STEREO.nearWidth);
near(panWidth(7, 0), STEREO.farWidth);
near(panWidth(30, 0), STEREO.farWidth);
assert.ok(STEREO.nearWidth >= 0.3 && STEREO.nearWidth <= 0.4, "a cell away: ~0.35");
assert.ok(STEREO.farWidth < 1, "never in one ear alone");
let last = 0;
for (let d = 0; d <= 9; d += 0.25) {
  const w = panWidth(d, 0);
  assert.ok(w >= last - 1e-12, "grows with the distance");
  last = w;
}
// (smooth: no step anywhere)
for (let d = 1; d < 7; d += 0.05) assert.ok(panWidth(d + 0.05, 0) - panWidth(d, 0) < 0.06, "no jump");
// a loud sound is wider (less to one side) than a quiet one at the same distance
assert.ok(panWidth(4, 1) < panWidth(4, 0.2));
near(panWidth(4, 1), panWidth(4, 0) * (1 - STEREO.loudSpread));
near(panWidth(4, 5), panWidth(4, 1), 1e-12); // (the level is limited to 1)
// the doorway's voice is the widest-spread: at most 0.6, however far
assert.ok(panWidth(30, 0, true) <= STEREO.portalWidth + 1e-12);
near(panWidth(30, 0, true), STEREO.portalWidth);
assert.ok(panWidth(0.5, 0, true) <= panWidth(0.5, 0, false) + 1e-12, "and not wider-set than a direct one when near");

// ---- the balance
// exactly to the right: the right ear gets more and the left one never goes silent
{
  const near1 = stereoPan(north, 1, 0, { distance: 1, level: 0.8 });
  const far = stereoPan(north, 9, 0, { distance: 9, level: 0.1 });
  assert.ok(near1 > 0 && near1 < 0.4, "close and loud: mildly right");
  assert.ok(far > 0.65 && far <= STEREO.farWidth, "far: much more to the right");
  const gains = earGains(near1);
  assert.ok(gains.right > gains.left && gains.left > 0.4, "both ears hear a near sound, the right more");
  const farGains = earGains(far);
  assert.ok(farGains.left > 0.15, "even a far one is in the left ear (less than 16 dB down)");
  assert.ok(farGains.right > farGains.left * 3, "but the right ear is much louder");
}
// straight ahead or behind: the middle
near(stereoPan(north, 0, -6, { distance: 6, level: 0.3 }), 0, 1e-9);
near(stereoPan(north, 0, 6, { distance: 6, level: 0.3 }), 0, 1e-9);
// mirrored
near(stereoPan(north, -4, 0, { distance: 4, level: 0.3 }), -stereoPan(north, 4, 0, { distance: 4, level: 0.3 }));
// the doorway's voice: wide even when its way round is long
assert.ok(Math.abs(stereoPan(north, 1, 0, { distance: 20, level: 0.2, portal: true })) <= STEREO.portalWidth);

// ---- the ears' gains (the panner's law)
near(earGains(0).left, Math.SQRT1_2);
near(earGains(0).right, Math.SQRT1_2);
near(earGains(-1).left, 1);
near(earGains(1).right, 1);
near(earGains(1).left, 0, 1e-12);
for (const pan of [-0.7, -0.2, 0.4, 0.9]) near(earGains(pan).left ** 2 + earGains(pan).right ** 2, 1, 1e-12); // equal power

console.log("stereo: ok");
