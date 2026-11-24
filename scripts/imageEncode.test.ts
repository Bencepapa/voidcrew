// Run: npx tsx scripts/imageEncode.test.ts
// Synthetic images only (nothing from the store, no network): the lossless chooser of `npm run pull:shared`.
import assert from "node:assert/strict";
import sharp from "sharp";
import { MAX_TEXTURE_SIZE, WEBP_MIN_GAIN, countColours, decodeRgba, encodeLossless, encodeSource, fileNameOf, limitSize, sameRgba, type Encoded, type RawImage } from "./imageEncode";

let seed = 12345;
const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
const image = (width: number, height: number, pixel: (x: number, y: number) => [number, number, number, number]): RawImage => {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(pixel(x, y), (y * width + x) * 4);
  return { data, width, height };
};

// what a result must always satisfy: it decodes to exactly the source pixels, its extension tells the truth,
// and it is never bigger than the best PNG (the WebP is only taken when clearly smaller)
async function check(name: string, raw: RawImage, result: Encoded) {
  assert.ok(sameRgba(await decodeRgba(result.bytes), raw), `${name}: pixels differ`);
  const real = (await sharp(result.bytes).metadata()).format;
  assert.equal(real, result.ext, `${name}: extension ${result.ext} but the bytes are ${real}`);
  assert.equal(fileNameOf("diffuse", result).split(".").pop(), real);
  assert.ok(result.bytes.length <= result.pngBytes, `${name}: ${result.bytes.length} > best PNG ${result.pngBytes}`);
  if (result.ext === "webp") {
    assert.ok(result.webpBytes !== undefined && result.webpBytes <= result.pngBytes * (1 - WEBP_MIN_GAIN), `${name}: WebP chosen without the margin`);
  }
  const sizes = `${result.bytes.length} B (${result.ext}; png ${result.pngBytes}, webp ${result.webpBytes ?? "-"})`;
  console.log(`  ${name}: ${sizes}`);
}

assert.equal(MAX_TEXTURE_SIZE, Infinity, "no resolution cap for now (D4)");

// flat colour
const flat = image(64, 64, () => [20, 120, 220, 255]);
await check("flat colour", flat, await encodeLossless(flat));

// noisy, photo-like (opaque and with a noisy alpha channel)
const noisy = image(96, 96, () => [random() * 256, random() * 256, random() * 256, 255]);
const noisyResult = await encodeLossless(noisy);
await check("noise", noisy, noisyResult);
assert.equal(noisyResult.ext, "png", "incompressible noise stays PNG");
const noisyAlpha = image(80, 70, () => [random() * 256, random() * 256, random() * 256, random() * 256]);
await check("noise + alpha", noisyAlpha, await encodeLossless(noisyAlpha));

// smooth gradient (photo-like): not 256 colours, many near-equal neighbours
const gradient = image(128, 96, (x, y) => [x * 2, y * 2, (x + y) & 255, 255]);
await check("gradient", gradient, await encodeLossless(gradient));

// few-colour pixel art, scaled up (8 colours, 3x3 blocks)
const palette: [number, number, number, number][] = [[0, 0, 0, 255], [255, 255, 255, 255], [200, 30, 30, 255], [30, 200, 30, 255], [30, 30, 200, 255], [220, 220, 40, 255], [90, 60, 20, 255], [10, 90, 90, 255]];
const cells = Array.from({ length: 24 * 24 }, () => Math.floor(random() * 8));
const art = image(72, 72, (x, y) => palette[cells[Math.floor(y / 3) * 24 + Math.floor(x / 3)]]);
assert.equal(countColours(art), 8);
const artResult = await encodeLossless(art);
await check("pixel art (8 colours)", art, artResult);

// transparency: cut-out sprite with a soft edge, different colours UNDER alpha 0 (must survive: alpha-aware exactness)
const sprite = image(60, 50, (x, y) => {
  const d = Math.hypot(x - 30, y - 25);
  if (d > 22) return [(x * 5) & 255, (y * 7) & 255, 99, 0];       // outside: transparent, but with its own colour
  if (d > 20) return [200, 100, 50, Math.round((22 - d) * 127)];  // soft edge
  return [10 + (x & 63), 80 + (y & 63), 40, 255];
});
const spriteResult = await encodeLossless(sprite);
await check("sprite with colour under alpha", sprite, spriteResult);

// 1x1 and odd sizes
for (const [w, h] of [[1, 1], [1, 300], [301, 1], [7, 13], [255, 3], [3, 255]] as const) {
  const odd = image(w, h, (x, y) => [(x * 37 + y * 11) & 255, (x * 3) & 255, (y * 91) & 255, x === 0 ? 128 : 255]);
  await check(`${w}x${h}`, odd, await encodeLossless(odd));
}
const single = image(1, 1, () => [1, 2, 3, 4]);
await check("1x1 translucent", single, await encodeLossless(single));

// grey depth-like (R = G = B), opaque and with alpha
const depth = image(100, 100, (x, y) => { const v = Math.round(128 + 100 * Math.sin(x / 9) * Math.cos(y / 11)); return [v, v, v, 255]; });
await check("grey depth", depth, await encodeLossless(depth));
const greyAlpha = image(40, 40, (x, y) => [x * 6, x * 6, x * 6, y > 20 ? 255 : 90]);
await check("grey + alpha", greyAlpha, await encodeLossless(greyAlpha));

// a normal-map-like image: smooth, bluish, all three channels vary
const normal = image(128, 128, (x, y) => [128 + Math.round(60 * Math.sin(x / 7)), 128 + Math.round(60 * Math.cos(y / 9)), 230, 255]);
await check("normal-like", normal, await encodeLossless(normal));

// a file as the script gets it: encodeSource on a (badly compressed) default PNG
const defaultPng = await sharp(Buffer.from(art.data), { raw: { width: 72, height: 72, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer();
const fromSource = await encodeSource(defaultPng);
await check("source png (uncompressed)", art, fromSource);
assert.ok(fromSource.bytes.length < defaultPng.length / 2, "the uncompressed source is recompressed");
assert.equal(fromSource.sourceBytes, defaultPng.length);
// ... and a source that is already small is not made bigger
const already = await sharp(Buffer.from(flat.data), { raw: { width: 64, height: 64, channels: 4 } }).png({ palette: true, colours: 2, effort: 10 }).toBuffer();
const kept = await encodeSource(already);
await check("small source", flat, kept);
assert.ok(kept.bytes.length <= already.length, "never bigger than a source PNG");
// a WebP source (an NPC sheet from the editor) can be re-encoded too
const webpSource = await sharp(Buffer.from(art.data), { raw: { width: 72, height: 72, channels: 4 } }).webp({ lossless: true }).toBuffer();
await check("webp source", art, await encodeSource(webpSource));

// a PNG with a colour profile is kept byte for byte (re-encoding could change what a browser shows)
const profiled = await sharp(Buffer.from(noisy.data), { raw: { width: 96, height: 96, channels: 4 } }).withIccProfile("srgb").png().toBuffer();
assert.ok((await sharp(profiled).metadata()).icc, "the fixture really has a profile");
const profiledResult = await encodeSource(profiled);
assert.ok(profiledResult.bytes.equals(profiled) && profiledResult.ext === "png", "ICC png kept as is");
// ... likewise 16-bit
const sixteen = await sharp(Buffer.alloc(8 * 8 * 3 * 2, 7), { raw: { width: 8, height: 8, channels: 3, depth: "ushort" } as never }).png().toBuffer();
if ((await sharp(sixteen).metadata()).depth === "ushort") {
  assert.ok((await encodeSource(sixteen)).bytes.equals(sixteen), "16-bit png kept as is");
}

// the pixel guard: a WebP encoder that is not exact (or fails) can never win, the PNG is used
const lying = await encodeLossless(art, { webp: async raw => sharp(Buffer.from(raw.data.map((v, i) => i === 5 ? v ^ 1 : v)), { raw: { width: raw.width, height: raw.height, channels: 4 } }).webp({ lossless: true }).toBuffer() });
assert.equal(lying.ext, "png");
assert.equal(lying.webpBytes, undefined, "the inexact WebP is dropped");
await check("inexact webp falls back", art, lying);
const failing = await encodeLossless(art, { webp: async () => { throw new Error("boom"); } });
assert.equal(failing.ext, "png");
// a WebP that is clearly smaller wins ... (a tiny fake PNG encoder makes it so), and a PNG encoder that lies is dropped
const huge = await encodeLossless(art, { png: async raw => sharp(Buffer.from(raw.data), { raw: { width: raw.width, height: raw.height, channels: 4 } }).png({ compressionLevel: 0 }).toBuffer() });
assert.equal(huge.ext, "webp", "WebP wins against a weak PNG");
const wrongPng = await encodeLossless(art, { png: async raw => sharp(Buffer.from(raw.data.map((v, i) => i === 9 ? v ^ 1 : v)), { raw: { width: raw.width, height: raw.height, channels: 4 } }).png().toBuffer() });
await check("inexact png falls back", art, wrongPng);

// a place that only reads PNG: never a WebP, still pixel-exact
const pngOnly = await encodeLossless(art, { pngOnly: true });
assert.equal(pngOnly.ext, "png");
assert.equal(pngOnly.webpBytes, undefined);
await check("png only", art, pngOnly);

// colour counting
assert.equal(countColours(flat), 1);
assert.equal(countColours(noisy, 256), 257);

// the resolution hook: Infinity changes nothing, a finite limit scales down (never up) and keeps the aspect
assert.equal(await limitSize(noisy), noisy);
assert.equal(await limitSize(noisy, 4096), noisy);
const small = await limitSize(image(200, 100, () => [1, 2, 3, 255]), 50);
assert.deepEqual([small.width, small.height], [50, 25]);
const capped = await encodeSource(await sharp(Buffer.from(noisy.data), { raw: { width: 96, height: 96, channels: 4 } }).png().toBuffer(), { maxSize: 48 });
assert.equal((await sharp(capped.bytes).metadata()).width, 48);

console.log("imageEncode: ok");
