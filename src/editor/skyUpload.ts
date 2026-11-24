// The browser part of uploading a sky picture: a PNG, JPG or WebP file becomes the draft's PNG (the store keeps
// diffuse.png for every image), the seam is measured on the decoded pixels and can be blended. The rules themselves
// (sizes, seam measure, the blend) are pure and live in game/skyImage.ts; the file-kind helpers in skyUploadLogic.ts.

import { t, type Key } from "../i18n";
import { makeSeamless, seamReport, skyIssues, type SeamReport, type SkyIssue } from "../game/skyImage";
import { decode, encode, MAX_PNG_BYTES } from "./imageTools";
import { isOpaque, sniffImageFormat } from "./skyUploadLogic";

export const SKY_FILE_ACCEPT = "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";

/** The sentence for a size problem of a sky (see skyIssues). */
export const skyIssueText = (issue: SkyIssue) => t(`sky.issue.${issue.code}` as Key, issue.params);

const megabytes = (bytes: number) => (bytes / 1048576).toFixed(1);

function checkPngSize(png: Blob, name: string) {
  if (png.size > MAX_PNG_BYTES) throw new Error(t("sky.err.pngTooBig", { name, mb: megabytes(png.size) }));
}

/**
 * A chosen file as the draft's picture: checked (kind, size, 2:1 and width limits) and, unless it is an opaque PNG
 * already, converted to a PNG (see-through pixels are flattened onto black: a sky has no holes).
 */
export async function readSkyFile(file: File): Promise<{ png: Blob; width: number; height: number }> {
  if (file.size > MAX_PNG_BYTES) throw new Error(t("assetManager.err.tooBig", { name: file.name, mb: megabytes(file.size) }));
  const format = sniffImageFormat(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!format) throw new Error(t("sky.err.format", { name: file.name }));
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error(t("assetManager.err.badImage", { name: file.name })); }
  try {
    const { width, height } = bitmap;
    const [problem] = skyIssues(width, height).errors;
    if (problem) throw new Error(skyIssueText(problem));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(bitmap, 0, 0);
    // (an opaque PNG is kept byte for byte: the browser's own PNG encoder would only make it bigger)
    if (format === "png" && isOpaque(ctx.getImageData(0, 0, width, height).data)) {
      return { png: file.slice(0, file.size, "image/png"), width, height };
    }
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("PNG encoding failed")), "image/png"));
    checkPngSize(png, file.name);
    return { png, width, height };
  } finally { bitmap.close(); }
}

export interface SkyInfo { width: number; height: number; seam: SeamReport; errors: SkyIssue[]; warnings: SkyIssue[] }

/** The size and seam of the draft's picture (decoded without colour conversion, as the game reads the values). */
export async function analyseSky(png: Blob): Promise<SkyInfo> {
  const image = await decode(png);
  return { width: image.width, height: image.height, seam: seamReport(image), ...skyIssues(image.width, image.height) };
}

/** The picture with its edges blended so that they join (see makeSeamless): a new PNG, the same size. */
export async function blendSkySeam(png: Blob, name: string): Promise<Blob> {
  const image = await decode(png);
  const fixed = await encode(new ImageData(makeSeamless(image), image.width, image.height));
  checkPngSize(fixed, name);
  return fixed;
}
