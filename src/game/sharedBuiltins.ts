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
export const bundledImages = (catalog.images ?? {}) as Record<string, Omit<SharedImage, "id" | "url"> & { rev: number }>;
