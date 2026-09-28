import type { MapFile } from "../game/mapFormat";
import { PROP_TYPES } from "../game/props";
import type { Direction, PropAnchor, Vec2 } from "../game/types";

// Edits on a map file (see mapStore.applyEdit): each takes a copy of the
// file and returns it changed.

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
