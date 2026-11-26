import { cellAt, ceilingHeight, floorHeight } from "../game/mapGeometry";
import { SKY_CEILING, type LightBakeMap, type Occluders } from "./bakeOcclusion";

const EPSILON = 1e-6;
const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export function createSkyProbeOrigins(map: LightBakeMap, occluders: Occluders) {
  const surface = new Float64Array(map.width * map.height);
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const cell = z * map.width + x;
      if (cellAt(map, x, z) === "wall") {
        let top = -Infinity;
        // The faces on a wall cell are built from its walkable neighbors.
        for (const [dx, dz] of SIDES) {
          if (cellAt(map, x + dx, z + dz) !== "wall") {
            top = Math.max(top, ceilingHeight(map, x + dx, z + dz));
          }
        }
        surface[cell] = top === -Infinity ? ceilingHeight(map, x, z) : top;
      } else {
        surface[cell] = (map.skySurfaces?.[cell] ?? 0) & SKY_CEILING
          ? floorHeight(map, x, z) : ceilingHeight(map, x, z);
      }
    }
  }

  return (cell: number, x: number, y: number, z: number): number | undefined => {
    const base = surface[cell];
    if (y < base - EPSILON) return undefined;
    let origin = y <= base + EPSILON ? base + EPSILON : y;
    const boxes = occluders.cells[cell];
    if (boxes) {
      // Use the original height to identify this probe's boxes. A separate
      // box overhead must still occlude rays from the lifted origin.
      for (const box of boxes) {
        const top = box.skyMaxY ?? box.maxY;
        if (y >= box.minY && y < top && x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ) {
          origin = Math.max(origin, top);
        }
      }
    }
    return origin;
  };
}
