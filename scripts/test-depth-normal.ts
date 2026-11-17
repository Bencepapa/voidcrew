/*
 * Self-check for src/render/depthNormal.ts. The repo has no test runner, so
 * this is a plain tsx script:   npx tsx scripts/test-depth-normal.ts
 *
 * The expected pixels/checksums below were produced by normalMap/src/core.js
 * with the same image and settings (its non-ported stages neutralised:
 * darkLift 0, flatten 0, detail 1, bevel 0, wrap false, keepAlpha true).
 */
import { strict as assert } from "node:assert";
import {
  defaultDepthNormalParams,
  generateDepth,
  generateMaps,
  generateNormal,
  type DepthNormalParams,
} from "../src/render/depthNormal";
import { previewSize } from "../src/render/depthNormalAsync";

const W = 64;
const H = 64;
const source = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    let v = Math.round((255 * x) / (W - 1)); // horizontal ramp
    if (x >= 24 && x < 40 && y >= 24 && y < 40) v = 220; // flat square
    source[i] = v;
    source[i + 1] = v;
    source[i + 2] = v;
    source[i + 3] = x < 4 ? 0 : (x + y) % 2 === 0 ? 255 : 128;
  }
}

const params: Partial<DepthNormalParams> = {
  oilRadius: 2,
  oilPasses: 2,
  blur: 1,
  levels: { auto: true, black: 0, white: 1, gamma: 1, invert: false },
  preBlur: 0.5,
  strength: 2,
  flipY: false,
};

const at = (rgba: Uint8ClampedArray, x: number, y: number) =>
  Array.from(rgba.subarray((y * W + x) * 4, (y * W + x) * 4 + 4));

function fnv1a(rgba: Uint8ClampedArray, channels: number[]): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < rgba.length; i += 4) {
    for (const c of channels) {
      h ^= rgba[i + c];
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return h >>> 0;
}

// ---- defaults match the core.js defaults of the ported stages -------------
assert.equal(defaultDepthNormalParams.oilRadius, 4);
assert.equal(defaultDepthNormalParams.oilPasses, 1);
assert.equal(defaultDepthNormalParams.blur, 2);
assert.equal(defaultDepthNormalParams.preBlur, 0);
assert.equal(defaultDepthNormalParams.strength, 3);
assert.equal(defaultDepthNormalParams.flipY, false);
assert.equal(defaultDepthNormalParams.levels.auto, true);
assert.equal(defaultDepthNormalParams.levels.black, 0);
assert.equal(defaultDepthNormalParams.levels.white, 1);
assert.equal(defaultDepthNormalParams.levels.gamma, 1);
assert.equal(defaultDepthNormalParams.levels.invert, false);

// ---- full pipeline --------------------------------------------------------
const maps = generateMaps(source, W, H, params);
assert.equal(maps.depth.length, W * H * 4);
assert.equal(maps.normal.length, W * H * 4);

// a flat region gives a flat normal
assert.deepEqual(at(maps.normal, 31, 31), [128, 128, 255, 255]);

// a ramp that brightens to the right tilts the normal left (red < 128)
for (const [x, y] of [[8, 50], [50, 10]] as const) {
  const n = at(maps.normal, x, y);
  assert(n[0] < 120, `ramp tilt red at ${x},${y}: ${n[0]}`);
  assert(n[2] > 150, `ramp tilt blue at ${x},${y}: ${n[2]}`);
}

// depth is grayscale, alpha copied from the diffuse (transparent stays so)
for (let i = 0; i < W * H; i++) {
  const j = i * 4;
  assert.equal(maps.depth[j], maps.depth[j + 1]);
  assert.equal(maps.depth[j], maps.depth[j + 2]);
  assert.equal(maps.depth[j + 3], source[j + 3]);
  assert.equal(maps.normal[j + 3], source[j + 3]);
}
assert.equal(at(maps.depth, 2, 2)[3], 0);
assert.equal(at(maps.normal, 2, 2)[3], 0);
assert.equal(at(maps.depth, 8, 50)[3], 255);

// ---- matches core.js on fixed pixels (within one level) -------------------
const expectedDepth: Array<[number, number, number]> = [
  [0, 0, 1], [2, 2, 4], [8, 50, 30], [31, 31, 221],
  [50, 10, 204], [63, 63, 255], [31, 8, 123], [8, 31, 30],
];
for (const [x, y, v] of expectedDepth) {
  const p = at(maps.depth, x, y);
  for (let c = 0; c < 3; c++) assert(Math.abs(p[c] - v) <= 1, `depth ${x},${y}: ${p}`);
}

const expectedNormal: Array<[number, number, number, number, number]> = [
  [0, 0, 99, 128, 252],
  [2, 2, 14, 138, 185],
  [8, 50, 15, 128, 187],
  [31, 31, 128, 128, 255],
  [50, 10, 22, 139, 198],
  [63, 63, 62, 128, 237],
  [31, 8, 5, 125, 162],
  [8, 31, 15, 128, 187],
];
for (const [x, y, r, g, b] of expectedNormal) {
  const p = at(maps.normal, x, y);
  assert(Math.abs(p[0] - r) <= 1, `normal red ${x},${y}: ${p}`);
  assert(Math.abs(p[1] - g) <= 1, `normal green ${x},${y}: ${p}`);
  assert(Math.abs(p[2] - b) <= 1, `normal blue ${x},${y}: ${p}`);
}
// whole-image fingerprints (core.js: depth RGB 3879044081, normal RGBA 1115965850)
assert.equal(fnv1a(maps.depth, [0, 1, 2]), 3879044081);
assert.equal(fnv1a(maps.normal, [0, 1, 2, 3]), 1115965850);

// ---- separate stages agree with the combined call -------------------------
const depth = generateDepth(source, W, H, params);
assert.deepEqual(Array.from(depth), Array.from(maps.depth));
const normalFromDepth = generateNormal(depth, W, H, params);
assert.equal(normalFromDepth.length, W * H * 4);
for (let j = 3; j < normalFromDepth.length; j += 4) assert.equal(normalFromDepth[j], depth[j]);
assert.deepEqual(at(normalFromDepth, 31, 31), [128, 128, 255, 255]);

// ---- flipY mirrors green --------------------------------------------------
const flipped = generateMaps(source, W, H, { ...params, flipY: true });
assert.equal(flipped.depth.length, maps.depth.length);
for (let j = 1; j < flipped.normal.length; j += 4) {
  assert(Math.abs((maps.normal[j] - 128) + (flipped.normal[j] - 128)) <= 1, `flipY at ${j}`);
}

// ---- preview helper -------------------------------------------------------
assert.deepEqual(previewSize(1280, 720), { width: 640, height: 360, scale: 0.5 });
assert.deepEqual(previewSize(300, 200), { width: 300, height: 200, scale: 1 });
assert.deepEqual(previewSize(1000, 1000), { width: 640, height: 640, scale: 0.64 });
assert.deepEqual(previewSize(1001, 1), { width: 640, height: 1, scale: 640 / 1001 });
assert.deepEqual(previewSize(0, 0), { width: 1, height: 1, scale: 1 });

console.log("depthNormal: all checks passed");
