// Shared pictures bundled by `npm run pull:shared` (public/shared-images/<id>.png|webp), as the game and the script see them.
// Pure (no storage, no network): the script checks the pickup it pulls with readPickupAppearance, the game builds the
// pictures of its catalog with bundledImageOf - a bundled pickup also registers its item type (see render/sharedImages.ts).
//
//   still / decal:  <id>.<ext> [+ <id>.normal.<ext> for a decal that has its own normal map]
//   pickup (item):  <id>.<ext>, <id>.normal.<ext>, <id>.depth.<ext>  (always all three: publishing makes them)
//
// <ext> is png or webp per file (the script picks the smaller lossless one); the catalog entry's `files` says which.

import { DEFAULT_PICKUP, isItemCategory, type PickupAppearance } from "./items";
import { cleanPickupValue } from "./pickupValue";
import { bundleExtOf, readBundleFiles, type BundleFiles } from "./bundleFiles";
import type { SharedImage } from "../render/sharedImages";

/** What the catalog (sharedBuiltins.json) keeps per bundled picture. */
export type BundledImageEntry = Omit<SharedImage, "id" | "url" | "normalUrl" | "pickup"> & {
  rev: number;
  hasNormal?: boolean;
  // the real file names ({ diffuse: "diffuse.webp", normal: "normal.png", ... }, see bundleFiles.ts); none: all png
  files?: BundleFiles;
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

/**
 * The files of a bundled picture, next to each other: `<baseUrl>shared-images/<id>[.normal|.depth].<ext>`, each file's
 * extension from the catalog's `files` (see bundleFiles.ts; no entry = png, the format before WebP was possible).
 */
export function bundledImageFiles(id: string, baseUrl: string, filesValue?: unknown) {
  const stem = `${baseUrl}shared-images/${id}`;
  const files = readBundleFiles(filesValue);
  return {
    diffuse: `${stem}.${bundleExtOf(files.diffuse)}`,
    normal: `${stem}.normal.${bundleExtOf(files.normal)}`,
    depth: `${stem}.depth.${bundleExtOf(files.depth)}`,
  };
}

/** The picture a catalog entry stands for. */
export function bundledImageOf(id: string, { hasNormal, pickup, files: filesValue, ...entry }: BundledImageEntry, baseUrl: string): SharedImage {
  const files = bundledImageFiles(id, baseUrl, filesValue);
  return {
    ...entry, id, url: files.diffuse,
    // (a decal bundled with its own normal map)
    ...(hasNormal ? { normalUrl: files.normal } : {}),
    ...(entry.type === "item" && pickup ? { pickup: { ...readPickupAppearance(pickup), depthUrl: files.depth, normalUrl: files.normal } } : {}),
  };
}
