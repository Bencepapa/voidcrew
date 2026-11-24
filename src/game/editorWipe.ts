// What happens when the whole crew is down (the pure parts; see useGameState's wipeIfDown).
//
// In play the run is lost (the wipe screen, then the respawn or the base). While the map editor is on
// nothing may be lost for it: the crew is revived in place at full health and the wipe state is never
// set - no respawn, no change of map, no failed run - so the map on screen (and its unsaved edits,
// which live in editor/mapStore.ts and are untouched by all of this) stays as it is. A wipe that
// happened in play, before the editor was opened, is not touched: it is shown when the editor is left.

import type { Crewmate } from "./types";

export type WipeOutcome = "none" | "wipe" | "revive";

export function wipeOutcome(crew: readonly Pick<Crewmate, "hp">[], alreadyWiped: boolean, editing: boolean): WipeOutcome {
  if (alreadyWiped || !crew.length || !crew.every((c) => c.hp === 0)) return "none";
  return editing ? "revive" : "wipe";
}

// everyone back on their feet at full health, where they are (energy and the rest as they were)
export const reviveCrew = (crew: readonly Crewmate[]): Crewmate[] => crew.map((c) => ({ ...c, hp: c.maxHp }));
