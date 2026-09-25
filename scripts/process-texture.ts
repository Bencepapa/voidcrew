import sharp from "sharp";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseArgs } from "node:util";
import { removeSmallIslands } from "../src/render/heightLevels";

// Turns a large AI-generated wall texture + depth map (typically 1024px JPEGs
// full of compression noise) into a clean, pixel-aligned texture set for the
// game: diffuse.png, depth.png (with baked height levels) and normal.png.
//
//   npm run texture:process -- --diffuse in/color.jpg --depth in/depth.jpg --out public/textures/wall4
//
// Diffuse: median-filtered, palette-quantized at full resolution, then each
// output pixel takes the most common palette color of its source block. Unlike
// averaging (blurry, muddy edges) or nearest sampling (keeps whatever noisy
// pixel happens to sit at the sample point), this gives crisp pixel art.
//
// Depth: median-filtered, each output pixel is its block's median, then the
// grays are clustered into a few levels (1D k-means, so the levels land on
// the map's natural plateaus instead of arbitrary thresholds) and small
// speckles are merged away. The result has at most a handful of distinct
// grays, which the game uses as-is (see quantizeHeights).
//
// Normal: derived from the smooth (pre-quantization) depth, so it adds soft
// shading within each flat relief step.

const USAGE = `Usage: npm run texture:process -- --diffuse <file> --depth <file> --out <dir>
  [--size 256]            output width in pixels (height keeps the aspect ratio)
  [--colors 32]           diffuse palette size
  [--levels 6]            depth height levels (at most; close ones get merged)
  [--min-island 3]        depth regions smaller than this many pixels get merged away (1 = off)
  [--min-level-gap 0.1]   depth levels closer than this fraction of the range get merged (0 = off)
  [--fill-gaps 2]         fill dark outlines up to this many pixels wide between two raised parts (0 = off)
  [--normal-strength 3]   normal map bumpiness
  [--normal-source levels] "levels" (follows the relief steps) or "smooth" (original depth shape)
  [--normal-bevel 2]      rounds edges over about this many pixels before deriving normals (0 = sharp),
                          which gives pipes and ledges round, light-catching top and bottom halves
  [--trim]                crop both images to the diffuse's opaque area first (for cut-outs like door frames)
  [--flatten-paint]       flatten saturated paint (stripes, decals, rust) to the surface it's painted on
  [--paint-saturation 0.45] how saturated a color must be to count as paint
  [--paint-grow 2]        widen the paint areas by this many pixels (the depth's stripes are often wider)
  [--emissive-panel]      also write emissive.png: the largest bright, colorless patch (a light panel)
  [--emissive-luma 150]   how bright a pixel must be to belong to the light panel

A transparent diffuse (e.g. a door frame's opening) is kept: diffuse.png and depth.png get the
same alpha holes, which the relief builder leaves out.`;

const { values: args } = parseArgs({
  options: {
    diffuse: { type: "string" },
    depth: { type: "string" },
    out: { type: "string" },
    size: { type: "string", default: "256" },
    colors: { type: "string", default: "32" },
    levels: { type: "string", default: "6" },
    "min-island": { type: "string", default: "3" },
    "min-level-gap": { type: "string", default: "0.1" },
    "fill-gaps": { type: "string", default: "2" },
    "normal-strength": { type: "string", default: "3" },
    "normal-source": { type: "string", default: "levels" },
    "normal-bevel": { type: "string", default: "2" },
    trim: { type: "boolean", default: false },
    "flatten-paint": { type: "boolean", default: false },
    "paint-saturation": { type: "string", default: "0.45" },
    "paint-grow": { type: "string", default: "2" },
    "emissive-panel": { type: "boolean", default: false },
    "emissive-luma": { type: "string", default: "150" },
  },
});

// source pixel range [start, end) covered by output pixel t
function blockRange(t: number, outSize: number, srcSize: number): [number, number] {
  const start = Math.floor((t * srcSize) / outSize);
  const end = Math.max(start + 1, Math.floor(((t + 1) * srcSize) / outSize));
  return [start, end];
}

// weighted RGB distance - green matters most to the eye, blue least
function colorDist(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return 2 * dr * dr + 4 * dg * dg + 3 * db * db;
}

// k-means palette over a pixel sample, seeded k-means++ init so reruns on the
// same input give the same palette. (sharp's own PNG palette option ignores
// the requested color count in this version, so it can't be used here.)
function buildPalette(rgb: Uint8Array, channels: number, colors: number): Float64Array {
  const pixelCount = rgb.length / channels;
  const step = Math.max(1, Math.floor(pixelCount / 65536));
  const sample: number[] = [];
  for (let p = 0; p < pixelCount; p += step) {
    // transparent pixels (a door frame's opening) don't get palette colors
    if (channels === 4 && rgb[p * 4 + 3] < 128) continue;
    sample.push(rgb[p * channels], rgb[p * channels + 1], rgb[p * channels + 2]);
  }
  const n = sample.length / 3;

  let seed = 12345;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const centers = new Float64Array(colors * 3);
  const minDist = new Float64Array(n).fill(Infinity);
  let first = Math.floor(random() * n);
  for (let c = 0; c < colors; c++) {
    centers.set([sample[first * 3], sample[first * 3 + 1], sample[first * 3 + 2]], c * 3);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const d = colorDist(sample[i * 3], sample[i * 3 + 1], sample[i * 3 + 2], centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]);
      if (d < minDist[i]) minDist[i] = d;
      total += minDist[i];
    }
    let r = random() * total;
    first = 0;
    for (let i = 0; i < n; i++) {
      r -= minDist[i];
      if (r <= 0) {
        first = i;
        break;
      }
    }
  }

  for (let iter = 0; iter < 20; iter++) {
    const sums = new Float64Array(colors * 3);
    const counts = new Uint32Array(colors);
    for (let i = 0; i < n; i++) {
      const c = nearestColor(centers, colors, sample[i * 3], sample[i * 3 + 1], sample[i * 3 + 2]);
      sums[c * 3] += sample[i * 3];
      sums[c * 3 + 1] += sample[i * 3 + 1];
      sums[c * 3 + 2] += sample[i * 3 + 2];
      counts[c]++;
    }
    for (let c = 0; c < colors; c++) {
      if (!counts[c]) continue;
      centers[c * 3] = sums[c * 3] / counts[c];
      centers[c * 3 + 1] = sums[c * 3 + 1] / counts[c];
      centers[c * 3 + 2] = sums[c * 3 + 2] / counts[c];
    }
  }
  return centers;
}

function nearestColor(centers: Float64Array, colors: number, r: number, g: number, b: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let c = 0; c < colors; c++) {
    const d = colorDist(r, g, b, centers[c * 3], centers[c * 3 + 1], centers[c * 3 + 2]);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

interface DiffuseResult {
  // RGBA, outW x outH
  rgba: Buffer;
  // 1 = opaque cell, 0 = hole; null when the source has no transparency
  solid: Uint8Array | null;
}

async function processDiffuse(input: Buffer, outW: number, outH: number, colors: number): Promise<DiffuseResult> {
  const hasAlpha = (await sharp(input).metadata()).hasAlpha;
  // median(3) removes JPEG ringing without softening hard pixel-art edges;
  // snapping every pixel to a small palette (no dithering) removes the rest
  const { data, info } = await sharp(input).ensureAlpha().median(3).raw().toBuffer({ resolveWithObject: true });
  const { width: srcW, height: srcH } = info;
  const palette = buildPalette(data, 4, colors);

  const index = new Uint8Array(srcW * srcH);
  for (let p = 0; p < index.length; p++) {
    index[p] = nearestColor(palette, colors, data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
  }

  const rgba = Buffer.alloc(outW * outH * 4);
  const solid = hasAlpha ? new Uint8Array(outW * outH) : null;
  const counts = new Uint32Array(colors);
  for (let ty = 0; ty < outH; ty++) {
    const [y0, y1] = blockRange(ty, outH, srcH);
    for (let tx = 0; tx < outW; tx++) {
      const [x0, x1] = blockRange(tx, outW, srcW);
      counts.fill(0);
      let opaque = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = sy * srcW + sx;
          if (data[p * 4 + 3] < 128) continue;
          counts[index[p]]++;
          opaque++;
        }
      }
      let best = 0;
      for (let c = 1; c < colors; c++) if (counts[c] > counts[best]) best = c;
      // a cell is opaque when most of its source block is
      const isSolid = opaque * 2 >= (y1 - y0) * (x1 - x0);
      const o = (ty * outW + tx) * 4;
      rgba[o] = Math.round(palette[best * 3]);
      rgba[o + 1] = Math.round(palette[best * 3 + 1]);
      rgba[o + 2] = Math.round(palette[best * 3 + 2]);
      rgba[o + 3] = isSolid ? 255 : 0;
      if (solid) solid[ty * outW + tx] = isSolid ? 1 : 0;
    }
  }
  return { rgba, solid };
}

// bounding box of the pixels with alpha >= 128
async function opaqueBounds(input: Buffer) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width;
  let right = -1;
  let top = info.height;
  let bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
}

// block median of a denoised grayscale depth map, 0..255 floats
async function smoothDepth(file: Buffer, srcW: number, srcH: number, outW: number, outH: number): Promise<Float32Array> {
  const { data, info } = await sharp(file)
    .resize(srcW, srcH, { fit: "fill" })
    .removeAlpha()
    .greyscale()
    .median(5)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { channels } = info;

  const out = new Float32Array(outW * outH);
  const block: number[] = [];
  for (let ty = 0; ty < outH; ty++) {
    const [y0, y1] = blockRange(ty, outH, srcH);
    for (let tx = 0; tx < outW; tx++) {
      const [x0, x1] = blockRange(tx, outW, srcW);
      block.length = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) block.push(data[(sy * srcW + sx) * channels]);
      }
      block.sort((a, b) => a - b);
      out[ty * outW + tx] = block[block.length >> 1];
    }
  }
  return out;
}

// AI depth maps tend to draw a thin dark outline between two raised parts,
// e.g. around the clamps holding a pipe, which in relief turns into a trench
// the pipe dips into before running under the clamp. Fill any groove at most
// `maxGap` pixels wide whose sides are both raised above the wall's base
// surface and differ in height (a pipe meeting its clamp), up to the lower of
// the two sides. Left alone: seams in the base surface (panel joints - sides
// at base level) and gaps between equal parts (two parallel pipes).
function fillGapsBetweenRaised(height: Float32Array, w: number, h: number, maxGap: number, base: number): Float32Array {
  const MIN_RISE = 8;
  const MIN_SIDE_DIFF = 8;
  const out = height.slice();
  if (maxGap <= 0) return out;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = height[i];
      let fill = v;

      let left = -Infinity;
      let right = -Infinity;
      let up = -Infinity;
      let down = -Infinity;
      for (let d = 1; d <= maxGap; d++) {
        if (x - d >= 0) left = Math.max(left, height[i - d]);
        if (x + d < w) right = Math.max(right, height[i + d]);
        if (y - d >= 0) up = Math.max(up, height[i - d * w]);
        if (y + d < h) down = Math.max(down, height[i + d * w]);
      }
      for (const [a, b] of [
        [left, right],
        [up, down],
      ]) {
        const side = Math.min(a, b);
        if (side > v + MIN_RISE && side > base + MIN_RISE && Math.abs(a - b) >= MIN_SIDE_DIFF) {
          fill = Math.max(fill, side);
        }
      }
      out[i] = fill;
    }
  }
  return out;
}

function mostCommonValue(values: Float32Array): number {
  const counts = new Uint32Array(256);
  for (const v of values) counts[Math.min(255, Math.max(0, Math.round(v)))]++;
  let best = 0;
  for (let g = 1; g < 256; g++) if (counts[g] > counts[best]) best = g;
  return best;
}

// 1D k-means; returns sorted, de-duplicated centers. Starts from centers
// spread evenly over the value range rather than over quantiles: one
// dominant plateau (a floor plate covering 60% of the map) would otherwise
// grab most starting centers, leaving small but distinct features (bolts,
// raised treads) to be swallowed by a neighboring level.
function kmeans1d(values: Float32Array, k: number): number[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  let centers = Array.from({ length: k }, (_, i) => lo + ((i + 0.5) / k) * (hi - lo));

  for (let iter = 0; iter < 50; iter++) {
    const sums = new Float64Array(centers.length);
    const counts = new Uint32Array(centers.length);
    for (const v of values) {
      const c = nearest(centers, v);
      sums[c] += v;
      counts[c]++;
    }
    const next = centers.map((c, i) => (counts[i] ? sums[i] / counts[i] : c));
    const moved = next.some((c, i) => Math.abs(c - centers[i]) > 0.01);
    centers = next;
    if (!moved) break;
  }
  return [...new Set(centers.map((c) => Math.round(c * 100) / 100))].sort((a, b) => a - b);
}

// Two levels only a few grays apart are almost always one flat plateau that
// k-means split along noise or a faint lighting gradient, which shows up as
// blotchy speckle inside panels. Merge neighbors closer than `minGap` (a
// fraction of the full range) until none are left.
function mergeCloseLevels(centers: number[], values: Float32Array, minGap: number): number[] {
  const counts = new Map<number, number>();
  for (const v of values) {
    const c = centers[nearest(centers, v)];
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  // centers that ended up with no pixels (possible with evenly spread
  // starting centers) aren't levels at all
  let levels = centers.map((c) => ({ value: c, count: counts.get(c) ?? 0 })).filter((l) => l.count > 0);
  const gap = (levels[levels.length - 1].value - levels[0].value) * minGap;

  for (;;) {
    let closest = -1;
    for (let i = 0; i < levels.length - 1; i++) {
      const d = levels[i + 1].value - levels[i].value;
      if (d < gap && (closest < 0 || d < levels[closest + 1].value - levels[closest].value)) closest = i;
    }
    if (closest < 0) break;
    const a = levels[closest];
    const b = levels[closest + 1];
    const count = a.count + b.count;
    const merged = { value: count ? (a.value * a.count + b.value * b.count) / count : (a.value + b.value) / 2, count };
    levels = [...levels.slice(0, closest), merged, ...levels.slice(closest + 2)];
  }
  return levels.map((l) => l.value);
}

function nearest(centers: number[], v: number): number {
  let best = 0;
  for (let i = 1; i < centers.length; i++) {
    if (Math.abs(centers[i] - v) < Math.abs(centers[best] - v)) best = i;
  }
  return best;
}

// separable box blur with clamped edges
function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  if (radius <= 0) return src;
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const n = radius * 2 + 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += src[y * w + Math.min(w - 1, Math.max(0, x + d))];
      tmp[y * w + x] = sum / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let d = -radius; d <= radius; d++) sum += tmp[Math.min(h - 1, Math.max(0, y + d)) * w + x];
      out[y * w + x] = sum / n;
    }
  }
  return out;
}

function normalMapFromHeight(height: Float32Array, w: number, h: number, strength: number): Buffer {
  const at = (x: number, y: number) =>
    height[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))] / 255;

  const out = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Sobel; image rows grow downward, so +dy in the image is -y in the
      // OpenGL-style (Y up) tangent space three.js expects
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let nx = -dx * strength;
      let ny = dy * strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const o = (y * w + x) * 3;
      out[o] = Math.round((nx * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

// AI depth maps often give painted stripes and decals height, as if the paint
// were a raised plate. With --flatten-paint, every connected patch of
// saturated diffuse color (paint, hazard stripes, rust) takes the level most
// common along its border, i.e. the surface it's painted on. Opt-in: it
// would also flatten genuinely raised colored parts, like red pipes.
function flattenPaint(q: Uint8Array, rgba: Buffer, w: number, h: number, minSaturation: number, grow: number): number {
  const painted = new Uint8Array(w * h);
  for (let i = 0; i < painted.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    painted[i] = rgba[i * 4 + 3] && max > 60 && (max - min) / max >= minSaturation ? 1 : 0;
  }
  // Rust and dirt come as scattered specks; only real paint patches (stripes,
  // decals) count. Growing the specks too would eat into the thin dark seams
  // between panels.
  const MIN_PAINT_PATCH = 12;
  {
    const seen = new Uint8Array(w * h);
    for (let start = 0; start < painted.length; start++) {
      if (!painted[start] || seen[start]) continue;
      const comp = [start];
      seen[start] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k];
        const x = i % w;
        const y = (i - x) / w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && painted[j] && !seen[j]) {
            seen[j] = 1;
            comp.push(j);
          }
        }
      }
      if (comp.length < MIN_PAINT_PATCH) for (const i of comp) painted[i] = 0;
    }
  }
  // The depth map's version of a stripe tends to be a pixel or two wider
  // than the paint in the diffuse; grow the paint mask so the border we
  // sample lands on the surface beyond it, not on the stripe's own rim.
  const paint = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!rgba[(y * w + x) * 4 + 3]) continue;
      search: for (let dy = -grow; dy <= grow; dy++) {
        for (let dx = -grow; dx <= grow; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h && painted[yy * w + xx]) {
            paint[y * w + x] = 1;
            break search;
          }
        }
      }
    }
  }

  const visited = new Uint8Array(w * h);
  let flattened = 0;
  for (let start = 0; start < paint.length; start++) {
    if (!paint[start] || visited[start]) continue;
    const comp: number[] = [];
    const border = new Map<number, number>();
    const stack = [start];
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0) continue;
        if (paint[j]) {
          if (!visited[j]) {
            visited[j] = 1;
            stack.push(j);
          }
        } else if (rgba[j * 4 + 3]) {
          border.set(q[j], (border.get(q[j]) ?? 0) + 1);
        }
      }
    }
    let best = -1;
    let bestCount = 0;
    for (const [level, count] of border) {
      if (count > bestCount) {
        best = level;
        bestCount = count;
      }
    }
    if (best < 0) continue;
    for (const i of comp) {
      if (q[i] !== best) flattened++;
      q[i] = best;
    }
  }
  return flattened;
}

// --emissive-panel: a mask of the largest connected patch of bright,
// colorless diffuse pixels - e.g. the frosted light panel in the middle of a
// ceiling tile - for the game to light up where there's a ceiling light.
function largestBrightPatch(rgba: Buffer, w: number, h: number, minLuma: number): { mask: Uint8Array; size: number } {
  const bright = new Uint8Array(w * h);
  for (let i = 0; i < bright.length; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    bright[i] = rgba[i * 4 + 3] && luma >= minLuma && (max - min) / (max || 1) < 0.2 ? 1 : 0;
  }
  const seen = new Uint8Array(w * h);
  let best: number[] = [];
  for (let start = 0; start < bright.length; start++) {
    if (!bright[start] || seen[start]) continue;
    const comp = [start];
    seen[start] = 1;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k];
      const x = i % w;
      const y = (i - x) / w;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && bright[j] && !seen[j]) {
          seen[j] = 1;
          comp.push(j);
        }
      }
    }
    if (comp.length > best.length) best = comp;
  }
  const mask = new Uint8Array(w * h);
  for (const i of best) mask[i] = 1;

  // fill the patch's interior holes (dark cracks, dirt) so the whole panel
  // glows: anything the outside can't reach without crossing the patch
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const i = stack.pop()!;
    if (outside[i] || mask[i]) continue;
    outside[i] = 1;
    const x = i % w;
    const y = (i - x) / w;
    if (x > 0) stack.push(i - 1);
    if (x < w - 1) stack.push(i + 1);
    if (y > 0) stack.push(i - w);
    if (y < h - 1) stack.push(i + w);
  }
  let size = 0;
  for (let i = 0; i < mask.length; i++) {
    if (!outside[i]) mask[i] = 1;
    size += mask[i];
  }
  return { mask, size };
}

function rgbaToRgb(rgba: Buffer): Buffer {
  const rgb = Buffer.alloc((rgba.length / 4) * 3);
  for (let p = 0; p < rgba.length / 4; p++) {
    rgb[p * 3] = rgba[p * 4];
    rgb[p * 3 + 1] = rgba[p * 4 + 1];
    rgb[p * 3 + 2] = rgba[p * 4 + 2];
  }
  return rgb;
}

async function main() {
  if (!args.diffuse || !args.depth || !args.out) {
    console.error(USAGE);
    process.exit(1);
  }
  const size = parseInt(args.size!, 10);
  const colors = parseInt(args.colors!, 10);
  const levels = parseInt(args.levels!, 10);
  const minIsland = parseInt(args["min-island"]!, 10);
  const minLevelGap = parseFloat(args["min-level-gap"]!);
  const fillGaps = parseInt(args["fill-gaps"]!, 10);
  const normalBevel = parseInt(args["normal-bevel"]!, 10);
  const paintSaturation = parseFloat(args["paint-saturation"]!);
  const paintGrow = parseInt(args["paint-grow"]!, 10);
  const normalStrength = parseFloat(args["normal-strength"]!);

  let diffuseInput = fs.readFileSync(args.diffuse);
  let depthInput = fs.readFileSync(args.depth);
  if (args.trim) {
    // crop both images to the diffuse's opaque area, so e.g. a door frame
    // drawn with empty space around it fills the whole wall cell
    const box = await opaqueBounds(diffuseInput);
    const size0 = await sharp(diffuseInput).metadata();
    depthInput = await sharp(depthInput).resize(size0.width, size0.height, { fit: "fill" }).extract(box).png().toBuffer();
    diffuseInput = await sharp(diffuseInput).extract(box).png().toBuffer();
  }

  const meta = await sharp(diffuseInput).metadata();
  const srcW = meta.width!;
  const srcH = meta.height!;
  const outW = size;
  const outH = Math.round((size * srcH) / srcW);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  // With a transparent diffuse (a door frame's opening) the opaque cells are
  // "solid": the relief only builds those, so the depth's levels are fitted
  // to them alone and the depth map carries the same holes in its alpha.
  const { rgba, solid } = await processDiffuse(diffuseInput, outW, outH, colors);
  await sharp(solid ? rgba : rgbaToRgb(rgba), { raw: { width: outW, height: outH, channels: solid ? 4 : 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "diffuse.png"));
  const uniqueColors = new Set<number>();
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3]) uniqueColors.add((rgba[i] << 16) | (rgba[i + 1] << 8) | rgba[i + 2]);
  }
  const solidOnly = (values: Float32Array) => (solid ? values.filter((_, i) => solid[i]) : values);

  const rawDepth = await smoothDepth(depthInput, srcW, srcH, outW, outH);
  // the values are already median-filtered, so the most common gray is the
  // wall's flat base surface
  const baseGray = mostCommonValue(solidOnly(rawDepth));
  const smooth = fillGapsBetweenRaised(rawDepth, outW, outH, fillGaps, baseGray);
  const solidSmooth = solidOnly(smooth);
  const centers = mergeCloseLevels(kmeans1d(solidSmooth, levels), solidSmooth, minLevelGap);
  let q = new Uint8Array(smooth.length);
  for (let i = 0; i < q.length; i++) q[i] = nearest(centers, smooth[i]);
  const flattened = args["flatten-paint"] ? flattenPaint(q, rgba, outW, outH, paintSaturation, paintGrow) : 0;
  q = removeSmallIslands(q, outW, outH, minIsland);

  // Stretch the source's full darkest..brightest range to 0..255 so the map is
  // easy to read and paint over - relative to the source, not to the outer
  // levels: if the extreme levels got merged away (tiny bolts absorbed into
  // the treads next to them), stretching the remaining levels would inflate
  // every step's height relative to the others.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of solidSmooth) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo || 1;
  const grays = centers.map((c) => Math.round(((c - lo) / range) * 255));
  const channels = solid ? 2 : 1;
  const depth = Buffer.alloc(outW * outH * channels);
  const depthGray = new Float32Array(outW * outH);
  const perLevel = new Uint32Array(centers.length);
  for (let i = 0; i < q.length; i++) {
    depthGray[i] = grays[q[i]];
    depth[i * channels] = grays[q[i]];
    if (solid) depth[i * 2 + 1] = solid[i] ? 255 : 0;
    if (!solid || solid[i]) perLevel[q[i]]++;
  }
  await sharp(depth, { raw: { width: outW, height: outH, channels } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "depth.png"));
  const solidCount = solid ? solid.reduce((n, s) => n + s, 0) : q.length;

  // "levels": normals from the same stepped heights the relief geometry is
  // built from, so shading rims line up with the voxel steps; "smooth": from
  // the pre-quantization depth (softer, can drift a pixel off the steps).
  // A bevel blurs the heights first, widening each rim into a rounded
  // chamfer of about that many pixels.
  const normalSource = args["normal-source"] === "smooth" ? smooth : depthGray;
  const bevelled = boxBlur(boxBlur(normalSource, outW, outH, normalBevel), outW, outH, normalBevel);
  const normal = normalMapFromHeight(bevelled, outW, outH, normalStrength);
  await sharp(normal, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "normal.png"));

  console.log(`${srcW}x${srcH} -> ${outW}x${outH} in ${path.relative(process.cwd(), outDir)}`);
  console.log(
    `  diffuse.png: ${uniqueColors.size} colors` +
      (solid ? `, ${((1 - solidCount / q.length) * 100).toFixed(1)}% transparent` : ""),
  );
  console.log(
    `  depth.png:   ${grays.length} levels: ` +
      grays.map((g, i) => `${g} (${((perLevel[i] / solidCount) * 100).toFixed(1)}%)`).join(", "),
  );
  if (args["emissive-panel"]) {
    const { mask, size: panelSize } = largestBrightPatch(rgba, outW, outH, parseFloat(args["emissive-luma"]!));
    const emissive = Buffer.alloc(outW * outH);
    for (let i = 0; i < mask.length; i++) emissive[i] = mask[i] ? 255 : 0;
    await sharp(emissive, { raw: { width: outW, height: outH, channels: 1 } })
      .png({ compressionLevel: 9 })
      .toFile(path.join(outDir, "emissive.png"));
    console.log(`  emissive.png: ${panelSize} px light panel`);
  }

  if (args["flatten-paint"]) console.log(`  paint:       ${flattened} depth pixels flattened`);
  console.log(`  normal.png:  strength ${normalStrength}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
