// The Auto channels: a texture's normal and depth maps made from its diffuse.
//
// This is a thin adapter. The generator itself (the normalMap core) is being
// ported into src/render/depthNormal.ts + depthNormalAsync.ts; until that
// lands this returns flat maps, so the Assets window, the drafts and the shared
// store all work with Auto channels already (they just come out flat).

// The recipe stored in meta.json next to an Auto channel, so the result can be
// reproduced (and told apart from a newer generator).
export const autoRecipe = { engine: "flat-placeholder", version: 0 } as const;

export async function generateAutoMaps(image: ImageData): Promise<{ depth: ImageData; normal: ImageData }> {
  // TODO(depthNormal): once src/render/depthNormalAsync.ts exists, import
  // { generateMapsAsync, defaultDepthNormalParams } from "../render/depthNormalAsync"
  // and return `generateMapsAsync(image, defaultDepthNormalParams)` here (and
  // bump autoRecipe: engine "normalmap-core", the version and the params).
  const { width, height } = image;
  const depth = new ImageData(width, height), normal = new ImageData(width, height);
  for (let i = 0; i < depth.data.length; i += 4) {
    depth.data.set([128, 128, 128, image.data[i + 3]], i);
    normal.data.set([128, 128, 255, image.data[i + 3]], i);
  }
  return { depth, normal };
}
