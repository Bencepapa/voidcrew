/*
 * Dependency-free depth/normal map generator — pure TypeScript, no DOM and no
 * three.js, so it runs in a worker, in the browser and in Node.
 *
 * Ported from the normalMap tool's core.js (same Kuwahara oil filter, gaussian
 * blur, auto levels, pre-blur and Sobel normal maths). One pipeline pass:
 *
 *   diffuse RGBA -> luminance -> Kuwahara oil (n passes) -> gaussian blur
 *   -> levels (auto/black/white/gamma/invert) => DEPTH (grayscale height)
 *   -> gaussian pre-blur -> Sobel -> NORMAL (OpenGL Y+ by default)
 *
 * All parameters are in pixels of the image passed in. Strength is a slope
 * per image-width unit, so a normal map looks the same at any resolution
 * (callers downscaling for a preview should scale the pixel radii with
 * previewSize().scale to keep the look matching the full-size result).
 */

export interface DepthNormalLevels {
  /** Stretch the height to the full 0..1 range, ignoring 0.5% outliers. */
  auto: boolean;
  /** Black point, 0..1. With auto levels this is the position inside the stretched range. */
  black: number;
  /** White point, 0..1. With auto levels this is the position inside the stretched range. */
  white: number;
  /** Gamma applied to the 0..1 height (1 = unchanged). */
  gamma: number;
  /** Invert the depth (dark becomes high). */
  invert: boolean;
}

export interface DepthNormalParams {
  /** Kuwahara (oil paint) radius in pixels, 0 = off. Default 4. */
  oilRadius: number;
  /** Number of Kuwahara passes, 1..5. Default 1. */
  oilPasses: number;
  /** Gaussian blur (sigma, px) applied to the height after painting. Default 2. */
  blur: number;
  /** Height levels applied after blurring; the result is the depth map. */
  levels: DepthNormalLevels;
  /** Extra gaussian blur (sigma, px) on the depth before the Sobel gradient. Default 0. */
  preBlur: number;
  /** Slope scale, independent of resolution. Default 3. */
  strength: number;
  /** false = OpenGL (green Y+ up), true = DirectX (green Y- down). Default false. */
  flipY: boolean;
}

/** The normalMap tool's defaults, restricted to the stages this module keeps. */
export const defaultDepthNormalParams: Readonly<DepthNormalParams> = Object.freeze({
  oilRadius: 4,
  oilPasses: 1,
  blur: 2,
  levels: Object.freeze({
    auto: true,
    black: 0,
    white: 1,
    gamma: 1,
    invert: false,
  }),
  preBlur: 0,
  strength: 3,
  flipY: false,
});

export interface DepthNormalMaps {
  /** RGBA grayscale depth map; alpha copied from the source. */
  depth: Uint8ClampedArray;
  /** RGBA normal map; alpha copied from the source. */
  normal: Uint8ClampedArray;
}

export type DepthNormalProgress = (fraction: number) => void;

const DEFAULTS = defaultDepthNormalParams;

function finite(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveParams(params?: Partial<DepthNormalParams>): DepthNormalParams {
  const levels = { ...DEFAULTS.levels, ...(params?.levels ?? {}) };
  return {
    oilRadius: finite(params?.oilRadius, DEFAULTS.oilRadius, 0, 24),
    oilPasses: finite(params?.oilPasses, DEFAULTS.oilPasses, 1, 5),
    blur: finite(params?.blur, DEFAULTS.blur, 0, 30),
    levels: {
      auto: !!levels.auto,
      black: finite(levels.black, DEFAULTS.levels.black, 0, 1),
      white: finite(levels.white, DEFAULTS.levels.white, 0, 1),
      gamma: finite(levels.gamma, DEFAULTS.levels.gamma, 0.2, 3),
      invert: !!levels.invert,
    },
    preBlur: finite(params?.preBlur, DEFAULTS.preBlur, 0, 10),
    strength: finite(params?.strength, DEFAULTS.strength, 0, 20),
    flipY: !!params?.flipY,
  };
}

// ---- helpers (verbatim maths from core.js) -------------------------------

function integral(p: Float32Array, w: number, h: number, square: boolean): Float64Array {
  const W = w + 1;
  const I = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      const v = p[y * w + x];
      row += square ? v * v : v;
      I[(y + 1) * W + x + 1] = I[y * W + x + 1] + row;
    }
  }
  return I;
}

/** Kuwahara filter on one plane; integral images make it O(1) per pixel. */
function kuwahara(plane: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return plane;
  const W = w + 1;
  const I = integral(plane, w, h, false);
  const I2 = integral(plane, w, h, true);
  const out = new Float32Array(w * h);
  const bs = (A: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    A[(y1 + 1) * W + x1 + 1] - A[y0 * W + x1 + 1] - A[(y1 + 1) * W + x0] + A[y0 * W + x0];
  const q = new Int32Array(16);
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - r);
    const yb = Math.min(h - 1, y + r);
    for (let x = 0; x < w; x++) {
      const xa = Math.max(0, x - r);
      const xb = Math.min(w - 1, x + r);
      // quadrants: TL, TR, BL, BR  (x0,y0,x1,y1)
      q[0] = xa; q[1] = ya; q[2] = x; q[3] = y;
      q[4] = x; q[5] = ya; q[6] = xb; q[7] = y;
      q[8] = xa; q[9] = y; q[10] = x; q[11] = yb;
      q[12] = x; q[13] = y; q[14] = xb; q[15] = yb;
      let best = 0;
      let bestVar = Infinity;
      for (let k = 0; k < 4; k++) {
        const x0 = q[k * 4];
        const y0 = q[k * 4 + 1];
        const x1 = q[k * 4 + 2];
        const y1 = q[k * 4 + 3];
        const n = (x1 - x0 + 1) * (y1 - y0 + 1);
        const m = bs(I, x0, y0, x1, y1) / n;
        const v = bs(I2, x0, y0, x1, y1) / n - m * m;
        if (v < bestVar) { bestVar = v; best = k; }
      }
      const x0 = q[best * 4];
      const y0 = q[best * 4 + 1];
      const x1 = q[best * 4 + 2];
      const y1 = q[best * 4 + 3];
      const n = (x1 - x0 + 1) * (y1 - y0 + 1);
      out[y * w + x] = bs(I, x0, y0, x1, y1) / n;
    }
  }
  return out;
}

function boxPass(
  src: Float32Array,
  dst: Float32Array,
  w: number,
  h: number,
  r: number,
  horiz: boolean,
  wrap: boolean,
): void {
  const len = horiz ? w : h;
  const lines = horiz ? h : w;
  const step = horiz ? 1 : w;
  const lstep = horiz ? w : 1;
  const at = (i: number) => (wrap ? ((i % len) + len) % len : i < 0 ? 0 : i >= len ? len - 1 : i);
  const inv = 1 / (2 * r + 1);
  for (let l = 0; l < lines; l++) {
    const o = l * lstep;
    let acc = 0;
    for (let i = -r; i <= r; i++) acc += src[o + at(i) * step];
    for (let i = 0; i < len; i++) {
      dst[o + i * step] = acc * inv;
      acc += src[o + at(i + r + 1) * step] - src[o + at(i - r) * step];
    }
  }
}

// 3 successive box blurs ~ gaussian; O(1) per pixel regardless of sigma
function boxBlurFast(src: Float32Array, w: number, h: number, sigma: number, wrap: boolean): Float32Array {
  const n = 3;
  const wi = Math.floor(Math.sqrt((12 * sigma * sigma) / n + 1));
  const wl = wi % 2 === 0 ? wi - 1 : wi;
  const wu = wl + 2;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const a = Float32Array.from(src);
  const b = new Float32Array(w * h);
  for (let i = 0; i < n; i++) {
    const r = ((i < m ? wl : wu) - 1) >> 1;
    boxPass(a, b, w, h, r, true, wrap);
    boxPass(b, a, w, h, r, false, wrap);
  }
  return a;
}

function gaussian(src: Float32Array, w: number, h: number, sigma: number, wrap: boolean): Float32Array {
  if (sigma <= 0) return src;
  if (sigma > 6) return boxBlurFast(src, w, h, sigma, wrap);
  const rad = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    k[i + rad] = v;
    sum += v;
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const idx = (i: number, n: number) => {
    if (i >= 0 && i < n) return i;
    if (wrap) return ((i % n) + n) % n;
    return i < 0 ? 0 : n - 1;
  };
  const tmp = new Float32Array(w * h);
  const dst = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += src[row + idx(x + i, w)] * k[i + rad];
      tmp[row + x] = a;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -rad; i <= rad; i++) a += tmp[idx(y + i, h) * w + x] * k[i + rad];
      dst[y * w + x] = a;
    }
  }
  return dst;
}

function percentileRange(d: Float32Array, lo: number, hi: number): [number, number] {
  const BINS = 2048;
  const hist = new Uint32Array(BINS);
  let mn = Infinity;
  let mx = -Infinity;
  for (let i = 0; i < d.length; i++) {
    if (d[i] < mn) mn = d[i];
    if (d[i] > mx) mx = d[i];
  }
  if (!(mx > mn)) return [mn, mn + 1];
  const s = (BINS - 1) / (mx - mn);
  for (let i = 0; i < d.length; i++) hist[Math.floor((d[i] - mn) * s)]++;
  const a = d.length * lo;
  const b = d.length * hi;
  let acc = 0;
  let ia = 0;
  let ib = BINS - 1;
  let gotA = false;
  for (let i = 0; i < BINS; i++) {
    acc += hist[i];
    if (!gotA && acc >= a) { ia = i; gotA = true; }
    if (acc >= b) { ib = i; break; }
  }
  const lov = mn + ia / s;
  const hiv = mn + ib / s;
  return hiv > lov ? [lov, hiv] : [mn, mx];
}

// ---- pipeline stages ------------------------------------------------------

/** Luma -> oil -> blur -> levels; returns the 0..1 height (pre-quantisation). */
function computeDepth(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
  s: DepthNormalParams,
  onProgress?: DepthNormalProgress,
): Float32Array {
  const n = w * h;
  const luma = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    luma[i] = (0.2126 * rgba[j] + 0.7152 * rgba[j + 1] + 0.0722 * rgba[j + 2]) / 255;
  }

  let plane = luma;
  let r = Math.round(s.oilRadius);
  if (s.oilRadius > 0 && r < 1) r = 1;
  if (r > 0) {
    for (let p = 0; p < s.oilPasses; p++) {
      plane = kuwahara(plane, w, h, r);
      onProgress?.(0.4 * ((p + 1) / s.oilPasses));
    }
  }

  let depth = gaussian(plane, w, h, s.blur, false);
  if (depth === plane) depth = Float32Array.from(depth);

  let lo = s.levels.black;
  let hi = s.levels.white;
  if (s.levels.auto) {
    const [a, b] = percentileRange(depth, 0.005, 0.995);
    lo = a + (b - a) * s.levels.black;
    hi = a + (b - a) * s.levels.white;
  }
  if (hi - lo < 1e-4) hi = lo + 1e-4;
  const inv = 1 / (hi - lo);
  for (let i = 0; i < depth.length; i++) {
    let v = (depth[i] - lo) * inv;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    if (s.levels.gamma !== 1) v = Math.pow(v, 1 / s.levels.gamma);
    depth[i] = s.levels.invert ? 1 - v : v;
  }

  onProgress?.(0.8);
  return depth;
}

/** Pre-blur -> Sobel -> normal RGBA. Alpha is copied from `alpha` when given. */
function normalsFromHeight(
  height: Float32Array,
  w: number,
  h: number,
  s: DepthNormalParams,
  alpha?: Uint8ClampedArray,
  onProgress?: DepthNormalProgress,
): Uint8ClampedArray {
  const d = gaussian(height, w, h, s.preBlur, false);
  // slope per image-width unit => independent of resolution
  const k = s.strength * Math.max(w, h);
  const sy = s.flipY ? -1 : 1;
  const data = new Uint8ClampedArray(w * h * 4);
  const px = (x: number, y: number) => {
    x = x < 0 ? 0 : x >= w ? w - 1 : x;
    y = y < 0 ? 0 : y >= h ? h - 1 : y;
    return d[y * w + x];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = px(x - 1, y - 1);
      const t = px(x, y - 1);
      const tr = px(x + 1, y - 1);
      const l = px(x - 1, y);
      const r = px(x + 1, y);
      const bl = px(x - 1, y + 1);
      const b = px(x, y + 1);
      const br = px(x + 1, y + 1);
      const dx = ((tr + 2 * r + br) - (tl + 2 * l + bl)) / 8;
      const dy = ((bl + 2 * b + br) - (tl + 2 * t + tr)) / 8;
      let nx = -dx * k;
      let ny = sy * dy * k;
      let nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      nx /= len;
      ny /= len;
      nz /= len;
      const j = (y * w + x) * 4;
      data[j] = (nx * 0.5 + 0.5) * 255 + 0.5;
      data[j + 1] = (ny * 0.5 + 0.5) * 255 + 0.5;
      data[j + 2] = (nz * 0.5 + 0.5) * 255 + 0.5;
      data[j + 3] = alpha ? alpha[j + 3] : 255;
    }
  }
  onProgress?.(1);
  return data;
}

function depthToRgba(depth: Float32Array, w: number, h: number, alpha: Uint8ClampedArray): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0, j = 0; i < depth.length; i++, j += 4) {
    const v = depth[i] * 255 + 0.5;
    data[j] = data[j + 1] = data[j + 2] = v;
    data[j + 3] = alpha[j + 3];
  }
  return data;
}

// ---- public API -----------------------------------------------------------

/** Generate the grayscale depth map (RGBA; alpha copied from the diffuse). */
export function generateDepth(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params?: Partial<DepthNormalParams>,
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) return new Uint8ClampedArray(0);
  const s = resolveParams(params);
  return depthToRgba(computeDepth(rgba, width, height, s), width, height, rgba);
}

/** Generate a normal map from an RGBA depth image (its red channel is the height). */
export function generateNormal(
  depthRgba: Uint8ClampedArray,
  width: number,
  height: number,
  params?: Partial<DepthNormalParams>,
): Uint8ClampedArray {
  if (width <= 0 || height <= 0) return new Uint8ClampedArray(0);
  const s = resolveParams(params);
  const n = width * height;
  const depth = new Float32Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) depth[i] = depthRgba[j] / 255;
  return normalsFromHeight(depth, width, height, s, depthRgba);
}

/**
 * Both maps in one pass. The normal is computed from the un-quantised height,
 * exactly like core.js's process(); generateNormal() reads the 8-bit depth,
 * so the two can differ by a level at very steep edges.
 *
 * `onProgress` (optional) receives fractions 0..1 at stage boundaries; the
 * worker and generateMapsAsync use it.
 */
export function generateMapsWithProgress(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params?: Partial<DepthNormalParams>,
  onProgress?: DepthNormalProgress,
): DepthNormalMaps {
  if (width <= 0 || height <= 0) {
    return { depth: new Uint8ClampedArray(0), normal: new Uint8ClampedArray(0) };
  }
  const s = resolveParams(params);
  onProgress?.(0);
  const depthFloat = computeDepth(rgba, width, height, s, onProgress);
  const depth = depthToRgba(depthFloat, width, height, rgba);
  const normal = normalsFromHeight(
    depthFloat,
    width,
    height,
    s,
    rgba,
    onProgress ? (f) => onProgress(0.8 + 0.2 * f) : undefined,
  );
  return { depth, normal };
}

/** Generate both the depth and normal map (RGBA, alpha copied). */
export function generateMaps(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  params?: Partial<DepthNormalParams>,
): DepthNormalMaps {
  return generateMapsWithProgress(rgba, width, height, params);
}
