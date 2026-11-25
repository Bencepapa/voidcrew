// Run: npx tsx src/game/look.test.ts
import assert from "node:assert/strict";
import {
  cleanLook,
  compactLook,
  createLookResolver,
  effectiveGrade,
  effectiveStrength,
  lookToText,
  parseLookText,
  resolveLook,
  withGradeValue,
  withPreset,
  withStrength,
  withoutGradeChanges,
  type LookSpec,
} from "./look";
import { IDENTITY_GRADE, presetGrade } from "../render/colorGrade";

// ---- cleaning a stored look ----
assert.equal(cleanLook(undefined), undefined);
assert.equal(cleanLook(null), undefined);
assert.equal(cleanLook("cold-mystic"), undefined);
assert.equal(cleanLook([1, 2]), undefined);
assert.equal(cleanLook({}), undefined);
assert.equal(cleanLook({ preset: "bogus" }), undefined, "an unknown preset is dropped (nothing left)");
assert.equal(cleanLook({ foo: 1, bar: { preset: "warm-film" } }), undefined, "unknown fields are thrown away");
assert.deepEqual(cleanLook({ preset: "warm-film" }), { preset: "warm-film" });
assert.deepEqual(cleanLook({ preset: "none" }), { preset: "none" }, "an explicit none is kept");
assert.deepEqual(cleanLook({ preset: "bogus", strength: 0.5 }), { strength: 0.5 });
assert.deepEqual(cleanLook({ preset: "cinder", strength: 4 }), { preset: "cinder", strength: 1 });
assert.deepEqual(cleanLook({ preset: "cinder", strength: -4 }), { preset: "cinder", strength: 0 });
assert.deepEqual(cleanLook({ preset: "cinder", strength: "0.5" }), { preset: "cinder" });
assert.deepEqual(cleanLook({ preset: "cinder", strength: Number.NaN }), { preset: "cinder" });
assert.deepEqual(
  cleanLook({ grade: { contrast: 9, saturation: -1, shadowHue: 400, tint: "x", temperature: Infinity, nonsense: 5, exposure: 0.5 } }),
  { grade: { contrast: 1.5, saturation: 0, shadowHue: 360, exposure: 0.5 } },
  "numbers are clamped, junk is dropped",
);
assert.equal(cleanLook({ grade: { nonsense: 5 } }), undefined);
assert.equal(cleanLook({ grade: [1] }), undefined);

// ---- the effective grade and strength ----
assert.deepEqual(effectiveGrade(undefined), IDENTITY_GRADE);
assert.deepEqual(effectiveGrade({ preset: "cold-mystic" }), presetGrade("cold-mystic"));
assert.equal(effectiveGrade({ preset: "cold-mystic", grade: { contrast: 1.3 } }).contrast, 1.3, "the grade wins over the preset");
assert.equal(effectiveGrade({ preset: "cold-mystic", grade: { contrast: 1.3 } }).saturation, presetGrade("cold-mystic").saturation);
assert.equal(effectiveStrength(undefined), 1);
assert.equal(effectiveStrength({ strength: 0.3 }), 0.3);

// ---- resolving: the map's, else the world's ----
const worldLook: LookSpec = { preset: "warm-film", strength: 0.8 };
assert.equal(resolveLook(undefined, undefined), null, "no look anywhere: nothing");
assert.deepEqual(resolveLook(undefined, worldLook), { grade: presetGrade("warm-film"), strength: 0.8 }, "the world's default");
assert.deepEqual(resolveLook({ preset: "cinder" }, worldLook), { grade: presetGrade("cinder"), strength: 1 }, "the map's own wins as a whole");
assert.equal(resolveLook({ preset: "none" }, worldLook), null, "an explicit none switches the default off");
assert.equal(resolveLook({ preset: "cinder", strength: 0 }, worldLook), null, "strength 0 is no look");
// (an empty look isn't what a file holds - cleanLook drops it - but if one is given it changes nothing)
assert.equal(resolveLook({}, worldLook), null);
assert.equal(resolveLook({ preset: "none", grade: { shadowAmount: 0, contrast: 1 } }, undefined), null, "a grade that changes nothing");
const custom = resolveLook({ preset: "none", grade: { saturation: 0.5 } }, undefined);
assert.equal(custom?.grade.saturation, 0.5, "a hand-made look from the neutral one");

// the resolver gives back the same object for the same inputs
const resolver = createLookResolver();
const own: LookSpec = { preset: "cinder" };
const a = resolver(own, undefined);
assert.equal(resolver(own, undefined), a);
assert.notEqual(resolver({ preset: "cinder" }, undefined), a, "another look object is resolved anew");
assert.equal(resolver(undefined, undefined), null);
assert.equal(resolver(undefined, undefined), null);

// ---- the editor's edits ----
let look = withPreset(undefined, "cold-mystic");
assert.deepEqual(look, { preset: "cold-mystic" });
look = withStrength(look, 0.6);
assert.deepEqual(look, { preset: "cold-mystic", strength: 0.6 });
look = withGradeValue(look, "contrast", 1.3);
assert.deepEqual(look, { preset: "cold-mystic", strength: 0.6, grade: { contrast: 1.3 } });
// a value back at the preset's own is not stored
look = withGradeValue(look, "contrast", presetGrade("cold-mystic").contrast);
assert.deepEqual(look, { preset: "cold-mystic", strength: 0.6 });
// values are clamped
assert.deepEqual(withGradeValue({ preset: "none" }, "saturation", 9), { preset: "none", grade: { saturation: 2 } });
// a new preset drops the changes by hand, keeps the strength
assert.deepEqual(withPreset({ preset: "cold-mystic", strength: 0.6, grade: { contrast: 1.3 } }, "cinder"), { preset: "cinder", strength: 0.6 });
assert.deepEqual(withoutGradeChanges({ preset: "cinder", strength: 0.6, grade: { contrast: 1.3 } }), { preset: "cinder", strength: 0.6 });
assert.deepEqual(withoutGradeChanges({ grade: { contrast: 1.3 } }), { preset: "none" });
// strength 1 is the default and isn't stored
assert.deepEqual(withStrength({ preset: "cinder", strength: 0.5 }, 1), { preset: "cinder" });
const before = { preset: "cinder" as const };
withGradeValue(before, "tint", 0.5);
assert.deepEqual(before, { preset: "cinder" }, "the look given is not changed");
assert.equal(compactLook(undefined), undefined);
assert.equal(compactLook({}), undefined);

// ---- copy and paste ----
const sample: LookSpec = { preset: "warm-film", strength: 0.7, grade: { contrast: 1.3, shadowHue: 250 } };
const text = lookToText(sample);
const roundTrip = parseLookText(text);
assert.ok(roundTrip.ok);
assert.deepEqual(roundTrip.ok && roundTrip.look, sample, "what is copied is what is pasted");
assert.deepEqual(parseLookText(lookToText({ preset: "cinder" })), { ok: true, look: { preset: "cinder" } });
assert.deepEqual(parseLookText(lookToText({ preset: "none" })), { ok: true, look: { preset: "none" } });
// the whole effective grade is in the text, so it survives a change of the presets
assert.deepEqual(JSON.parse(text).grade, effectiveGrade(sample));
// other forms taken: a bare look, and a map's { look } excerpt
assert.deepEqual(parseLookText('{"preset":"cinder","strength":0.4}'), { ok: true, look: { preset: "cinder", strength: 0.4 } });
assert.deepEqual(parseLookText('  {"look":{"preset":"cinder"},"name":"x"}  '), { ok: true, look: { preset: "cinder" } });
// values are cleaned on the way in
assert.deepEqual(parseLookText('{"preset":"none","grade":{"contrast":9}}'), { ok: true, look: { preset: "none", grade: { contrast: 1.5 } } });
// bad text is rejected
assert.deepEqual(parseLookText(""), { ok: false, reason: "empty" });
assert.deepEqual(parseLookText("   \n"), { ok: false, reason: "empty" });
assert.deepEqual(parseLookText("hello"), { ok: false, reason: "json" });
assert.deepEqual(parseLookText("{not json"), { ok: false, reason: "json" });
assert.deepEqual(parseLookText("[1,2,3]"), { ok: false, reason: "format" });
assert.deepEqual(parseLookText("42"), { ok: false, reason: "format" });
assert.deepEqual(parseLookText("null"), { ok: false, reason: "format" });
assert.deepEqual(parseLookText("{}"), { ok: false, reason: "format" });
assert.deepEqual(parseLookText('{"name":"a map","layout":["WW"]}'), { ok: false, reason: "format" });
assert.deepEqual(parseLookText('{"preset":"bogus"}'), { ok: false, reason: "format" });

console.log("look ok");
