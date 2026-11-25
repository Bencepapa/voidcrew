// Run: npx tsx src/audio/samples.test.ts
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { DEFAULT_INTERVAL, DEFAULT_SAMPLE, SAMPLES, SAMPLE_IDS, isSampleId, sampleUrl } from "./samples";

assert.equal(SAMPLE_IDS.length, 7);
assert.ok(isSampleId("hammer") && isSampleId("birds-forest"));
for (const bad of ["", "nope", "toString", "__proto__", undefined, null, 3, {}]) assert.equal(isSampleId(bad), false, String(bad));
assert.ok(isSampleId(DEFAULT_SAMPLE));
assert.ok(DEFAULT_INTERVAL.min > 0 && DEFAULT_INTERVAL.min <= DEFAULT_INTERVAL.max);

// the loop / one-shot split the task asked for
for (const id of ["birds-forest", "fire-crackle", "fireplace-loop", "crackling-fire"] as const) assert.equal(SAMPLES[id].loop, true, id);
for (const id of ["goblin-cackle", "goblin-death", "hammer"] as const) assert.equal(SAMPLES[id].loop, false, id);

// every entry: a Hungarian name, a gain that makes sense, a file that is really in public/sounds (short, lower-case)
for (const id of SAMPLE_IDS) {
  const def = SAMPLES[id];
  assert.ok(def.name.length > 0, id);
  assert.ok(def.gain > 0 && def.gain <= 4, `${id} gain`);
  assert.match(def.file, /^[a-z0-9-]+\.mp3$/, `${id} file name`);
  const path = new URL(`../../public/sounds/${def.file}`, import.meta.url);
  assert.ok(existsSync(path) && statSync(path).size > 1000, `${def.file} is shipped`);
}
assert.equal(new Set(SAMPLE_IDS.map((id) => SAMPLES[id].file)).size, SAMPLE_IDS.length, "one file each");

// urls: the base with or without its slash
assert.equal(sampleUrl("hammer", "/voidcrew/"), "/voidcrew/sounds/hammer.mp3");
assert.equal(sampleUrl("hammer", "/voidcrew"), "/voidcrew/sounds/hammer.mp3");
assert.equal(sampleUrl("goblin-cackle", "/"), "/sounds/goblin-cackle.mp3");
assert.equal(sampleUrl("goblin-cackle", ""), "/sounds/goblin-cackle.mp3");
console.log("samples: ok");
