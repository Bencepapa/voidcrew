// Run: npx tsx src/game/bundledImages.test.ts
import assert from "node:assert/strict";
import { bundledImageFiles, bundledImageOf, readPickupAppearance, type BundledImageEntry } from "./bundledImages";

const uuid = "0b8c1f6e-1111-4222-8333-444455556666";

// the files sit next to each other
assert.deepEqual(bundledImageFiles(`fantasy_item_${uuid}`, "/"), {
  diffuse: `/shared-images/fantasy_item_${uuid}.png`,
  normal: `/shared-images/fantasy_item_${uuid}.normal.png`,
  depth: `/shared-images/fantasy_item_${uuid}.depth.png`,
});

// a pickup: its maps are the files next to it, its look is the catalog's (limits applied)
const item: BundledImageEntry = { world: "fantasy", type: "item", name: "Apple", width: 16, height: 16, rev: 2,
  pickup: { category: "supplies", height: 9, glow: -1, value: 7.4 } };
const apple = bundledImageOf(`fantasy_item_${uuid}`, item, "/voidcrew/");
assert.equal(apple.url, `/voidcrew/shared-images/fantasy_item_${uuid}.png`);
assert.deepEqual(apple.pickup, {
  category: "supplies", height: 2, glow: 0, value: 7,
  depthUrl: `/voidcrew/shared-images/fantasy_item_${uuid}.depth.png`, normalUrl: `/voidcrew/shared-images/fantasy_item_${uuid}.normal.png`,
});
assert.equal(apple.normalUrl, undefined, "a pickup's normal map is part of the pickup");

// a pickup without a look (a damaged catalog) still gets the default one, so it can be registered
const bare = bundledImageOf(`fantasy_item_${uuid}`, { ...item, pickup: {} as never }, "/");
assert.equal(bare.pickup?.category, "salvage");
assert.equal(bare.pickup?.value, undefined, "no own value: the category's default counts when registered");
// no pickup block at all: not a usable pickup, the picture alone
assert.equal(bundledImageOf(`fantasy_item_${uuid}`, { ...item, pickup: undefined }, "/").pickup, undefined);

// a decal with its own normal map; a still has neither
const decal = bundledImageOf(`scifi_decal_${uuid}`, { world: "scifi", type: "decal", name: "Stain", width: 32, height: 32, rev: 1, surface: "floor", hasNormal: true }, "/");
assert.equal(decal.normalUrl, `/shared-images/scifi_decal_${uuid}.normal.png`);
assert.equal(decal.pickup, undefined);
const still = bundledImageOf(`fantasy_portrait_${uuid}`, { world: "fantasy", type: "portrait", name: "Elder", width: 256, height: 256, rev: 1, purpose: "loading" }, "/");
assert.equal(still.normalUrl, undefined);
assert.equal(still.purpose, "loading");

assert.deepEqual(readPickupAppearance(null), { category: "salvage", height: 0.2, glow: 0 });
assert.equal(readPickupAppearance({ category: "bogus" as never }).category, "salvage");
assert.equal(readPickupAppearance({ value: -3 }).value, undefined);
assert.equal(readPickupAppearance({ value: 99999 }).value, 10000);

console.log("bundledImages: ok");
