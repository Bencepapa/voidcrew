import { DIR_VECTOR } from "./movement";
import type { CellType, DoorSpec, GameMap, LadderSpec, Vec2 } from "./types";
import { parseMap } from "./mapFormat";
import type { MapFile } from "./mapFormat";
import deck2File from "../maps/deck2-engineering.json";

// (1,1) is the lift the player arrives in, (2,1) its door
export const deck2Engineering: GameMap = parseMap(deck2File as MapFile);

// the door spec of a door cell; unlisted door cells are standard doors
// whose front faces along the passage
export function doorAt(map: GameMap, x: number, y: number): DoorSpec {
  const spec = map.doors?.find((d) => d.cell.x === x && d.cell.y === y);
  if (spec) return spec;
  const northSouth = cellAt(map, x, y - 1) !== "wall" || cellAt(map, x, y + 1) !== "wall";
  return { cell: { x, y }, kind: "standard", facing: northSouth ? "S" : "E" };
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

// the ladder on the edge between two neighboring cells, if there is one
export function ladderBetween(map: GameMap, a: Vec2, b: Vec2): LadderSpec | undefined {
  return map.ladders?.find((l) => {
    const v = DIR_VECTOR[l.wall];
    const top = { x: l.cell.x + v.x, y: l.cell.y + v.y };
    const at = (p: Vec2, q: Vec2) => p.x === q.x && p.y === q.y;
    return (at(l.cell, a) && at(top, b)) || (at(l.cell, b) && at(top, a));
  });
}
