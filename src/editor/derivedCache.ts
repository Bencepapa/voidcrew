// Keys of the derived data kept in IndexedDB (the "auto" store, see idb.ts). Pure, so they can be tested.
//
// A published revision never changes, so what is made from it (the processed diffuse and the Auto
// normal / depth of a shared texture, a palette thumbnail) is valid for good under a key that holds
// the asset id + revision (or the revision's own URL) and everything the result depends on.

export interface UpgradeKeyInput {
  id: string;
  rev: number;
  transparency: { source: string; colorKey: string };
  auto: { normal: boolean; depth: boolean };
  // autoRecipe.version: a new generator makes new maps
  recipe: number;
}

/** The processed diffuse + Auto maps of one published texture revision. */
export function upgradeCacheKey({ id, rev, transparency, auto, recipe }: UpgradeKeyInput): string {
  return `up:${id}:r${rev}:${transparency.source}:${transparency.colorKey}:${auto.normal ? "n" : "-"}${auto.depth ? "d" : "-"}:g${recipe}`;
}

// Bump to make every stored thumbnail stale (a change of size or format).
export const THUMB_VERSION = 1;
export const THUMB_WIDTH = 96;

/** A palette thumbnail of one image: the URL of a published revision holds the id and the revision. */
export function thumbCacheKey(url: string): string {
  return `thumb${THUMB_VERSION}:${url}`;
}
