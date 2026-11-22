// Run: npx tsx src/editor/imageDraftLogic.test.ts
import assert from "node:assert/strict";
import type { SharedImage } from "../render/sharedImages";
import { canReviseImage, draftFromPublished, publishedUuid, sharedDecalNormalUrl } from "./imageDraftLogic";

const uuid = "0b8c1f6e-1111-4222-8333-444455556666";
const pickup: SharedImage = {
  id: `fantasy_item_${uuid}`, world: "fantasy", type: "item", name: "Red apple", width: 16, height: 16, url: "https://x/r2/diffuse.png",
  pickup: { category: "supplies", height: 0.2, glow: 0.5, value: 7, depthUrl: "https://x/r2/depth.png", normalUrl: "https://x/r2/normal.png" },
};
const decal: SharedImage = { id: `scifi_decal_${uuid}`, world: "scifi", type: "decal", name: "Stain", width: 32, height: 32, surface: "floor", url: "https://x/r1/diffuse.png" };
const still: SharedImage = { id: `fantasy_portrait_${uuid}`, world: "fantasy", type: "portrait", name: "Elder", width: 256, height: 256, purpose: "loading", url: "https://x/r1/diffuse.png" };

// the uuid is the id without "<world>_<type>_"; a built-in picture (any other id) has none
assert.equal(publishedUuid(pickup), uuid);
assert.equal(publishedUuid(decal), uuid);
assert.equal(publishedUuid({ id: "puddle", world: "fantasy", type: "decal" }), "");
assert.equal(publishedUuid({ id: `scifi_item_${uuid}`, world: "fantasy", type: "item" }), "", "the world must match");
assert.equal(publishedUuid({ id: `fantasy_item_${uuid}x`, world: "fantasy", type: "item" }), "", "a malformed uuid");

// a decal's normal file exists only when the meta says so; other types never have one
assert.equal(sharedDecalNormalUrl("decal", true, "https://x/r3/"), "https://x/r3/normal.png");
assert.equal(sharedDecalNormalUrl("decal", undefined, "https://x/r1/"), undefined, "an older revision");
assert.equal(sharedDecalNormalUrl("decal", "true", "https://x/r1/"), undefined);
assert.equal(sharedDecalNormalUrl("item", true, "https://x/r1/"), undefined);

// pickups and decals can be revised, stills (flat pictures) and built-ins cannot
assert.equal(canReviseImage(pickup), true);
assert.equal(canReviseImage(decal), true);
assert.equal(canReviseImage(still), false);
assert.equal(canReviseImage({ id: "puddle", world: "fantasy", type: "decal" }), false);

// a pickup's draft: same id and uuid (so Publish makes the next revision), appearance without URLs, the maps as uploads
{
  const png = new Blob(["d"]), normal = new Blob(["n"]), depth = new Blob(["h"]);
  const draft = draftFromPublished(pickup, { png, normal, depth });
  assert.equal(draft.id, pickup.id);
  assert.equal(draft.uuid, uuid);
  assert.equal(draft.type, "item");
  assert.equal(draft.name, "Red apple");
  assert.equal(draft.png, png);
  assert.deepEqual(draft.pickup, { category: "supplies", height: 0.2, glow: 0.5, value: 7 });
  assert.equal(draft.pickupMaps?.normal, normal);
  assert.equal(draft.pickupMaps?.depth, depth);
  assert.equal(draft.pickupMaps?.aiDepth, false);
  assert.equal(draft.transparency.source, "alpha", "the published diffuse is already cut out: the alpha channel stays");
}

// a pickup with no own value keeps following its category (no value key)
{
  const noValue: SharedImage = { ...pickup, pickup: { ...pickup.pickup!, value: undefined } };
  const draft = draftFromPublished(noValue, { png: new Blob(["d"]) });
  assert.equal("value" in draft.pickup!, false);
}

// a decal's draft keeps its surface and has no pickup data
{
  const draft = draftFromPublished(decal, { png: new Blob(["d"]) });
  assert.equal(draft.surface, "floor");
  assert.equal(draft.pickup, undefined);
  assert.equal(draft.pickupMaps, undefined);
  assert.equal(draft.world, "scifi");
  assert.equal(draft.decalNormal, undefined, "no normal file: the game keeps making one from the picture");
}

// a decal published with a normal map: the draft keeps it as its own normal (a decal has no depth)
{
  const normal = new Blob(["n"]);
  const draft = draftFromPublished({ ...decal, normalUrl: "https://x/r1/normal.png" }, { png: new Blob(["d"]), normal });
  assert.equal(draft.decalNormal, normal);
  assert.equal(draft.pickupMaps, undefined);
}
console.log("imageDraftLogic: ok");
