import { useSyncExternalStore } from "react";
import type { Area } from "../game/emitters";

// The block of cells selected in the zoomed minimap (App's `miniSel`), for the operable props' panel: its "Add the selected
// area" buttons turn it into a target that works every emitter / dormant NPC / dormant item inside it (see operables.ts).
// App publishes the selection here; a tiny store, so the panel needs no props passed down to it.

let area: Area | null = null;
const listeners = new Set<() => void>();

export const operableArea = {
  get: (): Area | null => area,
  set(next: Area | null) {
    if (JSON.stringify(next) === JSON.stringify(area)) return;
    area = next;
    for (const fn of [...listeners]) fn();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export const useOperableArea = (): Area | null => useSyncExternalStore(operableArea.subscribe, operableArea.get);
