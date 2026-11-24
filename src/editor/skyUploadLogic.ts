// The pure part of uploading a sky picture (the browser part is skyUpload.ts): what kind of file it is, a name from the
// file name, and whether it has see-through pixels. The size and seam rules are in game/skyImage.ts.

export type UploadFormat = "png" | "jpeg" | "webp";

/** The kind of image file, by its first bytes (the browser's own type guess can be empty or wrong). */
export function sniffImageFormat(head: ArrayLike<number>): UploadFormat | undefined {
  const is = (offset: number, bytes: readonly number[]) => bytes.every((byte, i) => head[offset + i] === byte);
  if (is(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (is(0, [0xff, 0xd8, 0xff])) return "jpeg";
  // RIFF....WEBP
  if (is(0, [0x52, 0x49, 0x46, 0x46]) && is(8, [0x57, 0x45, 0x42, 0x50])) return "webp";
  return undefined;
}

/** A draft's name from the file's name: no extension, `_` and `-` as spaces, at most 100 characters. */
export function skyNameFromFile(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.(png|jpe?g|webp)$/i, "");
  return base.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
}

/** Is every pixel fully opaque (RGBA data)? A sky has no holes: see-through pixels are flattened onto black. */
export function isOpaque(data: ArrayLike<number>): boolean {
  for (let i = 3; i < data.length; i += 4) if (data[i] !== 255) return false;
  return true;
}
