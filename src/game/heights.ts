import { cellAt, ceilingHeight, floorHeight, ladderBetween } from "./map";
import type { GameMap, Vec2 } from "./types";

// How far up a floor can step without a ladder, and down without a fall
// (in wall heights).
export const MAX_STEP = 0.25;
// the lowest opening the party fits through
export const MIN_HEADROOM = 0.75;
// how long climbing a ladder takes per wall height (grid movement)
export const CLIMB_MS_PER_HEIGHT = 1000;
// climbing speed in free movement (wall heights per second)
export const CLIMB_SPEED = 1;

export type Passage =
  | { kind: "walk" }
  // stepping off a ledge: `height` is the fall
  | { kind: "drop"; height: number }
  // up or down a ladder
  | { kind: "climb"; height: number; up: boolean }
  | { kind: "blocked"; reason: "wall" | "ledge" | "low" };

// Whether the party can move from one walkable cell to a neighboring one,
// judged by their floors and ceilings and any ladder between them (doors
// aside).
export function passage(map: GameMap, from: Vec2, to: Vec2): Passage {
  if (cellAt(map, to.x, to.y) === "wall") return { kind: "blocked", reason: "wall" };
  const fromFloor = floorHeight(map, from.x, from.y);
  const toFloor = floorHeight(map, to.x, to.y);
  const opening =
    Math.min(ceilingHeight(map, from.x, from.y), ceilingHeight(map, to.x, to.y)) - Math.max(fromFloor, toFloor);
  if (opening < MIN_HEADROOM - 1e-6) return { kind: "blocked", reason: "low" };
  const climb = toFloor - fromFloor;
  if (Math.abs(climb) > MAX_STEP + 1e-6 && ladderBetween(map, from, to)) {
    return { kind: "climb", height: Math.abs(climb), up: climb > 0 };
  }
  if (climb > MAX_STEP + 1e-6) return { kind: "blocked", reason: "ledge" };
  if (climb < -MAX_STEP - 1e-6) return { kind: "drop", height: -climb };
  return { kind: "walk" };
}
