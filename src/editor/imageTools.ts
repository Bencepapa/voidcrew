// Small PNG helpers for the Assets window: validating an upload, reading a
// Blob as pixels and back, the transparency source (alpha channel / colour key
// / none), and the surface map (gloss in green, metal in blue).

import { t } from "../i18n";

export const MAX_PNG_BYTES = 8 * 1024 * 1024;

export type TransparencySource = "alpha" | "colorKey" | "none";
export interface Transparency { source: TransparencySource; colorKey: string }
export const defaultTransparency = (): Transparency => ({ source: "none", colorKey: "#ff00ff" });

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// A PNG, by its file signature (the browser's own type guess can be empty or wrong).
export async function isPng(blob: Blob): Promise<boolean> {
  const head = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  return head.length === 8 && SIGNATURE.every((b, i) => head[i] === b);
}

// Checks a file before it is kept or uploaded; the error text says what is wrong.
export async function validatePng(blob: Blob, label: string): Promise<void> {
  if (blob.size > MAX_PNG_BYTES) throw new Error(t("assetManager.err.tooBig", { name: label, mb: (blob.size / 1048576).toFixed(1) }));
  if (!(await isPng(blob))) throw new Error(t("assetManager.err.notPng", { name: label }));
  try { await decode(blob); } catch { throw new Error(t("assetManager.err.badImage", { name: label })); }
}

export async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob, { premultiplyAlpha: "none", colorSpaceConversion: "none" });
  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally { bitmap.close(); }
}

export function encode(image: ImageData): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error("PNG encoding failed")), "image/png"));
}

// Any pixel less than fully opaque?
export async function hasAlpha(blob: Blob): Promise<boolean> {
  const { data } = await decode(blob);
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) return true;
  return false;
}

export function parseColor(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const v = parseInt(m?.[1] ?? "ff00ff", 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// The diffuse as the game should see it: the alpha channel kept (null: the file
// is fine as it is), the key colour turned into holes, or all pixels opaque.
export async function applyTransparency(blob: Blob, transparency: Transparency): Promise<Blob | null> {
  if (transparency.source === "alpha") return null;
  const image = await decode(blob);
  const { data } = image;
  if (transparency.source === "none") {
    let any = false;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) { data[i] = 255; any = true; }
    return any ? encode(image) : null;
  }
  const [r, g, b] = parseColor(transparency.colorKey);
  const near = 6;
  let any = false;
  for (let i = 0; i < data.length; i += 4) {
    if (Math.abs(data[i] - r) <= near && Math.abs(data[i + 1] - g) <= near && Math.abs(data[i + 2] - b) <= near) { data[i + 3] = 0; any = true; }
  }
  return any ? encode(image) : null;
}

// Roughness (the inverse of gloss) in green, metalness in blue, as the game reads a surface map.
export async function composeSurface(gloss?: Blob, metal?: Blob): Promise<Blob> {
  const g = gloss ? await decode(gloss) : undefined;
  const m = metal ? await decode(metal) : undefined;
  const width = Math.max(g?.width ?? 1, m?.width ?? 1), height = Math.max(g?.height ?? 1, m?.height ?? 1);
  const out = new ImageData(width, height);
  const sample = (img: ImageData | undefined, x: number, y: number, fallback: number) => {
    if (!img) return fallback;
    const px = Math.min(img.width - 1, Math.floor(x * img.width / width)), py = Math.min(img.height - 1, Math.floor(y * img.height / height));
    return img.data[(py * img.width + px) * 4];
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    out.data[i] = 0;
    out.data[i + 1] = g ? 255 - sample(g, x, y, 0) : 140;
    out.data[i + 2] = m ? sample(m, x, y, 0) : 0;
    out.data[i + 3] = 255;
  }
  return encode(out);
}

export async function splitSurface(blob: Blob): Promise<{ gloss: Blob; metal: Blob }> {
  const src = await decode(blob);
  const gloss = new ImageData(src.width, src.height), metal = new ImageData(src.width, src.height);
  for (let i = 0; i < src.data.length; i += 4) {
    const gv = 255 - src.data[i + 1], mv = src.data[i + 2];
    gloss.data.set([gv, gv, gv, 255], i);
    metal.data.set([mv, mv, mv, 255], i);
  }
  return { gloss: await encode(gloss), metal: await encode(metal) };
}
