import type { Direction, PropAnchor, Vec2 } from "./types";

// Fence and block pieces (see concept/editor-ui/NOTES-fence-blocks.md).
//
// Three kinds of piece, each a prop (an entry of the map's `props`) the fence tools put in, like the roof
// tool puts roof props:
//
//   block  fence_block  a full cell-sized block, any texture on its four sides (a hedge, a forest strip, a
//                       stone block), 1 wall height tall by default; neighbouring blocks hide their shared
//                       faces. It closes its cell.
//   edge   fence_edge   a fence along one EDGE of its cell (`at`: N / E / S / W); the edge is impassable
//                       between the two cells, both of them stay walkable right up to it.
//   mid    fence_mid    a fence through the MIDDLE of its cell, looking the same from both sides; it turns
//                       by itself where mid pieces (or blocks) are next to it, in 90 degree steps. In grid
//                       movement the cell is closed; in free movement each half of the cell is walkable up
//                       to the fence.
//
// Nothing here is stored per piece but its own settings: how a piece connects (a mid piece's arms, a block's
// hidden faces, which piece of a run carries the decoration) is worked out from its neighbours whenever it is
// needed - so there is nothing to keep in step on an edit (unlike the roof, whose pieces are different props).
//
// This file is pure: no rendering, no map file. The renderer, the collision, the line of sight, the minimap
// and the editor's edits all read it.

export type FenceForm = "block" | "edge" | "mid";
export const FENCE_FORMS: readonly FenceForm[] = ["block", "edge", "mid"];
export const FENCE_PROP: Record<FenceForm, string> = { block: "fence_block", edge: "fence_edge", mid: "fence_mid" };

export function fenceFormOf(id: string | undefined): FenceForm | null {
  return id === FENCE_PROP.block ? "block" : id === FENCE_PROP.edge ? "edge" : id === FENCE_PROP.mid ? "mid" : null;
}
export const isFenceProp = (id: string | undefined): boolean => fenceFormOf(id) !== null;

// the decorative element every `every` pieces of a run: a different texture on the piece, or a post (a column)
// standing in the line (with its own texture, else the piece's)
export interface FenceDeco {
  every: number;
  texture?: string;
  post?: boolean;
}

// a piece's own settings (PropSpec.fence); every one optional, the defaults left out of the map file
export interface FenceStyle {
  // wall heights (default 1)
  height?: number;
  // cells between the two faces of an edge / mid fence (default 0: the fence's own relief is its thickness)
  thickness?: number;
  // a texture set covering the gap between the faces (or a block's top); a block's default is its own texture
  top?: string;
  // whether it blocks sight: a stone wall does, a hedge or a wooden fence (see-through texture) doesn't.
  // Default: a block does, the others don't.
  opaque?: boolean;
  deco?: FenceDeco;
}

export const FENCE_HEIGHT = 1;
export const FENCE_HEIGHT_MIN = 0.25;
export const FENCE_HEIGHT_MAX = 3;
export const FENCE_THICKNESS_MAX = 0.8;
export const FENCE_EVERY_MAX = 32;
// what a thin fence stops bodies at, either side of its line (cells): a fence of thickness 0 still has a body
export const FENCE_BODY_HALF = 0.05;
// a decorative post's width (cells), and how far it stands above the fence (wall heights)
export const FENCE_POST_WIDTH = 0.22;
export const FENCE_POST_EXTRA = 0.1;

const TEXTURE_ID = /^[\w.-]{1,80}$/;
const round2 = (v: number) => Math.round(v * 100) / 100;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const textureId = (v: unknown): string | undefined => (typeof v === "string" && TEXTURE_ID.test(v) ? v : undefined);

// A style as the map file may hold it, made safe and minimal: out-of-range values pulled in, defaults and
// junk left out (the same style comes out of it again). undefined: nothing but defaults.
export function cleanFenceStyle(raw: unknown): FenceStyle | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Record<string, unknown>;
  const out: FenceStyle = {};
  const height = num(r.height);
  if (height !== undefined && Math.abs(height - FENCE_HEIGHT) > 1e-6) out.height = round2(clamp(height, FENCE_HEIGHT_MIN, FENCE_HEIGHT_MAX));
  const thickness = num(r.thickness);
  if (thickness !== undefined && thickness > 0) out.thickness = round2(clamp(thickness, 0.02, FENCE_THICKNESS_MAX));
  const top = textureId(r.top);
  if (top) out.top = top;
  if (typeof r.opaque === "boolean") out.opaque = r.opaque;
  const d = r.deco;
  if (d && typeof d === "object") {
    const deco = d as Record<string, unknown>;
    const texture = textureId(deco.texture);
    const post = deco.post === true;
    const every = num(deco.every);
    if ((texture || post) && every !== undefined) {
      out.deco = { every: Math.round(clamp(every, 1, FENCE_EVERY_MAX)), ...(texture ? { texture } : {}), ...(post ? { post: true } : {}) };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

// ---- pieces

// the part of a prop entry the fences read (PropSpec, as the map holds it)
export interface FenceProp {
  prop: string;
  cell: Vec2;
  at?: PropAnchor;
  rotation?: number;
  elevation?: number;
  texture?: string;
  fence?: FenceStyle;
}

export interface FencePiece {
  // its index in the props list it came from
  index: number;
  form: FenceForm;
  x: number;
  y: number;
  // an edge piece's side of its cell (N for the other forms)
  side: Direction;
  // which way a mid piece with no neighbour lies: along x (east-west) or z (north-south)
  axis: "x" | "z";
  // the texture set it wears (undefined: the deck's walls)
  texture?: string;
  elevation: number;
  style: FenceStyle;
  // resolved: wall heights, cells between the faces, whether it blocks sight
  height: number;
  thickness: number;
  opaque: boolean;
}

const SIDES: readonly Direction[] = ["N", "E", "S", "W"];
export const isSide = (v: unknown): v is Direction => v === "N" || v === "E" || v === "S" || v === "W";

export function fencePieceOf(p: FenceProp, index: number): FencePiece | null {
  const form = fenceFormOf(p.prop);
  if (!form) return null;
  const style = cleanFenceStyle(p.fence) ?? {};
  const turn = (((p.rotation ?? 0) % 180) + 180) % 180;
  return {
    index,
    form,
    x: p.cell.x,
    y: p.cell.y,
    side: form === "edge" && isSide(p.at) ? p.at : "N",
    axis: turn >= 45 && turn < 135 ? "z" : "x",
    ...(p.texture ? { texture: p.texture } : {}),
    elevation: p.elevation ?? 0,
    style,
    height: style.height ?? FENCE_HEIGHT,
    thickness: form === "block" ? 0 : style.thickness ?? 0,
    opaque: style.opaque ?? form === "block",
  };
}

export const VEC: Record<Direction, readonly [number, number]> = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPPOSITE: Record<Direction, Direction> = { N: "S", E: "W", S: "N", W: "E" };
const cellKey = (x: number, y: number) => `${x},${y}`;

// ---- edges

// An edge between two cells has one id however it is named. "H<x>,<y>": the edge above cell (x, y), running
// along x, at z = y - 0.5. "V<x>,<y>": the edge left of cell (x, y), running along z, at x = x - 0.5.
export function edgeId(x: number, y: number, side: Direction): string {
  switch (side) {
    case "N": return `H${x},${y}`;
    case "S": return `H${x},${y + 1}`;
    case "W": return `V${x},${y}`;
    case "E": return `V${x + 1},${y}`;
  }
}
// the two cells an edge separates (the north or west one first)
export function edgeCells(id: string): [Vec2, Vec2] {
  const [x, y] = id.slice(1).split(",").map(Number);
  return id[0] === "H" ? [{ x, y: y - 1 }, { x, y }] : [{ x: x - 1, y }, { x, y }];
}
// where an edge lies, in grid units (cell centres on integers): its middle, and the axis it runs along
export function edgeLine(id: string): { cx: number; cz: number; axis: "x" | "z" } {
  const [x, y] = id.slice(1).split(",").map(Number);
  return id[0] === "H" ? { cx: x, cz: y - 0.5, axis: "x" } : { cx: x - 0.5, cz: y, axis: "z" };
}
// the edge between two neighbouring cells (null when they aren't)
export function edgeBetween(a: Vec2, b: Vec2): string | null {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return null;
  return edgeId(a.x, a.y, dx === 1 ? "E" : dx === -1 ? "W" : dy === 1 ? "S" : "N");
}
// the side of a cell a point of it is nearest (dx, dz from its centre, -0.5..0.5): null when it is too near
// the middle to say (the caller asks for a side then)
export function sideFromPoint(dx: number, dz: number, deadZone = 0.12): Direction | null {
  if (Math.max(Math.abs(dx), Math.abs(dz)) < deadZone) return null;
  return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "E" : "W") : dz > 0 ? "S" : "N";
}

// ---- the index

export interface FenceBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  // wall heights above the floor of `cell`
  height: number;
  opaque: boolean;
  // the cell it stands in (a box of an edge: the one its piece is in)
  cell: Vec2;
}

export interface FenceIndex {
  pieces: FencePiece[];
  // by its index in the props list
  byIndex: Map<number, FencePiece>;
  // by "x,y"
  blocks: Map<string, FencePiece>;
  mids: Map<string, FencePiece>;
  // by edge id
  edges: Map<string, FencePiece>;
  // the boxes bodies are stopped by, listed under every cell they touch (an edge's: under both)
  boxes: Map<string, FenceBox[]>;
  // every box that blocks sight
  opaque: FenceBox[];
  // the cells grid movement can't enter: blocks and mid fences
  closed: Set<string>;
}

const NO_FENCES: FenceIndex = { pieces: [], byIndex: new Map(), blocks: new Map(), mids: new Map(), edges: new Map(), boxes: new Map(), opaque: [], closed: new Set() };
const indexes = new WeakMap<readonly object[], FenceIndex>();

// The fences of a props list (cached for as long as the list lives: a map's props never change in place).
export function fenceIndex(props: readonly FenceProp[] | undefined): FenceIndex {
  if (!props || !props.length) return NO_FENCES;
  let index = indexes.get(props);
  if (!index) {
    index = buildIndex(props);
    indexes.set(props, index);
  }
  return index;
}

function buildIndex(props: readonly FenceProp[]): FenceIndex {
  const idx: FenceIndex = { pieces: [], byIndex: new Map(), blocks: new Map(), mids: new Map(), edges: new Map(), boxes: new Map(), opaque: [], closed: new Set() };
  props.forEach((p, i) => {
    const piece = fencePieceOf(p, i);
    if (piece) {
      idx.pieces.push(piece);
      idx.byIndex.set(i, piece);
    }
  });
  if (!idx.pieces.length) return NO_FENCES;
  // (the first piece to claim a cell or an edge keeps it; a second one is a mistake the editor drops - see fenceEdits)
  for (const piece of idx.pieces) {
    const key = cellKey(piece.x, piece.y);
    if (piece.form === "block" && !idx.blocks.has(key) && !idx.mids.has(key)) idx.blocks.set(key, piece);
    else if (piece.form === "mid" && !idx.mids.has(key) && !idx.blocks.has(key)) idx.mids.set(key, piece);
    else if (piece.form === "edge") {
      const id = edgeId(piece.x, piece.y, piece.side);
      if (!idx.edges.has(id)) idx.edges.set(id, piece);
    }
  }
  const add = (cells: Vec2[], box: FenceBox) => {
    for (const c of cells) {
      const key = cellKey(c.x, c.y);
      const list = idx.boxes.get(key);
      if (list) list.push(box);
      else idx.boxes.set(key, [box]);
    }
    if (box.opaque) idx.opaque.push(box);
  };
  for (const piece of idx.blocks.values()) {
    idx.closed.add(cellKey(piece.x, piece.y));
    const cell = { x: piece.x, y: piece.y };
    add([cell], { minX: piece.x - 0.5, maxX: piece.x + 0.5, minZ: piece.y - 0.5, maxZ: piece.y + 0.5, height: piece.elevation + piece.height, opaque: piece.opaque, cell });
  }
  for (const piece of idx.mids.values()) {
    idx.closed.add(cellKey(piece.x, piece.y));
    const cell = { x: piece.x, y: piece.y };
    const half = Math.max(FENCE_BODY_HALF, piece.thickness / 2);
    for (const seg of midSegments(midArms(idx, piece), piece.axis, piece.thickness)) {
      const wide = seg.axis === "x" ? seg.length / 2 : half;
      const deep = seg.axis === "x" ? half : seg.length / 2;
      add([cell], { minX: piece.x + seg.cx - wide, maxX: piece.x + seg.cx + wide, minZ: piece.y + seg.cz - deep, maxZ: piece.y + seg.cz + deep, height: piece.elevation + piece.height, opaque: piece.opaque, cell });
    }
  }
  for (const [id, piece] of idx.edges) {
    const { cx, cz, axis } = edgeLine(id);
    const half = Math.max(FENCE_BODY_HALF, piece.thickness / 2);
    const wide = axis === "x" ? 0.5 : half;
    const deep = axis === "x" ? half : 0.5;
    add(edgeCells(id), { minX: cx - wide, maxX: cx + wide, minZ: cz - deep, maxZ: cz + deep, height: piece.elevation + piece.height, opaque: piece.opaque, cell: { x: piece.x, y: piece.y } });
  }
  return idx;
}

export const hasFences = (idx: FenceIndex) => idx.pieces.length > 0;

// ---- movement

// Whether the step between two neighbouring cells goes through an edge fence.
export function edgeFenceBetween(idx: FenceIndex, from: Vec2, to: Vec2): FencePiece | undefined {
  if (!idx.edges.size) return undefined;
  const id = edgeBetween(from, to);
  return id ? idx.edges.get(id) : undefined;
}

// Whether grid movement may not enter a cell (a block or a mid fence stands in it).
export const fenceClosesCell = (idx: FenceIndex, x: number, y: number): boolean => idx.closed.has(cellKey(x, y));

// The boxes that stop a body in a cell (free movement): blocks, the bars of a mid fence, and the edge fences
// on any of the cell's four sides.
export function fenceBoxes(idx: FenceIndex, x: number, y: number): readonly FenceBox[] {
  return idx.boxes.get(cellKey(x, y)) ?? [];
}

// Whether a straight line from (ax, az) to (bx, bz) (grid units) is stopped by an opaque fence: the line's
// height is `heightAt(t)` (0..1 along it, wall heights; omit to ignore heights), compared with the top of each
// box (`floorAt` of its cell + its height). A box the line starts or ends inside is looked out of, not at.
export function fenceBlocksSight(
  idx: FenceIndex,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  heightAt?: (t: number) => number,
  floorAt?: (x: number, y: number) => number,
): boolean {
  if (!idx.opaque.length) return false;
  const loX = Math.min(ax, bx);
  const hiX = Math.max(ax, bx);
  const loZ = Math.min(az, bz);
  const hiZ = Math.max(az, bz);
  const inside = (b: FenceBox, x: number, z: number) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ;
  for (const box of idx.opaque) {
    if (box.maxX < loX || box.minX > hiX || box.maxZ < loZ || box.minZ > hiZ) continue;
    if (inside(box, ax, az) || inside(box, bx, bz)) continue;
    // (slab test: the stretch of the line inside the box's x band, then its z band)
    const dx = bx - ax;
    const dz = bz - az;
    let t0 = 0;
    let t1 = 1;
    let hit = true;
    for (const [d, a, lo, hi] of [[dx, ax, box.minX, box.maxX], [dz, az, box.minZ, box.maxZ]] as const) {
      if (Math.abs(d) < 1e-9) {
        if (a < lo || a > hi) hit = false;
      } else {
        const u = (lo - a) / d;
        const v = (hi - a) / d;
        t0 = Math.max(t0, Math.min(u, v));
        t1 = Math.min(t1, Math.max(u, v));
      }
    }
    if (!hit || t0 > t1) continue;
    if (heightAt && floorAt && heightAt((t0 + t1) / 2) > floorAt(box.cell.x, box.cell.y) + box.height) continue;
    return true;
  }
  return false;
}

// ---- mid fences: the arms and the segments they make

const ARM_ORDER: readonly Direction[] = ["N", "E", "S", "W"];

// The sides a mid piece has a neighbour on: another mid piece or a block.
export function midArms(idx: FenceIndex, piece: Pick<FencePiece, "x" | "y">): Direction[] {
  return ARM_ORDER.filter((d) => {
    const key = cellKey(piece.x + VEC[d][0], piece.y + VEC[d][1]);
    return idx.mids.has(key) || idx.blocks.has(key);
  });
}

// One straight stretch of fence face, relative to the cell's centre: its middle, its length along `axis`, the
// way the texture's u runs along it (a unit vector in x, z) and the part of the texture it shows.
export interface FenceSegment {
  cx: number;
  cz: number;
  length: number;
  axis: "x" | "z";
  du: [number, number];
  u0: number;
  u1: number;
}

const straightSegment = (axis: "x" | "z"): FenceSegment =>
  axis === "x" ? { cx: 0, cz: 0, length: 1, axis, du: [1, 0], u0: 0, u1: 1 } : { cx: 0, cz: 0, length: 1, axis, du: [0, 1], u0: 0, u1: 1 };

// Where a mid fence's faces run. No neighbour, or neighbours along one line only: one straight piece the
// whole cell across (a lone piece lies along `axis`; one with a neighbour follows it - an end piece runs
// right through its cell). Neighbours on both axes: a corner, two halves of the one texture joined at the
// right angle (the first half running in to the middle, the second out again, so the picture goes round the
// bend); with three or four neighbours the straight lines they make, and a half-length stub for the odd one.
// `thickness` pushes the halves' ends past the middle by half of it, so the outer corner closes.
export function midSegments(arms: readonly Direction[], axis: "x" | "z", thickness: number): FenceSegment[] {
  const has = (d: Direction) => arms.includes(d);
  const ns = has("N") || has("S");
  const ew = has("E") || has("W");
  if (!ns && !ew) return [straightSegment(axis)];
  if (ns && !ew) return [straightSegment("z")];
  if (ew && !ns) return [straightSegment("x")];
  const e = thickness / 2;
  // a half fence out to the cell's edge on side `d`, the texture running in or out along it from `u`
  const stub = (d: Direction, inward: boolean, u: number): FenceSegment => {
    const [vx, vz] = VEC[d];
    const middle = 0.25 - e / 2;
    return {
      cx: vx * middle,
      cz: vz * middle,
      length: 0.5 + e,
      axis: vx ? "x" : "z",
      du: inward ? [-vx, -vz] : [vx, vz],
      // (an inward stub's u grows to the middle, an outward one's from it; either way the extra reaches past it)
      u0: inward ? u : u - e,
      u1: inward ? u + 0.5 + e : u + 0.5,
    };
  };
  if (arms.length === 2) {
    // (a corner: the first arm clockwise from north is the half going in, the one after it the half going out)
    const clockwise = (ARM_ORDER.indexOf(arms[1]) - ARM_ORDER.indexOf(arms[0]) + 4) % 4 === 1;
    const [a, b] = clockwise ? [arms[0], arms[1]] : [arms[1], arms[0]];
    return [stub(a, true, 0), stub(b, false, 0.5)];
  }
  const out: FenceSegment[] = [];
  if (has("N") && has("S")) out.push(straightSegment("z"));
  if (has("E") && has("W")) out.push(straightSegment("x"));
  for (const d of ARM_ORDER) if (has(d) && !has(OPPOSITE[d])) out.push(stub(d, false, 0.25));
  return out;
}

// ---- the model of one piece: what the renderer needs, from the piece and its neighbours

// everything a piece's model depends on, small and in a fixed key order (JSON.stringify is its cache key)
export interface FenceModelSpec {
  form: FenceForm;
  height: number;
  thickness: number;
  texture?: string;
  top?: string;
  // block: the sides a neighbouring block hides
  hide?: Direction[];
  // edge: its side
  side?: Direction;
  // mid: its neighbours, and the way a lone one lies
  arms?: Direction[];
  axis?: "x" | "z";
  // a post standing in the line (when this piece carries the decoration)
  post?: { texture?: string };
}

// how many pieces of its run come before this one (0: the first); -1 for a piece that isn't in a straight run
function runPosition(idx: FenceIndex, piece: FencePiece): number {
  if (piece.form === "edge") {
    // (the edge before it along the line: to the west on a horizontal edge, to the north on a vertical one)
    const id = edgeId(piece.x, piece.y, piece.side);
    const [x, y] = id.slice(1).split(",").map(Number);
    let n = 0;
    while (n < 4096 && idx.edges.has(id[0] === "H" ? `H${x - n - 1},${y}` : `V${x},${y - n - 1}`)) n++;
    return n;
  }
  if (piece.form === "mid") {
    const arms = midArms(idx, piece);
    const along = arms.some((d) => d === "N" || d === "S") ? "z" : arms.some((d) => d === "E" || d === "W") ? "x" : piece.axis;
    // (a corner, a T or a cross is no straight stretch)
    const ns = arms.some((d) => d === "N" || d === "S");
    const ew = arms.some((d) => d === "E" || d === "W");
    if (ns && ew) return -1;
    const step = along === "x" ? [-1, 0] : [0, -1];
    let n = 0;
    for (let x = piece.x, y = piece.y; n < 4096; n++) {
      x += step[0];
      y += step[1];
      if (!idx.mids.has(cellKey(x, y))) break;
    }
    return n;
  }
  return -1;
}

// whether this piece carries its run's decoration: the every-th piece counting from the west / north end
export function fenceDecorated(idx: FenceIndex, piece: FencePiece): boolean {
  const deco = piece.style.deco;
  if (!deco || piece.form === "block") return false;
  const n = runPosition(idx, piece);
  return n >= 0 && (n + 1) % deco.every === 0;
}

export function fenceModelSpec(idx: FenceIndex, piece: FencePiece): FenceModelSpec {
  const spec: FenceModelSpec = { form: piece.form, height: piece.height, thickness: piece.thickness };
  if (piece.texture) spec.texture = piece.texture;
  if (piece.style.top) spec.top = piece.style.top;
  if (piece.form === "block") {
    const hide = SIDES.filter((d) => idx.blocks.has(cellKey(piece.x + VEC[d][0], piece.y + VEC[d][1])));
    if (hide.length) spec.hide = hide;
  } else if (piece.form === "edge") {
    spec.side = piece.side;
  } else {
    spec.arms = midArms(idx, piece);
    spec.axis = piece.axis;
  }
  const deco = piece.style.deco;
  if (deco && fenceDecorated(idx, piece)) {
    if (deco.post) spec.post = deco.texture ? { texture: deco.texture } : {};
    else if (deco.texture) spec.texture = deco.texture;
  }
  return spec;
}

// A face of a piece's model, relative to the middle of its cell (x, z) and the piece's own base (y, wall
// heights). A "side" is an upright panel: `yaw` is the turn of three.js's rotation.y that puts its front (+z,
// where the picture reads left to right) toward (sin yaw, cos yaw); `mirror`: the back copy of the panel (the
// panels' own convention: yaw + PI and scale.x -1); `length`: across it; u0..u1: the part of the texture it
// shows. A "cap" is a horizontal quad `sx` by `sz`, at height `y`. `tex`: which texture it wears - the
// piece's, the top's or the decoration's.
export type FenceFace =
  | { kind: "side"; tex: "main" | "deco"; x: number; z: number; y0: number; y1: number; yaw: number; mirror: boolean; length: number; u0: number; u1: number }
  | { kind: "cap"; tex: "main" | "top" | "deco"; x: number; z: number; y: number; sx: number; sz: number };

// the yaw that makes a panel's picture run along (dx, dz): its local x axis (rotation.y = a sends (1,0,0) to
// (cos a, 0, -sin a))
export const yawAlong = (dx: number, dz: number) => Math.atan2(-dz, dx);
// the yaw that makes a panel's front look along (nx, nz)
export const yawFacing = (nx: number, nz: number) => Math.atan2(nx, nz);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4 + 0;

function panelPair(seg: FenceSegment, thickness: number, h: number): FenceFace[] {
  const yaw = yawAlong(seg.du[0], seg.du[1]);
  const nx = Math.sin(yaw);
  const nz = Math.cos(yaw);
  const half = thickness / 2;
  const side = (sign: 1 | -1): FenceFace => ({
    kind: "side",
    tex: "main",
    x: r4(seg.cx + nx * half * sign),
    z: r4(seg.cz + nz * half * sign),
    y0: 0,
    y1: h,
    yaw: sign === 1 ? yaw : yaw + Math.PI,
    mirror: sign === -1,
    length: r4(seg.length),
    u0: r4(seg.u0),
    u1: r4(seg.u1),
  });
  return [side(1), side(-1)];
}

// a column `w` wide round (x, z): four outward faces and a top
function post(x: number, z: number, w: number, h: number): FenceFace[] {
  const faces: FenceFace[] = SIDES.map((d) => ({
    kind: "side" as const,
    tex: "deco" as const,
    x: r4(x + VEC[d][0] * (w / 2)),
    z: r4(z + VEC[d][1] * (w / 2)),
    y0: 0,
    y1: h,
    yaw: yawFacing(VEC[d][0], VEC[d][1]),
    mirror: false,
    length: w,
    u0: 0,
    u1: 1,
  }));
  faces.push({ kind: "cap", tex: "deco", x: r4(x), z: r4(z), y: h, sx: w, sz: w });
  return faces;
}

export function fenceFaces(spec: FenceModelSpec): FenceFace[] {
  const h = spec.height;
  if (spec.form === "block") {
    const faces: FenceFace[] = [];
    for (const d of SIDES) {
      if (spec.hide?.includes(d)) continue;
      faces.push({ kind: "side", tex: "main", x: VEC[d][0] * 0.5, z: VEC[d][1] * 0.5, y0: 0, y1: h, yaw: yawFacing(VEC[d][0], VEC[d][1]), mirror: false, length: 1, u0: 0, u1: 1 });
    }
    faces.push({ kind: "cap", tex: spec.top ? "top" : "main", x: 0, z: 0, y: h, sx: 1, sz: 1 });
    return faces;
  }
  const segments: FenceSegment[] =
    spec.form === "edge"
      ? [edgeSegment(spec.side ?? "N")]
      : midSegments(spec.arms ?? [], spec.axis ?? "x", spec.thickness);
  const faces: FenceFace[] = [];
  for (const seg of segments) {
    faces.push(...panelPair(seg, spec.thickness, h));
    // (the gap between the two faces, covered - only where there is one and a top to cover it with)
    if (spec.thickness > 0 && spec.top) {
      faces.push({ kind: "cap", tex: "top", x: r4(seg.cx), z: r4(seg.cz), y: h, sx: r4(seg.axis === "x" ? seg.length : spec.thickness), sz: r4(seg.axis === "x" ? spec.thickness : seg.length) });
    }
  }
  if (spec.post) {
    // (at the middle of the piece: of its edge, or of its cell)
    const at = spec.form === "edge" ? edgeSegment(spec.side ?? "N") : { cx: 0, cz: 0 };
    faces.push(...post(at.cx, at.cz, FENCE_POST_WIDTH, h + FENCE_POST_EXTRA));
  }
  return faces;
}

// an edge piece's one straight face, along its side of the cell
export function edgeSegment(side: Direction): FenceSegment {
  const [vx, vz] = VEC[side];
  return vx ? { cx: vx * 0.5, cz: 0, length: 1, axis: "z", du: [0, 1], u0: 0, u1: 1 } : { cx: 0, cz: vz * 0.5, length: 1, axis: "x", du: [1, 0], u0: 0, u1: 1 };
}

// ---- the minimap and the floor marks of the editor

// The marks a piece has on the floor while editing, relative to the middle of its cell: rectangles (x, z their
// middle, sx, sz their size) - a hatched square for a block, a strip along the edge or along the bars.
export function fenceFloorMark(spec: FenceModelSpec): { x: number; z: number; sx: number; sz: number }[] {
  if (spec.form === "block") return [{ x: 0, z: 0, sx: 0.9, sz: 0.9 }];
  const segments = spec.form === "edge" ? [edgeSegment(spec.side ?? "N")] : midSegments(spec.arms ?? [], spec.axis ?? "x", 0);
  const strip = 0.16;
  return segments.map((s) => ({ x: s.cx, z: s.cz, sx: s.axis === "x" ? s.length : strip, sz: s.axis === "x" ? strip : s.length }));
}

export type FenceMark =
  | { kind: "block"; x: number; y: number; opaque: boolean }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; form: "edge" | "mid"; opaque: boolean };

// What to draw on a chart of the map, in grid units (cell centres on integers)
export function fenceMarks(idx: FenceIndex): FenceMark[] {
  const marks: FenceMark[] = [];
  for (const piece of idx.blocks.values()) marks.push({ kind: "block", x: piece.x, y: piece.y, opaque: piece.opaque });
  for (const piece of idx.mids.values()) {
    for (const seg of midSegments(midArms(idx, piece), piece.axis, 0)) {
      const wide = seg.axis === "x" ? seg.length / 2 : 0;
      const deep = seg.axis === "z" ? seg.length / 2 : 0;
      marks.push({ kind: "line", form: "mid", opaque: piece.opaque, x1: piece.x + seg.cx - wide, y1: piece.y + seg.cz - deep, x2: piece.x + seg.cx + wide, y2: piece.y + seg.cz + deep });
    }
  }
  for (const [id, piece] of idx.edges) {
    const { cx, cz, axis } = edgeLine(id);
    marks.push({ kind: "line", form: "edge", opaque: piece.opaque, x1: cx - (axis === "x" ? 0.5 : 0), y1: cz - (axis === "z" ? 0.5 : 0), x2: cx + (axis === "x" ? 0.5 : 0), y2: cz + (axis === "z" ? 0.5 : 0) });
  }
  return marks;
}

// ---- problems (the editor's checks)

export type FenceProblem = { kind: "doubleEdge" | "doubleCell" | "noSide"; x: number; y: number; side?: Direction };

// What is wrong with a props list's fences: two pieces on one edge, a block and a mid piece (or two of one
// kind) in one cell, an edge piece without a side.
export function fenceProblems(props: readonly FenceProp[] | undefined): FenceProblem[] {
  const out: FenceProblem[] = [];
  const edges = new Set<string>();
  const cells = new Set<string>();
  (props ?? []).forEach((p, i) => {
    const piece = fencePieceOf(p, i);
    if (!piece) return;
    if (piece.form === "edge") {
      if (!isSide(p.at)) out.push({ kind: "noSide", x: piece.x, y: piece.y });
      const id = edgeId(piece.x, piece.y, piece.side);
      if (edges.has(id)) out.push({ kind: "doubleEdge", x: piece.x, y: piece.y, side: piece.side });
      edges.add(id);
    } else {
      const key = cellKey(piece.x, piece.y);
      if (cells.has(key)) out.push({ kind: "doubleCell", x: piece.x, y: piece.y });
      cells.add(key);
    }
  });
  return out;
}
