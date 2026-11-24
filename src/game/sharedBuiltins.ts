import catalog from "./sharedBuiltins.json";
import type { TextureTuning } from "../render/textureTuning";
import type { BundledImageEntry } from "./bundledImages";
import type { BundleFiles } from "./bundleFiles";

interface BundledTexture {
  rev: number;
  label: string;
  kinds: ("wall" | "floor" | "ceiling" | "propFace")[];
  pixelArt: boolean;
  smooth?: boolean;
  // the real file names per map (see bundleFiles.ts); an old catalog listed them as an array of names
  files: BundleFiles | string[];
  tuning?: TextureTuning;
}

export const bundledTextures = catalog.textures as Record<string, BundledTexture>;

export const bundledMaps: Record<string, Record<string, number>> = catalog.maps;
/** Published props, door types and NPCs bundled by `npm run pull:shared`, by asset id (re-checked when installed). */
export interface BundledDefinition { rev: number; definition: unknown }
export const bundledDefinitions = (catalog as { definitions?: unknown }).definitions as
  Record<"prop" | "door" | "actor", Record<string, BundledDefinition>> ?? { prop: {}, door: {}, actor: {} };
export const bundledImages = (catalog.images ?? {}) as Record<string, BundledImageEntry>;
