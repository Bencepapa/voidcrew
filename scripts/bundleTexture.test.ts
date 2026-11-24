// Run: npx tsx scripts/bundleTexture.test.ts
// The bake of one texture (transparency, Auto maps, lossless encoding) on a synthetic image: no network, no files.
import assert from "node:assert/strict";
import sharp from "sharp";
import { generateMaps } from "../src/render/depthNormal";
import { bakeTexture } from "./bundleTexture";
import { decodeRgba, sameRgba } from "./imageEncode";

const W = 40, H = 30;
const pixels = Buffer.alloc(W * H * 4);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const magenta = x < 6 && y < 6;
  pixels.set(magenta ? [255, 0, 255, 255] : [60 + x * 3, 90 + y * 4, 40 + ((x * y) & 31), x > 30 ? 120 : 255], (y * W + x) * 4);
}
const png = (data: Buffer = pixels) => sharp(data, { raw: { width: W, height: H, channels: 4 } }).png().toBuffer();
const diffuse = await png();
const decodedSource = await decodeRgba(diffuse);

const realFormat = async (bytes: Buffer) => (await sharp(bytes).metadata()).format;

// Auto normal + depth: baked from the diffuse (the same maths the editor uses), diffuse itself untouched
{
  const baked = await bakeTexture({ sources: { diffuse }, maps: { normal: "auto", depth: "auto" }, transparency: { source: "alpha" } });
  assert.deepEqual(Object.keys(baked).sort(), ["depth", "diffuse", "normal"], "diffuse + normal + depth, nothing left to derive");
  const expected = generateMaps(new Uint8ClampedArray(decodedSource.data), W, H);
  for (const key of ["normal", "depth"] as const) {
    const out = baked[key]!;
    assert.equal(await realFormat(out.bytes), out.ext);
    assert.ok(sameRgba(await decodeRgba(out.bytes), { data: Buffer.from(expected[key]), width: W, height: H }), `${key} is the generated map, pixel for pixel`);
  }
  assert.ok(sameRgba(await decodeRgba(baked.diffuse!.bytes), decodedSource), "the diffuse keeps its pixels (alpha included)");
}

// uploaded maps pass through (lossless, same pixels); "none" maps are absent (the game uses its flat map)
{
  const uploaded = await png(Buffer.from(pixels.map((v, i) => (i % 4 === 3 ? 255 : 255 - v))));
  const baked = await bakeTexture({ sources: { diffuse, normal: uploaded }, maps: { normal: "uploaded", depth: "none" }, transparency: { source: "alpha" } });
  assert.deepEqual(Object.keys(baked).sort(), ["diffuse", "normal"]);
  assert.ok(sameRgba(await decodeRgba(baked.normal!.bytes), await decodeRgba(uploaded)));
}

// colour-key transparency is baked into the diffuse (near-magenta -> alpha 0), the Auto maps come from the keyed image
{
  const baked = await bakeTexture({ sources: { diffuse }, maps: { normal: "auto" }, transparency: { source: "colorKey", colorKey: "#ff00ff" } });
  const out = await decodeRgba(baked.diffuse!.bytes);
  assert.equal(out.data[3], 0, "the key colour is transparent");
  assert.deepEqual([...out.data.subarray((10 * W + 20) * 4, (10 * W + 20) * 4 + 4)], [...decodedSource.data.subarray((10 * W + 20) * 4, (10 * W + 20) * 4 + 4)], "other pixels untouched");
  assert.ok(baked.normal && !baked.depth);
}

// transparency "none": every pixel opaque
{
  const baked = await bakeTexture({ sources: { diffuse }, maps: {}, transparency: { source: "none" } });
  const out = await decodeRgba(baked.diffuse!.bytes);
  for (let i = 3; i < out.data.length; i += 4) assert.equal(out.data[i], 255);
  assert.equal(await realFormat(baked.diffuse!.bytes), baked.diffuse!.ext);
}

// a texture with nothing to bake is just encoded
{
  const baked = await bakeTexture({ sources: { diffuse }, maps: {} });
  assert.deepEqual(Object.keys(baked), ["diffuse"]);
  assert.ok(sameRgba(await decodeRgba(baked.diffuse!.bytes), decodedSource));
}

console.log("bundleTexture: ok");
