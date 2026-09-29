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
  // mounted on (or standing against) a wall: pushed toward a side of its
  // cell, it turns to face away from that wall, into the room
  wall?: boolean;
  // its relief's depth, relative to props' usual (softer for fabric)
  relief?: number;
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
      // how high above the floor it's mounted (wall heights); the parts'
      // y stays relative to the views
      elevation?: number;
      // the views' pixel sizes (npm run props:views prints them): each view
      // then covers its own extent at the front view's scale - an AI view
      // sheet rarely draws the side and top exactly as big as the front
      px?: { front: [number, number]; side: [number, number]; top: [number, number] };
    }
  | {
      // a walk-in box (a shower cabin) seen into through its front: a
      // cutout `door` (its glass see-through, with a pane of glass behind
      // it), the `inside` of its back wall, and <views>_side / _top outside
      kind: "cabin";
      door: string;
      inside: string;
      views: string;
    }
  | {
      // one upright relief cutout (its texture's transparent pixels left
      // out), `size` wide and tall, its bottom `elevation` above the floor,
      // facing +z - a curtain before a window, a picture on a stand; seen
      // from both sides
      kind: "panel";
      texture: string;
      elevation?: number;
    }
  | {
      // two such cutouts crossed at right angles (a potted plant): it reads
      // as solid from any side
      kind: "cross";
      texture: string;
    }
);

// Parts are measured off the views (see npm run props:views): x across the
// front view, y up it, z across the side view (+z = the front).
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

  // crew quarters
  crewbed1: {
    kind: "views",
    views: "crewbed1",
    size: [0.9, 0.376, 0.47],
    blocks: true,
    wall: true,
    parts: [
      // headboard; frame, mattress, pillow and blanket
      { min: [-0.45, 0, -0.235], max: [-0.37, 0.376, 0.235] },
      { min: [-0.37, 0, -0.235], max: [0.45, 0.3, 0.235] },
    ],
  },
  table1: {
    kind: "views",
    views: "table1",
    size: [0.5, 0.384, 0.41],
    blocks: true,
    px: { front: [562, 432], side: [463, 437], top: [536, 523] },
    parts: [
      // foot, pedestal, top (its edge band), and the mug on it
      { min: [-0.14, 0, -0.14], max: [0.14, 0.092, 0.14] },
      { min: [-0.035, 0.092, -0.035], max: [0.035, 0.25, 0.035] },
      { min: [-0.245, 0.25, -0.2], max: [0.245, 0.3, 0.2] },
      { min: [-0.155, 0.3, -0.14], max: [-0.07, 0.384, -0.03] },
    ],
  },
  foldtable1: {
    kind: "views",
    views: "foldtable1",
    size: [0.7, 0.262, 0.4],
    wall: true,
    elevation: 0.12,
    parts: [
      // wall plate, table top, brackets
      { min: [-0.22, 0, -0.2], max: [0.22, 0.262, -0.17] },
      { min: [-0.35, 0.162, -0.17], max: [0.35, 0.192, 0.2] },
      { min: [-0.3, 0, -0.17], max: [-0.22, 0.162, 0.1] },
      { min: [0.22, 0, -0.17], max: [0.3, 0.162, 0.1] },
    ],
  },
  shelf1: {
    kind: "views",
    views: "shelf1",
    size: [0.7, 0.415, 0.26],
    wall: true,
    elevation: 0.4,
    parts: [{ min: [-0.35, 0, -0.13], max: [0.35, 0.415, 0.13] }],
  },
  shower1: {
    kind: "cabin",
    views: "shower1",
    door: "shower1_door",
    inside: "shower1_inside",
    size: [0.5, 0.91, 0.42],
    blocks: true,
    wall: true,
  },
  kitchen1: {
    kind: "views",
    views: "kitchen1",
    size: [0.9, 0.614, 0.32],
    blocks: true,
    wall: true,
    px: { front: [739, 504], side: [263, 552], top: [744, 315] },
    parts: [
      // cabinets with the counter; microwave; kettle
      { min: [-0.45, 0, -0.109], max: [0.45, 0.43, 0.16] },
      { min: [-0.063, 0.43, -0.109], max: [0.27, 0.614, 0.08] },
      { min: [0.297, 0.43, -0.05], max: [0.405, 0.565, 0.06] },
    ],
  },
  curtain_closed: {
    kind: "panel",
    texture: "curtain_closed",
    size: [0.85, 0.75, 0.04],
    wall: true,
    elevation: 0.12,
    relief: 0.3,
  },
  curtain_open: { kind: "panel", texture: "curtain_open", size: [0.85, 0.75, 0.04], wall: true, elevation: 0.12, relief: 0.3 },
  plant1: { kind: "cross", texture: "plant1", size: [0.3, 0.58, 0.3] },
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

// the turn (degrees) that makes a wall prop face away from the wall it's
// pushed against (its front is +z, south, unturned)
const WALL_FACING: Partial<Record<PropAnchor, number>> = { N: 0, NE: 0, NW: 0, S: 180, SE: 180, SW: 180, E: 90, W: 270 };

export function propPlacement(spec: PropSpec): PropPlacement {
  const type = PROP_TYPES[spec.prop];
  const base = type.wall ? (WALL_FACING[spec.at] ?? 0) : 0;
  const yaw = ((base + (spec.rotation ?? 0)) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(yaw));
  const sin = Math.abs(Math.sin(yaw));
  const [length, , depth] = type.size;
  const reachX = (cos * length + sin * depth) / 2;
  const reachZ = (sin * length + cos * depth) / 2;
  const [ax, az] = ANCHOR_VECTOR[spec.at];
  const [ox, oz] = spec.offset ?? [0, 0];
  return {
    x: spec.cell.x + ax * Math.max(0, 0.5 - reachX - WALL_GAP) + ox,
    z: spec.cell.y + az * Math.max(0, 0.5 - reachZ - WALL_GAP) + oz,
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
      return { minX: x - reachX, maxX: x + reachX, minZ: z - reachZ, maxZ: z + reachZ, height: (p.elevation ?? 0) + type.size[1] };
    });
}

// whether a big prop closes the cell to grid movement
export function propBlocks(map: GameMap, cell: Vec2): boolean {
  return (map.props ?? []).some((p) => p.cell.x === cell.x && p.cell.y === cell.y && PROP_TYPES[p.prop].blocks);
}
