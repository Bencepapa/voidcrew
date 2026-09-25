import { bridgeAt, cellAt, ceilingHeight, floorHeight, ladderBetween } from "./map";
import type { Direction, GameMap, Vec2 } from "./types";

// How far up a floor can step without a ladder, and down without a fall
// (in wall heights).
export const MAX_STEP = 0.25;
// the lowest opening the party fits through
export const MIN_HEADROOM = 0.75;
// how long climbing a ladder takes per wall height (grid movement)
export const CLIMB_MS_PER_HEIGHT = 1000;
// climbing speed in free movement (wall heights per second)
export const CLIMB_SPEED = 1;
// a bridge deck's thickness below its walking surface, and its width
// (world units per cell) - narrow enough to step off in free movement even
// between walls (the player's center gets 0.3 from the middle there)
export const BRIDGE_THICKNESS = 0.06;
export const BRIDGE_WIDTH = 0.5;

export type Passage =
  // `y`: the height of the surface arrived on
  | { kind: "walk"; y: number }
  // stepping off a ledge: `height` is the fall
  | { kind: "drop"; y: number; height: number }
  // up or down a ladder
  | { kind: "climb"; y: number; height: number; up: boolean }
  | { kind: "blocked"; reason: "wall" | "ledge" | "low" };

function along(dir: Direction): "NS" | "EW" {
  return dir === "N" || dir === "S" ? "NS" : "EW";
}

// The heights the party can stand at in a cell, entering it moving in
// `dir` (or already in it, without): its floor, and a bridge's deck - only
// from the bridge's ends, i.e. moving along it.
export function surfaces(map: GameMap, cell: Vec2, dir?: Direction): number[] {
  const out = [floorHeight(map, cell.x, cell.y)];
  const bridge = bridgeAt(map, cell.x, cell.y);
  if (bridge && (!dir || bridge.axis === along(dir))) out.push(bridge.height);
  return out;
}

// the lowest thing overhead standing at height `y` in a cell: a bridge's
// underside, or the ceiling
export function spaceAbove(map: GameMap, cell: Vec2, y: number): number {
  const bridge = bridgeAt(map, cell.x, cell.y);
  if (bridge && bridge.height - BRIDGE_THICKNESS > y + 1e-6) return bridge.height - BRIDGE_THICKNESS;
  return ceilingHeight(map, cell.x, cell.y);
}

// Whether the party, standing at height `fromY` in a walkable cell, can
// move to a neighboring one - onto the highest surface there within a step
// of its feet (or down onto the only one lower), judged by the headroom and
// any ladder between the cells (doors aside).
export function passage(map: GameMap, from: Vec2, fromY: number, to: Vec2, dir: Direction): Passage {
  if (cellAt(map, to.x, to.y) === "wall") return { kind: "blocked", reason: "wall" };

  const fromFloor = floorHeight(map, from.x, from.y);
  const toFloor = floorHeight(map, to.x, to.y);
  // ladders connect the two cells' floors
  if (ladderBetween(map, from, to) && Math.abs(fromY - fromFloor) < 1e-6 && Math.abs(toFloor - fromY) > MAX_STEP + 1e-6) {
    if (headroom(map, from, fromY, to, toFloor) < MIN_HEADROOM - 1e-6) return { kind: "blocked", reason: "low" };
    return { kind: "climb", y: toFloor, height: Math.abs(toFloor - fromY), up: toFloor > fromY };
  }

  const reachable = surfaces(map, to, dir).filter((s) => s <= fromY + MAX_STEP + 1e-6);
  if (!reachable.length) return { kind: "blocked", reason: "ledge" };
  const y = Math.max(...reachable);
  if (headroom(map, from, fromY, to, y) < MIN_HEADROOM - 1e-6) return { kind: "blocked", reason: "low" };
  if (y < fromY - MAX_STEP - 1e-6) return { kind: "drop", y, height: fromY - y };
  return { kind: "walk", y };
}

// the opening between standing at `fromY` in one cell and `toY` in the next
function headroom(map: GameMap, from: Vec2, fromY: number, to: Vec2, toY: number): number {
  return Math.min(spaceAbove(map, from, fromY), spaceAbove(map, to, toY)) - Math.max(fromY, toY);
}

// Jumping down off a bridge onto the floor of the same cell: the fall, or
// null when not standing on one.
export function jumpDown(map: GameMap, cell: Vec2, y: number): number | null {
  const floor = floorHeight(map, cell.x, cell.y);
  if (y - floor <= MAX_STEP + 1e-6) return null;
  if (spaceAbove(map, cell, floor) - floor < MIN_HEADROOM - 1e-6) return null;
  return y - floor;
}

// the surface under feet at height `y` in a cell (grid state after free
// movement): the highest one not above them
export function standingHeight(map: GameMap, cell: Vec2, y: number): number {
  const below = surfaces(map, cell).filter((s) => s <= y + MAX_STEP + 1e-6);
  return below.length ? Math.max(...below) : floorHeight(map, cell.x, cell.y);
}
