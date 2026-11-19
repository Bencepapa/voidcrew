import type { CellType, GameMap } from "./types";

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

// Bridge thickness below its walking surface and width across its cell.
export const BRIDGE_THICKNESS = 0.06;
export const BRIDGE_WIDTH = 0.5;
