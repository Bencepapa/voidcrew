import type { GameMap } from "./types";

// Fire (see SmokeSpec.fire): a smoke emitter that burns - flames, dark smoke
// rising off them, a flickering light. Its cell burns whoever stands in it:
// the crew (one crewmate at a time, every FIRE_BURN_MS) and the actors (who
// won't walk into it). Whether a deck's fires are there is the ship's own
// hidden roll (ShipMood.fire), never shown on the scan.

export const FIRE_BURN_MS = 1000;
// what it does each time to a crewmate, and to an actor in it
export const FIRE_DAMAGE: [number, number] = [3, 6];
export const FIRE_ACTOR_DAMAGE = 6;

// the burning cells ("x,y")
export function fireCells(map: GameMap): Set<string> {
  return new Set((map.smokes ?? []).filter((s) => s.fire).map((s) => `${s.cell.x},${s.cell.y}`));
}
