export const TILE_SIZE = 512;
const SAMPLES = 3;
const SIZE = TILE_SIZE * SAMPLES;
type Color = readonly [number, number, number];

const greens: Color[] = [
  [84, 107, 49], [113, 129, 54], [127, 135, 59], [63, 94, 45],
  [96, 121, 55], [151, 147, 66], [121, 113, 51], [92, 116, 71],
];
const straw: Color[] = [
  [181, 126, 52], [201, 153, 67], [221, 174, 79], [182, 143, 55],
  [151, 104, 49], [213, 163, 88], [194, 145, 52], [132, 126, 58],
];

export const FOLIAGE = {
  fantasygrass_mid: { seed: 18329, maxHeight: 251, tufts: 13, count: 14, heads: 10 },
  fantasygrass_tall: { seed: 25181, maxHeight: 502, tufts: 14, count: 13, heads: 17 },
  fantasywheat: { seed: 87041, maxHeight: 460, tufts: 14, count: 8, heads: 48 },
};
export type FoliageId = keyof typeof FOLIAGE;

function randomGenerator(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (x: number, period: number) => ((x % period) + period) % period;
const byte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));

interface Stroke {
  x: number;
  y: number;
  length: number;
  lean: number;
  bend: number;
  width: number;
  color: Color;
  phase: number;
  light: number;
  shape: "blade" | "stem" | "grain";
}

const displacement = (lean: number, bend: number, t: number) => lean * t * t + bend * t * (1 - t);

export function renderFoliage(id: FoliageId, seed = FOLIAGE[id].seed, offset = 0) {
  const spec = FOLIAGE[id];
  const wheat = id === "fantasywheat";
  const random = randomGenerator(seed);
  const range = (lo: number, hi: number) => lo + (hi - lo) * random();
  const pick = (colors: Color[]) => colors[Math.floor(random() * colors.length)];
  const samples = new Uint8Array(SIZE * SIZE * 4);
  const shift = offset * SAMPLES;

  function paint({ x, y, length, lean, bend, width, color, phase, light, shape }: Stroke) {
    const fine = shape === "stem";
    const grain = shape === "grain";
    const firstRow = Math.max(0, Math.ceil((y - length) * SAMPLES - 0.5));
    const lastRow = Math.min(SIZE - 1, Math.floor(y * SAMPLES - 0.5));
    for (let row = firstRow; row <= lastRow; row++) {
      const t = (y - (row + 0.5) / SAMPLES) / length;
      const center = (x + displacement(lean, bend, t)) * SAMPLES;
      const profile = grain ? Math.pow(Math.sin(Math.PI * t), 0.72) : fine ? 1 - 0.36 * t
        : (1 - t) ** 0.72 * (0.58 + 0.83 * Math.sin(Math.PI * t));
      const radius = width * profile * SAMPLES / 2;
      const first = Math.ceil(center - radius - 0.5);
      const last = Math.floor(center + radius - 0.5);
      const heightLight = grain || y < TILE_SIZE - 60 ? 1 : 0.52 + 0.48 * Math.min(1, (y - (row + 0.5) / SAMPLES) / 140);
      // Broad brush-like value changes along the blade, plus a narrow lit edge.
      const bands = Math.round((Math.sin(t * 22 + phase) + 0.5 * Math.sin(t * 53 + phase)) * 3) / 38;
      for (let col = first; col <= last; col++) {
        const cross = (col + 0.5 - center) / radius;
        const outline = (1 - Math.abs(cross)) * radius < (fine ? 0.85 : 1.35);
        const fold = cross < -0.16 ? 1.13 : 0.89;
        const rim = cross < -0.48 && !outline ? 0.13 : 0;
        const shade = light * heightLight * (outline ? 0.65 : fold + rim + bands);
        const pixel = (row * SIZE + wrap(col + shift, SIZE)) * 4;
        samples[pixel] = byte(color[0] * shade);
        samples[pixel + 1] = byte(color[1] * shade);
        samples[pixel + 2] = byte(color[2] * shade);
        const relief = 28 + width * 5 * (1 - Math.abs(cross)) + samples[pixel + 3] * 0.31;
        samples[pixel + 3] = byte(relief);
      }
    }
  }

  function stroke(x: number, y: number, length: number, lean: number, bend: number, width: number,
    color: Color, light: number, shape: Stroke["shape"] = "blade") {
    paint({ x, y, length, lean, bend, width, color, light, phase: range(0, 2 * Math.PI), shape });
  }

  // Closely spaced short shoots make the soil line solid even where taller tufts separate.
  for (let x = 0; x < TILE_SIZE; x += 2) {
    stroke(x, 515, range(20, 64), range(-17, 17), range(-6, 6), range(7, 14),
      pick(wheat ? straw : greens), range(0.56, 0.86));
  }

  // Back and front fans share root positions, with uneven spaces between tufts.
  const roots = Array.from({ length: spec.tufts }, (_, i) => (i + range(-0.32, 0.32)) * TILE_SIZE / spec.tufts);
  function fans(front: boolean) {
    for (const root of roots) {
      const height = spec.maxHeight * range(0.71, 1);
      for (let i = 0; i < spec.count; i++) {
        const spread = range(-1, 1);
        const length = height * (front ? range(0.22, 0.72) : range(0.48, 1))
          * (1 - 0.31 * Math.abs(spread)) * (wheat ? 0.68 : 1);
        const palette = wheat && random() < 0.65 ? straw : greens;
        stroke(root + range(-9, 9), 513, length, spread * length * range(0.19, 0.55),
          range(-0.2, 0.2) * length, range(2.5, front ? 14 : 10), pick(palette), range(0.74, 1.06));
      }
    }
  }

  fans(false);
  for (let i = 0; i < spec.heads; i++) {
    const x = (i + range(-0.4, 0.4)) * TILE_SIZE / spec.heads;
    const earLength = wheat ? range(33, 55) : range(16, 36);
    const stemLength = spec.maxHeight * (i === 0 ? 1 : range(0.66, 0.985)) - earLength - 10;
    const lean = range(-0.14, 0.14) * stemLength;
    const bend = range(-0.13, 0.13) * stemLength;
    const y = 513 - stemLength;
    const headX = x + lean;
    const color = wheat && random() < 0.72 ? pick(straw) : pick(greens);
    const headLean = lean * 0.22 + range(-5, 5);
    const light = range(0.87, 1.12);
    stroke(x, 513, stemLength + 1, lean, bend, wheat ? range(3, 5.5) : range(2.2, 4.5), color, light, "stem");
    for (const side of [-1, 1]) {
      const t = range(0.27, 0.64);
      stroke(x + displacement(lean, bend, t), 513 - t * stemLength, stemLength * range(0.15, 0.35),
        side * range(18, 56), side * 12, range(3, 8), color, light);
    }
    stroke(headX, y + 1, earLength, headLean, 0, wheat ? 5 : 3, pick(straw), light, "stem");
    if (id === "fantasygrass_tall" && i % 3 === 1) {
      stroke(headX, y - earLength * 0.08, earLength * 0.76, headLean * 0.7, 0,
        range(6, 9), [140, 87, 44], light, "grain");
      continue;
    }
    const pairs = wheat ? 7 : 4;
    for (let k = 0; k < pairs; k++) {
      const t = (k + 0.4) / pairs;
      const kernelX = headX + headLean * t * t;
      const kernelY = y - t * earLength * 0.81;
      const spread = Math.sin(t * Math.PI * 0.9 + 0.4);
      for (const side of [-1, 1]) {
        const dx = side * (2 + spread * (wheat ? 5.5 : 3));
        const dy = earLength * (wheat ? 0.23 : 0.22);
        const kernelColor = pick(straw);
        if (wheat && k > 0) stroke(kernelX + dx * 0.62, kernelY - dy * 0.62, range(7, 14),
          dx * 0.48 + headLean * 0.24, 0, range(1.2, 1.8), kernelColor, light, "stem");
        stroke(kernelX, kernelY, dy, dx, dx, (wheat ? 8 : 4.5) * (0.5 + spread * 0.5),
          kernelColor, light * (side === -1 ? 1.1 : 0.92), "grain");
      }
    }
  }
  fans(true);

  const diffuse = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  const depth = new Uint8Array(diffuse.length);
  for (let y = 0; y < TILE_SIZE; y++) {
    for (let x = 0; x < TILE_SIZE; x++) {
      let hits = 0, red = 0, green = 0, blue = 0, relief = 0;
      for (let dy = 0; dy < SAMPLES; dy++) {
        for (let dx = 0; dx < SAMPLES; dx++) {
          const pixel = ((y * SAMPLES + dy) * SIZE + x * SAMPLES + dx) * 4;
          const height = samples[pixel + 3];
          if (!height) continue;
          hits++;
          red += samples[pixel];
          green += samples[pixel + 1];
          blue += samples[pixel + 2];
          relief += height;
        }
      }
      if (!hits) continue;
      const i = (y * TILE_SIZE + x) * 4;
      const alpha = byte(255 * hits / (SAMPLES * SAMPLES));
      diffuse.set([byte(red / hits), byte(green / hits), byte(blue / hits), alpha], i);
      const gray = byte(relief / (SAMPLES * SAMPLES));
      depth.set([gray, gray, gray, alpha >= 128 ? 255 : 0], i);
    }
  }
  return { diffuse, depth };
}

export function foliageStats(diffuse: Uint8Array) {
  let transparent = 0, opaque = 0, partial = 0, edgeDifference = 0, edgeRows = 0, occupiedHeight = 0;
  for (let y = 0; y < TILE_SIZE; y++) {
    const start = y * TILE_SIZE * 4 + 3;
    const left = diffuse[start];
    const right = diffuse[start + (TILE_SIZE - 1) * 4];
    edgeDifference += Math.abs(left - right);
    if (left >= 128 && right >= 128) edgeRows++;
    for (let x = 0; x < TILE_SIZE; x++) {
      const alpha = diffuse[start + x * 4];
      if (alpha === 0) transparent++;
      else if (alpha === 255) opaque++;
      else partial++;
      if (alpha >= 128) occupiedHeight = Math.max(occupiedHeight, TILE_SIZE - y);
    }
  }
  const area = TILE_SIZE * TILE_SIZE;
  return { transparent: transparent / area, opaque: opaque / area, partial: partial / area,
    occupiedHeight, edgeRows, meanEdgeDifference: edgeDifference / TILE_SIZE };
}

// Compare the two seam columns to the same pair rasterized in the interior.
export function seamMismatches(tile: Uint8Array, shifted: Uint8Array, offset: number) {
  let mismatches = 0;
  for (let y = 0; y < TILE_SIZE; y++) {
    for (const x of [TILE_SIZE - 1, 0]) {
      const src = (y * TILE_SIZE + x) * 4 + 3;
      const dst = (y * TILE_SIZE + wrap(x + offset, TILE_SIZE)) * 4 + 3;
      if (tile[src] !== shifted[dst]) mismatches++;
    }
  }
  return mismatches;
}
