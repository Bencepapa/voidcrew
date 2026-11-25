// The cells the engine counts as seen from the party (see updateSight in GameViewport and game/visibility.ts): the viewport
// publishes the set whenever it changes, the minimap can show it ("what does the engine see?"). A walls cell counts as seen
// when a sight line reaches it, so the set holds the walls around the visible floor as well.
import { useSyncExternalStore } from "react";

let current: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function publishSight(cells: ReadonlySet<string>) {
  current = cells;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

/** The cells ("x,y") in sight now. */
export function useSightCells(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, () => current);
}