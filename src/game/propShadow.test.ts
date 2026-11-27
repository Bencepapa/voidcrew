import assert from "node:assert/strict";
import { DEFAULT_PROP_SHADOW, propShadowAppearance, propShadowStrength } from "./propShadow";

const type = { kind: "prism" as const, size: [0.8, 1, 0.4] as [number, number, number] };
for (const kind of ["prism", "cross", "billboard"] as const) {
  assert.deepEqual(propShadowAppearance({ ...type, kind }), { width: 1, depth: 0.5, opacity: DEFAULT_PROP_SHADOW });
}
assert.deepEqual(propShadowAppearance({ kind: "panel", size: [0.8, 1, 0.01] }), { width: 1, depth: 0.25, opacity: DEFAULT_PROP_SHADOW });
assert.equal(propShadowAppearance({ ...type, kind: "box" }), undefined);
assert.equal(propShadowAppearance({ ...type, shadow: 0 }), undefined);
assert.equal(propShadowStrength(-1), 0);
assert.equal(propShadowStrength(2), 1);
assert.equal(propShadowStrength(Number.NaN), DEFAULT_PROP_SHADOW);
assert.equal(propShadowStrength("0"), DEFAULT_PROP_SHADOW);
const raised = { width: 0.5, depth: 0.25, opacity: 0.4 };
assert.deepEqual(propShadowAppearance({ ...type, shadow: 0.8 }, 0.5), raised);
assert.deepEqual(propShadowAppearance({ ...type, shadow: 0.8, elevation: 0.125 }, 0.25, 2), raised);
assert.deepEqual(propShadowAppearance(type, -1), propShadowAppearance(type));
