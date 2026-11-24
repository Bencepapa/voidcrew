// Run: npx tsx src/game/bundleFiles.test.ts
import assert from "node:assert/strict";
import { bundleExtOf, bundleFileNames, bundleFileOk, bundledTextureFiles, bundledTexturePaths, readBundleFiles } from "./bundleFiles";
import { bundledImageFiles, bundledImageOf } from "./bundledImages";

// names: the extension says what the bytes are, and only the map's own name is accepted
assert.ok(bundleFileOk("diffuse", "diffuse.webp") && bundleFileOk("diffuse", "diffuse.png"));
assert.ok(!bundleFileOk("diffuse", "normal.png"), "a map takes only its own name");
assert.ok(!bundleFileOk("diffuse", "diffuse.jpg") && !bundleFileOk("diffuse", "../diffuse.png") && !bundleFileOk("diffuse", 5));
assert.equal(bundleExtOf("diffuse.webp"), "webp");
assert.equal(bundleExtOf("diffuse.png"), "png");
assert.equal(bundleExtOf(undefined), "png");

// the map form, the old array form, and garbage
assert.deepEqual(readBundleFiles({ diffuse: "diffuse.webp", normal: "normal.png", depth: "depth.exe", glow: "glow.png" }), { diffuse: "diffuse.webp", normal: "normal.png" });
assert.deepEqual(readBundleFiles(["diffuse.png", "normal.png", "surface.png", "other.png"]), { diffuse: "diffuse.png", normal: "normal.png", surface: "surface.png" });
assert.deepEqual(readBundleFiles(undefined), {});
assert.deepEqual(readBundleFiles("diffuse.png"), {});
assert.deepEqual(readBundleFiles(null), {});
assert.deepEqual(bundleFileNames({ diffuse: "webp", normal: "png" }), { diffuse: "diffuse.webp", normal: "normal.png" });

// textures: diffuse is always there (png when unlisted); the other maps only when listed
assert.equal(bundledTextureFiles(undefined).diffuse, "diffuse.png");
assert.equal(bundledTextureFiles({ normal: "normal.webp" }).diffuse, "diffuse.png");
assert.deepEqual(bundledTexturePaths("fantasy_shared_abc", { diffuse: "diffuse.webp", normal: "normal.png", depth: "depth.webp", emissive: "emissive.png", surface: "surface.webp" }, "/voidcrew/"), {
  diffuse: "/voidcrew/textures/fantasy_shared_abc/diffuse.webp",
  normal: "/voidcrew/textures/fantasy_shared_abc/normal.png",
  depth: "/voidcrew/textures/fantasy_shared_abc/depth.webp",
  emissive: "/voidcrew/textures/fantasy_shared_abc/emissive.png",
  surface: "/voidcrew/textures/fantasy_shared_abc/surface.webp",
});
// the old catalog (array of names) reads as before: png names, the flat maps for what it lacks
assert.deepEqual(bundledTexturePaths("t", ["diffuse.png", "normal.png"], "/"), {
  diffuse: "/textures/t/diffuse.png", normal: "/textures/t/normal.png", depth: "/textures/flat/depth.png",
});
assert.deepEqual(bundledTexturePaths("t", undefined, "/"), { diffuse: "/textures/t/diffuse.png", normal: "/textures/flat/normal.png", depth: "/textures/flat/depth.png" });
assert.deepEqual(bundledTexturePaths("t", { diffuse: "diffuse.webp", normal: "evil.webp" }, "/"), {
  diffuse: "/textures/t/diffuse.webp", normal: "/textures/flat/normal.png", depth: "/textures/flat/depth.png",
}, "an unknown name is ignored, never followed");

// images: no `files` = all png (the catalog before WebP); each file takes its own extension
const id = "fantasy_item_0b8c1f6e-1111-4222-8333-444455556666";
assert.deepEqual(bundledImageFiles(id, "/"), {
  diffuse: `/shared-images/${id}.png`, normal: `/shared-images/${id}.normal.png`, depth: `/shared-images/${id}.depth.png`,
});
assert.deepEqual(bundledImageFiles(id, "/b/", { diffuse: "diffuse.webp", normal: "normal.png", depth: "depth.webp" }), {
  diffuse: `/b/shared-images/${id}.webp`, normal: `/b/shared-images/${id}.normal.png`, depth: `/b/shared-images/${id}.depth.webp`,
});
const pickup = bundledImageOf(id, { world: "fantasy", type: "item", name: "Apple", width: 16, height: 16, rev: 1,
  pickup: { category: "supplies", height: 0.2, glow: 0 }, files: { diffuse: "diffuse.webp", normal: "normal.webp", depth: "depth.png" } }, "/");
assert.equal(pickup.url, `/shared-images/${id}.webp`);
assert.equal(pickup.pickup?.normalUrl, `/shared-images/${id}.normal.webp`);
assert.equal(pickup.pickup?.depthUrl, `/shared-images/${id}.depth.png`);
assert.ok(!("files" in pickup), "the catalog's files record does not leak into the image");
const decal = bundledImageOf(id.replace("item", "decal"), { world: "fantasy", type: "decal", name: "Stain", width: 8, height: 8, rev: 1, hasNormal: true, files: { diffuse: "diffuse.png", normal: "normal.webp" } }, "/");
assert.equal(decal.url, `/shared-images/${id.replace("item", "decal")}.png`);
assert.equal(decal.normalUrl, `/shared-images/${id.replace("item", "decal")}.normal.webp`);

console.log("bundleFiles: ok");
