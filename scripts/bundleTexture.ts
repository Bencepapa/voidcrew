// What `npm run pull:shared` does to one published texture's files, without any network or file system (so a tsx test can
// run it on synthetic images): bake the transparency, bake the Auto normal / depth maps, and encode every map losslessly
// (scripts/imageEncode.ts). The shipped game then never derives anything from a bundled texture.
import { generateMaps } from "../src/render/depthNormal";
import type { BundleMapKey } from "../src/game/bundleFiles";
import { decodeRgba, encodeLossless, encodeSource, type Encoded, type RawImage } from "./imageEncode";

export interface TextureBakeInput {
  /** the files of the texture as downloaded (diffuse always; the others only when the texture uploaded them) */
  sources: Partial<Record<BundleMapKey, Buffer>> & { diffuse: Buffer };
  /** the published meta's `maps` (normal / depth: "auto" | "uploaded" | ...) */
  maps: Record<string, string | undefined>;
  transparency?: { source?: string; colorKey?: string };
}

/**
 * The bundle form of every map the texture has. Normal and depth are present whenever the texture uploaded them or had
 * them on Auto (those are generated here, from the full-resolution diffuse with its transparency applied, exactly as the
 * editor's own derivation does); a map the texture has as "none" stays absent (the game uses the flat map for it).
 * Geometry (relief) is NOT baked yet: that would be one more output of this function, see the TODO in pull-shared.ts.
 */
export async function bakeTexture({ sources, maps, transparency }: TextureBakeInput): Promise<Partial<Record<BundleMapKey, Encoded>>> {
  const encoded: Partial<Record<BundleMapKey, Encoded>> = {};
  const source = transparency?.source;
  if (maps.normal === "auto" || maps.depth === "auto" || source === "none" || source === "colorKey") {
    const decoded = await decodeRgba(sources.diffuse);
    const { width, height } = decoded;
    const rgba = new Uint8ClampedArray(decoded.data);
    const hex = /^#([\da-f]{6})$/i.exec(transparency?.colorKey ?? "")?.[1] ?? "ff00ff";
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
    if (source === "none" || source === "colorKey") {
      for (let i = 0; i < rgba.length; i += 4) {
        if (source === "none") rgba[i + 3] = 255;
        else if (rgb.every((value, channel) => Math.abs(value - rgba[i + channel]) <= 6)) rgba[i + 3] = 0;
      }
    }
    const pixels = (data: Uint8ClampedArray): RawImage => ({ data: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width, height });
    if (source === "none" || source === "colorKey") encoded.diffuse = await encodeLossless(pixels(rgba));
    if (maps.normal === "auto" || maps.depth === "auto") {
      // (a MAX_TEXTURE_SIZE only scales the maps when they are encoded: they are baked from the full-resolution diffuse)
      const generated = generateMaps(rgba, width, height);
      for (const channel of ["normal", "depth"] as const) {
        if (maps[channel] === "auto") encoded[channel] = await encodeLossless(pixels(generated[channel]));
      }
    }
  }
  for (const key of Object.keys(sources) as BundleMapKey[]) encoded[key] ??= await encodeSource(sources[key]!);
  return encoded;
}
