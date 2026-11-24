import { useSyncExternalStore } from "react";
import type { SourceRef } from "./operableEdits";

// Link mode of the operable props' targets: the Inspector's "Link a target" button starts it for the selected source,
// and while it is on a click in the view (a door, a wall trap) is not an edit but the target to link (see App's onEdit and
// the viewport's door pick). Esc or the button ends it. A tiny store, so the panel and the editor's click handler need
// no props passed between them.

let mode: SourceRef | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((fn) => fn());

export const operableLink = {
  get: (): SourceRef | null => mode,
  active: (): boolean => mode !== null,
  start(ref: SourceRef) {
    mode = ref;
    emit();
  },
  cancel() {
    if (mode === null) return;
    mode = null;
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

export const useOperableLink = (): SourceRef | null => useSyncExternalStore(operableLink.subscribe, operableLink.get);
