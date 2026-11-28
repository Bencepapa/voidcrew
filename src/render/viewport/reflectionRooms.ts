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

// Separate narrow passages from adjoining rooms even when there is no door.
// Room cells fill at least one 2×2 square. Two square-filled rooms can also
// meet across a single open edge, so check the square along that edge as well.
export function reflectionRooms(map: RoomMap, wallHeight: number) {
  const rooms = new Map<number, ReflectionRoom>();
  const open = (x: number, z: number) => {
    const cell = map.cells[z]?.[x];
    return cell !== undefined && cell !== "wall" && cell !== "door";
  };
  const square = (x: number, z: number) => open(x, z) && open(x + 1, z) && open(x, z + 1) && open(x + 1, z + 1);
  const wide = (x: number, z: number) => square(x, z) || square(x - 1, z) || square(x, z - 1) || square(x - 1, z - 1);
  const connected = (x: number, z: number, nx: number, nz: number) => {
    const broad = wide(x, z);
    if (broad !== wide(nx, nz)) return false;
    if (!broad) return true;
    if (nx === x) return square(x, Math.min(z, nz)) || square(x - 1, Math.min(z, nz));
    return square(Math.min(x, nx), z) || square(Math.min(x, nx), z - 1);
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
    let sumX = 0, sumZ = 0;
    let flat = true;
    for (const cell of cells) {
      const cx = cell % map.width, cz = Math.floor(cell / map.width);
      sumX += cx; sumZ += cz;
      x0 = Math.min(x0, cx); x1 = Math.max(x1, cx);
      z0 = Math.min(z0, cz); z1 = Math.max(z1, cz);
      if (floorHeight(map, cx, cz) !== floor || ceilingHeight(map, cx, cz) !== ceiling || (map.ceilingTextureAt?.(cx, cz) ?? map.textures?.ceiling) === "sky") flat = false;
      for (const [nx, nz] of [[cx - 1, cz], [cx + 1, cz], [cx, cz - 1], [cx, cz + 1]]) {
        const next = nz * map.width + nx;
        if (!open(nx, nz) || rooms.has(next) || !connected(cx, cz, nx, nz)) continue;
        rooms.set(next, room);
        cells.push(next);
      }
    }
    if (flat && ceiling > floor && cells.length === (x1 - x0 + 1) * (z1 - z0 + 1)) {
      room.bounds = { min: [x0 - 0.5, floor * wallHeight, z0 - 0.5], max: [x1 + 0.5, ceiling * wallHeight, z1 + 0.5] };
      room.origin = [(x0 + x1) / 2, room.origin[1], (z0 + z1) / 2];
    } else {
      const midX = sumX / cells.length, midZ = sumZ / cells.length;
      let closest = start, distance = Infinity;
      for (const cell of cells) {
        const dx = cell % map.width - midX, dz = Math.floor(cell / map.width) - midZ;
        const nextDistance = dx * dx + dz * dz;
        if (nextDistance < distance || (nextDistance === distance && cell < closest)) {
          closest = cell;
          distance = nextDistance;
        }
      }
      const cx = closest % map.width, cz = Math.floor(closest / map.width);
      room.origin = [cx, (floorHeight(map, cx, cz) + ceilingHeight(map, cx, cz)) * wallHeight / 2, cz];
    }
    return room;
  };
}
