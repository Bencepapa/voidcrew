// What the operable props look like right now (a lever down, a button sunk, a plate pressed): the game publishes it, the
// viewport draws it (see GameViewport's syncOperables). A tiny store, so neither has to carry it through App's props.
// `on` is by source key (see operables.ts operableSources); `mapId`: the deck it is about.

export interface OperableView {
  mapId: string;
  on: Readonly<Record<string, boolean>>;
}

let view: OperableView = { mapId: "", on: {} };
const listeners = new Set<() => void>();

export const operableView = {
  get: (): OperableView => view,
  set(next: OperableView) {
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
