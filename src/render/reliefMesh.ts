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
  // levels: those stay stepped - unless `smoothHoles` (below) asks for the
  // hybrid build.
  smooth?: boolean;
  // for a smooth one: how many cells along its long side (the graphics setting; default 64)
  smoothCells?: number;
  // HYBRID mode (an experiment, see createSmoothReliefGeometry): lets a
  // smooth relief take a map with holes. Grid quads that cover no solid pixel
  // are left out, the vertices on their rim sink back to `holeBackZ`, and the
  // pixel-precise edge is left to an alpha cutout on the front material
  // (alphaTest on the diffuse). Without it a smooth request for a map with
  // holes falls back to the stepped build.
  smoothHoles?: boolean;
  // for a smooth one: a distant, low-detail version of the same surface -
  // this many times fewer cells along each side. Its vertices are picked
  // off the detailed one (heights worked out at smoothCells, then sampled),
  // so the two agree on the base level, the eased edges and the panel's
  // outline, and a far panel meets a near neighbor without a step.
  smoothLod?: number;
  // Leave the left/right edges free for a corner join (see cornerJoins.ts)
  // instead of forcing them to the base (flushEdges): the relief runs right
  // up to both edges, and the edges themselves follow one profile shared by
  // the two sides - the wrap-around seam between the map's first and last
  // column, so a panel still meets a copy of itself next to it without a
  // step. Every version of the panel ends on exactly the same line, so a
  // neighbour or a join strip fits all of them: a smooth relief's profile
  // has a vertex at every row of the detailed surface, kept along the edges
  // of its distant versions too; a stepped one a step every whole multiple
  // of `joinEdges` cells (the coarser grid's rows - see MAX_EDGE_BANDS).
  joinEdges?: number;
  // Keep neighboring floor tiles at the same height along all four edges.
  floorEdges?: boolean;
  // Join a pillar block to its flat bevel rings at the nominal width.
  flushRows?: boolean;
  // a stepped distant version (built from a coarser grid, with its own
  // levels): its detailed version's edge profile, to end on the same line
  edgeProfile?: EdgeSegment[];
  // With joined edges: what each side edge (left, right) meets. 1: an outer
  // corner, -1: an inner one, 0: anything else. At a corner the edge is
  // pushed along the panel by its own height there (out past the corner
  // where it stands out, back where it's recessed), so it lands on the
  // mitre - where the other face, built the same way from the same profile,
  // lands too: the two meet edge to edge, vertex on vertex, with nothing
  // between them.
  edgeModes?: [number, number];
}

// One straight piece of a panel's side edge profile (see joinEdges), in the
// panel's local units: from (y0, z0) at the top to (y1, z1) at the bottom,
// with the texture's v there. A stepped profile is level within a piece
// (z0 = z1) and jumps between pieces.
export interface EdgeSegment {
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  v0: number;
  v1: number;
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
  // a distant version (smoothLod): how far its surface rises above the
  // detailed one's anywhere (local units, toward the viewer) - a decal
  // painted onto the detailed surface sinks into it that deep there, so
  // decals are pulled toward the eye that much at its distance (see
  // decals.ts, setFarPull); 0 for a detailed one
  lodRise?: number;
  // the side edges' shared profile, top to bottom (only with joinEdges)
  edge?: EdgeSegment[];
}

// Relief geometry is built per height-map cell; larger maps are box-filtered
// down first so a 1024px photo texture doesn't produce a million quads.
const MAX_GRID = 256;
// a stepped relief's joined edge profile: at most this many steps down a
// whole map's height (see joinEdges)
const MAX_EDGE_BANDS = 16;

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
  if (opts.smooth && !opts.holeLevels && (!grid.solid || opts.smoothHoles)) return createSmoothReliefGeometry(grid, opts);
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
  const joined = !!opts.joinEdges;
  const margin =
    opts.flushEdges === false || joined ? 0 : Math.min(Math.floor(gw / 2), Math.ceil(maxAbsZ / cellW - 1e-6));
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
  // x of a cell boundary at height z: a joined side edge lands on its
  // corner's mitre (see ReliefOptions.edgeModes)
  const modes = joined ? (opts.edgeModes ?? [0, 0]) : [0, 0];
  const EX = (bx: number, z: number) => X(bx) + z * ((modes[0] + modes[1]) * bx / gw - modes[0]);
  // Per-cell key: its level, or HOLE for a transparent cell (or one on the
  // lowest `holeLevels`). Holes get no front face; the side faces around
  // them reach back to `holeBackZ`.
  const HOLE = -1;
  const key = new Int16Array(gw * gh);
  const holeLevels = opts.holeLevels ?? 0;
  for (let i = 0; i < key.length; i++) key[i] = (solid && !solid[i]) || q[i] < holeLevels ? HOLE : q[i];
  const holeBackZ = opts.holeBackZ ?? levelZ(0);
  if (opts.floorEdges) {
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const i = y * gw + x;
      if ((x === 0 || y === 0 || x === gw - 1 || y === gh - 1) && key[i] !== HOLE) key[i] = base;
    }
  }
  // keys from levelCount up: the joined edge columns' own heights (below)
  const extraZ: number[] = [];
  const zOf = (k: number) => (k === HOLE ? holeBackZ : k >= levelCount ? extraZ[k - levelCount] : levelZ(k));

  // Joined edges (see ReliefOptions.joinEdges): the first and last column
  // take one shared height per band of rows - the two columns' average
  // there - or, for a distant version, its detailed one's profile.
  // As extra levels of their own, so the faces below treat them like any
  // other level.
  let edge: EdgeSegment[] | undefined;
  if (joined) {
    const keyFor = new Map<number, number>();
    const edgeKey = (z: number) => {
      let k = keyFor.get(z);
      if (k === undefined) {
        k = levelCount + extraZ.length;
        extraZ.push(z);
        keyFor.set(z, k);
      }
      return k;
    };
    const setRow = (y: number, z: number) => {
      for (const x of [0, gw - 1]) if (key[y * gw + x] !== HOLE) key[y * gw + x] = edgeKey(z);
    };
    if (opts.edgeProfile) {
      for (let y = 0; y < gh; y++) {
        const cy = Y(y + 0.5);
        const seg = opts.edgeProfile.find((s) => cy <= s.y0 && cy >= s.y1) ?? opts.edgeProfile[opts.edgeProfile.length - 1];
        setRow(y, seg.z0);
      }
      edge = opts.edgeProfile;
    } else {
      // (a whole multiple of joinEdges cells, so the distant version's rows
      // still line up - and no more than MAX_EDGE_BANDS over the whole map:
      // a fine map would give hundreds, each a few more triangles in the
      // join strips)
      const step = opts.joinEdges! * Math.max(1, Math.ceil(fullH / opts.joinEdges! / MAX_EDGE_BANDS));
      const bands = Math.max(1, Math.round(gh / step));
      edge = [];
      for (let b = 0; b < bands; b++) {
        const y0 = Math.round((b * gh) / bands);
        const y1 = Math.round(((b + 1) * gh) / bands);
        let sum = 0;
        let count = 0;
        for (let y = y0; y < y1; y++) {
          for (const x of [0, gw - 1]) {
            const k = key[y * gw + x];
            if (k === HOLE) continue;
            sum += zOf(k);
            count++;
          }
        }
        const z = count ? sum / count : 0;
        for (let y = y0; y < y1; y++) setRow(y, z);
        edge.push({ y0: Y(y0), y1: Y(y1), z0: z, z1: z, v0: V(y0), v1: V(y1) });
      }
    }
  }

  if (opts.flushRows) {
    for (const y of [0, gh - 1]) {
      for (let x = 0; x < gw; x++) if (key[y * gw + x] !== HOLE) key[y * gw + x] = base;
    }
  }
  // outside the map counts as base level, so recesses touching the top/bottom
  // edge get a closing face - except next to a hole, which just stays open
  // (a door frame's opening runs out through the bottom edge). Joined edges
  // stay open at the sides: the corner join closes them.
  const levelAt = (x: number, y: number) => {
    if (x >= 0 && y >= 0 && x < gw && y < gh) return key[y * gw + x];
    if (joined && y >= 0 && y < gh) return key[y * gw + Math.min(gw - 1, Math.max(0, x))];
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

      const z = zOf(l);
      quad(
        [
          [EX(x, z), Y(y1), z],
          [EX(x1, z), Y(y1), z],
          [EX(x1, z), Y(y), z],
          [EX(x, z), Y(y), z],
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

      const pxL = EX(bx, zL), pxR = EX(bx, zR);
      const leftHigher = zL > zR;
      const u = U(leftHigher ? bx - 0.5 : bx + 0.5);
      const uLow = U(leftHigher ? bx + 0.5 : bx - 0.5);
      quad(
        [
          [pxL, Y(y1), zL],
          [pxR, Y(y1), zR],
          [pxR, Y(y), zR],
          [pxL, Y(y), zL],
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
          [EX(x, zB), py, zB],
          [EX(x1, zB), py, zB],
          [EX(x1, zA), py, zA],
          [EX(x, zA), py, zA],
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
  const holeBounds = findHoleBounds((x, y) => key[y * gw + x] === HOLE, gw, gh, X, Y);

  return {
    geometry,
    aoMap,
    triangles: indices.length / 3,
    levelCount,
    baked,
    maxZ: levelZ(levelCount - 1),
    holeBounds,
    edge,
  };
}

// The central opening (a door frame's): its width is the run of hole cells
// through the middle row (the jambs can flare out near the floor); its top
// is the highest hole cell straight above any of those columns - the
// opening can reach higher at the sides than in the middle (a plate hanging
// from the header). Stray transparent pixels elsewhere, like a sliver along
// the image's edge, aren't part of it. Shared by the stepped and the hybrid
// smooth build, so both give a door the same opening.
function findHoleBounds(
  isHole: (x: number, y: number) => boolean,
  gw: number,
  gh: number,
  X: (x: number) => number,
  Y: (y: number) => number,
): HoleBounds | null {
  const cx = Math.floor(gw / 2);
  const cy = Math.floor(gh / 2);
  if (!isHole(cx, cy)) return null;
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
  return { minX: X(x0), maxX: X(x1 + 1), minY: Y(rowBottom + 1), maxY: Y(top) };
}

// The smooth variant: one vertex grid over the panel (at most SMOOTH_CELLS
// quads along its long side), each vertex raised by the height map there -
// slopes instead of steps. The heights are relative to the map's most common
// gray (the base surface, at z=0, like the stepped build); a continuous map
// is stretched over its 0.5%..99.5% range first, and the left and right
// edges ease back to the base when the panel has to meet a perpendicular
// wall (flushEdges). Normals come from the shape; the normal map adds the
// fine detail on top.
// (a smooth wall is 8192 triangles at 64 cells, 2048 at 32, 512 at 16)
const SMOOTH_CELLS = 64;

function createSmoothReliefGeometry(grid: HeightGrid, opts: ReliefOptions): ReliefResult {
  // HYBRID (grid.solid + opts.smoothHoles): transparent pixels are holes. The
  // heights are averaged over the solid pixels only (a transparent pixel's
  // color is junk), the base level and stretch are worked out over solid
  // cells only, grid quads covering no solid pixel are left out, and the
  // vertices on their rim sink back to holeBackZ. The pixel-precise edge is
  // the front material's alpha cutout. Closing jambs: not built - the rim
  // slopes back to holeBackZ instead (one cell wide), which is a continuous
  // surface, so there are no cracks; a door frame's two halves meet there.
  const holeSolid = opts.smoothHoles ? grid.solid : undefined;
  const factor = Math.max(1, Math.ceil(Math.max(grid.width, grid.height) / (opts.smoothCells ?? SMOOTH_CELLS)));
  let cellSolid: Uint8Array | undefined;
  let src: HeightGrid;
  if (holeSolid) {
    const sw = Math.max(1, Math.floor(grid.width / factor));
    const sh = Math.max(1, Math.floor(grid.height / factor));
    const data = new Float32Array(sw * sh);
    cellSolid = new Uint8Array(sw * sh);
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let sum = 0;
        let n = 0;
        for (let sy = 0; sy < factor; sy++) {
          for (let sx = 0; sx < factor; sx++) {
            const i = (y * factor + sy) * grid.width + x * factor + sx;
            if (!holeSolid[i]) continue;
            sum += grid.data[i];
            n++;
          }
        }
        data[y * sw + x] = n ? sum / n : 0;
        cellSolid[y * sw + x] = n ? 1 : 0;
      }
    }
    src = { width: sw, height: sh, data };
  } else {
    src = factor > 1 ? downsampleHeightGrid(grid, factor) : grid;
  }
  const { width: fullW, height: fullH } = src;
  // the heights that count: the solid cells' (all of them without holes)
  const statData = cellSolid ? Float32Array.from(src.data.filter((_, i) => cellSolid![i])) : src.data;

  // heights 0..1: absolute for a baked map, stretched for a continuous one
  const sorted = Float32Array.from(statData).sort();
  const distinct = new Set<number>();
  for (let i = 0; i < statData.length && distinct.size <= 32; i++) distinct.add(Math.round(statData[i] * 255));
  const stretch = distinct.size > MAX_BAKED_LEVELS;
  const lo = stretch ? sorted[Math.floor(sorted.length * 0.005)] : 0;
  const hi = stretch ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))] : 1;
  const range = hi - lo || 1;
  const norm = (v: number) => Math.min(1, Math.max(0, (v - lo) / range));
  // the base: the most common 8-bit gray
  const counts = new Uint32Array(256);
  for (const v of statData) counts[Math.min(255, Math.round(norm(v) * 255))]++;
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
  let minZ = 0;
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (cellSolid && !cellSolid[(r0 + y) * fullW + c0 + x]) continue;
      const z = (norm(src.data[(r0 + y) * fullW + c0 + x]) - base) * opts.depth;
      cellZ[y * gw + x] = z;
      if (z > maxZ) maxZ = z;
      if (z < minZ) minZ = z;
      if (Math.abs(z) > maxAbsZ) maxAbsZ = Math.abs(z);
    }
  }
  // what a hybrid one's jambs reach back to: the caller's back plane, else the lowest level
  const holeBackZ = opts.holeBackZ ?? minZ;
  // the heights the ambient occlusion sees: hole cells at the back plane
  let aoZ = cellZ;
  if (cellSolid) {
    aoZ = cellZ.slice();
    const isHoleCell = (i: number) => !cellSolid![(r0 + Math.floor(i / gw)) * fullW + c0 + (i % gw)];
    for (let i = 0; i < aoZ.length; i++) if (isHoleCell(i)) aoZ[i] = holeBackZ;
    // The surface itself: a hole cell takes its nearest solid cell's height
    // (flood outward), so the vertices beside a hole stay on the surface -
    // the jambs (below) make the opening's depth, not a sloping rim.
    const filled = new Uint8Array(cellZ.length);
    let frontier: number[] = [];
    for (let i = 0; i < cellZ.length; i++) if (!isHoleCell(i)) { filled[i] = 1; frontier.push(i); }
    while (frontier.length) {
      const next: number[] = [];
      for (const i of frontier) {
        const x = i % gw;
        const y = Math.floor(i / gw);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= gw || yy >= gh || filled[yy * gw + xx]) continue;
          filled[yy * gw + xx] = 1;
          cellZ[yy * gw + xx] = cellZ[i];
          next.push(yy * gw + xx);
        }
      }
      frontier = next;
    }
  }
  // the margin the side edges ease over, as in the stepped build (none when
  // they're joined: see joinEdges)
  // (a hybrid one has no joined edges: it's for doors)
  const joinEdges = holeSolid ? undefined : opts.joinEdges;
  const margin =
    opts.flushEdges === false || joinEdges ? 0 : Math.min(Math.floor(gw / 2), Math.ceil(maxAbsZ / cellW - 1e-6));
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
    if (opts.flushRows && (fy <= 1e-6 || fy >= gh - 1e-6)) return 0;
    if (opts.floorEdges && (fx <= 1e-6 || fy <= 1e-6 || fx >= gw - 1e-6 || fy >= gh - 1e-6)) return 0;
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

  // Joined edges (see ReliefOptions.joinEdges): both side edges follow the
  // seam between the first and last column, at every row of the detailed
  // surface - its stones and mortar run right up to a corner and meet the
  // other face's there. A distant version keeps every one of those rows
  // along its two edges (a fan of triangles over to its own coarser
  // columns), so all versions of a panel end on the very same line and
  // neighbours at different distances still meet vertex on vertex.
  let edgeZ: ((fy: number) => number) | null = null;
  let edge: EdgeSegment[] | undefined;
  if (joinEdges) {
    const ez = new Float32Array(gh + 1);
    for (let k = 0; k <= gh; k++) ez[k] = (sample(0, k) + sample(gw, k)) / 2;
    edgeZ = (fy) => {
      const t = Math.min(gh, Math.max(0, fy));
      const k = Math.min(gh - 1, Math.floor(t));
      return ez[k] + (ez[k + 1] - ez[k]) * (t - k);
    };
    edge = [];
    for (let k = 0; k < gh; k++) {
      edge.push({
        y0: opts.wallHeight / 2 - k * cellH,
        y1: opts.wallHeight / 2 - (k + 1) * cellH,
        z0: ez[k],
        z1: ez[k + 1],
        v0: 1 - (k + r0) / fullH,
        v1: 1 - (k + 1 + r0) / fullH,
      });
    }
  }
  // the detailed surface's height at a vertex position (cell corners)
  const surfaceAt = (fx: number, fy: number) => (edgeZ && (fx <= 0 || fx >= gw) ? edgeZ(fy) : sample(fx, fy));
  // (a joined edge lands on its corner's mitre: see ReliefOptions.edgeModes)
  const modes = edgeZ ? (opts.edgeModes ?? [0, 0]) : [0, 0];

  // the mesh's own cells: the height cells, or fewer for a distant version
  // (smoothLod) - each of its vertices then sits on the detailed surface,
  // `stepX` x `stepY` height cells apart
  const lod = Math.max(1, opts.smoothLod ?? 1);
  const mw = Math.max(1, Math.round(gw / lod));
  const mh = Math.max(1, Math.round(gh / lod));
  const stepX = gw / mw;
  const stepY = gh / mh;
  const pos: number[] = [];
  const uv: number[] = [];
  // HYBRID: which of the mesh's quads are holes (no solid pixel under them:
  // a summed-area table over the original grid's mask counts them; the
  // strict rule keeps every thin bar - what the quad keeps beyond its solid
  // pixels the alpha cutout takes away). The surface stays on its height
  // right up to the holes; the opening's depth is real jamb faces at the
  // mask's own pixel edges (below), so the cutout's edge and the jamb's top
  // are the same line and the two halves of a frame meet cleanly.
  let quadHole: Uint8Array | null = null;
  if (holeSolid) {
    const W = grid.width;
    const H = grid.height;
    const sat = new Uint32Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += holeSolid[y * W + x];
        sat[(y + 1) * (W + 1) + x + 1] = sat[y * (W + 1) + x + 1] + row;
      }
    }
    quadHole = new Uint8Array(mw * mh);
    for (let j = 0; j < mh; j++) {
      const py0 = Math.max(0, Math.floor(((r0 + j * stepY) / fullH) * H + 1e-6));
      const py1 = Math.min(H, Math.max(py0 + 1, Math.ceil(((r0 + (j + 1) * stepY) / fullH) * H - 1e-6)));
      for (let i = 0; i < mw; i++) {
        const px0 = Math.max(0, Math.floor(((c0 + i * stepX) / fullW) * W + 1e-6));
        const px1 = Math.min(W, Math.max(px0 + 1, Math.ceil(((c0 + (i + 1) * stepX) / fullW) * W - 1e-6)));
        const solidCount = sat[py1 * (W + 1) + px1] - sat[py0 * (W + 1) + px1] - sat[py1 * (W + 1) + px0] + sat[py0 * (W + 1) + px0];
        quadHole[j * mw + i] = solidCount === 0 ? 1 : 0;
      }
    }
  }
  // its columns of vertices, each with the rows they sit on (in height
  // cells): the coarse rows, or every row along a joined edge
  const fineRows = Array.from({ length: gh + 1 }, (_, j) => j);
  const coarseRows = mh === gh ? fineRows : Array.from({ length: mh + 1 }, (_, j) => j * stepY);
  const columns = Array.from({ length: mw + 1 }, (_, i) => {
    const side = i === 0 ? 0 : i === mw ? 1 : -1;
    const rows = edgeZ && side >= 0 ? fineRows : coarseRows;
    const ids = rows.map((fy) => {
      const fx = i * stepX;
      const z = side >= 0 ? surfaceAt(side ? gw : 0, fy) : sample(fx, fy);
      const shift = (edgeZ?.(fy) ?? 0) * ((modes[0] + modes[1]) * fx / gw - modes[0]);
      pos.push(-opts.wallWidth / 2 + fx * cellW + shift, opts.wallHeight / 2 - fy * cellH, z);
      uv.push((fx + c0) / fullW, 1 - (fy + r0) / fullH);
      return pos.length / 3 - 1;
    });
    return { rows, ids };
  });
  const indices: number[] = [];
  for (let i = 0; i < mw; i++) {
    const L = columns[i];
    const R = columns[i + 1];
    if (L.rows === R.rows) {
      for (let j = 0; j < L.rows.length - 1; j++) {
        if (quadHole && quadHole[j * mw + i]) continue;
        const a = L.ids[j];
        const b = R.ids[j];
        const c = L.ids[j + 1];
        const d = R.ids[j + 1];
        indices.push(a, c, d, a, d, b);
      }
      continue;
    }
    // rows that don't line up (a joined edge next to coarse rows): walk
    // down both, always stepping the one whose next row comes first
    let p = 0;
    let q = 0;
    while (p < L.rows.length - 1 || q < R.rows.length - 1) {
      if (q === R.rows.length - 1 || (p < L.rows.length - 1 && L.rows[p + 1] <= R.rows[q + 1])) {
        indices.push(L.ids[p], L.ids[p + 1], R.ids[q]);
        p++;
      } else {
        indices.push(L.ids[p], R.ids[q + 1], R.ids[q]);
        q++;
      }
    }
  }
  let positions = new Float32Array(pos);
  let uvs = new Float32Array(uv);
  if (quadHole) {
    // drop the vertices only holes used
    const remap = new Int32Array(positions.length / 3).fill(-1);
    let kept = 0;
    for (let k = 0; k < indices.length; k++) if (remap[indices[k]] < 0) remap[indices[k]] = kept++;
    const p2 = new Float32Array(kept * 3);
    const uv2 = new Float32Array(kept * 2);
    for (let v = 0; v < remap.length; v++) {
      const to = remap[v];
      if (to < 0) continue;
      p2.set(positions.subarray(v * 3, v * 3 + 3), to * 3);
      uv2.set(uvs.subarray(v * 2, v * 2 + 2), to * 2);
    }
    for (let k = 0; k < indices.length; k++) indices[k] = remap[indices[k]];
    positions = p2;
    uvs = uv2;
  }
  // HYBRID jambs and skirts: vertical faces (group 1, the side material), like
  // the stepped build's step faces. Along every edge between a solid and a hole
  // pixel one runs from the surface (read off the mesh itself, a hair above) back
  // to holeBackZ - straight runs that stay inside one mesh quad merge into one
  // face; along the panel's own outline a skirt closes the surface to the base
  // plane (z = 0) where it stands off it, so a frame meets the walls beside it
  // without a gap. Their texture coordinates are pinned to the solid edge
  // texel, across the depth.
  const frontIndexCount = indices.length;
  const jambPos: number[] = [];
  const jambUv: number[] = [];
  if (quadHole) {
    const W = grid.width;
    const H = grid.height;
    const cropped = !!opts.rows || !!opts.cols;
    const EPS = 0.002;
    const fx2x = (fx: number) => -opts.wallWidth / 2 + fx * cellW;
    const fy2y = (fy: number) => opts.wallHeight / 2 - fy * cellH;
    const vz = (i: number, j: number) => pos[columns[i].ids[j] * 3 + 2];
    // the mesh surface's height at (fx, fy) in quad (i, j)
    const zq = (i: number, j: number, fx: number, fy: number) => {
      const fu = Math.min(1, Math.max(0, (fx - i * stepX) / stepX));
      const fv = Math.min(1, Math.max(0, (fy - j * stepY) / stepY));
      const a = vz(i, j);
      const b = vz(i + 1, j);
      const c = vz(i, j + 1);
      const d = vz(i + 1, j + 1);
      return fv >= fu ? a + fu * (d - c) + fv * (c - a) : a + fu * (b - a) + fv * (d - b);
    };
    const face = (p: number[][], t: number[][], want: number[]) => {
      const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
      const e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
      const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) {
        p = [p[0], p[3], p[2], p[1]];
        t = [t[0], t[3], t[2], t[1]];
      }
      const base = positions.length / 3 + jambPos.length / 3;
      for (let k = 0; k < 4; k++) {
        jambPos.push(p[k][0], p[k][1], p[k][2]);
        jambUv.push(t[k][0], t[k][1]);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    const quadOf = (fx: number, fy: number) => [
      Math.min(mw - 1, Math.max(0, Math.floor(fx / stepX))),
      Math.min(mh - 1, Math.max(0, Math.floor(fy / stepY))),
    ];
    if (!cropped) {
      const sx = fullW / W;
      const sy = fullH / H;
      const solidAt = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && holeSolid![py * W + px] === 1;
      const holeAt = (px: number, py: number) => px >= 0 && py >= 0 && px < W && py < H && holeSolid![py * W + px] === 0;
      // edges between a solid and a hole pixel; along x lines (vertical edges), then along y lines
      for (const vertical of [true, false]) {
        const lines = vertical ? W : H;
        const run = vertical ? H : W;
        for (let e = 1; e < lines; e++) {
          for (const dir of [1, -1]) {
            // solid on the lower side of the line for dir 1, the upper for -1
            const sIdx = dir === 1 ? e - 1 : e;
            const hIdx = dir === 1 ? e : e - 1;
            let start = -1;
            let startQuad = -1;
            const flush = (end: number) => {
              if (start < 0) return;
              const [qi, qj] = vertical
                ? quadOf((sIdx + 0.5) * sx, (start + 0.5) * sy)
                : quadOf((start + 0.5) * sx, (sIdx + 0.5) * sy);
              const zb = holeBackZ;
              if (vertical) {
                const fx = e * sx;
                const z0 = zq(qi, qj, fx, start * sy) + EPS;
                const z1 = zq(qi, qj, fx, end * sy) + EPS;
                const u = (sIdx + 0.5) / W;
                const x = fx2x(fx);
                face(
                  [[x, fy2y(start * sy), z0], [x, fy2y(end * sy), z1], [x, fy2y(end * sy), zb], [x, fy2y(start * sy), zb]],
                  [[u, 1 - start / H], [u, 1 - end / H], [u, 1 - end / H], [u, 1 - start / H]],
                  [dir, 0, 0],
                );
              } else {
                const fy = e * sy;
                const z0 = zq(qi, qj, start * sx, fy) + EPS;
                const z1 = zq(qi, qj, end * sx, fy) + EPS;
                const v = 1 - (sIdx + 0.5) / H;
                const y = fy2y(fy);
                face(
                  [[fx2x(start * sx), y, z0], [fx2x(end * sx), y, z1], [fx2x(end * sx), y, zb], [fx2x(start * sx), y, zb]],
                  [[start / W, v], [end / W, v], [end / W, v], [start / W, v]],
                  [0, -dir, 0],
                );
              }
              start = -1;
            };
            for (let k = 0; k < run; k++) {
              const edge = vertical ? solidAt(sIdx, k) && holeAt(hIdx, k) : solidAt(k, sIdx) && holeAt(k, hIdx);
              if (edge) {
                const q = vertical ? quadOf((sIdx + 0.5) * sx, (k + 0.5) * sy)[1] : quadOf((k + 0.5) * sx, (sIdx + 0.5) * sy)[0];
                if (start >= 0 && q !== startQuad) flush(k);
                if (start < 0) {
                  start = k;
                  startQuad = q;
                }
              } else flush(k);
            }
            flush(run);
          }
        }
      }
    }
    // skirts along the outline, where a kept quad's surface stands off the base plane
    const skirt = (ax: number, ay: number, za: number, bx: number, by: number, zb2: number, tu: number, tv: number[], outward: number[]) => {
      if (Math.abs(za) < 1e-4 && Math.abs(zb2) < 1e-4) return;
      // (the face looks toward the lower side, as a stepped step face does)
      const sign = za + zb2 > 0 ? 1 : -1;
      face(
        [[ax, ay, za], [bx, by, zb2], [bx, by, 0], [ax, ay, 0]],
        [[tu, tv[0]], [tu, tv[1]], [tu, tv[1]], [tu, tv[0]]],
        outward.map((c) => c * sign),
      );
    };
    for (let j = 0; j < mh; j++) {
      for (const i of [0, mw - 1]) {
        if (quadHole[j * mw + i]) continue;
        const left = i === 0;
        const col = left ? 0 : mw;
        const fy0 = j * stepY;
        const fy1 = (j + 1) * stepY;
        const x = fx2x(col * stepX);
        const tu = (c0 + (left ? 0.5 * stepX : fullW - c0 - 0.5 * stepX)) / fullW;
        skirt(x, fy2y(fy0), vz(col, j), x, fy2y(fy1), vz(col, j + 1), tu, [1 - (fy0 + r0) / fullH, 1 - (fy1 + r0) / fullH], [left ? -1 : 1, 0, 0]);
      }
    }
    for (let i = 0; i < mw; i++) {
      for (const j of [0, mh - 1]) {
        if (quadHole[j * mw + i]) continue;
        const top = j === 0;
        const row = top ? 0 : mh;
        const fx0 = i * stepX;
        const fx1 = (i + 1) * stepX;
        const y = fy2y(row * stepY);
        const tv = 1 - (r0 + (top ? 0.5 * stepY : fullH - r0 - 0.5 * stepY)) / fullH;
        skirt(fx2x(fx0), y, vz(i, row), fx2x(fx1), y, vz(i + 1, row), (fx0 + c0) / fullW, [tv, tv], [0, top ? 1 : -1, 0]);
      }
    }
  }
  if (jambPos.length) {
    const merged = new Float32Array(positions.length + jambPos.length);
    merged.set(positions);
    merged.set(jambPos, positions.length);
    positions = merged;
    const mergedUv = new Float32Array(uvs.length + jambUv.length);
    mergedUv.set(uvs);
    mergedUv.set(jambUv, uvs.length);
    uvs = mergedUv;
  }
  // A distant version's flat triangles cut across the detailed surface's
  // hollows - how far they rise above it at worst (checked at the detailed
  // mesh's own vertices: both are flat between them, the detailed mesh's
  // triangles split the same way, so the gap peaks at one; a joined edge's
  // fans, on the detailed surface's own edge rows, are left out). (Not for
  // a hybrid one: doors have no decals.)
  let lodRise = 0;
  if (lod > 1 && !quadHole) {
    const at = (i: number, j: number) => positions[columns[i].ids[Math.round(columns[i].rows === fineRows ? j * stepY : j)] * 3 + 2];
    for (let y = 0; y <= gh; y++) {
      for (let x = 0; x <= gw; x++) {
        const u = Math.min(mw - 1e-6, x / stepX);
        const v = Math.min(mh - 1e-6, y / stepY);
        const i = Math.floor(u);
        const j = Math.floor(v);
        if (edgeZ && (i === 0 || i === mw - 1)) continue;
        const fu = u - i;
        const fv = v - j;
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i, j + 1);
        const d = at(i + 1, j + 1);
        // (the triangles a-c-d and a-d-b, as indexed below)
        const coarse = fv >= fu ? a + fu * (d - c) + fv * (c - a) : a + fu * (b - a) + fv * (d - b);
        lodRise = Math.max(lodRise, coarse - surfaceAt(x, y));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setAttribute("uv1", new THREE.BufferAttribute(uvs.slice(), 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // (a hybrid one's jambs and skirts are group 1: the side material)
  geometry.addGroup(0, frontIndexCount, 0);
  if (indices.length > frontIndexCount) geometry.addGroup(frontIndexCount, indices.length - frontIndexCount, 1);

  // (a distant version uses its detailed one's AO map: none of its own)
  const aoMap =
    lod > 1
      ? createAoTexture(new Float32Array([1]), 1, 1)
      : createAoTexture(computeAmbientOcclusion(aoZ, gw, gh, cellW, cellH, opts.aoRadius), gw, gh);
  // The opening comes from the mask itself, at the height map's own
  // resolution and exactly as the stepped build finds it (for the uncropped
  // map: a door's collision and its panel's size don't depend on the look)
  let holeBounds: HoleBounds | null = null;
  if (holeSolid) {
    const W = grid.width;
    const H = grid.height;
    const gr0 = opts.rows ? Math.round(opts.rows[0] * H) : 0;
    const gr1 = opts.rows ? Math.max(gr0 + 1, Math.round(opts.rows[1] * H)) : H;
    const gc0 = opts.cols ? Math.round(opts.cols[0] * W) : 0;
    const gc1 = opts.cols ? Math.max(gc0 + 1, Math.round(opts.cols[1] * W)) : W;
    const hw = gc1 - gc0;
    const hh = gr1 - gr0;
    holeBounds = findHoleBounds(
      (x, y) => !holeSolid[(gr0 + y) * W + gc0 + x],
      hw,
      hh,
      (x) => -opts.wallWidth / 2 + (x * opts.wallWidth) / hw,
      (y) => opts.wallHeight / 2 - (y * opts.wallHeight) / hh,
    );
  }
  return { geometry, aoMap, triangles: indices.length / 3, levelCount: 0, baked: false, maxZ, holeBounds, lodRise, edge };
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
  // the distance of each step in each direction (it depends on nothing else: worked out once, not for every cell -
  // a hypot per step was a third of a deck's load time)
  const inverseDist = new Float32Array(DIRS.length * r);
  for (let d = 0; d < DIRS.length; d++) {
    for (let s = 1; s <= r; s++) inverseDist[d * r + s - 1] = 1 / Math.hypot(DIRS[d][0] * s * cellW, DIRS[d][1] * s * cellH);
  }
  const lastX = w - 1;
  const lastY = h - 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const z0 = z[y * w + x];
      let occlusion = 0;
      for (let d = 0; d < DIRS.length; d++) {
        const dx = DIRS[d][0];
        const dy = DIRS[d][1];
        let maxSlope = 0;
        for (let s = 1; s <= r; s++) {
          // clamp at the map edge: the neighboring wall panel continues the
          // same surface there
          let xx = x + dx * s;
          let yy = y + dy * s;
          xx = xx < 0 ? 0 : xx > lastX ? lastX : xx;
          yy = yy < 0 ? 0 : yy > lastY ? lastY : yy;
          const slope = (z[yy * w + xx] - z0) * inverseDist[d * r + s - 1];
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
