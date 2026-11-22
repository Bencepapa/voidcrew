// Run: npx tsx src/editor/channelEditor.test.ts
import assert from "node:assert/strict";
import {
  aiChannelOf, canDeriveNormal, ownedPropTexture, normalPixelsFromDepth, propOwnTextureId, SURFACE_CHANNELS, TEXTURE_MODES,
  type ChannelEditor, type ChannelView,
} from "./channelEditor";
import type { MapKey, MapMode } from "./textureDrafts";

// the mode buttons per channel: a texture's diffuse has none to choose, normal / depth may be Auto, the rest Uploaded / None
assert.deepEqual(TEXTURE_MODES("diffuse"), ["uploaded"]);
assert.deepEqual(TEXTURE_MODES("normal"), ["uploaded", "auto", "none"]);
assert.deepEqual(TEXTURE_MODES("depth"), ["uploaded", "auto", "none"]);
assert.deepEqual(TEXTURE_MODES("emissive"), ["uploaded", "none"]);

// the AI section sits under the depth card; a category without depth (decal, NPC sheet) gets it under the normal card
assert.equal(aiChannelOf(SURFACE_CHANNELS), "depth");
assert.equal(aiChannelOf(["diffuse", "normal"]), "normal");
assert.equal(aiChannelOf(["diffuse"]), undefined);

const view = (slots: Partial<Record<MapKey, { mode: MapMode; has: boolean }>>): ChannelView => ({
  pixelArt: true, transparency: { source: "alpha", colorKey: "#ff00ff" },
  slot: key => slots[key] ?? { mode: "none", has: false },
});
const base = (v: ChannelView | undefined, channels: readonly MapKey[] = SURFACE_CHANNELS): Pick<ChannelEditor, "view" | "depthBlob" | "applyNormal" | "channels"> =>
  ({ view: v, channels, depthBlob: async () => undefined, applyNormal: async () => {} });

// "Normal from depth" needs an UPLOADED depth that is really there, and a category that stores a depth and a normal
assert.equal(canDeriveNormal(base(view({ depth: { mode: "uploaded", has: true } }))), true);
assert.equal(canDeriveNormal(base(view({ depth: { mode: "auto", has: false } }))), false, "Auto depth is no file");
assert.equal(canDeriveNormal(base(view({ depth: { mode: "uploaded", has: false } }))), false, "an empty upload");
assert.equal(canDeriveNormal(base(undefined)), false);
assert.equal(canDeriveNormal(base(view({ depth: { mode: "uploaded", has: true } }), ["diffuse", "normal"])), false, "no depth channel");
assert.equal(canDeriveNormal({ ...base(view({ depth: { mode: "uploaded", has: true } })), applyNormal: undefined }), false, "no place to store it");

// a prop's own texture is the shared texture with the prop's id; any other texture is somebody else's
const prop = "fantasy_prop_0b8c1f6e-1111-4222-8333-444455556666";
assert.equal(propOwnTextureId(prop), "fantasy_shared_0b8c1f6e-1111-4222-8333-444455556666");
assert.equal(ownedPropTexture(prop, propOwnTextureId(prop)), propOwnTextureId(prop));
assert.equal(ownedPropTexture(prop, "fantasywall1"), "");
assert.equal(ownedPropTexture(prop, ""), "");
assert.equal(ownedPropTexture(prop, undefined), "");
assert.equal(ownedPropTexture("tree1", "fantasytree1"), "", "a built-in prop has no own texture");

// depth to normal: flat ground stays flat, a slope tilts the same way a reversed slope tilts the other way, alpha is kept
const size = 8;
const depth = (height: (x: number, y: number) => number) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = height(x, y);
    data[i + 3] = 255;
  }
  return { data, width: size, height: size };
};
const at = (pixels: Uint8ClampedArray, x: number, y: number) => { const i = (y * size + x) * 4; return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]; };
{
  const flat = normalPixelsFromDepth(depth(() => 128));
  assert.equal(flat.length, size * size * 4);
  const [r, g, b, a] = at(flat, 3, 3);
  assert.ok(Math.abs(r - 128) <= 1 && Math.abs(g - 128) <= 1 && b >= 254 && a === 255, `flat: ${[r, g, b, a]}`);
  const up = at(normalPixelsFromDepth(depth(x => x * 30)), 3, 3);
  const down = at(normalPixelsFromDepth(depth(x => 210 - x * 30)), 3, 3);
  assert.ok(up[0] !== 128 && down[0] !== 128, "a slope tilts the normal");
  assert.equal(Math.sign(up[0] - 128), -Math.sign(down[0] - 128), "opposite slopes tilt opposite ways");
  assert.ok(Math.abs(up[1] - 128) <= 1, "a slope along x leaves the green channel level");
}
console.log("channelEditor: ok");
