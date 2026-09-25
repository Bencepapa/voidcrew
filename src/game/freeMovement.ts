import { cellAt, ceilingHeight, floorHeight } from "./map";
import { CLIMB_SPEED, MAX_STEP, MIN_HEADROOM } from "./heights";
import { DIR_VECTOR } from "./movement";
import type { Direction, GameMap, Vec2 } from "./types";

// Free (non-grid) movement: a continuous pose with circle-vs-grid collision.
// The grid game state (cell + facing, used by the minimap, logs and doors)
// follows the pose: nearest cell, nearest cardinal direction.

export interface FreePose {
  // world position in grid units (cell centers on integers)
  x: number;
  z: number;
  // height of the feet (wall heights): the floor underfoot, or on the way
  // down to it after stepping off a ledge
  y: number;
  // falling speed (wall heights per second), 0 when standing
  fallSpeed: number;
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
// stepping up onto a higher floor (wall heights per second)
const STEP_UP_SPEED = 1.5;
// wall heights per second squared (matches the grid movement's fall)
const FALL_GRAVITY = 12;
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

// Solid boxes of one cell, for feet at height `feet`. A wall, a floor too high
// to step onto and a ceiling too low to pass under block the whole cell (a
// lower floor doesn't: walking over its edge is a fall). A door stands
// across the middle of its cell (see GameViewport): closed, the whole door
// slab blocks; open, only its frame's two side pieces around the opening do.
// Either way the half-cell alcoves on both sides stay walkable.
function cellBoxes(map: GameMap, cx: number, cy: number, feet: number, doors: DoorState): Box[] {
  const type = cellAt(map, cx, cy);
  const whole = { minX: cx - 0.5, maxX: cx + 0.5, minZ: cy - 0.5, maxZ: cy + 0.5 };
  if (type === "wall") return [whole];
  const floor = floorHeight(map, cx, cy);
  if (floor > feet + MAX_STEP + 1e-6) return [whole];
  if (ceilingHeight(map, cx, cy) - Math.max(feet, floor) < MIN_HEADROOM - 1e-6) return [whole];
  if (type !== "door") return [];

  const northSouth = cellAt(map, cx, cy - 1) !== "wall" || cellAt(map, cx, cy + 1) !== "wall";
  const d = DOOR_FRAME_HALF_DEPTH;
  const o = doors.isOpen({ x: cx, y: cy }) ? DOOR_OPENING_HALF_WIDTH : 0;
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

// how close to a ladder's step face the player can hold on to it
const LADDER_REACH = PLAYER_RADIUS + 0.2;
// cells per second
const LADDER_BACK_OFF_SPEED = 1.5;

// the ladder in the cell at (x, z) within reach, with the direction it
// leads up and the floors it connects
function ladderInReach(map: GameMap, x: number, z: number) {
  const cx = Math.round(x);
  const cy = Math.round(z);
  for (const ladder of map.ladders ?? []) {
    if (ladder.cell.x !== cx || ladder.cell.y !== cy) continue;
    const dir = DIR_VECTOR[ladder.wall];
    // distance to the step face
    const gap = (cx + dir.x * 0.5 - x) * dir.x + (cy + dir.y * 0.5 - z) * dir.y;
    if (gap > LADDER_REACH) continue;
    return { dir, gap, bottom: floorHeight(map, cx, cy), top: floorHeight(map, cx + dir.x, cy + dir.y) };
  }
  return null;
}

// first blocking cell for a circle at (x, z), or null if the spot is free
function blockingCell(map: GameMap, x: number, z: number, feet: number, doors: DoorState): Vec2 | null {
  const r = PLAYER_RADIUS;
  for (let cy = Math.round(z - r); cy <= Math.round(z + r); cy++) {
    for (let cx = Math.round(x - r); cx <= Math.round(x + r); cx++) {
      if (cellBoxes(map, cx, cy, feet, doors).some((b) => circleHitsBox(x, z, r, b))) return { x: cx, y: cy };
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
  let y = pose.y;
  let fallSpeed = pose.fallSpeed;

  // On a ladder - within reach of it and off the floor, or pushing toward
  // it - moving toward the ladder climbs and away from it climbs down. Off
  // the floor the player hangs on: no walking off, no falling; only a push
  // toward the ladder moves on, which steps onto the ledge once high enough
  // (until then the step face blocks it). Walking over the ledge above a
  // ladder puts the player straight onto it.
  const ladder = ladderInReach(map, x, z);
  let hanging = false;
  if (ladder) {
    const push = scale ? (dx * ladder.dir.x + dz * ladder.dir.y) / (FREE_MOVE_SPEED * dt) : 0;
    if (y > ladder.bottom + 1e-3 || push > 0.3) {
      y = Math.min(ladder.top, Math.max(ladder.bottom, y + push * CLIMB_SPEED * dt));
      fallSpeed = 0;
      hanging = y > ladder.bottom + 1e-3 && push <= 0.3;
      // having stepped over the edge onto it, back off the step face (else
      // the ledge's cell would overlap, and block, the player at the bottom)
      const clear = PLAYER_RADIUS + 0.01 - ladder.gap;
      if (hanging && clear > 0) {
        const back = Math.min(clear, LADDER_BACK_OFF_SPEED * dt);
        x -= ladder.dir.x * back;
        z -= ladder.dir.y * back;
      }
    }
  }

  let bumpedDoor: Vec2 | null = null;
  const tryMove = (nx: number, nz: number) => {
    const hit = blockingCell(map, nx, nz, y, doors);
    if (!hit) return true;
    if (cellAt(map, hit.x, hit.y) === "door" && !doors.isOpen(hit)) bumpedDoor = hit;
    return false;
  };
  if (!hanging) {
    if (dx && tryMove(x + dx, z)) x += dx;
    if (dz && tryMove(x, z + dz)) z += dz;
  }

  // the floor under the player's center: step up onto it, or fall to it
  // (unless holding on to a ladder)
  const ground = floorHeight(map, Math.round(x), Math.round(z));
  const holding = ladderInReach(map, x, z);
  if (y < ground) {
    y = Math.min(ground, y + STEP_UP_SPEED * dt);
    fallSpeed = 0;
  } else if (y > ground && !(holding && y <= holding.top)) {
    fallSpeed += FALL_GRAVITY * dt;
    y = Math.max(ground, y - fallSpeed * dt);
    if (y === ground) fallSpeed = 0;
  }

  return { pose: { x, z, y, fallSpeed, yaw }, bumpedDoor };
}
