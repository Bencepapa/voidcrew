import type { GameMap, PropAnchor, PropSpec, Vec2 } from "./types";

// 3D props standing in walkable cells (crates, beds, ...), textured like the
// walls. They sit pushed against a side or a corner of their cell. Small
// ones let the party pass (grid movement ignores them; free movement
// collides with their footprint); big ones (`blocks`) close their cell to
// grid movement too.

// Box parts in the prop's own space: x along its length, y up from the
// floor, z across (+z = the front, the side its front view shows).
export interface PropPart {
  min: [number, number, number];
  max: [number, number, number];
}

export type PropType = {
  // extent (cells; height in wall heights): x length, y height, z depth
  size: [number, number, number];
  blocks?: boolean;
} & (
  | {
      // a relief box: `side` texture set on its four sides, `top` on top
      kind: "box";
      side: string;
      top: string;
    }
  | {
      // box parts projection-textured from orthographic views: texture
      // sets <views>_front (looking at +z's side, x to the right), _side
      // (looking from +x, the front to the left) and _top (from above, x to
      // the right, the front at the bottom), each covering the whole
      // extent
      kind: "views";
      views: string;
      parts: PropPart[];
    }
);

export const PROP_TYPES: Record<string, PropType> = {
  crate1: { kind: "box", size: [0.5, 0.4, 0.5], side: "crate1", top: "crate1_top" },
  // a hospital bed, headboard at -x; parts measured off its front view
  medbed1: {
    kind: "views",
    views: "medbed1",
    size: [0.9, 0.37, 0.4],
    blocks: true,
    parts: [
      // headboard posts and panel, footboard
      { min: [-0.45, 0, -0.2], max: [-0.387, 0.37, 0.2] },
      { min: [-0.387, 0, -0.2], max: [-0.33, 0.32, 0.2] },
      { min: [0.387, 0, -0.2], max: [0.45, 0.293, 0.2] },
      // frame, mattress and legs; the pillow on top
      { min: [-0.33, 0, -0.2], max: [0.387, 0.241, 0.2] },
      { min: [-0.35, 0.241, -0.116], max: [-0.22, 0.276, 0.12] },
    ],
  },
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
  // half extents of the axis-aligned box around its turned footprint
  reachX: number;
  reachZ: number;
  type: PropType;
}

export function propPlacement(spec: PropSpec): PropPlacement {
  const type = PROP_TYPES[spec.prop];
  const yaw = ((spec.rotation ?? 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const [length, , depth] = type.size;
  const reachX = (cos * length + sin * depth) / 2;
  const reachZ = (sin * length + cos * depth) / 2;
  const [ax, az] = ANCHOR_VECTOR[spec.at];
  return {
    x: spec.cell.x + ax * Math.max(0, 0.5 - reachX - WALL_GAP),
    z: spec.cell.y + az * Math.max(0, 0.5 - reachZ - WALL_GAP),
    yaw,
    reachX,
    reachZ,
    type,
  };
}

// footprints of the props in a cell (axis-aligned around their turn), with
// their heights above the cell's floor
export function propBoxes(map: GameMap, cx: number, cy: number) {
  return (map.props ?? [])
    .filter((p) => p.cell.x === cx && p.cell.y === cy)
    .map((p) => {
      const { x, z, reachX, reachZ, type } = propPlacement(p);
      return { minX: x - reachX, maxX: x + reachX, minZ: z - reachZ, maxZ: z + reachZ, height: type.size[1] };
    });
}

// whether a big prop closes the cell to grid movement
export function propBlocks(map: GameMap, cell: Vec2): boolean {
  return (map.props ?? []).some((p) => p.cell.x === cell.x && p.cell.y === cell.y && PROP_TYPES[p.prop].blocks);
}
