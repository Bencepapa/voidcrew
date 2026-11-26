import assert from "node:assert/strict";
import { DEFAULT_INTERVAL, samplePatch, sampleSource } from "./samples";
import { isSharedSampleId, readSoundDefinition, registerSharedSamples, sharedSamples, subscribeSharedSamples } from "./sharedSamples";

const id = "fantasy_sound_00000000-0000-4000-8000-000000000001";
const metadata = { name: " Forest ", category: "effect", format: "wav", duration: 3, bytes: 1200, volume: 0.35, rate: 1.5 };
const definition = readSoundDefinition(metadata);
assert.ok(definition);
assert.equal(definition.name, "Forest");
for (const change of [{ volume: -1 }, { rate: 3 }, { duration: Infinity }, { bytes: 0.2 }, { format: "__proto__" }, { category: "tone" }]) {
  assert.equal(readSoundDefinition({ ...metadata, ...change }), undefined);
}
assert.equal(isSharedSampleId(id), true);
assert.equal(isSharedSampleId(id + "/sound.wav"), false);
assert.equal(sampleSource(id, "/"), undefined);

let notifications = 0;
const stop = subscribeSharedSamples(() => notifications++);
const entry = { ...definition, id, world: "fantasy" as const, url: "https://example.test/r1/sound.wav" };
registerSharedSamples([entry]);
const firstSnapshot = sharedSamples();
registerSharedSamples([entry]);
assert.equal(notifications, 1);
assert.equal(sharedSamples(), firstSnapshot);
assert.deepEqual(sampleSource(id, "/"), { url: entry.url, format: "wav", loop: false, gain: 1 });
assert.deepEqual(samplePatch(id), { kind: "sample", sample: id, volume: 0.35, rate: 1.5, interval: DEFAULT_INTERVAL });
assert.deepEqual(samplePatch("fire-crackle"), { kind: "sample", sample: "fire-crackle", interval: undefined });
registerSharedSamples([{ ...entry, url: "https://example.test/r2/sound.wav" }]);
assert.equal(notifications, 2);
assert.notEqual(sharedSamples(), firstSnapshot);
registerSharedSamples([entry]);
assert.equal(notifications, 2, "an older fetch cannot replace a published revision");
stop();
