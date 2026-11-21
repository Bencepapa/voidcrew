import { ROOF_SHAPES, roofShapeHeight, type RoofPieceId } from "./roofPieces";

// The roof autotile: from the cells an author roofed, work out which piece
// (slope, corner, inner corner, flat), turned how and raised how high, goes in
// each one - so the roof closes cleanly over the outline of the area. Pure
// arithmetic (no props.ts, no build): see concept/editor-ui/NOTES-roof-autotile.md
// for the rule set with diagrams, src/game/roofAutotile.test.ts for the checks.
//
// The idea in one line: a roof's height at each cell corner is that corner's
// distance (Chebyshev, i.e. the larger of the two axis distances) from the
// outline of the roofed area - one wall height per cell, a 45 degree pitch -
// optionally capped (a flat top). Every cell then holds the piece whose
// surface matches the heights at its four corners; as neighbours share corners
// and the pieces are straight between them, the roof is continuous everywhere.

// The forms an author picks:
//  slope  - slope only: it keeps rising to the ridge (hips and valleys closed)
//  flat   - slope and flat: one cell of full slope round the edge, a flat top
//  bent   - the same with the bent pieces (half a cell of slope, then flat)
export type RoofForm = "slope" | "flat" | "bent";
export const ROOF_FORMS: readonly RoofForm[] = ["slope", "flat", "bent"];
export const isRoofForm = (value: unknown): value is RoofForm => ROOF_FORMS.includes(value as RoofForm);

interface FormRule {
  // the highest the roof climbs above its eave (wall heights)
  cap: number;
  flat: RoofPieceId;
  slope: RoofPieceId;
  outer: RoofPieceId;
  inner: RoofPieceId;
}
const FORM_RULES: Record<RoofForm, FormRule> = {
  slope: { cap: Infinity, flat: "roof_flat", slope: "roof_slope", outer: "roof_corner", inner: "roof_inner" },
  flat: { cap: 1, flat: "roof_flat", slope: "roof_slope", outer: "roof_corner", inner: "roof_inner" },
  bent: { cap: 0.5, flat: "roof_flat", slope: "roof_slope_flat", outer: "roof_corner_flat", inner: "roof_inner_flat" },
};

// A roof built with the tool is a group of roof props, each with `auto: <group id>`
// (see PropSpec.auto): "<form>-<number>", e.g. "slope-3".
export function roofGroupId(form: RoofForm, n: number): string {
  return `${form}-${n}`;
}
export function parseRoofGroup(id: unknown): { form: RoofForm; n: number } | null {
  if (typeof id !== "string") return null;
  const m = /^(slope|flat|bent)-(\d+)$/.exec(id);
  return m ? { form: m[1] as RoofForm, n: Number(m[2]) } : null;
}

// A cell of a roof: where it is, and the height of the floor it stands on
// (wall heights). Cells of one roof at different floor heights are different
// levels: each level has its own outline and eaves (a raised block's edge).
export interface RoofCell {
  x: number;
  y: number;
  level: number;
}

// What a cell gets: the roof prop to put there, how it's turned (degrees,
// clockwise seen from above, as PropSpec.rotation) and its height above the
// cell's floor (PropSpec.elevation).
export interface RoofPiece {
  x: number;
  y: number;
  prop: RoofPieceId;
  rotation: 0 | 90 | 180 | 270;
  elevation: number;
  // the corners can't be matched (see planRoof): a flat standing in for a saddle
  approx?: boolean;
}

const EPS = 1e-9;
const levelKey = (level: number) => Math.round(level * 1000);

// The distance of every lattice point (cell corner) of a set of cells from
// the outline, the Chebyshev way: 0 on the outline (a corner touching a cell
// that's not in the set), else how many cells it is from it. Two passes of the
// chessboard chamfer - exact for this metric.
export function outlineDistances(cells: readonly { x: number; y: number }[]): (i: number, j: number) => number {
  if (!cells.length) return () => 0;
  const has = new Set(cells.map((c) => `${c.x},${c.y}`));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  // lattice points minX..maxX+1, minY..maxY+1
  const w = maxX - minX + 2;
  const h = maxY - minY + 2;
  const d = new Float64Array(w * h).fill(Infinity);
  const inside = (x: number, y: number) => has.has(`${x},${y}`);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = minX + i;
      const y = minY + j;
      if (!(inside(x - 1, y - 1) && inside(x, y - 1) && inside(x - 1, y) && inside(x, y))) d[j * w + i] = 0;
    }
  }
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= w || j >= h ? 0 : d[j * w + i]);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const best = Math.min(at(i - 1, j - 1), at(i, j - 1), at(i + 1, j - 1), at(i - 1, j));
      if (best + 1 < d[j * w + i]) d[j * w + i] = best + 1;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const best = Math.min(at(i + 1, j + 1), at(i, j + 1), at(i - 1, j + 1), at(i + 1, j));
      if (best + 1 < d[j * w + i]) d[j * w + i] = best + 1;
    }
  }
  return (i, j) => (i < minX || j < minY || i > maxX + 1 || j > maxY + 1 ? 0 : d[(j - minY) * w + (i - minX)]);
}

// Which piece matches a cell whose corners (NW, NE, SE, SW) stand at these
// heights - they differ by at most one `unit`.
function pieceForCorners(nw: number, ne: number, se: number, sw: number, rule: FormRule): Omit<RoofPiece, "x" | "y"> {
  const corners = { NW: nw, NE: ne, SE: se, SW: sw };
  const lo = Math.min(nw, ne, se, sw);
  const hi = Math.max(nw, ne, se, sw);
  if (hi - lo < EPS) return { prop: rule.flat, rotation: 0, elevation: lo };
  const mid = (lo + hi) / 2;
  const high = (Object.keys(corners) as (keyof typeof corners)[]).filter((c) => corners[c] > mid);
  if (high.length === 1) {
    // one corner up: an outer (hip) corner - its eaves on the two sides far from that corner
    const rotation = { NE: 0, SE: 90, SW: 180, NW: 270 }[high[0]] as RoofPiece["rotation"];
    return { prop: rule.outer, rotation, elevation: lo };
  }
  if (high.length === 3) {
    // one corner down: an inner (valley) corner - its eaves on the two sides at that corner
    const low = (Object.keys(corners) as (keyof typeof corners)[]).find((c) => corners[c] <= mid)!;
    const rotation = { SE: 0, SW: 90, NW: 180, NE: 270 }[low] as RoofPiece["rotation"];
    return { prop: rule.inner, rotation, elevation: lo };
  }
  const up = new Set(high);
  // two corners up, side by side: a slope, its eave on the far side
  if (up.has("NW") && up.has("NE")) return { prop: rule.slope, rotation: 0, elevation: lo };
  if (up.has("NE") && up.has("SE")) return { prop: rule.slope, rotation: 90, elevation: lo };
  if (up.has("SE") && up.has("SW")) return { prop: rule.slope, rotation: 180, elevation: lo };
  if (up.has("SW") && up.has("NW")) return { prop: rule.slope, rotation: 270, elevation: lo };
  // two opposite corners up: a saddle, no piece has it - a flat at the eave's level
  return { prop: rule.flat, rotation: 0, elevation: lo, approx: true };
}

// The pieces for the cells of one roof: for each cell (in the order given) the
// prop, turn and height. Cells at one floor height make one area, whose outline
// is where it meets a cell that isn't in the roof (or is at another height).
//
// A flat that stands in for a saddle (two opposite corners up, no piece has
// that) is marked `approx`. A flat on a ridge (all four corners level while the
// middle of the cell would peak up to half a unit higher: the middle cell of a
// three wide roof, say) is the intended closing, not marked: the roof closes
// at the cell's edges and only the peak is shaved.
export function planRoof(cells: readonly RoofCell[], form: RoofForm): RoofPiece[] {
  const rule = FORM_RULES[form];
  const levels = new Map<number, RoofCell[]>();
  for (const c of cells) {
    const key = levelKey(c.level);
    const list = levels.get(key);
    if (list) list.push(c);
    else levels.set(key, [c]);
  }
  const pieces = new Map<string, RoofPiece>();
  for (const list of levels.values()) {
    const dist = outlineDistances(list);
    const up = (i: number, j: number) => Math.min(dist(i, j), rule.cap);
    for (const c of list) {
      const piece = pieceForCorners(up(c.x, c.y), up(c.x + 1, c.y), up(c.x + 1, c.y + 1), up(c.x, c.y + 1), rule);
      pieces.set(`${c.x},${c.y},${levelKey(c.level)}`, { x: c.x, y: c.y, ...piece });
    }
  }
  return cells.map((c) => pieces.get(`${c.x},${c.y},${levelKey(c.level)}`)!);
}

// ---- checking a plan against the surface it stands for

// The height of a piece's surface at a spot of its cell (u east, v south, 0..1
// from the cell's north west corner), above the cell's floor.
export function roofPieceHeightAt(piece: Pick<RoofPiece, "prop" | "rotation" | "elevation">, u: number, v: number): number {
  const turn = (piece.rotation * Math.PI) / 180;
  const a = u - 0.5;
  const b = v - 0.5;
  // (back to the piece's own space: the front, where its eave is, is +z)
  const x = a * Math.cos(turn) + b * Math.sin(turn) + 0.5;
  const z = -a * Math.sin(turn) + b * Math.cos(turn) + 0.5;
  return piece.elevation + roofShapeHeight(ROOF_SHAPES[piece.prop], x, z);
}

// The height the roof should have at a spot (px, py: cell units, the cell x,y
// reaching from x to x + 1): the distance to the nearest cell that isn't in the
// area (cells of `area` only, one level), capped by the form.
export function roofFieldAt(area: readonly { x: number; y: number }[], form: RoofForm, px: number, py: number): number {
  const has = new Set(area.map((c) => `${c.x},${c.y}`));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of area) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }
  let best = Infinity;
  for (let y = minY - 1; y <= maxY + 1; y++) {
    for (let x = minX - 1; x <= maxX + 1; x++) {
      if (has.has(`${x},${y}`)) continue;
      const dx = Math.max(x - px, 0, px - (x + 1));
      const dy = Math.max(y - py, 0, py - (y + 1));
      best = Math.min(best, Math.max(dx, dy));
    }
  }
  return Math.min(best, FORM_RULES[form].cap);
}

// ---- the raised floor's footprint

// The cells of the raised block `start` stands on: the floor cells connected to
// it (four ways) at the same floor height - `floorAt` gives a cell's floor
// height, or null where there's no floor (a wall, a door, off the map). A block
// is a raised one when something next to it is lower: null if it isn't (the
// level ground: it would be the whole deck) or if it's bigger than `limit`.
export function raisedFootprint(
  start: { x: number; y: number },
  floorAt: (x: number, y: number) => number | null,
  limit = 256,
): { x: number; y: number }[] | null {
  const level = floorAt(start.x, start.y);
  if (level === null) return null;
  const seen = new Set([`${start.x},${start.y}`]);
  const out = [{ x: start.x, y: start.y }];
  let drop = false;
  for (let i = 0; i < out.length; i++) {
    const { x, y } = out[i];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const n = { x: x + dx, y: y + dy };
      const floor = floorAt(n.x, n.y);
      if (floor === null) continue;
      if (Math.abs(floor - level) < EPS) {
        const key = `${n.x},${n.y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(n);
        if (out.length > limit) return null;
      } else if (floor < level) drop = true;
    }
  }
  return drop ? out : null;
}
