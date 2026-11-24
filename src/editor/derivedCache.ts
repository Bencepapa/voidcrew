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

// One cell of a sprite sheet (an NPC's first frame): the sheet has `cols` x `rows` cells, this is column `col`, row `row`.
export interface ThumbCrop { cols: number; rows: number; col: number; row: number }

/** What a thumbnail of this image (or of one cell of it) is cut from. */
export function thumbSource(width: number, height: number, crop?: ThumbCrop): { x: number; y: number; width: number; height: number } {
  if (!crop || crop.cols < 1 || crop.rows < 1) return { x: 0, y: 0, width, height };
  const cellW = Math.floor(width / crop.cols), cellH = Math.floor(height / crop.rows);
  const col = Math.min(Math.max(0, Math.floor(crop.col)), crop.cols - 1), row = Math.min(Math.max(0, Math.floor(crop.row)), crop.rows - 1);
  return { x: col * cellW, y: row * cellH, width: Math.max(1, cellW), height: Math.max(1, cellH) };
}

/** The thumbnail's pixel size: at most `maxWidth` wide, never larger than the source. */
export function thumbSize(width: number, height: number, maxWidth = THUMB_WIDTH): { width: number; height: number } {
  const scale = Math.min(1, maxWidth / Math.max(1, width));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** The cache key of a thumbnail of `url` (with its crop, if any). */
export function thumbKey(url: string, crop?: ThumbCrop): string {
  return thumbCacheKey(crop ? `${url}#${crop.cols}x${crop.rows}@${crop.col},${crop.row}` : url);
}

/** Only a file of the shared store is worth a thumbnail (bundled / local / blob images are already local). */
export function isStoreUrl(url: string, project: string | undefined): boolean {
  return !!project && url.startsWith(project + "/");
}
