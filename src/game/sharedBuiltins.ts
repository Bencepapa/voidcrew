import catalog from "./sharedBuiltins.json";
import type { TextureTuning } from "../render/textureTuning";
import type { SharedImage } from "../render/sharedImages";

interface BundledTexture {
  rev: number;
  label: string;
  kinds: ("wall" | "floor" | "ceiling" | "propFace")[];
  pixelArt: boolean;
  smooth?: boolean;
  files: string[];
  tuning?: TextureTuning;
}

export const bundledTextures = catalog.textures as Record<string, BundledTexture>;

export const bundledMaps: Record<string, Record<string, number>> = catalog.maps;
/** Published props, door types and NPCs bundled by `npm run pull:shared`, by asset id (re-checked when installed). */
export interface BundledDefinition { rev: number; definition: unknown }
export const bundledDefinitions = (catalog as { definitions?: unknown }).definitions as
  Record<"prop" | "door" | "actor", Record<string, BundledDefinition>> ?? { prop: {}, door: {}, actor: {} };
export const bundledImages = (catalog.images ?? {}) as Record<string, Omit<SharedImage, "id" | "url" | "normalUrl"> & { rev: number; hasNormal?: boolean }>;
