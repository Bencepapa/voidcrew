import {
  FENCE_JITTER,
  FENCE_JITTER_MAX,
  FENCE_LAYERS_MAX,
  FENCE_SPACING,
  FENCE_SPACING_MAX,
  FENCE_SPACING_MIN,
  VEC,
  edgeSegment,
  midSegments,
  yawAlong,
  type FenceModelSpec,
  type FenceSegment,
} from "./fences";

// Foliage: the planes of a layered or crossed fence piece (see concept/editor-ui/NOTES-fence-blocks.md, "Foliage").
//
// A hedge, tall grass or wheat drawn as ONE plane looks flat, and vanishes edge-on. Drawn as several upright planes
// side by side (layers) or as two planes crossing in the cell's middle (an X) it reads as a mass of plants from
// every side - and because the planes are transparent-textured relief cutouts (the holes are real holes), the
// scene shows through the gaps of every one of them.
//
//   layered edge  planes parallel to the edge, from the edge into its cell, `spacing` cells apart
//   layered mid   planes parallel to each straight stretch of the fence, symmetric about its line
//   cross         two planes through the cell's middle (north-south + east-west, or the two diagonals), each
//                 repeated like a mid fence's: several X side by side
//
// Every plane is nudged by `jitter` and the nudge is a pure function of the piece's variant (`spec.seed`) and
// the layer, so a model is the same every time it is built and the pieces in a field still differ (a handful of
// variants). Layer 0 of an edge fence stays exactly on its edge (it is the line the rest of the game - walking,
// sight, the edge's one id - knows).
//
// Z-fighting: two planes of one piece are never nearer than FOLIAGE_MIN_GAP, whatever the jitter (the nudge is
// capped by the room the spacing leaves), and the planes of the different kinds of piece in one cell sit at
// slightly different fixed biases, so their lines don't coincide when the spacings happen to agree.
//
// Pure: no rendering. The viewport lays a plane's relief panel on each (GameViewport buildFence).

export const FOLIAGE_MIN_GAP = 0.02;
// how far the outermost planes may be from the first (an edge: into the cell; a mid: the whole stack's width) so the stack stays
// inside its cell - a bigger `spacing` is shrunk to fit
// (with the nudge across - at most ACROSS_MAX - and the bias still inside the cell)
const EDGE_SPAN = 0.88;
const MID_SPAN = 0.8;
const DIAGONAL_SPAN = 0.5;
const ACROSS_MAX = 0.06;
// a fixed push per kind of piece (cells), see above
const BIAS_EDGE = 0.0053;
const BIAS_MID = 0.0031;
// a diagonal plane's unit direction
const SQ = Math.SQRT1_2;
// the texture shifts a layer may have (fractions of the picture, going round); few, so the relief panels cut for them are shared
export const FOLIAGE_SHIFTS = 4;

export interface FoliagePlane {
  // which layer of its family (0 first), and which family: the straight stretch / axis it is parallel to
  layer: number;
  family: number;
  // the middle of the plane, relative to the middle of the cell (cell units)
  cx: number;
  cz: number;
  // the way the picture runs along it (unit vector in x, z), and rotation.y that makes the panel's x axis follow it
  du: [number, number];
  yaw: number;
  // its length before `sx`, and the part of the texture it shows
  length: number;
  u0: number;
  u1: number;
  // size variation: wider (>= 1) and taller or shorter, about its foot
  sx: number;
  sy: number;
  // the picture reversed along the plane
  flip: boolean;
  // the picture going round by this fraction (0 .. <1, a multiple of 1 / FOLIAGE_SHIFTS)
  shift: number;
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4 + 0;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// a number 0..1 that depends only on its three integers (a small integer hash)
export function unitHash(seed: number, a: number, b: number): number {
  let h = Math.imul(seed | 0, 374761393) ^ Math.imul(a | 0, 668265263) ^ Math.imul(b | 0, 2147483629);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = Math.imul(h ^ (h >>> 16), 2246822519);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

interface Base {
  seg: Pick<FenceSegment, "cx" | "cz" | "length" | "du" | "u0" | "u1">;
  // the unit vector the layers are laid out along, and whether they go one way from the base (an edge) or both
  normal: [number, number];
  oneSided: boolean;
  span: number;
  bias: number;
  // whether the plane may slide along itself (a full-length plane: a stub of a corner may not)
  lateral: boolean;
}

function basesOf(spec: FenceModelSpec): Base[] {
  const perpendicular = (du: readonly [number, number]): [number, number] => [-du[1], du[0]];
  if (spec.form === "mid" && spec.cross) {
    const dirs: [number, number][] = spec.cross === "axes" ? [[1, 0], [0, 1]] : [[SQ, SQ], [SQ, -SQ]];
    return dirs.map((du) => ({
      seg: { cx: 0, cz: 0, length: 1, du, u0: 0, u1: 1 },
      normal: perpendicular(du),
      oneSided: false,
      span: spec.cross === "axes" ? MID_SPAN : DIAGONAL_SPAN,
      bias: BIAS_MID,
      lateral: true,
    }));
  }
  if (spec.form === "edge") {
    const side = spec.side ?? "N";
    const seg = edgeSegment(side);
    // (into the cell)
    return [{ seg, normal: [-VEC[side][0], -VEC[side][1]], oneSided: true, span: EDGE_SPAN, bias: BIAS_EDGE, lateral: true }];
  }
  return midSegments(spec.arms ?? [], spec.axis ?? "x", 0).map((seg) => ({
    seg,
    normal: perpendicular(seg.du),
    oneSided: false,
    span: MID_SPAN,
    bias: BIAS_MID,
    lateral: seg.length >= 1 - 1e-9,
  }));
}

// The planes of a foliage model (the layers of an edge / mid fence, or its X's), jitter and all. Ordered by
// family, then layer.
export function foliagePlanes(spec: FenceModelSpec): FoliagePlane[] {
  const layers = Math.round(clamp(spec.layers ?? 1, 1, FENCE_LAYERS_MAX));
  const spacing = clamp(spec.spacing ?? FENCE_SPACING, FENCE_SPACING_MIN, FENCE_SPACING_MAX);
  const jitter = clamp(spec.jitter ?? FENCE_JITTER, 0, FENCE_JITTER_MAX);
  const seed = spec.seed ?? 0;
  const out: FoliagePlane[] = [];
  basesOf(spec).forEach((base, family) => {
    // (a spacing too wide for the room is shrunk so the stack stays in its cell)
    const eff = layers > 1 ? Math.min(spacing, base.span / (layers - 1)) : spacing;
    // how far a plane may be nudged across: never so far that it comes nearer than the least gap to the next
    const across = Math.min(jitter * eff, ACROSS_MAX, Math.max(0, (eff - FOLIAGE_MIN_GAP) / 2));
    const size = 0.2 * jitter;
    for (let layer = 0; layer < layers; layer++) {
      const first = layer === 0;
      const at = base.oneSided ? layer * eff : (layer - (layers - 1) / 2) * eff;
      // (the first plane of an edge keeps to the edge: nudging it would pull the fence off the line the game knows)
      const nudge = base.oneSided && first ? 0 : (unitHash(seed, layer, family * 8 + 1) * 2 - 1) * across;
      const bias = base.oneSided && first ? 0 : base.bias;
      const offset = at + nudge + bias;
      // (the first plane is the plain one; the others slide along, turn the picture round, go round in it, vary in size)
      const slide = base.lateral && !first ? (layer % 2 ? 1 : -1) * jitter * (0.3 + 0.7 * unitHash(seed, layer, family * 8 + 2)) : 0;
      const whole = base.seg.u0 <= 1e-6 && base.seg.u1 >= 1 - 1e-6;
      const shift = whole && jitter > 0 && !first ? Math.floor(unitHash(seed, layer, family * 8 + 3) * FOLIAGE_SHIFTS) / FOLIAGE_SHIFTS : 0;
      const flip = jitter > 0 && !first && unitHash(seed, layer, family * 8 + 4) < 0.5;
      const sx = first ? 1 : 1 + size * unitHash(seed, layer, family * 8 + 5);
      const sy = first ? 1 : 1 + size * (unitHash(seed, layer, family * 8 + 6) * 2 - 1);
      const du = base.seg.du;
      out.push({
        layer,
        family,
        cx: r4(base.seg.cx + base.normal[0] * offset + du[0] * slide),
        cz: r4(base.seg.cz + base.normal[1] * offset + du[1] * slide),
        du: [r4(du[0]), r4(du[1])],
        yaw: r4(yawAlong(du[0], du[1])),
        length: r4(base.seg.length),
        u0: base.seg.u0,
        u1: base.seg.u1,
        sx: r4(sx),
        sy: r4(sy),
        flip,
        shift,
      });
    }
  });
  return out;
}

// The editor's floor mark of a foliage piece, relative to the middle of its cell: one rectangle (x, z its middle,
// sx along `yaw`'s direction, sz across it) round each family's planes.
export function foliageFloorMark(spec: FenceModelSpec): { x: number; z: number; sx: number; sz: number; yaw: number }[] {
  const planes = foliagePlanes(spec);
  const families = new Map<number, FoliagePlane[]>();
  for (const p of planes) families.set(p.family, [...(families.get(p.family) ?? []), p]);
  const strip = 0.14;
  return [...families.values()].map((list) => {
    const [dx, dz] = list[0].du;
    // (positions across the planes: the plane's centre against the normal)
    const across = list.map((p) => p.cx * -dz + p.cz * dx);
    const lo = Math.min(...across);
    const hi = Math.max(...across);
    const mid = (lo + hi) / 2;
    const along = list.map((p) => p.cx * dx + p.cz * dz);
    const centre = (Math.min(...along) + Math.max(...along)) / 2;
    return {
      x: r4(dx * centre + -dz * mid),
      z: r4(dz * centre + dx * mid),
      sx: r4(list[0].length),
      sz: r4(hi - lo + strip),
      yaw: list[0].yaw,
    };
  });
}
