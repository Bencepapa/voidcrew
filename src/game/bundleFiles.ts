// The real file names of what `npm run pull:shared` bundled (pure: the script writes them, the game reads them).
//
// A bundled picture can be a PNG or a lossless WebP, chosen per file by the script (scripts/imageEncode.ts), and the file
// name always says which: `diffuse.webp` is WebP bytes, `diffuse.png` is PNG bytes, never the other way round. The catalog
// (sharedBuiltins.json) records the names per map:
//
//   textures:  "files": { "diffuse": "diffuse.webp", "normal": "normal.png", "depth": "depth.webp", "emissive": "emissive.png" }
//   images:    "files": { "diffuse": "diffuse.webp", "normal": "normal.png", "depth": "depth.png" }
//
// (for an image the same names stand for `<id>.webp`, `<id>.normal.png`, `<id>.depth.png`: see bundledImageFiles.)
// Backward compatible: an old texture entry listed its files as an array (["diffuse.png", "normal.png"]), and an image
// entry without `files` is all PNG. Unknown names are ignored, so a damaged catalog can never point the game anywhere odd.

export const BUNDLE_MAP_KEYS = ["diffuse", "normal", "depth", "emissive", "surface"] as const;
export type BundleMapKey = (typeof BUNDLE_MAP_KEYS)[number];
export const BUNDLE_EXTS = ["png", "webp"] as const;
export type BundleExt = (typeof BUNDLE_EXTS)[number];
/** map -> real file name, as the catalog keeps it */
export type BundleFiles = Partial<Record<BundleMapKey, string>>;

/** Is `name` the file name of this map (`<key>.png` or `<key>.webp`)? */
export const bundleFileOk = (key: BundleMapKey, name: unknown): name is string =>
  name === `${key}.png` || name === `${key}.webp`;

/** The extension of a bundle file name (`png` for anything that is not a webp). */
export const bundleExtOf = (name: string | undefined): BundleExt => name?.endsWith(".webp") ? "webp" : "png";

/** The catalog's `files` value as a map: the current map form, or the old array of names; anything invalid is dropped. */
export function readBundleFiles(value: unknown): BundleFiles {
  const result: BundleFiles = {};
  if (Array.isArray(value)) {
    for (const key of BUNDLE_MAP_KEYS) {
      const found = value.find(name => bundleFileOk(key, name));
      if (found) result[key] = found;
    }
  } else if (value && typeof value === "object") {
    for (const key of BUNDLE_MAP_KEYS) {
      const name = (value as Record<string, unknown>)[key];
      if (bundleFileOk(key, name)) result[key] = name;
    }
  }
  return result;
}

/** What a texture's files are called in the bundle: the map's own name, `diffuse` always present (PNG when unlisted). */
export function bundledTextureFiles(value: unknown): BundleFiles & { diffuse: string } {
  const files = readBundleFiles(value);
  return { ...files, diffuse: files.diffuse ?? "diffuse.png" };
}

/** The urls of a bundled texture (public/textures/<id>/): normal and depth fall back to the flat maps when it has none. */
export function bundledTexturePaths(id: string, filesValue: unknown, baseUrl: string) {
  const files = bundledTextureFiles(filesValue);
  const folder = `${baseUrl}textures/${id}/`;
  return {
    diffuse: folder + files.diffuse,
    normal: files.normal ? folder + files.normal : `${baseUrl}textures/flat/normal.png`,
    depth: files.depth ? folder + files.depth : `${baseUrl}textures/flat/depth.png`,
    ...(files.emissive ? { emissive: folder + files.emissive } : {}),
    ...(files.surface ? { surface: folder + files.surface } : {}),
  };
}

/** The file names a texture's maps get on disk, from the extensions the script chose: `{ diffuse: "webp", normal: "png" }` -> names. */
export const bundleFileNames = (exts: Partial<Record<BundleMapKey, BundleExt>>): BundleFiles =>
  Object.fromEntries(Object.entries(exts).map(([key, ext]) => [key, `${key}.${ext}`])) as BundleFiles;
