// Run: npx tsx src/editor/sharedUploadPolicy.test.ts
import assert from "node:assert/strict";
import { IMMUTABLE_CACHE_CONTROL, uploadCacheControl } from "./sharedUploadPolicy";

const base = "/storage/v1/object/void-textures/";
const uuid = "0b8c1f6e-1111-4222-8333-444455556666";
// every file of a revision folder, whatever the kind
for (const path of [
  `${base}fantasy/${uuid}/r1/diffuse.png`,
  `${base}fantasy/${uuid}/r12/meta.json`,
  `${base}scifi/decal/${uuid}/r3/normal.png`,
  `${base}fantasy/actor/${uuid}/r2/diffuse.webp`,
  `${base}common/dialogue/void-fantasy/r4/meta.json`,
  `${base}common/shop/market/r1/meta.json`,
]) assert.equal(uploadCacheControl(path, false), IMMUTABLE_CACHE_CONTROL, path);
assert.match(IMMUTABLE_CACHE_CONTROL, /max-age=31536000/);
assert.match(IMMUTABLE_CACHE_CONTROL, /immutable/);

// an overwrite (upsert) never gets a long cache, nor does anything outside a revision folder
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}/r1/diffuse.png`, true), undefined);
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}-name.png`, false), undefined, "legacy flat file");
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}/meta.json`, false), undefined, "a head file");
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}/r0/meta.json`, false), undefined, "r0 is not a revision");
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}/rx/meta.json`, false), undefined);
assert.equal(uploadCacheControl(`${base}fantasy/${uuid}/r1/sub/meta.json`, false), undefined, "only a file directly in the folder");
assert.equal(uploadCacheControl(`/storage/v1/object/other-bucket/a/r1/meta.json`, false), undefined);

console.log("sharedUploadPolicy: ok");
