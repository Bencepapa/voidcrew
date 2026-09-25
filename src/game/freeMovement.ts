import { cellAt } from "./map";
import type { Direction, GameMap, Vec2 } from "./types";

// Free (non-grid) movement: a continuous pose with circle-vs-grid collision.
// The grid game state (cell + facing, used by the minimap, logs and doors)
// follows the pose: nearest cell, nearest cardinal direction.

export interface FreePose {
  // world position in grid units (cell centers on integers)
  x: number;
  z: number;
  // heading, radians clockwise from north
  yaw: number;
}

export interface FreeInput {
  // -1..1: strafe right+ / forward+
  moveX: number;
  moveY: number;
  // -1..1: turn right+
  turn: number;
}

export interface DoorState {
  isOpen: (cell: Vec2) => boolean;
}

export const FREE_MOVE_SPEED = 1.6; // cells per second
export const FREE_TURN_SPEED = 2.4; // radians per second
const PLAYER_RADIUS = 0.2;
// an open door frame (see GameViewport's door): a slab this thick around
// the cell's center plane, open only this far either side of the middle
const DOOR_FRAME_HALF_DEPTH = 0.08;
const DOOR_OPENING_HALF_WIDTH = 0.34;

const DIRECTIONS: Direction[] = ["N", "E", "S", "W"];

export function yawOf(dir: Direction): number {
  return (DIRECTIONS.indexOf(dir) * Math.PI) / 2;
}

export function nearestDirection(yaw: number): Direction {
  const quarter = Math.round(yaw / (Math.PI / 2));
  return DIRECTIONS[((quarter % 4) + 4) % 4];
}

export function forwardOf(yaw: number): { x: number; z: number } {
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

export function poseCell(pose: FreePose): Vec2 {
  return { x: Math.round(pose.x), y: Math.round(pose.z) };
}

interface Box {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function circleHitsBox(x: number, z: number, r: number, b: Box): boolean {
  const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
  const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
  return dx * dx + dz * dz < r * r;
}

// Solid boxes of one cell. A closed door fills its cell; an open door leaves
// its frame's two side pieces standing around the opening.
function cellBoxes(map: GameMap, cx: number, cy: number, doors: DoorState): Box[] {
  const type = cellAt(map, cx, cy);
  const full = { minX: cx - 0.5, maxX: cx + 0.5, minZ: cy - 0.5, maxZ: cy + 0.5 };
  if (type === "wall") return [full];
  if (type !== "door") return [];
  if (!doors.isOpen({ x: cx, y: cy })) return [full];

  const northSouth = cellAt(map, cx, cy - 1) !== "wall" || cellAt(map, cx, cy + 1) !== "wall";
  const d = DOOR_FRAME_HALF_DEPTH;
  const o = DOOR_OPENING_HALF_WIDTH;
  return northSouth
    ? [
        { minX: cx - 0.5, maxX: cx - o, minZ: cy - d, maxZ: cy + d },
        { minX: cx + o, maxX: cx + 0.5, minZ: cy - d, maxZ: cy + d },
      ]
    : [
        { minX: cx - d, maxX: cx + d, minZ: cy - 0.5, maxZ: cy - o },
        { minX: cx - d, maxX: cx + d, minZ: cy + o, maxZ: cy + 0.5 },
      ];
}

// first blocking cell for a circle at (x, z), or null if the spot is free
function blockingCell(map: GameMap, x: number, z: number, doors: DoorState): Vec2 | null {
  const r = PLAYER_RADIUS;
  for (let cy = Math.round(z - r); cy <= Math.round(z + r); cy++) {
    for (let cx = Math.round(x - r); cx <= Math.round(x + r); cx++) {
      if (cellBoxes(map, cx, cy, doors).some((b) => circleHitsBox(x, z, r, b))) return { x: cx, y: cy };
    }
  }
  return null;
}

// Advances the pose by `dt` seconds. Movement is resolved one axis at a time
// so the player slides along walls instead of sticking to them. Returns the
// new pose and the closed door cell bumped into, if any (bumping opens it).
export function stepFreePose(
  pose: FreePose,
  input: FreeInput,
  dt: number,
  map: GameMap,
  doors: DoorState,
): { pose: FreePose; bumpedDoor: Vec2 | null } {
  const yaw = pose.yaw + input.turn * FREE_TURN_SPEED * dt;
  const fwd = forwardOf(yaw);
  // right-hand vector: forward rotated 90 degrees clockwise
  const right = { x: -fwd.z, z: fwd.x };
  const len = Math.hypot(input.moveX, input.moveY);
  const scale = (len > 1 ? 1 / len : 1) * FREE_MOVE_SPEED * dt;
  const dx = (fwd.x * input.moveY + right.x * input.moveX) * scale;
  const dz = (fwd.z * input.moveY + right.z * input.moveX) * scale;

  let x = pose.x;
  let z = pose.z;
  let bumpedDoor: Vec2 | null = null;
  const tryMove = (nx: number, nz: number) => {
    const hit = blockingCell(map, nx, nz, doors);
    if (!hit) return true;
    if (cellAt(map, hit.x, hit.y) === "door" && !doors.isOpen(hit)) bumpedDoor = hit;
    return false;
  };
  if (dx && tryMove(x + dx, z)) x += dx;
  if (dz && tryMove(x, z + dz)) z += dz;

  return { pose: { x, z, yaw }, bumpedDoor };
}
