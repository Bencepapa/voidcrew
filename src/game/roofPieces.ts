// The roof pieces' shapes, apart from props.ts (which needs the Vite build
// to load): plain data and arithmetic, so the roof autotile (roofAutotile.ts)
// and its tests can use them from a bare `tsx` run. props.ts builds its roof
// prop types from ROOF_SHAPES; render/roofMesh.ts draws the same profiles.

export interface RoofSegment {
  kind: "slope" | "flat";
  // horizontal cells it covers (a slope rises as much as it runs)
  run: number;
}

// how thick a roof is (world units: its underside is this far under its surface)
export const ROOF_THICKNESS = 0.06;

export const ROOF_SLOPE: RoofSegment = { kind: "slope", run: 1 };
export const ROOF_SLOPE_FLAT: RoofSegment[] = [
  { kind: "slope", run: 0.5 },
  { kind: "flat", run: 0.5 },
];

// a side of a piece, in its own space (before it is turned): the front is where the eave of a plain
// slope is (z = 1, south when unturned), then the back (z = 0), the left (x = 0) and the right (x = 1)
export type RoofSide = "front" | "back" | "left" | "right";

export interface RoofShape {
  // the side view from the eave (the piece's front edge); the rest is flat
  profile: RoofSegment[];
  // two profiles meeting: an outer corner (hip, min) or an inner one (valley, max)
  corner?: "outer" | "inner";
  // eaves on several sides at once (a ridge, a half pyramid, a pyramid): the profile run from each of
  // these sides, the lowest of them is the surface. Instead of `corner`.
  eaves?: readonly RoofSide[];
}

// The prop ids of the roof pieces and what each one is (see PROP_TYPES).
export const ROOF_SHAPES = {
  roof_slope: { profile: [ROOF_SLOPE] },
  roof_slope_flat: { profile: ROOF_SLOPE_FLAT },
  roof_flat: { profile: [{ kind: "flat", run: 1 }] },
  roof_corner: { profile: [ROOF_SLOPE], corner: "outer" },
  roof_corner_flat: { profile: ROOF_SLOPE_FLAT, corner: "outer" },
  roof_inner: { profile: [ROOF_SLOPE], corner: "inner" },
  roof_inner_flat: { profile: ROOF_SLOPE_FLAT, corner: "inner" },
  // eaves on opposite sides: a tent a cell across, rising 0.5 to a ridge along the middle (the ridge
  // runs east-west unturned: the eaves are south and north)
  roof_ridge: { profile: [ROOF_SLOPE], eaves: ["front", "back"] },
  // eaves on three sides: the end of a ridge (hipped end, half a pyramid); the ridge goes on to the east unturned
  roof_hipend: { profile: [ROOF_SLOPE], eaves: ["front", "back", "left"] },
  // eaves all round: a four sided pyramid, its peak (0.5 up) in the middle of the cell
  roof_pyramid: { profile: [ROOF_SLOPE], eaves: ["front", "back", "left", "right"] },
} as const satisfies Record<string, RoofShape>;
export type RoofPieceId = keyof typeof ROOF_SHAPES;

export const isRoofPieceId = (id: string): id is RoofPieceId => Object.hasOwn(ROOF_SHAPES, id);

// how far up a profile climbs (wall heights, as the cells it covers are 1 wide)
export function roofRise(profile: readonly RoofSegment[]): number {
  return profile.reduce((sum, s) => sum + (s.kind === "slope" ? s.run : 0), 0);
}

// the profile's height and surface distance (the length of the path along it)
// `d` cells from the eave; what the profile doesn't cover is flat
export function roofProfileAt(profile: readonly RoofSegment[], d: number): { h: number; s: number } {
  let h = 0;
  let s = 0;
  let at = 0;
  for (const seg of profile) {
    const len = Math.min(seg.run, Math.max(0, d - at));
    if (seg.kind === "slope") {
      h += len;
      s += len * Math.SQRT2;
    } else s += len;
    at += seg.run;
    if (d <= at) return { h, s };
  }
  return { h, s: s + (d - at) };
}

// how far a spot of a piece's own space (x, z in 0..1) is from one of its sides
export function roofEaveDistance(side: RoofSide, x: number, z: number): number {
  return side === "front" ? 1 - z : side === "back" ? z : side === "left" ? x : 1 - x;
}

// how far up a whole piece climbs: a piece with eaves on several sides tops out in the middle of the cell
export function roofShapeRise(shape: RoofShape): number {
  return shape.eaves ? roofProfileAt(shape.profile, 0.5).h : roofRise(shape.profile);
}

// A piece's surface height (above its lowest point) at a spot of its own
// space: x across (0 left .. 1 right), z along (0 back .. 1 front, where the
// eave is) - the same surface roofMesh.ts draws.
export function roofShapeHeight(shape: RoofShape, x: number, z: number): number {
  if (shape.eaves) return Math.min(...shape.eaves.map((side) => roofProfileAt(shape.profile, roofEaveDistance(side, x, z)).h));
  const a = roofProfileAt(shape.profile, 1 - z).h;
  if (!shape.corner) return a;
  const b = roofProfileAt(shape.profile, shape.corner === "inner" ? 1 - x : x).h;
  return shape.corner === "outer" ? Math.min(a, b) : Math.max(a, b);
}
