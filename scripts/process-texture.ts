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
  [--normal-strength 1.5] normal map bumpiness`;

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
    "normal-strength": { type: "string", default: "1.5" },
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

async function processDiffuse(file: string, outW: number, outH: number, colors: number): Promise<Buffer> {
  // median(3) removes JPEG ringing without softening hard pixel-art edges;
  // snapping every pixel to a small palette (no dithering) removes the rest
  const { data, info } = await sharp(file).removeAlpha().median(3).raw().toBuffer({ resolveWithObject: true });
  const { width: srcW, height: srcH, channels } = info;
  const palette = buildPalette(data, channels, colors);

  const index = new Uint8Array(srcW * srcH);
  for (let p = 0; p < index.length; p++) {
    index[p] = nearestColor(palette, colors, data[p * channels], data[p * channels + 1], data[p * channels + 2]);
  }

  const out = Buffer.alloc(outW * outH * 3);
  const counts = new Uint32Array(colors);
  for (let ty = 0; ty < outH; ty++) {
    const [y0, y1] = blockRange(ty, outH, srcH);
    for (let tx = 0; tx < outW; tx++) {
      const [x0, x1] = blockRange(tx, outW, srcW);
      counts.fill(0);
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) counts[index[sy * srcW + sx]]++;
      }
      let best = 0;
      for (let c = 1; c < colors; c++) if (counts[c] > counts[best]) best = c;
      const o = (ty * outW + tx) * 3;
      out[o] = Math.round(palette[best * 3]);
      out[o + 1] = Math.round(palette[best * 3 + 1]);
      out[o + 2] = Math.round(palette[best * 3 + 2]);
    }
  }
  return out;
}

// block median of a denoised grayscale depth map, 0..255 floats
async function smoothDepth(file: string, srcW: number, srcH: number, outW: number, outH: number): Promise<Float32Array> {
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

// 1D k-means; returns sorted, de-duplicated centers
function kmeans1d(values: Float32Array, k: number): number[] {
  const sorted = Float32Array.from(values).sort();
  let centers = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  centers = [...new Set(centers)];

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
  let levels = centers.map((c) => ({ value: c, count: counts.get(c) ?? 0 }));
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
  const normalStrength = parseFloat(args["normal-strength"]!);

  const meta = await sharp(args.diffuse).metadata();
  const srcW = meta.width!;
  const srcH = meta.height!;
  const outW = size;
  const outH = Math.round((size * srcH) / srcW);
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });

  const diffuse = await processDiffuse(args.diffuse, outW, outH, colors);
  await sharp(diffuse, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "diffuse.png"));
  const uniqueColors = new Set<number>();
  for (let i = 0; i < diffuse.length; i += 3) uniqueColors.add((diffuse[i] << 16) | (diffuse[i + 1] << 8) | diffuse[i + 2]);

  const rawDepth = await smoothDepth(args.depth, srcW, srcH, outW, outH);
  // the values are already median-filtered, so the most common gray is the
  // wall's flat base surface
  const baseGray = mostCommonValue(rawDepth);
  const smooth = fillGapsBetweenRaised(rawDepth, outW, outH, fillGaps, baseGray);
  const centers = mergeCloseLevels(kmeans1d(smooth, levels), smooth, minLevelGap);
  let q = new Uint8Array(smooth.length);
  for (let i = 0; i < q.length; i++) q[i] = nearest(centers, smooth[i]);
  q = removeSmallIslands(q, outW, outH, minIsland);

  // stretch the levels to the full 0..255 range (keeping their relative
  // spacing) so the map is easy to read and paint over in an image editor
  const lo = centers[0];
  const range = centers[centers.length - 1] - lo || 1;
  const grays = centers.map((c) => (centers.length > 1 ? Math.round(((c - lo) / range) * 255) : 128));
  const depth = Buffer.alloc(outW * outH);
  const perLevel = new Uint32Array(centers.length);
  for (let i = 0; i < q.length; i++) {
    depth[i] = grays[q[i]];
    perLevel[q[i]]++;
  }
  await sharp(depth, { raw: { width: outW, height: outH, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "depth.png"));

  const normal = normalMapFromHeight(smooth, outW, outH, normalStrength);
  await sharp(normal, { raw: { width: outW, height: outH, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, "normal.png"));

  console.log(`${srcW}x${srcH} -> ${outW}x${outH} in ${path.relative(process.cwd(), outDir)}`);
  console.log(`  diffuse.png: ${uniqueColors.size} colors`);
  console.log(
    `  depth.png:   ${grays.length} levels: ` +
      grays.map((g, i) => `${g} (${((perLevel[i] / q.length) * 100).toFixed(1)}%)`).join(", "),
  );
  console.log(`  normal.png:  strength ${normalStrength}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
