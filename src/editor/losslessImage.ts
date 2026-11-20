// Lossless colour-map storage: the smaller of PNG and lossless WebP, but a
// WebP only when it decodes to exactly the same visible pixels as the PNG.

import { decode, encode } from "./imageTools";

export interface Pixels { width: number; height: number; data: ArrayLike<number> }
export interface LosslessImage { blob: Blob; mime: "image/png" | "image/webp"; ext: "png" | "webp" }

// Same size, same alpha everywhere, same R,G,B wherever alpha > 0 (RGB under alpha 0 is invisible).
export function sameVisiblePixels(a: Pixels, b: Pixels): boolean {
  if (a.width !== b.width || a.height !== b.height || a.data.length !== b.data.length) return false;
  const x = a.data, y = b.data;
  for (let i = 0; i < x.length; i += 4) {
    if (x[i + 3] !== y[i + 3]) return false;
    if (x[i + 3] > 0 && (x[i] !== y[i] || x[i + 1] !== y[i + 1] || x[i + 2] !== y[i + 2])) return false;
  }
  return true;
}

export async function isWebp(blob: Blob): Promise<boolean> {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  return b.length === 12 && text(0, 4) === "RIFF" && text(8, 12) === "WEBP";
}

const png = (blob: Blob): LosslessImage => ({ blob, mime: "image/png", ext: "png" });

// An ImageData is encoded both ways; a Blob (PNG or WebP) is used as one of the candidates as it is.
export async function encodeSmallestLossless(image: ImageData | Blob): Promise<LosslessImage> {
  const isBlob = image instanceof Blob;
  const sourceIsWebp = isBlob && await isWebp(image);
  const pixels = isBlob ? await decode(image) : image;
  const pngBlob = isBlob && !sourceIsWebp ? image : await encode(pixels);
  let webpBlob: Blob | null = null;
  if (sourceIsWebp) webpBlob = image as Blob;
  else {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = pixels.width;
      canvas.height = pixels.height;
      canvas.getContext("2d")!.putImageData(pixels, 0, 0);
      const out = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", 1));
      if (out?.type === "image/webp") webpBlob = out;
    } catch { /* no WebP encoder: keep the PNG */ }
  }
  if (!webpBlob || webpBlob.size >= pngBlob.size) return png(pngBlob);
  try {
    if (!sameVisiblePixels(await decode(pngBlob), await decode(webpBlob))) return png(pngBlob);
  } catch { return png(pngBlob); }
  return { blob: webpBlob, mime: "image/webp", ext: "webp" };
}
