// Remembers which shared lists were fetched in full this page load, so nothing lists the whole store twice.
// Opening the Assets window, opening the Shared maps dialog, the game's "this map needs an id that is not
// registered" effects and the background loader all ask through here; only an explicit Refresh forces a reload.
// Pure (no storage, no network of its own), so it can be tested.

export type LoadKind = "textures" | "images" | "props" | "doors" | "actors" | "sounds" | "shops" | "dialogues" | "heads";

const done = new Set<string>();
const inflight = new Map<string, Promise<void>>();
const slot = (kind: LoadKind, world: string) => `${kind}:${world}`;

export const isLoaded = (kind: LoadKind, world: string) => done.has(slot(kind, world));

/**
 * Runs `load` unless this list was already fetched in full (or is being fetched: then both callers share it).
 * `force` fetches again (the Refresh button); a failed load is not remembered.
 */
export function loadOnce(kind: LoadKind, world: string, load: () => Promise<unknown>, force = false): Promise<void> {
  const key = slot(kind, world);
  if (!force && done.has(key)) return Promise.resolve();
  const running = inflight.get(key);
  if (running) return running;
  const promise = (async () => {
    try {
      await load();
      done.add(key);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, promise);
  return promise;
}

/** For tests: forget everything. */
export function resetLoadGate() {
  done.clear();
  inflight.clear();
}
