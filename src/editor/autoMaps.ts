// The Auto channels: a texture's normal and depth maps made from its diffuse,
// by the normalMap core (src/render/depthNormal.ts, run in a Worker).
import { generateMapsAsync } from "../render/depthNormalAsync";
import { defaultDepthNormalParams } from "../render/depthNormal";

// The recipe stored in meta.json next to an Auto channel, so the result can be
// reproduced (and told apart from a newer generator). The version also keys the
// cache of generated maps: bump it when the generator or its defaults change.
export const autoRecipe = { engine: "normalmap-core", version: 1 } as const;

export function generateAutoMaps(image: ImageData): Promise<{ depth: ImageData; normal: ImageData }> {
  return generateMapsAsync(image, defaultDepthNormalParams);
}
