// Testing aid: "Enemies inactive" freezes the hostile actors - they stay where they are and do not
// see, shoot, move or damage anyone; they are not removed (the crew can still shoot them), and the
// friendly townspeople, the crew's own turrets and the story go on. Which way it is set (pure; the
// stored choice and the hooks are in playPrefs.ts):
//   ?enemies=off (or on) in the URL speaks for this page load, else the switch stored in this browser.

import type { ActorState } from "./actors";

export const ENEMIES_STORAGE_KEY = "voidcrew-enemies-off";

// "?enemies=off" -> true (inactive), "?enemies=on" -> false, anything else: no say
export function enemiesParamChoice(search: string): boolean | null {
  const v = new URLSearchParams(search).get("enemies");
  return v === "off" ? true : v === "on" ? false : null;
}

// the stored switch ("1": inactive, "0": active, else none)
export function enemiesStoredChoice(raw: string | null): boolean | null {
  return raw === "1" ? true : raw === "0" ? false : null;
}

export const resolveEnemiesOff = (param: boolean | null, stored: boolean | null): boolean => param ?? stored ?? false;

// whom the switch holds still: whoever is neither a friendly one nor the crew's own
export const isEnemy = (a: Pick<ActorState, "friendly" | "ally">): boolean => !a.friendly && !a.ally;

// After a step of the actors (`stepped` came from `before`): the enemies are as they were before it
// (one that was walking finishes its step, it never starts another); the others are as stepped. The
// same array if nothing differs. `stepped` is never longer than `before` plus new arrivals (those
// have no earlier state: they are held where they appear).
export function holdEnemies(before: readonly ActorState[], stepped: ActorState[]): ActorState[] {
  const was = new Map(before.map((a) => [a.id, a]));
  let changed = false;
  const held = stepped.map((a) => {
    const old = was.get(a.id);
    if (!old || !isEnemy(a) || old === a) return a;
    changed = true;
    return old;
  });
  return changed ? held : stepped;
}
