import * as THREE from "three";

// Turns a grayscale height map into real, stepped wall geometry: every height
// level becomes a flat front face and every step between levels becomes a
// vertical side face. Unlike displacementMap (which only moves the vertices of
// a fixed-resolution plane and so smears pixel-art edges into soft hills), the
// steps here land exactly on the height map's pixel boundaries.
//
// Coordinate convention matches THREE.PlaneGeometry: centered on the origin,
// facing +Z, image row 0 at the top.

export interface HeightGrid {
  width: number;
  height: number;
  // 0..1, row-major, row 0 = top of the image
  data: Float32Array;
}

export interface ReliefOptions {
  wallWidth: number;
  wallHeight: number;
  // world-space distance between the lowest and highest quantized level
  depth: number;
  // number of discrete height levels (>= 2)
  levels: number;
  // 3x3 majority-filter passes that remove single-pixel speckles left over
  // after quantizing a noisy/continuous height map
  cleanupPasses: number;
}

export interface ReliefResult {
  geometry: THREE.BufferGeometry;
  triangles: number;
}

// Relief geometry is built per height-map cell; larger maps are box-filtered
// down first so a 1024px photo texture doesn't produce a million quads.
const MAX_GRID = 256;

export async function loadHeightGrid(url: string): Promise<HeightGrid> {
  const img = new Image();
  img.src = url;
  await img.decode();

  const factor = Math.max(1, Math.ceil(Math.max(img.naturalWidth, img.naturalHeight) / MAX_GRID));
  const width = Math.max(1, Math.floor(img.naturalWidth / factor));
  const height = Math.max(1, Math.floor(img.naturalHeight / factor));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas unavailable");
  // canvas downscaling averages source pixels, which is exactly the box
  // filter we want for the height values
  ctx.imageSmoothingEnabled = factor > 1;
  ctx.drawImage(img, 0, 0, width, height);

  const rgba = ctx.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let i = 0; i < data.length; i++) {
    data[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255;
  }
  return { width, height, data };
}

// Quantize to `levels` steps after stretching the 0.5%..99.5% percentile range
// to 0..1, so a map that only uses a narrow band of grays still spreads over
// all levels and a few stray white/black pixels don't compress the rest.
function quantize(grid: HeightGrid, levels: number): Uint8Array {
  const sorted = Float32Array.from(grid.data).sort();
  const lo = sorted[Math.floor(sorted.length * 0.005)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))];
  const range = hi - lo || 1;

  const out = new Uint8Array(grid.data.length);
  for (let i = 0; i < out.length; i++) {
    const t = Math.min(1, Math.max(0, (grid.data[i] - lo) / range));
    out[i] = Math.round(t * (levels - 1));
  }
  return out;
}

function majorityFilter(q: Uint8Array, w: number, h: number, levels: number): Uint8Array {
  const out = new Uint8Array(q.length);
  const counts = new Uint16Array(levels);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      counts.fill(0);
      for (let dy = -1; dy <= 1; dy++) {
        const yy = Math.min(h - 1, Math.max(0, y + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          counts[q[yy * w + xx]]++;
        }
      }
      const self = q[y * w + x];
      let best = self;
      for (let l = 0; l < levels; l++) {
        if (counts[l] > counts[best]) best = l;
      }
      out[y * w + x] = best;
    }
  }
  return out;
}

function mostCommonLevel(q: Uint8Array, levels: number): number {
  const counts = new Uint32Array(levels);
  for (const v of q) counts[v]++;
  let best = 0;
  for (let l = 1; l < levels; l++) if (counts[l] > counts[best]) best = l;
  return best;
}

export function createReliefWallGeometry(grid: HeightGrid, opts: ReliefOptions): ReliefResult {
  const { width: gw, height: gh } = grid;
  const levels = Math.max(2, Math.round(opts.levels));

  let q = quantize(grid, levels);
  for (let i = 0; i < opts.cleanupPasses; i++) q = majorityFilter(q, gw, gh, levels);

  // The most common level (usually the flat panel surface) sits exactly on
  // the grid boundary; lower levels recess into the wall, higher ones protrude
  // into the room. Keeping the dominant surface at z=0 lines it up with the
  // floor/ceiling edges.
  const base = mostCommonLevel(q, levels);
  const levelZ = (l: number) => ((l - base) / (levels - 1)) * opts.depth;
  const maxAbsZ = Math.max(Math.abs(levelZ(0)), Math.abs(levelZ(levels - 1)));

  // Each wall face is built independently, so where two perpendicular walls
  // meet, a protrusion on one would poke through the other (inner corners)
  // and two recesses would carve a see-through notch (outer corners). Forcing
  // a margin at least as wide as the deepest relief back to the base level
  // keeps every face flush along its vertical edges, the same trick the
  // beveled profile uses with its taper.
  const cellW = opts.wallWidth / gw;
  const cellH = opts.wallHeight / gh;
  const margin = Math.min(Math.floor(gw / 2), Math.ceil(maxAbsZ / cellW - 1e-6));
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < margin; x++) {
      q[y * gw + x] = base;
      q[y * gw + gw - 1 - x] = base;
    }
  }

  const X = (x: number) => -opts.wallWidth / 2 + x * cellW;
  const Y = (y: number) => opts.wallHeight / 2 - y * cellH;
  const U = (x: number) => x / gw;
  const V = (y: number) => 1 - y / gh;
  // outside the map counts as base level, so recesses touching the top/bottom
  // edge get a closing face
  const levelAt = (x: number, y: number) => (x < 0 || y < 0 || x >= gw || y >= gh ? base : q[y * gw + x]);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  function quad(p: number[][], n: number[], uv: number[][]) {
    const i0 = positions.length / 3;
    for (let k = 0; k < 4; k++) {
      positions.push(p[k][0], p[k][1], p[k][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[k][0], uv[k][1]);
    }
    // vertices are given counter-clockwise as seen from the normal side
    indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  // --- front faces: greedy-merge same-level cells into rectangles ---------
  const used = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (used[y * gw + x]) continue;
      const l = q[y * gw + x];

      let x1 = x + 1;
      while (x1 < gw && !used[y * gw + x1] && q[y * gw + x1] === l) x1++;

      let y1 = y + 1;
      grow: while (y1 < gh) {
        for (let xx = x; xx < x1; xx++) {
          if (used[y1 * gw + xx] || q[y1 * gw + xx] !== l) break grow;
        }
        y1++;
      }

      for (let yy = y; yy < y1; yy++) used.fill(1, yy * gw + x, yy * gw + x1);

      const z = levelZ(l);
      quad(
        [
          [X(x), Y(y1), z],
          [X(x1), Y(y1), z],
          [X(x1), Y(y), z],
          [X(x), Y(y), z],
        ],
        [0, 0, 1],
        [
          [U(x), V(y1)],
          [U(x1), V(y1)],
          [U(x1), V(y)],
          [U(x), V(y)],
        ],
      );
    }
  }
  const frontIndexCount = indices.length;

  // --- side faces: one per run of identical steps along a cell boundary ---
  // A step's side face shows the higher cell's edge texel stretched across
  // its depth (u or v pinned to that cell's center), the classic look of
  // extruded pixel art.

  // vertical boundaries between column bx-1 and bx
  for (let bx = 0; bx <= gw; bx++) {
    let y = 0;
    while (y < gh) {
      const lL = levelAt(bx - 1, y);
      const lR = levelAt(bx, y);
      if (lL === lR) {
        y++;
        continue;
      }
      let y1 = y + 1;
      while (y1 < gh && levelAt(bx - 1, y1) === lL && levelAt(bx, y1) === lR) y1++;

      const zL = levelZ(lL);
      const zR = levelZ(lR);
      const px = X(bx);
      if (lL > lR) {
        const u = U(bx - 0.5);
        quad(
          [
            [px, Y(y1), zL],
            [px, Y(y1), zR],
            [px, Y(y), zR],
            [px, Y(y), zL],
          ],
          [1, 0, 0],
          [
            [u, V(y1)],
            [u, V(y1)],
            [u, V(y)],
            [u, V(y)],
          ],
        );
      } else {
        const u = U(bx + 0.5);
        quad(
          [
            [px, Y(y1), zL],
            [px, Y(y1), zR],
            [px, Y(y), zR],
            [px, Y(y), zL],
          ],
          [-1, 0, 0],
          [
            [u, V(y1)],
            [u, V(y1)],
            [u, V(y)],
            [u, V(y)],
          ],
        );
      }
      y = y1;
    }
  }

  // horizontal boundaries between row by-1 (above) and by (below)
  for (let by = 0; by <= gh; by++) {
    let x = 0;
    while (x < gw) {
      const lA = levelAt(x, by - 1);
      const lB = levelAt(x, by);
      if (lA === lB) {
        x++;
        continue;
      }
      let x1 = x + 1;
      while (x1 < gw && levelAt(x1, by - 1) === lA && levelAt(x1, by) === lB) x1++;

      const zA = levelZ(lA);
      const zB = levelZ(lB);
      const py = Y(by);
      if (lA > lB) {
        // upper cell sticks out further: its underside faces down
        const v = V(by - 0.5);
        quad(
          [
            [X(x), py, zB],
            [X(x1), py, zB],
            [X(x1), py, zA],
            [X(x), py, zA],
          ],
          [0, -1, 0],
          [
            [U(x), v],
            [U(x1), v],
            [U(x1), v],
            [U(x), v],
          ],
        );
      } else {
        // lower cell sticks out further: its top faces up
        const v = V(by + 0.5);
        quad(
          [
            [X(x), py, zB],
            [X(x1), py, zB],
            [X(x1), py, zA],
            [X(x), py, zA],
          ],
          [0, 1, 0],
          [
            [U(x), v],
            [U(x1), v],
            [U(x1), v],
            [U(x), v],
          ],
        );
      }
      x = x1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  // group 0: front faces (full material incl. normal map)
  // group 1: step side faces (their UVs are degenerate in one direction, which
  // breaks the derivative-based tangent frame a normal map needs)
  geometry.addGroup(0, frontIndexCount, 0);
  geometry.addGroup(frontIndexCount, indices.length - frontIndexCount, 1);

  return { geometry, triangles: indices.length / 3 };
}
