import assert from "node:assert/strict";
import { WORLD_SETTING_KEYS, worldDefaults, worldSettings } from "./worldRenderDefaults";
import type { ViewportSettings } from "../components/GameViewport";

// The fantasy world's tuned defaults; other worlds add nothing.
const fantasy = worldSettings("fantasy");
assert.equal(fantasy.fov, 53);
assert.equal(fantasy.moveDurationMs, 360);
assert.equal(fantasy.eyeHeight, 0.52);
assert.equal(fantasy.cameraPullback, 0.31);
assert.equal(fantasy.mapLightIntensity, 0.45);
assert.equal(fantasy.pointLightIntensity, 2.7);
assert.equal(fantasy.ambientIntensity, 1.8);
assert.deepEqual(worldSettings("scifi"), {});
assert.deepEqual(worldSettings(undefined), {});
assert.equal(WORLD_SETTING_KEYS.length, 7);

// worldDefaults puts the world's values over the given ones and leaves the rest
const base = { fov: 72, eyeHeight: 0.5, fogColor: "#000000" } as unknown as ViewportSettings;
const merged = worldDefaults("fantasy", base) as unknown as Record<string, unknown>;
assert.equal(merged.fov, 53);
assert.equal(merged.fogColor, "#000000");
assert.equal((worldDefaults("scifi", base) as unknown as Record<string, unknown>).fov, 72);
console.log("worldRenderDefaults ok");