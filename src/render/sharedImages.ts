import { useSyncExternalStore } from "react";
import type { WorldId } from "../game/worlds";
import { bundledImages } from "../game/sharedBuiltins";
import { ITEM_TYPES, isSharedPickupId, type PickupAppearance } from "../game/items";
import { pickupValue } from "../game/pickupValue";
import { textureFolder, type TextureSetFiles } from "./textureSets";

export type SharedImageType = "portrait" | "decal" | "item";
export type DecalSurfaceKind = "wall" | "floor" | "ceiling";
// The stored type "portrait" covers every still image; this says which one it is.
// A legacy image without a purpose is a portrait.
export type ImagePurpose = "loading" | "portrait" | "room";
export const IMAGE_PURPOSES: readonly ImagePurpose[] = ["loading", "portrait", "room"];
export const isImagePurpose = (value: unknown): value is ImagePurpose =>
  value === "loading" || value === "portrait" || value === "room";

export interface SharedImage {
  id: string;
  world: WorldId;
  type: SharedImageType;
  name: string;
  width: number;
  height: number;
  surface?: DecalSurfaceKind;
  purpose?: ImagePurpose;
  url: string;
  // a decal's own normal map (absent: the game makes one from the picture's brightness)
  normalUrl?: string;
  pickup?: PickupAppearance & { depthUrl: string; normalUrl: string };
}

const worlds = new Map<WorldId, SharedImage[]>();
const listeners = new Set<() => void>();
const decalListeners = new Set<(ids: ReadonlySet<string>) => void>();
const pickupListeners = new Set<(ids: ReadonlySet<string>) => void>();
const builtins: SharedImage[] = Object.entries(bundledImages).map(([id, { hasNormal, ...entry }]) => ({
  ...entry, id, url: `${import.meta.env.BASE_URL}shared-images/${id}.png`,
  // (a decal bundled with its own normal map: public/shared-images/<id>.normal.png)
  ...(hasNormal ? { normalUrl: `${import.meta.env.BASE_URL}shared-images/${id}.normal.png` } : {}),
}));
let snapshot: readonly SharedImage[] = builtins;

export const getSharedImages = () => snapshot;
export const sharedImage = (id: string) => snapshot.find((image) => image.id === id);
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const useSharedImages = () => useSyncExternalStore(subscribe, getSharedImages);
// Has the browser fetch pictures (shared image ids) ahead of time, so a loading
// screen shows its picture at once
const preloaded = new Set<string>();
export function preloadSharedImages(ids: readonly string[]) {
  for (const id of ids) {
    const url = sharedImage(id)?.url;
    if (!url || preloaded.has(url) || typeof Image === "undefined") continue;
    preloaded.add(url);
    new Image().src = url;
  }
}
export function pickupTexture(id: string): TextureSetFiles {
  const image = sharedImage(id);
  return image?.pickup
    ? { diffuse: image.url, depth: image.pickup.depthUrl, normal: image.pickup.normalUrl, pixelArt: true }
    : textureFolder(`item_${id}`);
}

export function onSharedPickupsChanged(listener: (ids: ReadonlySet<string>) => void): () => void {
  pickupListeners.add(listener);
  return () => { pickupListeners.delete(listener); };
}
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
  const pickups = (list: SharedImage[]) => new Map(list.filter(image =>
    image.type === "item" && image.pickup && isSharedPickupId(image.id)).map(image => [image.id, image]));
  const oldPickups = pickups(before);
  const newPickups = pickups(images);
  const updatedPickups = new Set<string>();
  for (const id of oldPickups.keys()) {
    if (!newPickups.has(id)) { delete ITEM_TYPES[id]; updatedPickups.add(id); }
  }
  for (const [id, image] of newPickups) {
    if (!image.pickup) continue;
    ITEM_TYPES[id] = { name: image.name, category: image.pickup.category, value: pickupValue(image.pickup.value, image.pickup.category) };
    if (JSON.stringify(oldPickups.get(id)) !== JSON.stringify(image)) updatedPickups.add(id);
  }
  for (const listener of listeners) listener();
  if (updatedPickups.size) for (const listener of pickupListeners) listener(updatedPickups);
  const oldDecals = new Map(before.filter(i => i.type === "decal").map(i => [i.id, i.url]));
  const newDecals = new Map(images.filter(i => i.type === "decal").map(i => [i.id, i.url]));
  const changed = new Set([...oldDecals.keys(), ...newDecals.keys()].filter(id => oldDecals.get(id) !== newDecals.get(id)));
  if (changed.size) for (const listener of decalListeners) listener(changed);
}
