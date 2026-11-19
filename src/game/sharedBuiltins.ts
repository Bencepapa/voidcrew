import catalog from "./sharedBuiltins.json";
import type { TextureTuning } from "../render/textureTuning";

interface BundledTexture {
  rev: number;
  label: string;
  kinds: ("wall" | "floor" | "ceiling")[];
  pixelArt: boolean;
  smooth?: boolean;
  files: string[];
  tuning?: TextureTuning;
}

export const bundledTextures = catalog.textures as Record<string, BundledTexture>;

export const bundledMaps: Record<string, Record<string, number>> = catalog.maps;
