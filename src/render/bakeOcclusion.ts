import { cellAt, ceilingHeight, floorHeight, wallFaceSpans } from "../game/mapGeometry";
import type { PropType } from "../game/props";
import type { Direction, GameMap } from "../game/types";
import type { SkyDirection } from "./skySampling";

export type LightBakeMap = Pick<GameMap, "width" | "height" | "cells" | "floorHeights" | "ceilingHeights" | "props" | "bridges"> & {
  sharedPropTypes?: Record<string, PropType>;
  skySurfaces?: Uint8Array;
};

const MARCH_STEP = 0.12;

// Bits in the worker's per-cell mask. Side bits denote sky-textured wall
// spans (portals) and the ceiling bit denotes an open roof.
export const SKY_CEILING = 1;
export const SKY_FACE = { E: 2, W: 4, S: 8, N: 16 } satisfies Record<Direction, number>;
const SIDES = ["E", "W", "S", "N"] as const;
const RAY_EPSILON = 1e-6;

// What else casts shadows in the bake: the props (but plants - they're
// mostly leaves and gaps) and the bridges' decks, as boxes (x, z in cells;
// y in wall heights) listed under each cell they reach into. Doors don't:
// the grid is baked once, as if they were all open.
export interface Occluder {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  skyOnly?: boolean;
  skyMaxY?: number;
}
// (per cell, row by row; none: an empty list)
export interface Occluders {
  width: number;
  cells: (Occluder[] | undefined)[];
}

const inside = (b: Occluder, x: number, y: number, z: number, top = b.maxY) =>
  x > b.minX && x < b.maxX && y > b.minY && y < top && z > b.minZ && z < b.maxZ;

// the box around a point in its cell, if any (but `skip`)
function blockedAt(occluders: Occluders, cx: number, cz: number, x: number, y: number, z: number, skip?: Occluder[]): boolean {
  if (cx < 0 || cx >= occluders.width || cz < 0) return false;
  const boxes = occluders.cells[cz * occluders.width + cx];
  if (!boxes) return false;
  return boxes.some((b) => inside(b, x, y, z) && !b.skyOnly && !skip?.includes(b));
}

// whether the line from a sample to a light crosses no wall, floor or
// ceiling, prop or bridge (the light's own cell doesn't count - it may sit
// in a wall, or on a prop)
export function clearLine(
  map: LightBakeMap,
  occluders: Occluders,
  px: number,
  py: number,
  pz: number,
  lx: number,
  ly: number,
  lz: number,
  lightCell: { x: number; z: number },
): boolean {
  const steps = Math.ceil(Math.hypot(lx - px, lz - pz, ly - py) / MARCH_STEP);
  // a sample inside a prop isn't in the prop's own shadow (its surfaces read
  // it, and they're lit as if it weren't there)
  const cx0 = Math.round(px);
  const cz0 = Math.round(pz);
  const own = cx0 >= 0 && cx0 < occluders.width && cz0 >= 0 ? (occluders.cells[cz0 * occluders.width + cx0] ?? []).filter((b) => inside(b, px, py, pz)) : [];
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const x = px + (lx - px) * t;
    const y = py + (ly - py) * t;
    const z = pz + (lz - pz) * t;
    const cx = Math.round(x);
    const cz = Math.round(z);
    if (cx === lightCell.x && cz === lightCell.z) continue;
    if (cellAt(map, cx, cz) === "wall") return false;
    if (y < floorHeight(map, cx, cz) - 1e-3 || y > ceilingHeight(map, cx, cz) + 1e-3) return false;
    if (blockedAt(occluders, cx, cz, x, y, z, own)) return false;
  }
  return true;
}

// Extend the same bake occluders to rays with no nearby light endpoint.
// Visit each cell up to the map edge or above the tallest geometry. Exact
// cell intervals avoid stepping over a thin roof or clipping a wall corner.
export function createSkyRayTest(map: LightBakeMap, occluders: Occluders) {
  const { width, height, skySurfaces } = map;
  let top = -Infinity;
  const spans: ReturnType<typeof wallFaceSpans>[] = [];
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (cellAt(map, x, z) === "wall") continue;
      const cell = z * width + x;
      const mask = skySurfaces?.[cell] ?? 0;
      top = Math.max(top, ceilingHeight(map, x, z));
      for (let side = 0; side < SIDES.length; side++) {
        const dir = SIDES[side];
        if (mask & SKY_FACE[dir]) continue;
        const faces = wallFaceSpans(map, { x, y: z }, dir);
        if (faces.length) spans[cell * 4 + side] = faces;
      }
    }
  }
  for (const boxes of occluders.cells) {
    for (const box of boxes ?? []) top = Math.max(top, box.skyMaxY ?? box.maxY);
  }

  const inMap = (x: number, z: number) => x >= 0 && x < width && z >= 0 && z < height;
  const hitsFace = (x: number, z: number, side: number, y: number) =>
    inMap(x, z) && spans[(z * width + x) * 4 + side]?.some(({ bottom, top }) =>
      y > bottom + RAY_EPSILON && y < top - RAY_EPSILON);

  return (px: number, py: number, pz: number, [dx, dy, dz]: SkyDirection): boolean => {
    let cx = Math.round(px);
    let cz = Math.round(pz);
    const stepX = dx < 0 ? -1 : 1;
    const stepZ = dz < 0 ? -1 : 1;
    const sideX = dx < 0 ? 1 : 0;
    const sideZ = dz < 0 ? 3 : 2;
    const strideX = dx ? Math.abs(1 / dx) : Infinity;
    const strideZ = dz ? Math.abs(1 / dz) : Infinity;
    let nextX = dx ? (cx + stepX * 0.5 - px) / dx : Infinity;
    let nextZ = dz ? (cz + stepZ * 0.5 - pz) / dz : Infinity;
    const end = dy > 0 ? Math.max(0, (top + RAY_EPSILON - py) / dy) : Infinity;
    let enter = 0;
    while (inMap(cx, cz)) {
      const cell = cz * width + cx;
      const exit = Math.min(nextX, nextZ, end);
      const y0 = py + dy * enter;
      const y1 = py + dy * exit;
      if (cellAt(map, cx, cz) !== "wall") {
        if (y0 < floorHeight(map, cx, cz) - RAY_EPSILON) return false;
        const ceiling = ceilingHeight(map, cx, cz);
        if (!((skySurfaces?.[cell] ?? 0) & SKY_CEILING) && y0 <= ceiling && y1 >= ceiling) return false;
      }
      const boxes = occluders.cells[cell];
      if (boxes?.some((box) => intersectsBox(box, px, py, pz, dx, dy, dz, enter, exit))) return false;
      if (exit === end) return true;

      // The two cells can each contribute a different face at this edge.
      const crossX = nextX === exit;
      const crossZ = nextZ === exit;
      if (crossX && (hitsFace(cx, cz, sideX, y1) || hitsFace(cx + stepX, cz, sideX ^ 1, y1))) return false;
      if (crossZ && (hitsFace(cx, cz, sideZ, y1) || hitsFace(cx, cz + stepZ, sideZ ^ 1, y1))) return false;
      if (crossX) {
        cx += stepX;
        nextX += strideX;
      }
      if (crossZ) {
        cz += stepZ;
        nextZ += strideZ;
      }
      enter = exit;
    }
    return true;
  };
}

function intersectsBox(
  box: Occluder, x: number, y: number, z: number, dx: number, dy: number, dz: number, enter: number, exit: number,
): boolean {
  const top = box.skyMaxY ?? box.maxY;
  for (const [origin, direction, min, max] of [
    [x, dx, box.minX, box.maxX], [y, dy, box.minY, top], [z, dz, box.minZ, box.maxZ],
  ]) {
    if (!direction) {
      if (origin <= min || origin >= max) return false;
      continue;
    }
    const first = (min - origin) / direction;
    const last = (max - origin) / direction;
    enter = Math.max(enter, Math.min(first, last));
    exit = Math.min(exit, Math.max(first, last));
    if (enter >= exit) return false;
  }
  return true;
}

