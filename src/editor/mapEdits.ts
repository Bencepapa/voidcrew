import type { MapFile } from "../game/mapFormat";
import { PROP_TYPES } from "../game/props";
import type { Direction, MapLight, PropAnchor, Vec2 } from "../game/types";

// Edits on a map file (see mapStore.applyEdit): each takes a copy of the
// file and returns it changed.

// What a click in the editor does (see EDITOR.md): dig a wall out or fill a
// floor in, paint the surface the pointer is on with a texture set, or place
// / remove a ceiling light.
export type EditTool = "dig" | "fill" | "texture" | "light";

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
  const width = file.layout[0]?.length ?? 0;
  const layers = file.layers ?? (file.layers = {});
  let entry = layers[layer];
  if (!entry && setId === null) return file;
  if (!entry) {
    entry = { legend: {}, rows: Array.from({ length: file.layout.length }, () => ".".repeat(width)) };
    layers[layer] = entry;
  }
  const row = entry.rows[cell.y];
  if (row === undefined || row.length !== width) return file;
  const taken = new Set(Object.keys(entry.legend));
  const known = setId === null ? undefined : Object.entries(entry.legend).find(([, id]) => id === setId)?.[0];
  let char: string | null;
  if (known !== undefined) {
    char = known;
  } else if (setId === null) {
    char = taken.has(".") ? [...CHAR_POOL].find((c) => !taken.has(c)) ?? null : ".";
  } else {
    const shown = new Set(entry.rows.join(""));
    char = [...CHAR_POOL].find((c) => !taken.has(c) && !shown.has(c)) ?? null;
    if (char !== null) entry.legend[char] = setId;
  }
  if (char === null) return file;
  entry.rows[cell.y] = setChar(row, cell.x, char);
  return file;
}

// Switches the cell's ceiling light on or off. A generated one (`auto`: the
// mood lighting puts one there - see lights.ts autoLightCells) is switched
// off by listing the cell in lightsOff; any other is the map's own, in
// lights.
export function setLight(file: MapFile, cell: Vec2, on: boolean, auto: boolean): MapFile {
  const here = (l: { x: number; y: number }) => l.x === cell.x && l.y === cell.y;
  file.lights = (file.lights ?? []).filter((l) => !here(l));
  file.lightsOff = (file.lightsOff ?? []).filter((l) => !here(l));
  if (on && !auto) file.lights.push({ x: cell.x, y: cell.y });
  if (!on && auto) file.lightsOff.push({ x: cell.x, y: cell.y });
  if (!file.lights.length) delete file.lights;
  if (!file.lightsOff.length) delete file.lightsOff;
  return file;
}

// The map's own lights (MapLight): add one - a ceiling lamp in a cell, or a
// free-standing one at `pos` there - change one, or remove one. Adding a
// lamp where the generated lighting has one switches that one off.
export function addLight(file: MapFile, light: MapLight): MapFile {
  const lights = file.lights ?? (file.lights = []);
  if (!light.pos) {
    file.lightsOff = (file.lightsOff ?? []).filter((l) => l.x !== light.x || l.y !== light.y);
    if (!file.lightsOff.length) delete file.lightsOff;
  }
  lights.push(light);
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

// A generated ceiling lamp becomes the map's own (to be colored or moved):
// the generated one is switched off, an own one takes its place.
export function customizeBuiltInLight(file: MapFile, cell: Vec2): MapFile {
  const off = file.lightsOff ?? (file.lightsOff = []);
  if (!off.some((l) => l.x === cell.x && l.y === cell.y)) off.push({ x: cell.x, y: cell.y });
  (file.lights ?? (file.lights = [])).push({ x: cell.x, y: cell.y });
  return file;
}
