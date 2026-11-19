import { useSyncExternalStore } from "react";
import type { WorldId } from "../game/worlds";
import { bundledImages } from "../game/sharedBuiltins";

export type SharedImageType = "portrait" | "decal";
export type DecalSurfaceKind = "wall" | "floor" | "ceiling";

export interface SharedImage {
  id: string;
  world: WorldId;
  type: SharedImageType;
  name: string;
  width: number;
  height: number;
  surface?: DecalSurfaceKind;
  url: string;
}

const worlds = new Map<WorldId, SharedImage[]>();
const listeners = new Set<() => void>();
const decalListeners = new Set<(ids: ReadonlySet<string>) => void>();
const builtins: SharedImage[] = Object.entries(bundledImages).map(([id, entry]) => ({
  ...entry, id, url: `${import.meta.env.BASE_URL}shared-images/${id}.png`,
}));
let snapshot: readonly SharedImage[] = builtins;

export const getSharedImages = () => snapshot;
export const sharedImage = (id: string) => snapshot.find((image) => image.id === id);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useSharedImages = () => useSyncExternalStore(subscribe, getSharedImages);
export function onSharedDecalsChanged(listener: (ids: ReadonlySet<string>) => void): () => void {
  decalListeners.add(listener);
  return () => { decalListeners.delete(listener); };
}

export function setSharedImages(world: WorldId, images: SharedImage[]) {
  images = images.filter(image => !Object.hasOwn(bundledImages, image.id));
  const before = worlds.get(world) ?? [];
  if (JSON.stringify(before) === JSON.stringify(images)) return;
  worlds.set(world, images);
  snapshot = [...builtins, ...[...worlds.values()].flat()];
  for (const listener of listeners) listener();
  const oldDecals = new Map(before.filter(i => i.type === "decal").map(i => [i.id, i.url]));
  const newDecals = new Map(images.filter(i => i.type === "decal").map(i => [i.id, i.url]));
  const changed = new Set([...oldDecals.keys(), ...newDecals.keys()].filter(id => oldDecals.get(id) !== newDecals.get(id)));
  if (changed.size) for (const listener of decalListeners) listener(changed);
}
