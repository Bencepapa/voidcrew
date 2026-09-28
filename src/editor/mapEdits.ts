import type { MapFile } from "../game/mapFormat";
import type { Vec2 } from "../game/types";

// Edits on a map file (see mapStore.applyEdit): each takes a copy of the
// file and returns it changed.

type Layers = NonNullable<MapFile["layers"]>;
const LAYER_NAMES: (keyof Layers)[] = ["floor", "ceiling", "floorTexture", "wallTexture", "ceilingTexture"];

const setChar = (row: string, x: number, char: string) => row.slice(0, x) + char + row.slice(x + 1);

// Digs a wall cell out into floor, like the open cell it was dug from
// (`from`, next to it): the same floor and ceiling heights and textures.
export function dig(file: MapFile, cell: Vec2, from: Vec2): MapFile {
  file.layout[cell.y] = setChar(file.layout[cell.y], cell.x, ".");
  for (const name of LAYER_NAMES) {
    const layer = file.layers?.[name];
    if (!layer) continue;
    layer.rows[cell.y] = setChar(layer.rows[cell.y], cell.x, layer.rows[from.y]?.[from.x] ?? ".");
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
