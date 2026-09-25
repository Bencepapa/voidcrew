import { cellAt, ceilingHeight, floorHeight } from "./map";
import type { GameMap, Vec2 } from "./types";

// How far up a floor can step without a ladder, and down without a fall
// (in wall heights).
export const MAX_STEP = 0.25;
// the lowest opening the party fits through
export const MIN_HEADROOM = 0.75;

export type Passage =
  | { kind: "walk" }
  // stepping off a ledge: `height` is the fall
  | { kind: "drop"; height: number }
  | { kind: "blocked"; reason: "wall" | "ledge" | "low" };

// Whether the party can move from one walkable cell to a neighboring one,
// judged by their floors and ceilings (doors aside).
export function passage(map: GameMap, from: Vec2, to: Vec2): Passage {
  if (cellAt(map, to.x, to.y) === "wall") return { kind: "blocked", reason: "wall" };
  const fromFloor = floorHeight(map, from.x, from.y);
  const toFloor = floorHeight(map, to.x, to.y);
  const opening =
    Math.min(ceilingHeight(map, from.x, from.y), ceilingHeight(map, to.x, to.y)) - Math.max(fromFloor, toFloor);
  if (opening < MIN_HEADROOM - 1e-6) return { kind: "blocked", reason: "low" };
  const climb = toFloor - fromFloor;
  if (climb > MAX_STEP + 1e-6) return { kind: "blocked", reason: "ledge" };
  if (climb < -MAX_STEP - 1e-6) return { kind: "drop", height: -climb };
  return { kind: "walk" };
}
