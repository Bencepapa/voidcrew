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

// the burning cells ("x,y"): a decorative fire (a torch) doesn't count, nor one that is switched off (`on`: whether the
// emitter with that index in the map's smokes is on - see emitterStore.ts emittersOn; unset: all are)
export function fireCells(map: GameMap, on?: (index: number) => boolean): Set<string> {
  return new Set((map.smokes ?? []).filter((s, i) => s.fire && !s.decorative && (!on || on(i))).map((s) => `${s.cell.x},${s.cell.y}`));
}
