import { emitterOn } from "./emitters";
import { emitterView } from "./emitterStore";
import type { Vec2 } from "./types";

// The sound emitters as the switches (levers, buttons, plates - see operables.ts) work them: a target of kind "sound"
// addresses sounds by their cell (+ `index`), an `id` or an `area`, as a smoke emitter is, and switches them on, off or
// over. The runtime keeps the result in the operable state's `emit` record (the one smoke emitters use) under keys with a
// "sound:" prefix, and publishes it through emitterView; the sound system reads it (`soundsOn`) instead of the map's own
// `active`, which is only where a sound starts. The map itself is never edited.

export const SOUND_KEY_PREFIX = "sound:";

interface SoundLike {
  x: number;
  y: number;
  id?: string;
  active?: boolean;
}

// the sounds in the shape the addressing (emitters.ts `resolveAddress`) wants: a cell, an id
export const soundEntries = (sounds: readonly SoundLike[] | undefined): { cell: Vec2; id?: string; active?: boolean }[] =>
  (sounds ?? []).map((s) => ({ cell: { x: s.x, y: s.y }, id: s.id, active: s.active }));

// "sound:x,y" for the first sound in a cell, "sound:x,y#2" for the second...: what the state knows a sound by
export function soundKeys(sounds: readonly SoundLike[] | undefined): string[] {
  const seen = new Map<string, number>();
  return (sounds ?? []).map((s) => {
    const base = `${s.x},${s.y}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${SOUND_KEY_PREFIX}${n === 1 ? base : `${base}#${n}`}`;
  });
}

// whether a sound is on: what a switch said, else its own `active` (on unless it says false)
export const soundOn = (spec: { active?: boolean }, key: string, on: Readonly<Record<string, boolean>>): boolean => emitterOn(spec, key, on);

// For the sound system: whether each sound of `map` is on (by its index), as the operable runtime has it right now. The
// view is read when asked, so the function stays right as switches are thrown.
export function soundsOn(map: { id: string; sounds?: readonly SoundLike[] }): (index: number) => boolean {
  const keys = soundKeys(map.sounds);
  return (index) => {
    const spec = map.sounds?.[index];
    if (!spec) return false;
    const view = emitterView.get();
    return soundOn(spec, keys[index], view.mapId === map.id ? view.on : {});
  };
}
