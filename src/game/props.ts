import type { GameMap, PropAnchor, PropSpec } from "./types";

// 3D props standing in walkable cells (crates, ...): relief boxes textured
// like the walls. They sit pushed against a side or a corner of their cell,
// so the party still passes (grid movement ignores them; free movement
// collides with their footprint).

export interface PropType {
  // footprint side (cells) and height (wall heights)
  size: number;
  height: number;
  // texture sets (renderer ids) of its sides and top
  side: string;
  top: string;
}

export const PROP_TYPES: Record<string, PropType> = {
  crate1: { size: 0.5, height: 0.4, side: "crate1", top: "crate1_top" },
};

// kept free between a prop and the walls it's pushed against (its relief
// sticks out a little past its footprint)
const WALL_GAP = 0.04;

const ANCHOR_VECTOR: Record<PropAnchor, [number, number]> = {
  center: [0, 0],
  N: [0, -1],
  S: [0, 1],
  E: [1, 0],
  W: [-1, 0],
  NE: [1, -1],
  NW: [-1, -1],
  SE: [1, 1],
  SW: [-1, 1],
};

export interface PropPlacement {
  // center of its footprint, world grid units
  x: number;
  z: number;
  // yaw in radians (clockwise seen from above, like the spec's degrees)
  yaw: number;
  // half the side of the axis-aligned square around its turned footprint
  reach: number;
  type: PropType;
}

export function propPlacement(spec: PropSpec): PropPlacement {
  const type = PROP_TYPES[spec.prop];
  const yaw = ((spec.rotation ?? 0) * Math.PI) / 180;
  const reach = (type.size / 2) * (Math.abs(Math.cos(yaw)) + Math.abs(Math.sin(yaw)));
  const [ax, az] = ANCHOR_VECTOR[spec.at];
  const shift = Math.max(0, 0.5 - reach - WALL_GAP);
  return { x: spec.cell.x + ax * shift, z: spec.cell.y + az * shift, yaw, reach, type };
}

// footprints of the props in a cell (axis-aligned around their turn), with
// their heights above the cell's floor
export function propBoxes(map: GameMap, cx: number, cy: number) {
  return (map.props ?? [])
    .filter((p) => p.cell.x === cx && p.cell.y === cy)
    .map((p) => {
      const { x, z, reach, type } = propPlacement(p);
      return { minX: x - reach, maxX: x + reach, minZ: z - reach, maxZ: z + reach, height: type.height };
    });
}
