import type { MapFile } from "../game/mapFormat";
import { PROP_TYPES } from "../game/props";
import type { Direction, MapLight, PropAnchor, Vec2 } from "../game/types";

// Edits on a map file (see mapStore.applyEdit): each takes a copy of the
// file and returns it changed.

// What a click in the editor does (see EDITOR.md): dig a wall out or fill a
// floor in, paint the surface the pointer is on with a texture set, place /
// change / remove a light, raise or lower a floor or ceiling, or put in /
// take out a ladder, a bridge, a door or a prop.
export type EditTool = "dig" | "fill" | "texture" | "light" | "height" | "ladder" | "bridge" | "door" | "prop" | "decal";

// The surface under the pointer, which picks the tool's target (a wall's
// face is seen from the open cell it belongs to - `from`).
export type EditSurface = "wall" | "floor" | "ceiling";

// The layer each surface's texture set is written to.
export type TextureLayer = "floorTexture" | "wallTexture" | "ceilingTexture";

type Layers = NonNullable<MapFile["layers"]>;
const LAYER_NAMES: (keyof Layers)[] = ["floor", "ceiling", "floorTexture", "wallTexture", "ceilingTexture"];

const setChar = (row: string, x: number, char: string) => row.slice(0, x) + char + row.slice(x + 1);

// the wall a wall-mounted prop at an anchor hangs on (corners: the north or
// south one - see props.ts WALL_FACING)
const MOUNTED_ON: Record<PropAnchor, Direction | null> = {
  center: null,
  N: "N",
  NE: "N",
  NW: "N",
  S: "S",
  SE: "S",
  SW: "S",
  E: "E",
  W: "W",
};

const NEIGHBOURS: { dx: number; dy: number; toward: Direction }[] = [
  { dx: 0, dy: 1, toward: "N" },
  { dx: 0, dy: -1, toward: "S" },
  { dx: 1, dy: 0, toward: "W" },
  { dx: -1, dy: 0, toward: "E" },
];

// Digs a wall cell out into floor, like the open cell it was dug from
// (`from`, next to it): the same floor and ceiling heights and textures.
// What was on the wall's faces goes with it: the decals on them and the
// props mounted on them, in the cells around.
export function dig(file: MapFile, cell: Vec2, from: Vec2): MapFile {
  file.layout[cell.y] = setChar(file.layout[cell.y], cell.x, ".");
  for (const name of LAYER_NAMES) {
    const layer = file.layers?.[name];
    if (!layer) continue;
    layer.rows[cell.y] = setChar(layer.rows[cell.y], cell.x, layer.rows[from.y]?.[from.x] ?? ".");
  }
  // a face of the dug wall: a neighbour's side toward it
  const onFace = (x: number, y: number, side: string | null | undefined) =>
    NEIGHBOURS.some((n) => x === cell.x + n.dx && y === cell.y + n.dy && side === n.toward);
  if (file.decals) file.decals = file.decals.filter((d) => !onFace(d.x, d.y, d.surface));
  if (file.props) {
    file.props = file.props.filter((p) => !(PROP_TYPES[p.prop]?.wall && onFace(p.x, p.y, MOUNTED_ON[p.at ?? "center"])));
  }
  return file;
}

// Fills a floor cell in as wall, taking its decals and ceiling light with
// it. What stands in it (a prop, an enemy, a ladder...) has to go first:
// the map wouldn't parse (see mapStore.applyEdit).
export function fill(file: MapFile, cell: Vec2): MapFile {
  file.layout[cell.y] = setChar(file.layout[cell.y], cell.x, "W");
  const here = (p: { x: number; y: number }) => p.x === cell.x && p.y === cell.y;
  if (file.decals) file.decals = file.decals.filter((d) => !here(d));
  if (file.lights) file.lights = file.lights.filter((l) => !here(l));
  return file;
}

// Characters a texture layer's legend can use: one per set.
const CHAR_POOL = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

// Paints a cell's surface (`cell`: the open cell a wall face is seen from)
// with a texture set, or - `setId` null - back to the layer's default. A
// layer the map doesn't have yet starts empty, every cell the default. Its
// legend maps one character per set, so a set not on the map yet takes a
// character no legend uses and no row shows: rows only mean the default for
// characters their legend doesn't know.
export function paintTexture(file: MapFile, layer: TextureLayer, cell: Vec2, setId: string | null): MapFile {
  return setLayerCell(file, layer, cell, setId);
}

// A cell's value in a layer (a texture set, a height), or - null - the
// layer's default there (see paintTexture on how the legend grows).
export function setLayerCell(file: MapFile, layer: keyof Layers, cell: Vec2, value: string | number | null): MapFile {
  const width = file.layout[0]?.length ?? 0;
  const layers = file.layers ?? (file.layers = {});
  let entry = layers[layer] as { legend: Record<string, string | number>; default?: string | number; rows: string[] } | undefined;
  if (!entry && value === null) return file;
  if (!entry) {
    entry = { legend: {}, rows: Array.from({ length: file.layout.length }, () => ".".repeat(width)) };
    (layers as Record<string, unknown>)[layer] = entry;
  }
  const row = entry.rows[cell.y];
  if (row === undefined || row.length !== width) return file;
  const taken = new Set(Object.keys(entry.legend));
  const known = value === null ? undefined : Object.entries(entry.legend).find(([, v]) => v === value)?.[0];
  let char: string | null;
  if (known !== undefined) {
    char = known;
  } else if (value === null) {
    char = taken.has(".") ? [...CHAR_POOL].find((c) => !taken.has(c)) ?? null : ".";
  } else {
    const shown = new Set(entry.rows.join(""));
    char = [...CHAR_POOL].find((c) => !taken.has(c) && !shown.has(c)) ?? null;
    if (char !== null) entry.legend[char] = value;
  }
  if (char === null) return file;
  entry.rows[cell.y] = setChar(row, cell.x, char);
  return file;
}

// A cell's floor or ceiling height (wall heights); null: the default - a
// floor of 0, a ceiling one panel above its floor.
export function setHeight(file: MapFile, which: "floor" | "ceiling", cell: Vec2, value: number | null): MapFile {
  return setLayerCell(file, which, cell, value);
}

const at = (cell: Vec2) => (p: { x: number; y: number }) => p.x === cell.x && p.y === cell.y;

// A ladder in `cell` against its `wall` side (up to the higher neighbour
// there): put in, or taken out if there is one.
export function toggleLadder(file: MapFile, cell: Vec2, wall: Direction): MapFile {
  const ladders = file.ladders ?? [];
  const i = ladders.findIndex((l) => at(cell)(l) && l.wall === wall);
  if (i >= 0) ladders.splice(i, 1);
  else ladders.push({ x: cell.x, y: cell.y, wall });
  file.ladders = ladders;
  if (!ladders.length) delete file.ladders;
  return file;
}

// A bridge across `cell` (along `axis`, at `height`), or - if it has one -
// taken out.
export function toggleBridge(file: MapFile, cell: Vec2, axis: "NS" | "EW", height: number): MapFile {
  const bridges = file.bridges ?? [];
  const i = bridges.findIndex(at(cell));
  if (i >= 0) bridges.splice(i, 1);
  else bridges.push({ x: cell.x, y: cell.y, height, axis });
  file.bridges = bridges;
  if (!bridges.length) delete file.bridges;
  return file;
}

// A door in `cell` (its front facing along the passage - see doorAt), or -
// a door cell - back to floor, its settings dropped.
export function toggleDoor(file: MapFile, cell: Vec2): MapFile {
  const isDoor = file.layout[cell.y]?.[cell.x] === "D";
  file.layout[cell.y] = setChar(file.layout[cell.y], cell.x, isDoor ? "." : "D");
  if (isDoor && file.doors) {
    file.doors = file.doors.filter((d) => !at(cell)(d));
    if (!file.doors.length) delete file.doors;
  }
  return file;
}

// A prop in `cell` at an anchor (turned `rotation` degrees; nudged and
// raised as `extra` says - see PropSpec).
export function addProp(
  file: MapFile,
  prop: string,
  cell: Vec2,
  anchor: PropAnchor,
  rotation: number,
  extra: { offset?: [number, number]; elevation?: number } = {},
): MapFile {
  const props = file.props ?? (file.props = []);
  props.push({ prop, x: cell.x, y: cell.y, at: anchor, ...(rotation ? { rotation } : {}), ...extra });
  return file;
}

type PropEntry = NonNullable<MapFile["props"]>[number];

// changes a prop (a setting set to undefined drops it)
export function updateProp(file: MapFile, index: number, patch: Partial<PropEntry>): MapFile {
  const prop = file.props?.[index];
  if (!prop) return file;
  const next = { ...prop, ...patch } as Record<string, unknown>;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  file.props![index] = next as PropEntry;
  return file;
}

export function removePropIndex(file: MapFile, index: number): MapFile {
  if (!file.props?.[index]) return file;
  file.props.splice(index, 1);
  if (!file.props.length) delete file.props;
  return file;
}

type DecalEntry = NonNullable<MapFile["decals"]>[number];

// The map's decals: put one in, change one, take one out.
export function addDecal(file: MapFile, decal: DecalEntry): MapFile {
  (file.decals ?? (file.decals = [])).push(decal);
  return file;
}

export function updateDecal(file: MapFile, index: number, patch: Partial<DecalEntry>): MapFile {
  const decal = file.decals?.[index];
  if (!decal) return file;
  const next = { ...decal, ...patch } as Record<string, unknown>;
  for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
  file.decals![index] = next as DecalEntry;
  return file;
}

export function removeDecal(file: MapFile, index: number): MapFile {
  if (!file.decals?.[index]) return file;
  file.decals.splice(index, 1);
  if (!file.decals.length) delete file.decals;
  return file;
}

// Takes out the prop in `cell` nearest an anchor (the one pointed at).
export function removeProp(file: MapFile, cell: Vec2, near: PropAnchor): MapFile {
  const props = file.props ?? [];
  const here = props.map((p, i) => ({ p, i })).filter(({ p }) => at(cell)(p));
  if (!here.length) return file;
  const [nx, ny] = ANCHOR_OFFSET[near];
  here.sort((a, b) => {
    const [ax, ay] = ANCHOR_OFFSET[a.p.at ?? "center"];
    const [bx, by] = ANCHOR_OFFSET[b.p.at ?? "center"];
    return Math.hypot(ax - nx, ay - ny) - Math.hypot(bx - nx, by - ny);
  });
  props.splice(here[0].i, 1);
  if (!props.length) delete file.props;
  return file;
}

// where each anchor is in its cell (fractions of it, from the center)
const ANCHOR_OFFSET: Record<PropAnchor, [number, number]> = {
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

// The anchor nearest a spot of a cell (dx, dz from its center, -0.5..0.5):
// the center if it's near the middle, else a side or a corner. A prop
// hung on a wall only takes a side.
export function anchorAt(dx: number, dz: number, wallOnly = false): PropAnchor {
  if (wallOnly || Math.max(Math.abs(dx), Math.abs(dz)) >= 0.15) {
    const sx = Math.abs(dx) >= 0.15 ? Math.sign(dx) : 0;
    const sz = Math.abs(dz) >= 0.15 ? Math.sign(dz) : 0;
    if (wallOnly || !(sx && sz)) {
      return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? "E" : "W") : dz > 0 ? "S" : "N";
    }
    return `${sz > 0 ? "S" : "N"}${sx > 0 ? "E" : "W"}` as PropAnchor;
  }
  return "center";
}


// The map's lights (MapLight): add one - a ceiling lamp in a cell, or a
// free-standing one at `pos` there - change one, or remove one.
export function addLight(file: MapFile, light: MapLight): MapFile {
  (file.lights ?? (file.lights = [])).push(light);
  return file;
}

export function updateLight(file: MapFile, index: number, patch: Partial<MapLight>): MapFile {
  const light = file.lights?.[index];
  if (!light) return file;
  file.lights![index] = { ...light, ...patch };
  return file;
}

export function removeLight(file: MapFile, index: number): MapFile {
  if (!file.lights?.[index]) return file;
  file.lights.splice(index, 1);
  if (!file.lights.length) delete file.lights;
  return file;
}

