import { DIR_VECTOR, rightOf } from "./movement";
import type { BridgeSpec, CellType, Direction, DoorSpec, GameMap, LadderSpec, LiftSpec, Vec2 } from "./types";
import { parseMap } from "./mapFormat";
import type { MapFile } from "./mapFormat";

// every map in src/maps/, by id (its file name)
const files = import.meta.glob<MapFile>("../maps/*.json", { eager: true, import: "default" });
export const MAPS: Record<string, GameMap> = Object.fromEntries(
  Object.entries(files).map(([path, file]) => {
    const id = path.replace(/^.*\/(.+)\.json$/, "$1");
    return [id, parseMap(id, file)];
  }),
);

// the deck the game starts on: in its lift, (1,1), behind its door at (2,1)
// the deck the game starts on; ?map=<id> in the URL starts on another
// (for testing a deck without riding the lifts there)
const requestedMap = typeof location !== "undefined" ? new URLSearchParams(location.search).get("map") : null;
export const START_MAP = (requestedMap && MAPS[requestedMap]) || MAPS["deck2-engineering"];

// the door spec of a door cell; unlisted door cells are standard doors
// whose front faces along the passage
export function doorAt(map: GameMap, x: number, y: number): DoorSpec {
  const spec = map.doors?.find((d) => d.cell.x === x && d.cell.y === y);
  if (spec) return spec;
  const northSouth = cellAt(map, x, y - 1) !== "wall" || cellAt(map, x, y + 1) !== "wall";
  return { cell: { x, y }, kind: "standard", facing: northSouth ? "S" : "E" };
}

// how far a door goes from its cell's middle: its frame (0.08 deep) flush
// with the cell's edge, in line with the walls on either side
export const DOOR_EDGE_OFFSET = 0.42;

// Whether a step from one cell to the next goes through a door's plane (a
// door cell's door, wherever in the cell it stands - see DoorSpec.offset):
// a door in the middle or in the near half is gone through stepping into
// its cell, one in the far half stepping out of it. The door cell, or null.
export function doorCrossed(map: GameMap, from: Vec2, to: Vec2): Vec2 | null {
  const m = { x: Math.sign(to.x - from.x), y: Math.sign(to.y - from.y) };
  const along = (cell: Vec2) => {
    const spec = doorAt(map, cell.x, cell.y);
    const v = DIR_VECTOR[spec.facing];
    // where its plane is, along the step (0: the cell's middle)
    return (spec.offset ?? 0) * (v.x * m.x + v.y * m.y);
  };
  if (cellAt(map, to.x, to.y) === "door" && along(to) <= 1e-6) return to;
  if (cellAt(map, from.x, from.y) === "door" && along(from) > 1e-6) return from;
  return null;
}

export function cellAt(map: GameMap, x: number, y: number): CellType {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return "wall";
  return map.cells[y][x];
}

// floor and ceiling heights of a walkable cell (in wall heights)
export function floorHeight(map: GameMap, x: number, y: number): number {
  return map.floorHeights[y]?.[x] ?? 0;
}

export function ceilingHeight(map: GameMap, x: number, y: number): number {
  return map.ceilingHeights[y]?.[x] ?? 1;
}

// every wall panel a window takes: its cell, the wall, and where in the
// window it is (0 = leftmost, seen facing the wall)
export function windowPanels(map: GameMap): { cell: Vec2; wall: Direction; index: number; width: number }[] {
  return (map.windows ?? []).flatMap((w) => {
    const right = DIR_VECTOR[rightOf(w.wall)];
    return Array.from({ length: w.width }, (_, index) => ({
      cell: { x: w.cell.x + right.x * index, y: w.cell.y + right.y * index },
      wall: w.wall,
      index,
      width: w.width,
    }));
  });
}

export function bridgeAt(map: GameMap, x: number, y: number): BridgeSpec | undefined {
  return map.bridges?.find((b) => b.cell.x === x && b.cell.y === y);
}

export function liftAt(map: GameMap, cell: Vec2): LiftSpec | undefined {
  return map.lifts?.find((l) => l.cell.x === cell.x && l.cell.y === cell.y);
}

// the lift door of a lift cabin: the lift door facing away from it
export function liftDoorOf(map: GameMap, cabin: Vec2): DoorSpec | undefined {
  return map.doors?.find((d) => {
    const v = DIR_VECTOR[d.facing];
    return d.kind === "lift" && d.cell.x - v.x === cabin.x && d.cell.y - v.y === cabin.y;
  });
}

// the ladder on the edge between two neighboring cells, if there is one
export function ladderBetween(map: GameMap, a: Vec2, b: Vec2): LadderSpec | undefined {
  return map.ladders?.find((l) => {
    const v = DIR_VECTOR[l.wall];
    const top = { x: l.cell.x + v.x, y: l.cell.y + v.y };
    const at = (p: Vec2, q: Vec2) => p.x === q.x && p.y === q.y;
    return (at(l.cell, a) && at(top, b)) || (at(l.cell, b) && at(top, a));
  });
}
