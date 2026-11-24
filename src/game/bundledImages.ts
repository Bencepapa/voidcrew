// Shared pictures bundled by `npm run pull:shared` (public/shared-images/<id>.png), as the game and the script see them.
// Pure (no storage, no network): the script checks the pickup it pulls with readPickupAppearance, the game builds the
// pictures of its catalog with bundledImageOf - a bundled pickup also registers its item type (see render/sharedImages.ts).
//
//   still / decal:  <id>.png [+ <id>.normal.png for a decal that has its own normal map]
//   pickup (item):  <id>.png, <id>.normal.png, <id>.depth.png  (always all three: publishing makes them)

import { DEFAULT_PICKUP, isItemCategory, type PickupAppearance } from "./items";
import { cleanPickupValue } from "./pickupValue";
import type { SharedImage } from "../render/sharedImages";

/** What the catalog (sharedBuiltins.json) keeps per bundled picture. */
export type BundledImageEntry = Omit<SharedImage, "id" | "url" | "normalUrl" | "pickup"> & {
  rev: number;
  hasNormal?: boolean;
  // a pickup's look (its maps are files next to the picture)
  pickup?: PickupAppearance;
};

/** A pickup's appearance from a meta.json / catalog value: the same limits the editor publishes with. */
export function readPickupAppearance(value?: Partial<PickupAppearance> | null): PickupAppearance {
  const own = cleanPickupValue(value?.value);
  return {
    category: isItemCategory(value?.category) ? value.category : DEFAULT_PICKUP.category,
    height: typeof value?.height === "number" && Number.isFinite(value.height) ? Math.max(0.03, Math.min(2, value.height)) : DEFAULT_PICKUP.height,
    glow: typeof value?.glow === "number" && Number.isFinite(value.glow) ? Math.max(0, Math.min(2, value.glow)) : DEFAULT_PICKUP.glow,
    ...(own !== undefined ? { value: own } : {}),
  };
}

/** The files of a bundled picture, next to each other: `<baseUrl>shared-images/<id>[.normal|.depth].png`. */
export function bundledImageFiles(id: string, baseUrl: string) {
  const stem = `${baseUrl}shared-images/${id}`;
  return { diffuse: `${stem}.png`, normal: `${stem}.normal.png`, depth: `${stem}.depth.png` };
}

/** The picture a catalog entry stands for. */
export function bundledImageOf(id: string, { hasNormal, pickup, ...entry }: BundledImageEntry, baseUrl: string): SharedImage {
  const files = bundledImageFiles(id, baseUrl);
  return {
    ...entry, id, url: files.diffuse,
    // (a decal bundled with its own normal map)
    ...(hasNormal ? { normalUrl: files.normal } : {}),
    ...(entry.type === "item" && pickup ? { pickup: { ...readPickupAppearance(pickup), depthUrl: files.depth, normalUrl: files.normal } } : {}),
  };
}
