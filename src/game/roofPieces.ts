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

export interface RoofShape {
  // the side view from the eave (the piece's front edge); the rest is flat
  profile: RoofSegment[];
  // two profiles meeting: an outer corner (hip, min) or an inner one (valley, max)
  corner?: "outer" | "inner";
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

// A piece's surface height (above its lowest point) at a spot of its own
// space: x across (0 left .. 1 right), z along (0 back .. 1 front, where the
// eave is) - the same surface roofMesh.ts draws.
export function roofShapeHeight(shape: RoofShape, x: number, z: number): number {
  const a = roofProfileAt(shape.profile, 1 - z).h;
  if (!shape.corner) return a;
  const b = roofProfileAt(shape.profile, shape.corner === "inner" ? 1 - x : x).h;
  return shape.corner === "outer" ? Math.min(a, b) : Math.max(a, b);
}
