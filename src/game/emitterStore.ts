import { emitterOn, smokeKeys } from "./emitters";
import type { GameMap } from "./types";

// Which smoke / fire emitters are on right now (see emitters.ts): the operable runtime publishes it, the viewport shows
// only the emitters that are on while playing, the fire's burn reads it. A tiny store like operableStore.ts.
//   mapId   the deck it is about
//   playing the game is running this deck (not the map editor): inactive emitters are hidden then; the editor shows all
//   on      by emitter key (see smokeKeys): only the ones a switch has set - the rest follow their own `active`

export interface EmitterView {
  mapId: string;
  playing: boolean;
  on: Readonly<Record<string, boolean>>;
}

let view: EmitterView = { mapId: "", playing: false, on: {} };
const listeners = new Set<() => void>();

export const emitterView = {
  get: (): EmitterView => view,
  set(next: EmitterView) {
    view = next;
    for (const fn of [...listeners]) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

// whether each emitter of `map` is on (by its index in the map's smokes), for what runs: the fire's burn
export function emittersOn(map: Pick<GameMap, "id" | "smokes">): (index: number) => boolean {
  const v = view;
  const keys = smokeKeys(map.smokes);
  return (index) => {
    const spec = map.smokes?.[index];
    return !!spec && emitterOn(spec, keys[index], v.mapId === map.id ? v.on : {});
  };
}

// whether each emitter of `map` is drawn (by index): while playing only the ones that are on, in the editor all
export function emittersShown(map: Pick<GameMap, "id" | "smokes">): boolean[] {
  const v = view;
  const keys = smokeKeys(map.smokes);
  const live = v.playing && v.mapId === map.id;
  return (map.smokes ?? []).map((spec, i) => !live || emitterOn(spec, keys[i], v.on));
}
