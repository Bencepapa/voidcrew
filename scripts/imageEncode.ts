// Lossless image encoding for `npm run pull:shared` (the bundle). Node only (sharp), no Vite APIs, so tsx tests import it.
//
// Policy (final decisions D1/D4/D6, see concept/webp-compression-plan.md): NOTHING here loses a pixel. Every image becomes
// the smaller of an optimised PNG and a lossless WebP; the PNG is kept unless the WebP is clearly smaller (WEBP_MIN_GAIN),
// since a PNG needs no loader support at all. Both candidates are decoded again and compared with the source, byte for
// byte over RGBA (alpha and the colour under alpha included); a candidate that differs is dropped.
//
// sharp pitfall found while writing this: `png({ effort })` (and quality / colours / dither) silently turns the PNG into a
// QUANTISED palette PNG (lossy above 256 colours) unless `palette: false` is given. Every PNG here passes `palette`
// explicitly; the palette variant is only a candidate when the image has at most 256 distinct RGBA values (and is then
// verified like everything else).
import sharp from "sharp";

/**
 * D4 hook: the longest side a texture may have in the bundle. Infinity = no resize (current decision: do not resize
 * anything). To cap the store's 1024-1254 px uploads later, set e.g. 512 here: every image goes through limitSize()
 * before it is encoded (by encodeSource / encodeLossless), so this one number is the whole change.
 */
export const MAX_TEXTURE_SIZE = Infinity;

/** The WebP is used only when it is at least this much smaller than the best PNG (a fraction of the PNG's size). */
export const WEBP_MIN_GAIN = 0.1;

/** 8-bit RGBA pixels, row after row. */
export interface RawImage { data: Uint8Array; width: number; height: number }
export type ImageExt = "png" | "webp";

export interface Encoded {
  ext: ImageExt;
  bytes: Buffer;
  /** the smallest verified PNG (or the untouched source when that was smaller / had to be kept) */
  pngBytes: number;
  /** the verified lossless WebP, when there is one (absent: not encodable or not exact) */
  webpBytes?: number;
  /** size of the file this was made from (encodeSource only) */
  sourceBytes?: number;
  /** a few words: what was picked and why (for the report) */
  note: string;
}

export interface EncodeOptions {
  /** a place that only reads PNG (an NPC's normal map): no WebP candidate, the best verified PNG */
  pngOnly?: boolean;
  /** test hook: replaces the WebP encoder (a wrong one must be caught by the pixel guard) */
  webp?: (raw: RawImage) => Promise<Buffer>;
  /** test hook: replaces the optimised-PNG encoder */
  png?: (raw: RawImage) => Promise<Buffer>;
}

const rgbaOptions = (raw: RawImage) => ({ raw: { width: raw.width, height: raw.height, channels: 4 as const } });

/** Decodes any image sharp reads to 8-bit sRGB RGBA, straight (not premultiplied) alpha. */
export async function decodeRgba(bytes: Uint8Array): Promise<RawImage> {
  const { data, info } = await sharp(bytes).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export function sameRgba(a: RawImage, b: RawImage): boolean {
  return a.width === b.width && a.height === b.height && Buffer.compare(Buffer.from(a.data.buffer, a.data.byteOffset, a.data.byteLength), Buffer.from(b.data.buffer, b.data.byteOffset, b.data.byteLength)) === 0;
}

/** How many distinct RGBA values there are; stops counting at `limit + 1` (so "more than limit" is cheap to know). */
export function countColours(raw: RawImage, limit = 256): number {
  const pixels = new Uint32Array(raw.data.buffer.slice(raw.data.byteOffset, raw.data.byteOffset + raw.data.byteLength));
  const seen = new Set<number>();
  for (let i = 0; i < pixels.length; i++) {
    seen.add(pixels[i]);
    if (seen.size > limit) return limit + 1;
  }
  return seen.size;
}

/** Scales an image down (never up) so its longest side is at most `max`. With max = Infinity (see MAX_TEXTURE_SIZE) it is the same image. */
export async function limitSize(raw: RawImage, max = MAX_TEXTURE_SIZE): Promise<RawImage> {
  const longest = Math.max(raw.width, raw.height);
  if (!(max >= 1) || longest <= max) return raw;
  const scale = max / longest;
  const width = Math.max(1, Math.round(raw.width * scale));
  const height = Math.max(1, Math.round(raw.height * scale));
  const { data, info } = await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), rgbaOptions(raw))
    .resize(width, height, { kernel: "lanczos3", fit: "fill" }).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// The PNG pixel layout that needs the fewest bytes: grey (R = G = B) and/or opaque images drop channels.
function pack(raw: RawImage): { data: Buffer; channels: 1 | 2 | 3 | 4 } {
  const src = raw.data;
  let opaque = true, grey = true;
  for (let i = 0; i < src.length && (opaque || grey); i += 4) {
    if (src[i + 3] !== 255) opaque = false;
    if (src[i] !== src[i + 1] || src[i] !== src[i + 2]) grey = false;
  }
  const channels = (grey ? (opaque ? 1 : 2) : (opaque ? 3 : 4)) as 1 | 2 | 3 | 4;
  if (channels === 4) return { data: Buffer.from(src.buffer, src.byteOffset, src.byteLength), channels };
  const pixels = src.length / 4;
  const out = Buffer.alloc(pixels * channels);
  for (let p = 0, o = 0; p < pixels; p++) {
    const i = p * 4;
    if (grey) { out[o++] = src[i]; if (channels === 2) out[o++] = src[i + 3]; }
    else { out[o++] = src[i]; out[o++] = src[i + 1]; out[o++] = src[i + 2]; }
  }
  return { data: out, channels };
}

const pngVariants = async (raw: RawImage): Promise<Buffer[]> => {
  const { data, channels } = pack(raw);
  const input = { raw: { width: raw.width, height: raw.height, channels } };
  const variants = await Promise.all([true, false].map(adaptiveFiltering =>
    sharp(data, input).png({ compressionLevel: 9, adaptiveFiltering, palette: false }).toBuffer()));
  const colours = countColours(raw);
  if (colours <= 256) {
    // (quality 100 and no dithering: with few colours the palette is the image's own; verified below all the same)
    variants.push(await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), rgbaOptions(raw))
      .png({ palette: true, colours: Math.max(2, colours), quality: 100, effort: 10, dither: 0, compressionLevel: 9, adaptiveFiltering: true }).toBuffer());
  }
  return variants;
};

const losslessWebp = (raw: RawImage) =>
  sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), rgbaOptions(raw)).webp({ lossless: true, effort: 6, exact: true }).toBuffer();

/** The candidate's bytes if decoding them gives exactly `raw` back (every RGBA byte), else undefined. */
async function verified(candidate: Buffer, raw: RawImage): Promise<Buffer | undefined> {
  try {
    return sameRgba(await decodeRgba(candidate), raw) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

const smallest = (list: (Buffer | undefined)[]) =>
  list.reduce<Buffer | undefined>((best, one) => one && (!best || one.length < best.length) ? one : best, undefined);

/**
 * The smaller of the best verified PNG and a verified lossless WebP of these pixels (the WebP only when it is at least
 * WEBP_MIN_GAIN smaller). `source` (a PNG whose decoded pixels are exactly `raw`) is also a PNG candidate, so a file that
 * is already well compressed is not made bigger. Throws only when nothing at all reproduces the pixels.
 */
export async function encodeLossless(raw: RawImage, options: EncodeOptions & { source?: Buffer; maxSize?: number } = {}): Promise<Encoded> {
  // (D4 hook: a no-op while MAX_TEXTURE_SIZE is Infinity; a resized image is no longer the source's pixels)
  const limited = await limitSize(raw, options.maxSize ?? MAX_TEXTURE_SIZE);
  if (limited !== raw) { raw = limited; options = { ...options, source: undefined }; }
  const variants = await (options.png ? options.png(raw).then(bytes => [bytes]) : pngVariants(raw)).catch(() => [] as Buffer[]);
  // (the source, when given, is a PNG of exactly these pixels by construction)
  let png = smallest([...await Promise.all(variants.map(bytes => verified(bytes, raw))), options.source]);
  if (!png) {
    // (last resort: the plain default encoder)
    png = await verified(await sharp(Buffer.from(raw.data.buffer, raw.data.byteOffset, raw.data.byteLength), rgbaOptions(raw)).png().toBuffer(), raw);
  }
  if (!png) throw new Error("No PNG reproduces the pixels exactly.");
  const webp = options.pngOnly ? undefined : await verified(await (options.webp ?? losslessWebp)(raw).catch(() => Buffer.alloc(0)), raw);
  const useWebp = !!webp && webp.length <= png.length * (1 - WEBP_MIN_GAIN);
  const common = { pngBytes: png.length, ...(webp ? { webpBytes: webp.length } : {}), ...(options.source ? { sourceBytes: options.source.length } : {}) };
  if (useWebp) return { ext: "webp", bytes: webp, note: `lossless WebP, ${Math.round((1 - webp.length / png.length) * 100)}% smaller than PNG`, ...common };
  return { ext: "png", bytes: png, note: options.pngOnly ? "PNG (only png allowed here)" : webp ? "PNG (WebP not 10% smaller)" : "PNG (no exact WebP)", ...common };
}

/**
 * An image file (normally a PNG from the store) to its bundle form: `limitSize`, then encodeLossless. A file that is not a
 * plain 8-bit image (16-bit, an embedded colour profile, animated) is kept byte for byte: re-encoding could change what a
 * browser shows. Only an unchanged-size source can be used as a PNG candidate.
 */
export async function encodeSource(source: Buffer, options: EncodeOptions & { maxSize?: number } = {}): Promise<Encoded> {
  const info = await sharp(source).metadata();
  const plain = info.format === "png" && info.depth !== "ushort" && !info.icc && (info.pages ?? 1) === 1 && info.space !== "rgb16" && info.space !== "grey16";
  if (!plain && info.format === "png") {
    return { ext: "png", bytes: source, pngBytes: source.length, sourceBytes: source.length, note: "kept as is (16-bit, colour profile or animated)" };
  }
  return encodeLossless(await decodeRgba(source), { ...options, ...(info.format === "png" ? { source } : {}) });
}

/** `<stem>.<ext>` for an encoded image: the extension always says what the bytes are. */
export const fileNameOf = (stem: string, encoded: Pick<Encoded, "ext">) => `${stem}.${encoded.ext}`;
