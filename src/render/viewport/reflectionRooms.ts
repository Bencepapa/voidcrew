import { ceilingHeight, floorHeight } from "../../game/mapGeometry";
import type { GameMap } from "../../game/types";

type RoomMap = Pick<GameMap, "width" | "height" | "cells" | "floorHeights" | "ceilingHeights" | "textures" | "ceilingTextureAt">;
type Point = [x: number, y: number, z: number];

export interface ReflectionRoom {
  origin: Point;
  bounds?: { min: Point; max: Point };
}

export const BOX_PROJECT_REFLECTION = `
vec3 roomReflectionDirection(vec3 position, vec3 direction) {
  if (!uProjectReflection || any(lessThan(position, uRoomMin)) || any(greaterThan(position, uRoomMax))) return direction;
  vec3 distanceToSide = mix(position - uRoomMin, uRoomMax - position, step(0.0, direction));
  vec3 axis = abs(direction);
  vec3 travel = mix(vec3(100000.0), distanceToSide / max(axis, vec3(0.00001)), step(0.00001, axis));
  return position + direction * min(travel.x, min(travel.y, travel.z)) - uRoomCaptureOrigin;
}`;

// Doors delimit capture regions, including when open. Irregular rooms and
// outdoor areas still share a capture but use the uncorrected reflection ray.
export function reflectionRooms(map: RoomMap, wallHeight: number) {
  const rooms = new Map<number, ReflectionRoom>();
  const open = (x: number, z: number) => {
    const cell = map.cells[z]?.[x];
    return cell !== undefined && cell !== "wall" && cell !== "door";
  };
  return (x: number, z: number): ReflectionRoom | undefined => {
    if (!open(x, z)) return;
    const start = z * map.width + x;
    const known = rooms.get(start);
    if (known) return known;
    const floor = floorHeight(map, x, z);
    const ceiling = ceilingHeight(map, x, z);
    const room: ReflectionRoom = { origin: [x, (floor + ceiling) * wallHeight / 2, z] };
    const cells = [start];
    rooms.set(start, room);
    let x0 = x, x1 = x, z0 = z, z1 = z;
    let flat = true;
    for (const cell of cells) {
      const cx = cell % map.width, cz = Math.floor(cell / map.width);
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
      z0 = Math.min(z0, cz); z1 = Math.max(z1, cz);
      if (floorHeight(map, cx, cz) !== floor || ceilingHeight(map, cx, cz) !== ceiling || (map.ceilingTextureAt?.(cx, cz) ?? map.textures?.ceiling) === "sky") flat = false;
      for (const [nx, nz] of [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]]) {
        const next = nz * map.width + nx;
        if (!open(nx, nz) || rooms.has(next)) continue;
        rooms.set(next, room);
        cells.push(next);
      }
    }
    if (flat && ceiling > floor && cells.length === (x1 - x0 + 1) * (z1 - z0 + 1)) {
      room.bounds = { min: [x0 - 0.5, floor * wallHeight, z0 - 0.5], max: [x1 + 0.5, ceiling * wallHeight, z1 + 0.5] };
      room.origin = [(x0 + x1) / 2, room.origin[1], (z0 + z1) / 2];
    }
    return room;
  };
}
