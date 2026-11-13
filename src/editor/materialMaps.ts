import type { TextureSetFiles } from "../render/textureSets";

export const channels = ["diffuse", "normal", "depth", "gloss", "metal", "emissive", "glow"] as const;
export type Channel = typeof channels[number];
export type MaterialMaps = Partial<Record<Channel, string>>;

export async function baseMaps(set: TextureSetFiles): Promise<MaterialMaps> {
  const maps: MaterialMaps = { diffuse: set.diffuse, normal: set.normal, depth: set.depth, emissive: set.emissive, glow: set.glow };
  if (!set.surface) return maps;
  const image = new Image();
  image.src = set.surface;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const source = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (const channel of ["gloss", "metal"] as const) {
    const out = ctx.createImageData(canvas.width, canvas.height);
    for (let i = 0; i < out.data.length; i += 4) {
      const value = channel === "gloss" ? 255 - source.data[i + 1] : source.data[i + 2];
      out.data.set([value, value, value, 255], i);
    }
    ctx.putImageData(out, 0, 0);
    maps[channel] = canvas.toDataURL();
  }
  return maps;
}

export function importImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const image = new Image();
      image.src = String(reader.result);
      try { await image.decode(); resolve(image.src); } catch { reject(new Error("Invalid image file")); }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
