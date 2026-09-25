// Height-map level helpers shared by the in-game relief builder and the
// offline texture processing script (scripts/process-texture.ts). Kept free
// of DOM/three.js imports so both can use it.

// A height map with at most this many distinct grays is treated as already
// quantized ("baked"): each gray is its own level, at its own height.
export const MAX_BAKED_LEVELS = 16;

export interface HeightLevels {
  // per-cell level index
  q: Uint8Array;
  // per-level height, 0..1 (lowest level 0, highest 1)
  heights: number[];
  // true if the levels came straight from the map's distinct grays
  baked: boolean;
}

// `data` holds 0..1 heights. Baked maps (few distinct grays, e.g. painted in
// Aseprite or produced by process-texture) keep their exact levels and
// relative spacing; continuous maps are split into `levels` even steps after
// stretching the 0.5%..99.5% percentile range to 0..1, so a map using only a
// narrow band of grays still spreads over all levels and a few stray
// white/black pixels don't compress the rest.
export function quantizeHeights(data: Float32Array, levels: number): HeightLevels {
  const distinct = new Set<number>();
  for (let i = 0; i < data.length && distinct.size <= MAX_BAKED_LEVELS; i++) {
    distinct.add(Math.round(data[i] * 255));
  }

  if (distinct.size <= MAX_BAKED_LEVELS) {
    const grays = [...distinct].sort((a, b) => a - b);
    const index = new Map(grays.map((g, i) => [g, i]));
    const lo = grays[0];
    const range = grays[grays.length - 1] - lo || 1;
    const q = new Uint8Array(data.length);
    for (let i = 0; i < q.length; i++) q[i] = index.get(Math.round(data[i] * 255))!;
    return { q, heights: grays.map((g) => (g - lo) / range), baked: true };
  }

  const n = Math.max(2, Math.round(levels));
  const sorted = Float32Array.from(data).sort();
  const lo = sorted[Math.floor(sorted.length * 0.005)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))];
  const range = hi - lo || 1;

  const q = new Uint8Array(data.length);
  for (let i = 0; i < q.length; i++) {
    const t = Math.min(1, Math.max(0, (data[i] - lo) / range));
    q[i] = Math.round(t * (n - 1));
  }
  return { q, heights: Array.from({ length: n }, (_, l) => l / (n - 1)), baked: false };
}

// Merges every 4-connected same-level region smaller than `minSize` cells
// into the level most common along its border. Unlike a majority filter this
// keeps small but deliberate shapes (a 2x2 rivet survives minSize <= 4) while
// removing single-pixel speckles from noisy maps.
export function removeSmallIslands(q: Uint8Array, w: number, h: number, minSize: number): Uint8Array {
  if (minSize <= 1) return q;

  const out = q.slice();
  const visited = new Uint8Array(q.length);
  const inComp = new Uint8Array(q.length);
  const comp: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < q.length; start++) {
    if (visited[start]) continue;
    const level = q[start];

    comp.length = 0;
    stack.push(start);
    visited[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      comp.push(i);
      const x = i % w;
      const y = (i - x) / w;
      const neighbors = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of neighbors) {
        if (j >= 0 && !visited[j] && q[j] === level) {
          visited[j] = 1;
          stack.push(j);
        }
      }
    }

    if (comp.length >= minSize) continue;

    for (const i of comp) inComp[i] = 1;
    const counts = new Map<number, number>();
    for (const i of comp) {
      const x = i % w;
      const y = (i - x) / w;
      const neighbors = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of neighbors) {
        if (j >= 0 && !inComp[j]) counts.set(q[j], (counts.get(q[j]) ?? 0) + 1);
      }
    }
    for (const i of comp) inComp[i] = 0;

    let best = -1;
    let bestCount = 0;
    for (const [l, c] of counts) {
      if (c > bestCount) {
        best = l;
        bestCount = c;
      }
    }
    if (best >= 0) for (const i of comp) out[i] = best;
  }
  return out;
}

export function mostCommonLevel(q: Uint8Array, levelCount: number): number {
  const counts = new Uint32Array(levelCount);
  for (const v of q) counts[v]++;
  let best = 0;
  for (let l = 1; l < levelCount; l++) if (counts[l] > counts[best]) best = l;
  return best;
}
