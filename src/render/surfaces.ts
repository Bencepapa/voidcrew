import * as THREE from "three";
import { DIR_VECTOR } from "../game/movement";
import type { Direction, Vec2 } from "../game/types";

// The surfaces of a walkable cell: the walls around it (by the direction
// they're in, seen from the cell), its floor and its ceiling. Every surface
// is built as a +Z-facing panel centered on its origin (see reliefMesh.ts),
// then placed with the transform below.
export type Surface = Direction | "floor" | "ceiling";

// direction -> the Y rotation a wall panel needs so its front faces the
// walkable cell it belongs to
export const WALL_ROTATION: Record<Direction, number> = {
  N: 0,
  S: Math.PI,
  E: -Math.PI / 2,
  W: Math.PI / 2,
};

export function surfaceKey(cell: Vec2, surface: Surface): string {
  return `${cell.x},${cell.y},${surface}`;
}

export interface SurfaceFrame {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  // panel size: 1 x wallHeight for walls, 1 x 1 for floors and ceilings
  width: number;
  height: number;
}

// world heights of a cell's floor and ceiling
export interface CellLevels {
  floor: number;
  ceiling: number;
}

// The frame of a cell's surface. A wall's frame is its first panel: the one
// standing on the cell's floor (a taller wall stacks more panels above it).
export function surfaceFrame(cell: Vec2, surface: Surface, wallHeight: number, levels: CellLevels): SurfaceFrame {
  const euler = new THREE.Euler();
  const position = new THREE.Vector3();
  if (surface === "floor") {
    euler.set(-Math.PI / 2, 0, 0);
    position.set(cell.x, levels.floor, cell.y);
  } else if (surface === "ceiling") {
    euler.set(Math.PI / 2, 0, 0);
    position.set(cell.x, levels.ceiling, cell.y);
  } else {
    const v = DIR_VECTOR[surface];
    euler.set(0, WALL_ROTATION[surface], 0);
    position.set(cell.x + v.x * 0.5, levels.floor + wallHeight / 2, cell.y + v.y * 0.5);
  }
  return {
    position,
    quaternion: new THREE.Quaternion().setFromEuler(euler),
    width: 1,
    height: surface === "floor" || surface === "ceiling" ? 1 : wallHeight,
  };
}

// Surfaces lying in the same plane as `surface` of `cell`, within `reach`
// cells: the next panels along a straight wall, or the neighboring floor
// (ceiling) tiles. A decal overhanging its own panel continues onto these
// (onto a floor tile only if it's level with the decal's own: the projection
// box is shallow).
export function coplanarSurfaces(cell: Vec2, surface: Surface, reach: number): Vec2[] {
  const cells: Vec2[] = [];
  if (surface === "floor" || surface === "ceiling") {
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) cells.push({ x: cell.x + dx, y: cell.y + dy });
    }
    return cells;
  }
  // walls run perpendicular to the direction they're in
  const v = DIR_VECTOR[surface];
  const along = { x: Math.abs(v.y), y: Math.abs(v.x) };
  for (let i = -reach; i <= reach; i++) cells.push({ x: cell.x + along.x * i, y: cell.y + along.y * i });
  return cells;
}
