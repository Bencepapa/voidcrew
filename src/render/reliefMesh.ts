import * as THREE from "three";
import { MAX_BAKED_LEVELS, mostCommonLevel, quantizeHeights, removeSmallIslands } from "./heightLevels";

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
  // 1 = solid cell, 0 = hole (transparent in the height map); absent when
  // the map has no transparency
  solid?: Uint8Array;
}

export interface ReliefOptions {
  wallWidth: number;
  wallHeight: number;
  // world-space distance between the lowest and highest level
  depth: number;
  // number of discrete height levels (>= 2) for continuous maps; ignored
  // for maps with baked levels (see quantizeHeights)
  levels: number;
  // same-level regions smaller than this many cells get merged into their
  // surroundings - removes speckles left over after quantizing a noisy map
  minIsland: number;
  // how far (in height-map cells) ambient occlusion looks for occluders
  aoRadius: number;
  // force the left/right edges back to the base level so perpendicular
  // walls meet cleanly at corners (see below); floors tile edge to edge on a
  // single plane and don't need it
  flushEdges?: boolean;
  // z the side faces around holes reach back to (default: the lowest
  // level) - e.g. a door frame's back plane, so its opening gets deep jambs
  holeBackZ?: number;
  // build only this band of the map's rows, as fractions of its height from
  // the top - a partial panel, e.g. [0, 0.25] = the top quarter, stretched to
  // wallHeight. Levels come from the whole map and the UVs keep pointing into
  // the whole texture, so a partial panel shares the full panel's materials
  // and AO map.
  rows?: [number, number];
  // the same for the map's columns, as fractions of its width from the left
  cols?: [number, number];
  // cut this many of the lowest levels out as holes - a grate's slots, to
  // see through
  holeLevels?: number;
  // a smooth height field (slopes between the heights) instead of stepped
  // levels - for stone, hedges, trees. Not for maps with holes or cut-out
  // levels: those stay stepped.
  smooth?: boolean;
}

export interface HoleBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface ReliefResult {
  geometry: THREE.BufferGeometry;
  // ambient occlusion baked from the relief, read through the `uv1` set
  aoMap: THREE.DataTexture;
  triangles: number;
  levelCount: number;
  baked: boolean;
  // how far the highest level sticks out of the base plane
  maxZ: number;
  // extent of the central hole (e.g. a door frame's opening) in local units,
  // measured through the middle; null when the center isn't a hole
  holeBounds: HoleBounds | null;
}

// Relief geometry is built per height-map cell; larger maps are box-filtered
// down first so a 1024px photo texture doesn't produce a million quads.
const MAX_GRID = 256;

export async function loadHeightGrid(url: string): Promise<HeightGrid> {
  // onload rather than img.decode(): decode() can stall while the page is
  // hidden (a background tab), leaving the walls unbuilt
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });

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
  const solid = new Uint8Array(width * height);
  let holes = false;
  for (let i = 0; i < data.length; i++) {
    data[i] = (rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114) / 255;
    solid[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
    if (!solid[i]) holes = true;
  }
  return { width, height, data, solid: holes ? solid : undefined };
}

// A coarser copy of a height grid (every `factor` x `factor` block averaged;
// a block is solid when most of it is), for distant, low-detail reliefs.
export function downsampleHeightGrid(grid: HeightGrid, factor: number): HeightGrid {
  const width = Math.max(1, Math.floor(grid.width / factor));
  const height = Math.max(1, Math.floor(grid.height / factor));
  const data = new Float32Array(width * height);
  const solid = grid.solid ? new Uint8Array(width * height) : undefined;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let solidCount = 0;
      for (let sy = 0; sy < factor; sy++) {
        for (let sx = 0; sx < factor; sx++) {
          const i = (y * factor + sy) * grid.width + x * factor + sx;
          sum += grid.data[i];
          solidCount += grid.solid ? grid.solid[i] : 1;
        }
      }
      data[y * width + x] = sum / (factor * factor);
      if (solid) solid[y * width + x] = solidCount * 2 >= factor * factor ? 1 : 0;
    }
  }
  return { width, height, data, solid };
}

export function createReliefWallGeometry(grid: HeightGrid, opts: ReliefOptions): ReliefResult {
  if (opts.smooth && !grid.solid && !opts.holeLevels) return createSmoothReliefGeometry(grid, opts);
  const { width: fullW, height: fullH } = grid;

  const { q: quantized, heights, baked } = quantizeHeights(grid.data, opts.levels);
  const fullQ = removeSmallIslands(quantized, fullW, fullH, Math.round(opts.minIsland));
  const levelCount = heights.length;

  // The most common level (usually the flat panel surface) sits exactly on
  // the grid boundary; lower levels recess into the wall, higher ones protrude
  // into the room. Keeping the dominant surface at z=0 lines it up with the
  // floor/ceiling edges.
  // (counted over solid cells only - a door frame is mostly hole)
  const fullSolid = grid.solid;
  const base = mostCommonLevel(fullSolid ? fullQ.filter((_, i) => fullSolid[i]) : fullQ, levelCount);

  // the rectangle of the map this geometry covers (all of it unless
  // opts.rows / opts.cols)
  const r0 = opts.rows ? Math.round(opts.rows[0] * fullH) : 0;
  const r1 = opts.rows ? Math.max(r0 + 1, Math.round(opts.rows[1] * fullH)) : fullH;
  const c0 = opts.cols ? Math.round(opts.cols[0] * fullW) : 0;
  const c1 = opts.cols ? Math.max(c0 + 1, Math.round(opts.cols[1] * fullW)) : fullW;
  const gh = r1 - r0;
  const gw = c1 - c0;
  const crop = <T extends Uint8Array | Int32Array | Uint16Array | Float32Array>(a: T): T => {
    if (c0 === 0 && c1 === fullW) return a.subarray(r0 * fullW, r1 * fullW) as T;
    const out = new (a.constructor as new (n: number) => T)(gw * gh);
    for (let y = 0; y < gh; y++) out.set(a.subarray((r0 + y) * fullW + c0, (r0 + y) * fullW + c1), y * gw);
    return out;
  };
  const q = crop(fullQ);
  const solid = fullSolid ? crop(fullSolid) : undefined;
  const levelZ = (l: number) => (heights[l] - heights[base]) * opts.depth;
  const maxAbsZ = Math.max(Math.abs(levelZ(0)), Math.abs(levelZ(levelCount - 1)));

  // Each wall face is built independently, so where two perpendicular walls
  // meet, a protrusion on one would poke through the other (inner corners)
  // and two recesses would carve a see-through notch (outer corners). Forcing
  // a margin at least as wide as the deepest relief back to the base level
  // keeps every face flush along its vertical edges, the same trick the
  // beveled profile uses with its taper.
  const cellW = opts.wallWidth / gw;
  const cellH = opts.wallHeight / gh;
  const margin = opts.flushEdges === false ? 0 : Math.min(Math.floor(gw / 2), Math.ceil(maxAbsZ / cellW - 1e-6));
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < margin; x++) {
      q[y * gw + x] = base;
      q[y * gw + gw - 1 - x] = base;
    }
  }

  const X = (x: number) => -opts.wallWidth / 2 + x * cellW;
  const Y = (y: number) => opts.wallHeight / 2 - y * cellH;
  const U = (x: number) => (x + c0) / fullW;
  const V = (y: number) => 1 - (y + r0) / fullH;
  // Per-cell key: its level, or HOLE for a transparent cell (or one on the
  // lowest `holeLevels`). Holes get no front face; the side faces around
  // them reach back to `holeBackZ`.
  const HOLE = -1;
  const key = new Int16Array(gw * gh);
  const holeLevels = opts.holeLevels ?? 0;
  for (let i = 0; i < key.length; i++) key[i] = (solid && !solid[i]) || q[i] < holeLevels ? HOLE : q[i];
  const holeBackZ = opts.holeBackZ ?? levelZ(0);
  const zOf = (k: number) => (k === HOLE ? holeBackZ : levelZ(k));
  // outside the map counts as base level, so recesses touching the top/bottom
  // edge get a closing face - except next to a hole, which just stays open
  // (a door frame's opening runs out through the bottom edge)
  const levelAt = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < gw && y < gh) return key[y * gw + x];
    const edge = key[Math.min(gh - 1, Math.max(0, y)) * gw + Math.min(gw - 1, Math.max(0, x))];
    return edge === HOLE ? HOLE : base;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  // second UV set, for the ambient occlusion map (see computeAmbientOcclusion)
  const uvs1: number[] = [];
  const indices: number[] = [];

  function quad(p: number[][], n: number[], uv: number[][], uv1: number[][] = uv) {
    const i0 = positions.length / 3;
    for (let k = 0; k < 4; k++) {
      positions.push(p[k][0], p[k][1], p[k][2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(uv[k][0], uv[k][1]);
      uvs1.push(uv1[k][0], uv1[k][1]);
    }
    // vertices are given counter-clockwise as seen from the normal side
    indices.push(i0, i0 + 1, i0 + 2, i0, i0 + 2, i0 + 3);
  }

  // --- front faces: greedy-merge same-level cells into rectangles ---------
  const used = new Uint8Array(gw * gh);
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (used[y * gw + x] || key[y * gw + x] === HOLE) continue;
      const l = key[y * gw + x];

      let x1 = x + 1;
      while (x1 < gw && !used[y * gw + x1] && key[y * gw + x1] === l) x1++;

      let y1 = y + 1;
      grow: while (y1 < gh) {
        for (let xx = x; xx < x1; xx++) {
          if (used[y1 * gw + xx] || key[y1 * gw + xx] !== l) break grow;
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
  // extruded pixel art. Its ambient occlusion comes from the lower cell at
  // the foot of the step instead - the side sits in that crevice, not up on
  // the open top surface.

  // vertical boundaries between column bx-1 and bx
  for (let bx = 0; bx <= gw; bx++) {
    let y = 0;
    while (y < gh) {
      const lL = levelAt(bx - 1, y);
      const lR = levelAt(bx, y);
      const zL = zOf(lL);
      const zR = zOf(lR);
      if (zL === zR) {
        y++;
        continue;
      }
      let y1 = y + 1;
      while (y1 < gh && levelAt(bx - 1, y1) === lL && levelAt(bx, y1) === lR) y1++;

      const px = X(bx);
      const leftHigher = zL > zR;
      const u = U(leftHigher ? bx - 0.5 : bx + 0.5);
      const uLow = U(leftHigher ? bx + 0.5 : bx - 0.5);
      quad(
        [
          [px, Y(y1), zL],
          [px, Y(y1), zR],
          [px, Y(y), zR],
          [px, Y(y), zL],
        ],
        [leftHigher ? 1 : -1, 0, 0],
        [
          [u, V(y1)],
          [u, V(y1)],
          [u, V(y)],
          [u, V(y)],
        ],
        [
          [uLow, V(y1)],
          [uLow, V(y1)],
          [uLow, V(y)],
          [uLow, V(y)],
        ],
      );
      y = y1;
    }
  }

  // horizontal boundaries between row by-1 (above) and by (below)
  for (let by = 0; by <= gh; by++) {
    let x = 0;
    while (x < gw) {
      const lA = levelAt(x, by - 1);
      const lB = levelAt(x, by);
      const zA = zOf(lA);
      const zB = zOf(lB);
      if (zA === zB) {
        x++;
        continue;
      }
      let x1 = x + 1;
      while (x1 < gw && levelAt(x1, by - 1) === lA && levelAt(x1, by) === lB) x1++;

      const py = Y(by);
      // upper cell sticking out further: its underside faces down;
      // otherwise the lower cell's top faces up
      const upperHigher = zA > zB;
      const v = V(upperHigher ? by - 0.5 : by + 0.5);
      const vLow = V(upperHigher ? by + 0.5 : by - 0.5);
      quad(
        [
          [X(x), py, zB],
          [X(x1), py, zB],
          [X(x1), py, zA],
          [X(x), py, zA],
        ],
        [0, upperHigher ? -1 : 1, 0],
        [
          [U(x), v],
          [U(x1), v],
          [U(x1), v],
          [U(x), v],
        ],
        [
          [U(x), vLow],
          [U(x1), vLow],
          [U(x1), vLow],
          [U(x), vLow],
        ],
      );
      x = x1;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new THREE.Float32BufferAttribute(uvs1, 2));
  geometry.setIndex(indices);
  // group 0: front faces (full material incl. normal map)
  // group 1: step side faces (their UVs are degenerate in one direction, which
  // breaks the derivative-based tangent frame a normal map needs)
  geometry.addGroup(0, frontIndexCount, 0);
  geometry.addGroup(frontIndexCount, indices.length - frontIndexCount, 1);

  const cellZ = new Float32Array(gw * gh);
  for (let i = 0; i < cellZ.length; i++) cellZ[i] = zOf(key[i]);
  const aoMap = createAoTexture(computeAmbientOcclusion(cellZ, gw, gh, cellW, cellH, opts.aoRadius), gw, gh);

  // The central opening (a door frame's): its width is the run of hole cells
  // through the middle row (the jambs can flare out near the floor); its top
  // is the highest hole cell straight above any of those columns - the
  // opening can reach higher at the sides than in the middle (a plate hanging
  // from the header). Stray transparent pixels elsewhere, like a sliver along
  // the image's edge, aren't part of it.
  let holeBounds: HoleBounds | null = null;
  const cx = Math.floor(gw / 2);
  const cy = Math.floor(gh / 2);
  const isHole = (x: number, y: number) => key[y * gw + x] === HOLE;
  if (isHole(cx, cy)) {
    let rowTop = cy;
    let rowBottom = cy;
    while (rowTop > 0 && isHole(cx, rowTop - 1)) rowTop--;
    while (rowBottom < gh - 1 && isHole(cx, rowBottom + 1)) rowBottom++;
    let x0 = cx;
    let x1 = cx;
    while (x0 > 0 && isHole(x0 - 1, cy)) x0--;
    while (x1 < gw - 1 && isHole(x1 + 1, cy)) x1++;
    let top = rowTop;
    for (let x = x0; x <= x1; x++) {
      if (!isHole(x, cy)) continue;
      let y = cy;
      while (y > 0 && isHole(x, y - 1)) y--;
      top = Math.min(top, y);
    }
    holeBounds = { minX: X(x0), maxX: X(x1 + 1), minY: Y(rowBottom + 1), maxY: Y(top) };
  }

  return {
    geometry,
    aoMap,
    triangles: indices.length / 3,
    levelCount,
    baked,
    maxZ: levelZ(levelCount - 1),
    holeBounds,
  };
}

// The smooth variant: one vertex grid over the panel (at most SMOOTH_CELLS
// quads along its long side), each vertex raised by the height map there -
// slopes instead of steps. The heights are relative to the map's most common
// gray (the base surface, at z=0, like the stepped build); a continuous map
// is stretched over its 0.5%..99.5% range first, and the left and right
// edges ease back to the base when the panel has to meet a perpendicular
// wall (flushEdges). Normals come from the shape; the normal map adds the
// fine detail on top.
const SMOOTH_CELLS = 64;

function createSmoothReliefGeometry(grid: HeightGrid, opts: ReliefOptions): ReliefResult {
  const factor = Math.max(1, Math.ceil(Math.max(grid.width, grid.height) / SMOOTH_CELLS));
  const src = factor > 1 ? downsampleHeightGrid(grid, factor) : grid;
  const { width: fullW, height: fullH } = src;

  // heights 0..1: absolute for a baked map, stretched for a continuous one
  const sorted = Float32Array.from(src.data).sort();
  const distinct = new Set<number>();
  for (let i = 0; i < src.data.length && distinct.size <= 32; i++) distinct.add(Math.round(src.data[i] * 255));
  const stretch = distinct.size > MAX_BAKED_LEVELS;
  const lo = stretch ? sorted[Math.floor(sorted.length * 0.005)] : 0;
  const hi = stretch ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))] : 1;
  const range = hi - lo || 1;
  const norm = (v: number) => Math.min(1, Math.max(0, (v - lo) / range));
  // the base: the most common 8-bit gray
  const counts = new Uint32Array(256);
  for (const v of src.data) counts[Math.min(255, Math.round(norm(v) * 255))]++;
  let baseGray = 0;
  for (let g = 1; g < 256; g++) if (counts[g] > counts[baseGray]) baseGray = g;
  const base = baseGray / 255;

  const r0 = opts.rows ? Math.round(opts.rows[0] * fullH) : 0;
  const r1 = opts.rows ? Math.max(r0 + 1, Math.round(opts.rows[1] * fullH)) : fullH;
  const c0 = opts.cols ? Math.round(opts.cols[0] * fullW) : 0;
  const c1 = opts.cols ? Math.max(c0 + 1, Math.round(opts.cols[1] * fullW)) : fullW;
  const gh = r1 - r0;
  const gw = c1 - c0;
  const cellW = opts.wallWidth / gw;
  const cellH = opts.wallHeight / gh;

  // the cropped heights, per cell
  const cellZ = new Float32Array(gw * gh);
  let maxZ = 0;
  let maxAbsZ = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      const z = (norm(src.data[(r0 + y) * fullW + c0 + x]) - base) * opts.depth;
      cellZ[y * gw + x] = z;
      if (z > maxZ) maxZ = z;
      if (Math.abs(z) > maxAbsZ) maxAbsZ = Math.abs(z);
    }
  }
  // the margin the side edges ease over, as in the stepped build
  const margin = opts.flushEdges === false ? 0 : Math.min(Math.floor(gw / 2), Math.ceil(maxAbsZ / cellW - 1e-6));
  if (margin > 0) {
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const t = Math.min(1, Math.min(x + 0.5, gw - x - 0.5) / margin);
        cellZ[y * gw + x] *= t * t * (3 - 2 * t);
      }
    }
  }

  // bilinear height at a continuous cell position (cell centers at +0.5)
  const sample = (fx: number, fy: number) => {
    const x = Math.min(gw - 1, Math.max(0, fx - 0.5));
    const y = Math.min(gh - 1, Math.max(0, fy - 0.5));
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = Math.min(gw - 1, x0 + 1);
    const y1 = Math.min(gh - 1, y0 + 1);
    const tx = x - x0;
    const ty = y - y0;
    const top = cellZ[y0 * gw + x0] * (1 - tx) + cellZ[y0 * gw + x1] * tx;
    const bottom = cellZ[y1 * gw + x0] * (1 - tx) + cellZ[y1 * gw + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  };

  const nx = gw + 1;
  const ny = gh + 1;
  const positions = new Float32Array(nx * ny * 3);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      positions[k * 3] = -opts.wallWidth / 2 + i * cellW;
      positions[k * 3 + 1] = opts.wallHeight / 2 - j * cellH;
      positions[k * 3 + 2] = sample(i, j);
      uvs[k * 2] = (i + c0) / fullW;
      uvs[k * 2 + 1] = 1 - (j + r0) / fullH;
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const a = j * nx + i;
      const b = a + 1;
      const c = a + nx;
      const d = c + 1;
      indices.push(a, c, d, a, d, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uvs.slice(), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.addGroup(0, indices.length, 0);

  const aoMap = createAoTexture(computeAmbientOcclusion(cellZ, gw, gh, cellW, cellH, opts.aoRadius), gw, gh);
  return { geometry, aoMap, triangles: indices.length / 3, levelCount: 0, baked: false, maxZ, holeBounds: null };
}

// Horizon-based ambient occlusion over the relief's height field: for each
// cell, march 8 directions up to `radius` cells, find the steepest rise
// toward the neighbors, and count how much of the sky it blocks
// (sin of the horizon angle). Crevices between tall steps come out dark, open
// flat surfaces stay at 1.
function computeAmbientOcclusion(
  z: Float32Array,
  w: number,
  h: number,
  cellW: number,
  cellH: number,
  radius: number,
): Float32Array {
  const DIRS = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  const ao = new Float32Array(w * h);
  const r = Math.max(1, Math.round(radius));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z0 = z[y * w + x];
      let occlusion = 0;
      for (const [dx, dy] of DIRS) {
        let maxSlope = 0;
        for (let s = 1; s <= r; s++) {
          // clamp at the map edge: the neighboring wall panel continues the
          // same surface there
          const xx = Math.min(w - 1, Math.max(0, x + dx * s));
          const yy = Math.min(h - 1, Math.max(0, y + dy * s));
          const dist = Math.hypot(dx * s * cellW, dy * s * cellH);
          const slope = (z[yy * w + xx] - z0) / dist;
          if (slope > maxSlope) maxSlope = slope;
        }
        occlusion += maxSlope / Math.sqrt(1 + maxSlope * maxSlope);
      }
      ao[y * w + x] = 1 - occlusion / DIRS.length;
    }
  }
  return ao;
}

function createAoTexture(ao: Float32Array, w: number, h: number): THREE.DataTexture {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    // DataTexture rows run bottom-up (no flipY), grid rows top-down
    const row = h - 1 - y;
    for (let x = 0; x < w; x++) {
      const v = Math.round(ao[y * w + x] * 255);
      const o = (row * w + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  // per-texel, like the rest of the voxel look
  tex.magFilter = THREE.NearestFilter;
  // the relief geometry's second UV set: front faces map it like `uv`, step
  // sides sample the cell at the foot of the step
  tex.channel = 1;
  tex.needsUpdate = true;
  return tex;
}
