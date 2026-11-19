import { DIR_VECTOR } from "./movement";
import type { CellType, Direction, GameMap, Vec2 } from "./types";

export function cellAt(map: Pick<GameMap, "width" | "height" | "cells">, x: number, y: number): CellType {
  if (y < 0 || y >= map.height || x < 0 || x >= map.width) return "wall";
  return map.cells[y][x];
}

// Floor and ceiling heights of a walkable cell, in wall heights.
export function floorHeight(map: Pick<GameMap, "floorHeights">, x: number, y: number): number {
  return map.floorHeights[y]?.[x] ?? 0;
}

export function ceilingHeight(map: Pick<GameMap, "ceilingHeights">, x: number, y: number): number {
  return map.ceilingHeights[y]?.[x] ?? 1;
}

export type WallFacePart = "riser" | "header";

export function wallFaceSpans(
  map: Pick<GameMap, "width" | "height" | "cells" | "floorHeights" | "ceilingHeights">,
  { x, y }: Vec2,
  side: Direction,
): { bottom: number; top: number; part?: WallFacePart }[] {
  if (cellAt(map, x, y) === "wall") return [];
  const offset = DIR_VECTOR[side];
  const nx = x + offset.x, ny = y + offset.y;
  const floor = floorHeight(map, x, y), ceiling = ceilingHeight(map, x, y);
  if (cellAt(map, nx, ny) === "wall") return [{ bottom: floor, top: ceiling }];
  const farFloor = floorHeight(map, nx, ny), farCeiling = ceilingHeight(map, nx, ny);
  const faces: ReturnType<typeof wallFaceSpans> = [];
  if (farFloor > floor) faces.push({ bottom: floor, top: Math.min(ceiling, farFloor), part: "riser" });
  if (farCeiling < ceiling) faces.push({ bottom: Math.max(floor, farCeiling), top: ceiling, part: "header" });
  return faces;
}

// Bridge thickness below its walking surface and width across its cell.
export const BRIDGE_THICKNESS = 0.06;
export const BRIDGE_WIDTH = 0.5;
