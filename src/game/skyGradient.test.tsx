// Run: npx tsx src/game/skyGradient.test.tsx
import assert from "node:assert/strict";
import { cleanSkyGradient, SKY_GRADIENT_PRESETS, skyGradientStops } from "./skyGradient";

const spec = { top: "#3B78D8", horizon: "#cfe6ff" };

assert.deepEqual(cleanSkyGradient(spec), { top: "#3b78d8", horizon: "#cfe6ff" });
assert.deepEqual(cleanSkyGradient({ ...spec, bottom: "#123456" }), { top: "#3b78d8", horizon: "#cfe6ff", bottom: "#123456" });

// invalid colours are dropped, never an error
assert.equal(cleanSkyGradient(undefined), undefined);
assert.equal(cleanSkyGradient({ top: "#3b78d8" }), undefined);
assert.equal(cleanSkyGradient({ horizon: "#cfe6ff" }), undefined);
assert.equal(cleanSkyGradient({ top: "3b78d8", horizon: "#cfe6ff" }), undefined);
assert.equal(cleanSkyGradient({ top: "#3b78d8", horizon: "red" }), undefined);
assert.deepEqual(cleanSkyGradient({ ...spec, bottom: "bad" }), { top: "#3b78d8", horizon: "#cfe6ff" });
assert.equal(cleanSkyGradient({ ...spec, top: 42 }), undefined);

// canvas stops: zenith, horizon, optional ground; the latter keeps the horizon
assert.deepEqual(skyGradientStops(cleanSkyGradient(spec)!), [
  { offset: 0, color: "#3b78d8" },
  { offset: 0.5, color: "#cfe6ff" },
]);
assert.deepEqual(skyGradientStops(cleanSkyGradient({ ...spec, bottom: "#000000" })!), [
  { offset: 0, color: "#3b78d8" },
  { offset: 0.5, color: "#cfe6ff" },
  { offset: 1, color: "#000000" },
]);

assert.deepEqual(SKY_GRADIENT_PRESETS.map((p) => p.gradient), [
  { top: "#3b78d8", horizon: "#cfe6ff" },
  { top: "#2a1a4a", horizon: "#ff9a5a" },
  { top: "#05060f", horizon: "#1b2a4a" },
]);
assert.equal(new Set(SKY_GRADIENT_PRESETS.map((p) => p.id)).size, 3);

console.log("skyGradient ok");
