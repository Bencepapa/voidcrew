import type { MapFile } from "../game/mapFormat";
import type { Direction, PropAnchor, Vec2 } from "../game/types";
import { DIR_VECTOR, rightOf, turnRight } from "../game/movement";
import { PROP_TYPES } from "../game/props";
import { fenceFormOf } from "../game/fences";
import { parseRoofGroup, roofGroupId } from "../game/roofAutotile";
import { clearCells, setLayerCell, type Rect } from "./mapEdits";
import { floorHeightIn, isFloorIn, reevaluateRoofs } from "./roofEdits";
import { reevaluateFences } from "./fenceEdits";
import { cellsOfRuns, readZone, runsOfCells, type AcousticZone } from "../game/acousticZones";

// The area clipboard (see docs/szerkeszto-masolas-beillesztes.md): everything inside a rectangle of a map - its
// cells (walls, floors, heights, textures) and what stands in them - copied, turned or mirrored, and pasted
// again somewhere else, in the same map or another. All of it is plain functions on map files, so the rotation
// maths and the merging are tested without a browser (areaClipboard.test.ts); the editor (useAreaClipboard.ts)
// only decides when to call them.
//
// A clip keeps each thing with the x, y of its cell relative to the clip's top-left corner, in the same shape as
// the map file keeps it. Left out when copying, and counted in `skipped`: the party's start, exits and stairs
// (named links must stay unique), lifts (a lift is two cabins on two decks) with their doors and buttons, and the
// deck's story triggers. A thing with an `id` is copied, and given another id when pasted if the map has it
// already (see pasteArea).

type Entry<K extends keyof MapFile> = NonNullable<MapFile[K]> extends readonly (infer E)[] ? E : never;

export const LAYER_NAMES = ["floor", "ceiling", "floorTexture", "wallTexture", "ceilingTexture"] as const;
export type LayerName = (typeof LAYER_NAMES)[number];
// a cell's value in a layer: a height, a texture set, or null - the layer's default
export type LayerValue = string | number | null;

// the lists of things placed in cells, each entry with its cell in `x`, `y`
export const LOCAL_LISTS = ["doors", "props", "items", "smokes", "sounds", "lights", "actors", "decals", "ladders", "bridges", "windows", "faceTextures", "chanceWalls", "wallInteractions"] as const;
export type LocalList = (typeof LOCAL_LISTS)[number];

export const CLIP_VERSION = 1;

export type AreaClip = {
  version: typeof CLIP_VERSION;
  // the size in cells
  w: number;
  h: number;
  // the map it was copied from (for the status line)
  source?: string;
  // w rows of h characters: W wall, . floor, D door
  layout: string[];
  // per layer, w * h values in reading order (a layer with nothing set is left out)
  layers: Partial<Record<LayerName, LayerValue[]>>;
  // restricted cells
  restricted?: [number, number][];
  // the sound zones' cells inside the area, each with the zone's settings (cells relative to the corner, as runs); pasted
  // as zones of their own, whatever map they go into
  zones?: AcousticZone[];
  // the size in pixels of each decal's picture (turning a floor decal needs it)
  decalSizes?: Record<string, [number, number]>;
  // what was left out when copying, by kind
  skipped: Record<string, number>;
} & { [K in LocalList]?: Entry<K>[] };

type Lists = Record<string, { x: number; y: number }[] | undefined>;
const listsOf = (clip: AreaClip) => clip as unknown as Lists;

const nz = (n: number) => (n === 0 ? 0 : n);
const degrees = (d: number) => nz(((d % 360) + 360) % 360);

// ---- copying

export interface CollectOptions {
  source?: string;
  // a decal picture's size in pixels, if known (see decalSizes)
  decalSize?: (name: string) => [number, number] | undefined;
}

// The rectangle as the clip it is: the part of it inside the map, or null when none is.
export function collectArea(file: MapFile, rect: Rect, options: CollectOptions = {}): AreaClip | null {
  const H = file.layout.length;
  const W = file.layout[0]?.length ?? 0;
  const x0 = Math.max(0, Math.min(rect.x0, rect.x1));
  const y0 = Math.max(0, Math.min(rect.y0, rect.y1));
  const x1 = Math.min(W - 1, Math.max(rect.x0, rect.x1));
  const y1 = Math.min(H - 1, Math.max(rect.y0, rect.y1));
  if (x1 < x0 || y1 < y0) return null;
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  const shift = <T extends { x: number; y: number }>(e: T): T => {
    const copy = structuredClone(e);
    copy.x -= x0;
    copy.y -= y0;
    return copy;
  };
  const skipped: Record<string, number> = {};
  const skip = (what: string, n = 1) => {
    if (n > 0) skipped[what] = (skipped[what] ?? 0) + n;
  };
  const here = (list: readonly { x: number; y: number }[] | undefined) => (list ?? []).filter((e) => inside(e.x, e.y));

  const clip: AreaClip = { version: CLIP_VERSION, w, h, ...(options.source ? { source: options.source } : {}), layout: [], layers: {}, skipped };
  const lists = listsOf(clip);
  const put = (key: LocalList, entries: { x: number; y: number }[]) => {
    if (entries.length) lists[key] = entries;
  };

  // what is not copied
  if (inside(file.start.x, file.start.y)) skip("start");
  skip("exits", here(file.exits).length);
  skip("stairs", here(file.stairs).length);
  skip("lifts", here(file.lifts).length);
  skip("triggers", (file.triggers ?? []).filter((t) => (t.on === "enter" || t.on === "open") && t.x !== undefined && t.y !== undefined && inside(t.x, t.y)).length);

  // doors (a lift's door is the lift's: its cell is copied as a plain floor)
  const liftDoors = new Set<string>();
  const doors: { x: number; y: number }[] = [];
  for (const d of here(file.doors) as Entry<"doors">[]) {
    if (d.kind === "lift") {
      liftDoors.add(`${d.x},${d.y}`);
      skip("lifts");
    } else doors.push(shift(d));
  }
  put("doors", doors);

  for (let y = y0; y <= y1; y++) {
    let row = "";
    for (let x = x0; x <= x1; x++) {
      const char = file.layout[y][x];
      row += char === "D" && liftDoors.has(`${x},${y}`) ? "." : char;
    }
    clip.layout.push(row);
  }

  for (const name of LAYER_NAMES) {
    const layer = file.layers?.[name] as { legend: Record<string, string | number>; default?: string | number; rows: string[] } | undefined;
    if (!layer) continue;
    const values: LayerValue[] = [];
    let any = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const value = layer.legend[layer.rows[y]?.[x] ?? ""] ?? layer.default ?? null;
        if (value !== null) any = true;
        values.push(value);
      }
    }
    if (any) clip.layers[name] = values;
  }

  put("props", here(file.props).map(shift));
  put("items", here(file.items).map(shift));
  put("smokes", here(file.smokes).map(shift));
  put("sounds", here(file.sounds).map(shift));
  put("lights", here(file.lights).map(shift));
  put("chanceWalls", here(file.chanceWalls).map(shift));
  put("faceTextures", here(file.faceTextures).map(shift));
  put("wallInteractions", here(file.wallInteractions).map(shift));

  // a button of a lift is the lift's too
  const decals = here(file.decals) as Entry<"decals">[];
  skip("lifts", decals.filter((d) => d.action === "lift").length);
  put("decals", decals.filter((d) => d.action !== "lift").map(shift));

  // an actor's route stays only if all of it is inside
  put(
    "actors",
    (here(file.actors) as Entry<"actors">[]).map((a) => {
      const copy = shift(a);
      if (copy.patrol && !a.patrol!.every(([px, py]) => inside(px, py))) delete copy.patrol;
      else if (copy.patrol) copy.patrol = a.patrol!.map(([px, py]) => [px - x0, py - y0]);
      return copy;
    }),
  );

  // a ladder needs its top, a window all its panels
  const ladders = here(file.ladders) as Entry<"ladders">[];
  const keptLadders = ladders.filter((l) => inside(l.x + DIR_VECTOR[l.wall].x, l.y + DIR_VECTOR[l.wall].y));
  skip("ladders", ladders.length - keptLadders.length);
  put("ladders", keptLadders.map(shift));
  put("bridges", here(file.bridges).map(shift));
  const windows = here(file.windows) as Entry<"windows">[];
  const keptWindows = windows.filter((win) => windowCells(win).every((c) => inside(c.x, c.y)));
  skip("windows", windows.length - keptWindows.length);
  put("windows", keptWindows.map(shift));

  const restricted = (file.restricted ?? []).filter(([x, y]) => inside(x, y));
  if (restricted.length) clip.restricted = restricted.map(([x, y]) => [x - x0, y - y0]);

  // the part of each sound zone that is inside (a zone with none of its cells in the area is not copied)
  const zones: AcousticZone[] = [];
  for (const zone of file.acoustics ?? []) {
    const cells = cellsOfRuns(zone.cells)
      .filter(([x, y]) => inside(x, y))
      .map(([x, y]): [number, number] => [x - x0, y - y0]);
    if (!cells.length) continue;
    const copy = structuredClone(zone);
    delete copy.lost;
    zones.push({ ...copy, cells: runsOfCells(cells) });
  }
  if (zones.length) clip.zones = zones;

  if (options.decalSize && clip.decals?.length) {
    const sizes: Record<string, [number, number]> = {};
    for (const d of clip.decals) {
      const size = options.decalSize(d.decal);
      if (size && !sizes[d.decal]) sizes[d.decal] = [size[0], size[1]];
    }
    if (Object.keys(sizes).length) clip.decalSizes = sizes;
  }
  return clip;
}

// the cells of a window's panels: the first one and the ones to its right (seen facing the wall)
function windowCells(win: { x: number; y: number; wall: Direction; width?: number }): Vec2[] {
  const right = DIR_VECTOR[rightOf(win.wall)];
  return Array.from({ length: win.width ?? 1 }, (_, i) => ({ x: win.x + right.x * i, y: win.y + right.y * i }));
}

// how many things the clip holds (not counting the cells themselves)
export function clipThings(clip: AreaClip): number {
  const lists = listsOf(clip);
  return LOCAL_LISTS.reduce((sum, key) => sum + (lists[key]?.length ?? 0), 0) + (clip.restricted?.length ?? 0) + (clip.zones?.length ?? 0);
}

// how many things were left out when copying
export function clipSkipped(clip: AreaClip): number {
  return Object.values(clip.skipped).reduce((sum, n) => sum + n, 0);
}

// ---- turning and mirroring

// A change of the clip's space: where a cell goes, which way a step (across, along) and a side point after, and
// how a heading (degrees, clockwise from north) changes.
interface Tx {
  turn: boolean;
  w: number;
  h: number;
  cell(x: number, y: number): [number, number];
  vec(dx: number, dz: number): [number, number];
  dir(d: Direction): Direction;
  heading(degrees: number): number;
}

// a quarter turn clockwise: the top left corner goes to the top right
const turnTx = (w: number, h: number): Tx => ({
  turn: true,
  w: h,
  h: w,
  cell: (x, y) => [h - 1 - y, x],
  vec: (dx, dz) => [nz(-dz), dx],
  dir: turnRight,
  heading: (d) => d + 90,
});

// left and right swapped
const flipTx = (w: number, h: number): Tx => ({
  turn: false,
  w,
  h,
  cell: (x, y) => [w - 1 - x, y],
  vec: (dx, dz) => [nz(-dx), dz],
  dir: (d) => (d === "E" ? "W" : d === "W" ? "E" : d),
  heading: (d) => -d,
});

const ANCHOR_VECTOR: Record<PropAnchor, [number, number]> = {
  center: [0, 0],
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
  NE: [1, -1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [-1, 1],
};
const anchorAt = (v: [number, number]): PropAnchor => (Object.keys(ANCHOR_VECTOR) as PropAnchor[]).find((a) => ANCHOR_VECTOR[a][0] === v[0] && ANCHOR_VECTOR[a][1] === v[1]) ?? "center";
// the corner a chamfer cuts, for any anchor (see props.ts CHAMFER_CORNER)
const CHAMFER_CORNER: Record<PropAnchor, PropAnchor> = { NE: "NE", NW: "NW", SE: "SE", SW: "SW", N: "NE", E: "SE", S: "SW", W: "NW", center: "NE" };

type Prop = Entry<"props">;
function xProp(p: Prop, tx: Tx): Prop {
  const [x, y] = tx.cell(p.x, p.y);
  const next: Prop = { ...p, x, y };
  if (p.offset) next.offset = tx.vec(p.offset[0], p.offset[1]);
  const form = fenceFormOf(p.prop);
  if (form === "edge") {
    // (the side of the cell it stands on)
    if (p.at === "N" || p.at === "E" || p.at === "S" || p.at === "W") next.at = tx.dir(p.at);
    return next;
  }
  if (form === "block") return next;
  const type = PROP_TYPES[p.prop];
  const chamfer = type?.kind === "chamfer";
  // A prop hung on a wall (a chamfer too) turns to face away from the wall it is on, with its anchor: a quarter
  // turn leaves its own `rotation` as it is. Any other prop turns by itself.
  const wallLike = !!type?.wall || chamfer;
  let at: PropAnchor = p.at ?? "center";
  // (a chamfer cuts the corner its anchor names: a mirror needs it spelled out, and so does a middle one)
  if (chamfer && (!tx.turn || at === "center")) at = CHAMFER_CORNER[at];
  const moved = anchorAt(tx.vec(...ANCHOR_VECTOR[at]));
  if (p.at !== undefined || moved !== "center") next.at = moved;
  if (!(tx.turn && wallLike) && (p.rotation !== undefined || tx.turn)) {
    const rotation = degrees(tx.heading(p.rotation ?? 0));
    if (rotation) next.rotation = rotation;
    else delete next.rotation;
  }
  return next;
}

type Decal = Entry<"decals">;
// A decal's picture is `w` x `h` pixels, its top-left corner (px, py) on a surface of 256 x 256 pixels. A wall is seen
// from its cell, so a turn changes only which wall it is; a floor turns about its cell's middle with the picture
// (a ceiling is seen from below: the other way round); a mirror flips across the surface (the picture itself is not
// mirrored: its text stays readable).
function xDecal(d: Decal, size: [number, number] | undefined, tx: Tx): Decal {
  const [w, h] = size ?? [0, 0];
  const [x, y] = tx.cell(d.x, d.y);
  const next: Decal = { ...d, x, y };
  const flat = d.surface === "floor" || d.surface === "ceiling";
  const cx = d.px + w / 2;
  const cy = d.py + h / 2;
  let nx = cx;
  let ny = cy;
  let rotation = d.rotation ?? 0;
  if (tx.turn) {
    if (d.surface === "floor") [nx, ny, rotation] = [256 - cy, cx, rotation + 90];
    else if (d.surface === "ceiling") [nx, ny, rotation] = [cy, 256 - cx, rotation - 90];
    else next.surface = tx.dir(d.surface);
  } else {
    [nx, rotation] = [256 - cx, -rotation];
    if (!flat) next.surface = tx.dir(d.surface as Direction);
  }
  next.px = nz(Math.round(nx - w / 2));
  next.py = nz(Math.round(ny - h / 2));
  if (!(tx.turn && !flat)) {
    if (degrees(rotation)) next.rotation = degrees(rotation);
    else delete next.rotation;
  }
  return next;
}

function transformClip(clip: AreaClip, tx: Tx): AreaClip {
  const { w, h } = clip;
  const out: AreaClip = { version: CLIP_VERSION, w: tx.w, h: tx.h, ...(clip.source ? { source: clip.source } : {}), layout: [], layers: {}, skipped: { ...clip.skipped } };
  const lists = listsOf(out);
  const from = listsOf(clip);

  const rows = Array.from({ length: tx.h }, () => Array<string>(tx.w).fill("W"));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [nx, ny] = tx.cell(x, y);
      rows[ny][nx] = clip.layout[y][x];
    }
  }
  out.layout = rows.map((r) => r.join(""));
  for (const name of LAYER_NAMES) {
    const values = clip.layers[name];
    if (!values) continue;
    const moved = new Array<LayerValue>(tx.w * tx.h).fill(null);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const [nx, ny] = tx.cell(x, y);
        moved[ny * tx.w + nx] = values[y * w + x];
      }
    }
    out.layers[name] = moved;
  }

  const copy = <T extends { x: number; y: number }>(e: T): T => structuredClone(e);
  const at = <T extends { x: number; y: number }>(e: T): T => {
    const next = copy(e);
    [next.x, next.y] = tx.cell(e.x, e.y);
    return next;
  };
  const map = (key: LocalList, change: (e: never) => { x: number; y: number }) => {
    const list = from[key];
    if (list?.length) lists[key] = list.map((e) => change(e as never));
  };

  map("doors", (d: Entry<"doors">) => ({ ...at(d), facing: tx.dir(d.facing) }));
  map("props", (p: Prop) => xProp(copy(p), tx));
  map("items", (i: Entry<"items">) => {
    const next = at(i);
    if (i.offset) next.offset = tx.vec(i.offset[0], i.offset[1]);
    return next;
  });
  map("smokes", (s: Entry<"smokes">) => {
    const next = at(s);
    const [px, pz] = tx.vec(s.pos[0], s.pos[2]);
    next.pos = [px, s.pos[1], pz];
    if (s.blow) next.blow = { ...s.blow, yaw: degrees(tx.heading(s.blow.yaw)) };
    return next;
  });
  // (the spot in the cell turns with the cell; a sound without one stays in the middle)
  map("sounds", (s: Entry<"sounds">) => {
    const next = at(s);
    if (s.pos) {
      const [px, pz] = tx.vec(s.pos[0], s.pos[2]);
      next.pos = [px, s.pos[1], pz];
    }
    return next;
  });
  map("lights", (l: Entry<"lights">) => {
    const next = at(l);
    if (l.pos) {
      const [px, pz] = tx.vec(l.pos[0], l.pos[2]);
      next.pos = [px, l.pos[1], pz];
    }
    return next;
  });
  map("actors", (a: Entry<"actors">) => {
    const next = at(a);
    const facing = tx.dir(a.facing ?? "S");
    if (a.facing !== undefined || facing !== "S") next.facing = facing;
    if (a.patrol) next.patrol = a.patrol.map(([px, py]) => tx.cell(px, py));
    return next;
  });
  map("decals", (d: Decal) => xDecal(d, clip.decalSizes?.[d.decal], tx));
  map("ladders", (l: Entry<"ladders">) => ({ ...at(l), wall: tx.dir(l.wall) }));
  map("bridges", (b: Entry<"bridges">) => ({ ...at(b), axis: tx.turn ? (b.axis === "NS" ? "EW" : "NS") : b.axis }));
  map("windows", (win: Entry<"windows">) => {
    // (a mirror reads the panels from the other end: its first one is the old last)
    const cells = windowCells(win);
    const first = tx.turn ? cells[0] : cells[cells.length - 1];
    const [x, y] = tx.cell(first.x, first.y);
    return { ...copy(win), x, y, wall: tx.dir(win.wall) };
  });
  map("faceTextures", (f: Entry<"faceTextures">) => ({ ...at(f), face: tx.dir(f.face) }));
  map("chanceWalls", at);
  map("wallInteractions", (w: Entry<"wallInteractions">) => ({ ...at(w), side: tx.dir(w.side) }));

  if (clip.restricted) out.restricted = clip.restricted.map(([x, y]) => tx.cell(x, y));
  if (clip.zones) out.zones = clip.zones.map((zone) => ({ ...structuredClone(zone), cells: runsOfCells(cellsOfRuns(zone.cells).map(([x, y]) => tx.cell(x, y))) }));
  if (clip.decalSizes) out.decalSizes = structuredClone(clip.decalSizes);
  return out;
}

// a quarter turn clockwise
export const rotateClip = (clip: AreaClip): AreaClip => transformClip(clip, turnTx(clip.w, clip.h));
// left and right swapped
export const flipClip = (clip: AreaClip): AreaClip => transformClip(clip, flipTx(clip.w, clip.h));
// The clip mirrored if `flip`, then turned `turns` quarter turns clockwise.
export function orientClip(clip: AreaClip, turns: number, flip: boolean): AreaClip {
  let result = flip ? flipClip(clip) : clip;
  for (let i = 0; i < (((turns % 4) + 4) % 4); i++) result = rotateClip(result);
  return result;
}

// ---- pasting

export interface PasteReport {
  // things put in
  things: number;
  // cells written
  cells: number;
  // cells that fell outside the map
  clipped: number;
  // cells left alone: the start, a gate, stairs or a lift stands there
  kept: number;
  // windows, ladders, bridges and routes that could not stay (a wall changed beside them)
  dropped: number;
}

// the cells the clip covers when its top-left corner is at `at`
export const pasteRect = (clip: Pick<AreaClip, "w" | "h">, at: Vec2): Rect => ({ x0: at.x, y0: at.y, x1: at.x + clip.w - 1, y1: at.y + clip.h - 1 });

const setChar = (row: string, x: number, char: string) => row.slice(0, x) + char + row.slice(x + 1);
const NEIGHBOURS: { dx: number; dy: number; toward: Direction }[] = [
  { dx: 0, dy: 1, toward: "N" },
  { dx: 0, dy: -1, toward: "S" },
  { dx: 1, dy: 0, toward: "W" },
  { dx: -1, dy: 0, toward: "E" },
];
// the wall a wall prop hangs on, by its anchor (see mapEdits MOUNTED_ON)
const MOUNTED_ON: Record<PropAnchor, Direction | null> = { center: null, N: "N", NE: "N", NW: "N", S: "S", SE: "S", SW: "S", E: "E", W: "W" };

const ceilingHeightIn = (file: MapFile, x: number, y: number) => {
  const layer = file.layers?.ceiling;
  return (layer ? layer.legend[layer.rows[y]?.[x] ?? ""] ?? layer.default : undefined) ?? floorHeightIn(file, x, y) + 1;
};

// Puts the clip into the file with its top-left corner at `at`, replacing the area: what stood in the cells it
// covers is taken away first, and the cells (layout, heights, textures) are the clip's. Cells outside the map are
// left out, and so are the ones with the party's start, a gate, stairs or a lift (they stay as they are). Roofs get
// roof ids of their own (they must not grow into the roof beside), a thing whose id the map has already gets
// another (and the `with` / `without` of the pasted things that name it follow), and then what can't stand any
// more (a window with no wall beside it, a ladder with no ledge...) is taken out. The file is changed in place:
// call it from applyEdit's edit, which makes the whole paste one undo step.
export function pasteArea(file: MapFile, clip: AreaClip, at: Vec2): PasteReport {
  const H = file.layout.length;
  const W = file.layout[0]?.length ?? 0;
  const report: PasteReport = { things: 0, cells: 0, clipped: 0, kept: 0, dropped: 0 };

  const protectedCells = new Set<string>([`${file.start.x},${file.start.y}`]);
  for (const list of [file.exits, file.stairs, file.lifts]) for (const e of list ?? []) protectedCells.add(`${e.x},${e.y}`);

  // the cells to write: [index in the clip, x, y in the map]
  const targets: { i: number; x: number; y: number }[] = [];
  for (let ly = 0; ly < clip.h; ly++) {
    for (let lx = 0; lx < clip.w; lx++) {
      const x = at.x + lx;
      const y = at.y + ly;
      if (x < 0 || y < 0 || x >= W || y >= H) report.clipped++;
      else if (protectedCells.has(`${x},${y}`)) report.kept++;
      else targets.push({ i: ly * clip.w + lx, x, y });
    }
  }
  const live = new Set(targets.map((c) => `${c.x},${c.y}`));
  report.cells = targets.length;
  if (!targets.length) return report;
  const cells = targets.map(({ x, y }) => ({ x, y }));

  // what stood there goes (the windows too: clearCells does not know them)
  const wasWall = new Set(targets.filter((c) => file.layout[c.y][c.x] === "W").map((c) => `${c.x},${c.y}`));
  clearCells(file, cells);
  if (file.windows) {
    file.windows = file.windows.filter((win) => !windowCells(win).some((c) => live.has(`${c.x},${c.y}`)));
    if (!file.windows.length) delete file.windows;
  }

  // the layout and the layers
  for (const { i, x, y } of targets) {
    const lx = i % clip.w;
    const ly = Math.floor(i / clip.w);
    const char = clip.layout[ly][lx];
    file.layout[y] = setChar(file.layout[y], x, char);
    // (a wall that opens: what hung on its faces from the cells beside it goes - as dig does)
    if (wasWall.has(`${x},${y}`) && char !== "W") {
      for (const n of NEIGHBOURS) {
        const nx = x + n.dx;
        const ny = y + n.dy;
        if (live.has(`${nx},${ny}`)) continue;
        if (file.decals) {
          file.decals = file.decals.filter((d) => !(d.x === nx && d.y === ny && d.surface === n.toward));
          if (!file.decals.length) delete file.decals;
        }
        if (file.props) {
          file.props = file.props.filter((p) => !(PROP_TYPES[p.prop]?.wall && p.x === nx && p.y === ny && MOUNTED_ON[p.at ?? "center"] === n.toward));
          if (!file.props.length) delete file.props;
        }
      }
    }
  }
  for (const name of LAYER_NAMES) {
    const values = clip.layers[name];
    for (const { i, x, y } of targets) setLayerCell(file, name, { x, y }, values?.[i] ?? null);
  }

  // ids: the ones the map has still (after what was cleared) are made new
  const taken = new Set<string>();
  const fileLists = file as unknown as Record<string, { id?: string }[] | undefined>;
  for (const key of ["doors", "props", "items", "smokes", "lights", "actors", "decals", "chanceWalls"]) for (const e of fileLists[key] ?? []) if (e.id) taken.add(e.id);
  const clipLists = listsOf(clip) as unknown as Record<string, { id?: string }[] | undefined>;
  const clipIds = new Set<string>();
  for (const key of LOCAL_LISTS) for (const e of clipLists[key] ?? []) if (e.id) clipIds.add(e.id);
  const renamed = new Map<string, string>();
  for (const id of clipIds) {
    if (!taken.has(id)) continue;
    let n = 2;
    while (taken.has(`${id}-${n}`) || clipIds.has(`${id}-${n}`)) n++;
    renamed.set(id, `${id}-${n}`);
    taken.add(`${id}-${n}`);
  }

  // roofs: every group of the clip becomes a group of its own
  let top = 0;
  for (const p of file.props ?? []) top = Math.max(top, parseRoofGroup(p.auto)?.n ?? 0);
  const groups = new Map<string, string>();
  const newGroup = (group: string) => {
    let next = groups.get(group);
    if (!next) {
      const parsed = parseRoofGroup(group);
      next = parsed ? roofGroupId(parsed.form, ++top) : group;
      groups.set(group, next);
    }
    return next;
  };

  const target = file as unknown as Record<string, unknown[] | undefined>;
  for (const key of LOCAL_LISTS) {
    for (const entry of (clipLists[key] ?? []) as ({ x: number; y: number; id?: string; with?: string; without?: string } & Record<string, unknown>)[]) {
      const x = at.x + entry.x;
      const y = at.y + entry.y;
      if (!live.has(`${x},${y}`)) continue;
      const copy = structuredClone(entry);
      copy.x = x;
      copy.y = y;
      if (copy.id && renamed.has(copy.id)) copy.id = renamed.get(copy.id);
      if (copy.with && renamed.has(copy.with)) copy.with = renamed.get(copy.with);
      if (copy.without && renamed.has(copy.without)) copy.without = renamed.get(copy.without);
      if (key === "props" && typeof copy.auto === "string") copy.auto = newGroup(copy.auto);
      if (key === "actors" && Array.isArray(copy.patrol)) copy.patrol = (copy.patrol as [number, number][]).map(([px, py]) => [at.x + px, at.y + py]);
      if (key === "windows") {
        // (placed whole or not at all: a panel outside the map or on a kept cell leaves the window out)
        if (!windowCells(copy as never).every((c) => live.has(`${c.x},${c.y}`))) continue;
      }
      (target[key] ?? (target[key] = [])).push(copy);
      report.things++;
    }
  }
  for (const [rx, ry] of clip.restricted ?? []) {
    if (!live.has(`${at.x + rx},${at.y + ry}`)) continue;
    (file.restricted ?? (file.restricted = [])).push([at.x + rx, at.y + ry]);
    report.things++;
  }
  // sound zones: each one's cells become a new zone of the map (a name is no id: it may repeat); the area's old zone cells
  // went with clearCells above
  for (const zone of clip.zones ?? []) {
    const cells = cellsOfRuns(zone.cells)
      .map(([x, y]): [number, number] => [at.x + x, at.y + y])
      .filter(([x, y]) => live.has(`${x},${y}`));
    if (!cells.length) continue;
    (file.acoustics ?? (file.acoustics = [])).push({ ...structuredClone(zone), cells: runsOfCells(cells) });
    report.things++;
  }

  report.dropped = dropUnstable(file);
  reevaluateRoofs(file);
  reevaluateFences(file);
  return report;
}

// Takes out what a changed wall or floor left unable to stand, as parseMap would refuse it: a window needs open
// cells with a wall behind, a ladder an open ledge above it, a bridge a floor cell with room for it; an actor's
// route over a wall is dropped (the actor stays). Returns how many were taken out.
export function dropUnstable(file: MapFile): number {
  let dropped = 0;
  const open = (x: number, y: number) => {
    const char = file.layout[y]?.[x];
    return char !== undefined && char !== "W" && !file.chanceWalls?.some((w) => w.x === x && w.y === y);
  };
  const keep = <T>(key: "windows" | "ladders" | "bridges", ok: (e: T) => boolean) => {
    const list = file[key] as T[] | undefined;
    if (!list) return;
    const kept = list.filter(ok);
    dropped += list.length - kept.length;
    if (kept.length === list.length) return;
    if (kept.length) (file as unknown as Record<string, unknown>)[key] = kept;
    else delete file[key];
  };
  keep<Entry<"windows">>("windows", (win) => {
    const out = DIR_VECTOR[win.wall];
    return windowCells(win).every((c) => open(c.x, c.y) && !open(c.x + out.x, c.y + out.y));
  });
  keep<Entry<"ladders">>("ladders", (l) => {
    const top = { x: l.x + DIR_VECTOR[l.wall].x, y: l.y + DIR_VECTOR[l.wall].y };
    return open(l.x, l.y) && open(top.x, top.y) && floorHeightIn(file, top.x, top.y) > floorHeightIn(file, l.x, l.y);
  });
  keep<Entry<"bridges">>("bridges", (b) => isFloorIn(file, b.x, b.y) && b.height > floorHeightIn(file, b.x, b.y) && b.height < ceilingHeightIn(file, b.x, b.y));
  for (const a of file.actors ?? []) {
    if (a.patrol && !a.patrol.every(([x, y]) => isFloorIn(file, x, y))) {
      delete a.patrol;
      dropped++;
    }
  }
  return dropped;
}

// ---- keeping it: validated on the way in, and in the browser's storage

export const CLIP_STORAGE_KEY = "voidcrew.areaClipboard";
const MAX_SIDE = 512;
const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

// The clip a stored value says, or null when it isn't one (another version, a damaged value): it is only taken
// as far as its shape goes - an unknown prop or texture is found when it is pasted, as with any map.
export function parseClip(raw: unknown): AreaClip | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== CLIP_VERSION || !isInt(r.w) || !isInt(r.h) || r.w < 1 || r.h < 1 || r.w > MAX_SIDE || r.h > MAX_SIDE) return null;
  const { w, h } = r;
  if (!Array.isArray(r.layout) || r.layout.length !== h || !r.layout.every((row) => typeof row === "string" && row.length === w && /^[W.D]*$/.test(row))) return null;
  const clip: AreaClip = { version: CLIP_VERSION, w, h, layout: r.layout as string[], layers: {}, skipped: {} };
  if (typeof r.source === "string") clip.source = r.source;
  if (typeof r.layers === "object" && r.layers !== null) {
    for (const name of LAYER_NAMES) {
      const values = (r.layers as Record<string, unknown>)[name];
      if (values === undefined) continue;
      if (!Array.isArray(values) || values.length !== w * h || !values.every((v) => v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v)))) return null;
      clip.layers[name] = values as LayerValue[];
    }
  }
  if (typeof r.skipped === "object" && r.skipped !== null) {
    for (const [k, v] of Object.entries(r.skipped)) if (typeof v === "number" && Number.isFinite(v) && v > 0) clip.skipped[k] = v;
  }
  const lists = listsOf(clip);
  const inside = (e: unknown): e is { x: number; y: number } => typeof e === "object" && e !== null && isInt((e as { x?: unknown }).x) && isInt((e as { y?: unknown }).y) && (e as { x: number }).x >= 0 && (e as { x: number }).x < w && (e as { y: number }).y >= 0 && (e as { y: number }).y < h;
  for (const key of LOCAL_LISTS) {
    const list = r[key];
    if (!Array.isArray(list)) continue;
    const kept = list.filter(inside);
    if (kept.length) lists[key] = kept;
  }
  if (Array.isArray(r.restricted)) {
    const cells = r.restricted.filter((c): c is [number, number] => Array.isArray(c) && isInt(c[0]) && isInt(c[1]) && c[0] >= 0 && c[0] < w && c[1] >= 0 && c[1] < h).map((c): [number, number] => [c[0], c[1]]);
    if (cells.length) clip.restricted = cells;
  }
  if (Array.isArray(r.zones)) {
    const zones = r.zones.map((z) => readZone(z, (x, y) => x >= 0 && x < w && y >= 0 && y < h)).filter((z) => z.cells.length);
    for (const z of zones) delete z.lost;
    if (zones.length) clip.zones = zones;
  }
  if (typeof r.decalSizes === "object" && r.decalSizes !== null) {
    const sizes: Record<string, [number, number]> = {};
    for (const [name, size] of Object.entries(r.decalSizes)) {
      if (Array.isArray(size) && typeof size[0] === "number" && typeof size[1] === "number" && Number.isFinite(size[0]) && Number.isFinite(size[1])) sizes[name] = [size[0], size[1]];
    }
    if (Object.keys(sizes).length) clip.decalSizes = sizes;
  }
  return clip;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const browserStore = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

// Keeps the clip (null: forgets it) so a reload, or another map, still has it; false if the storage refused.
export function saveClip(clip: AreaClip | null, store: Store | null = browserStore()): boolean {
  if (!store) return false;
  try {
    if (clip) store.setItem(CLIP_STORAGE_KEY, JSON.stringify(clip));
    else store.removeItem(CLIP_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function loadClip(store: Store | null = browserStore()): AreaClip | null {
  if (!store) return null;
  try {
    const text = store.getItem(CLIP_STORAGE_KEY);
    return text ? parseClip(JSON.parse(text)) : null;
  } catch {
    return null;
  }
}

// ---- decals' picture sizes (turning a floor decal needs them; the browser knows them once the picture is in)

const decalPictures = new Map<string, [number, number]>();
export const knownDecalSize = (name: string): [number, number] | undefined => decalPictures.get(name);
export const rememberDecalSize = (name: string, size: [number, number]) => void decalPictures.set(name, size);
