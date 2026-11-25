// Run: npx tsx src/render/colorGrade.test.ts
import assert from "node:assert/strict";
import {
  GRADE_KEYS,
  GRADE_LIMITS,
  IDENTITY_GRADE,
  LOOK_PRESETS,
  buildLut,
  gradeColor,
  gradeKey,
  isIdentityGrade,
  isPresetId,
  mergeGrade,
  presetGrade,
  swatchesCss,
} from "./colorGrade";

// ---- the identity ----
assert.equal(isIdentityGrade(IDENTITY_GRADE), true);
assert.equal(isIdentityGrade({ ...IDENTITY_GRADE, shadowHue: 10, highlightHue: 300 }), true, "a hue without an amount changes nothing");
assert.equal(isIdentityGrade({ ...IDENTITY_GRADE, shadowAmount: 0.1 }), false);
assert.equal(isIdentityGrade({ ...IDENTITY_GRADE, contrast: 1.01 }), false);
assert.equal(isIdentityGrade(presetGrade("none")), true);
assert.equal(isIdentityGrade(presetGrade(undefined)), true);

// the identity grade gives every colour back exactly
for (const c of [[0, 0, 0], [1, 1, 1], [0.2, 0.5, 0.9], [0.013, 0.6, 0.31]] as const) {
  assert.deepEqual(gradeColor(c[0], c[1], c[2], IDENTITY_GRADE), [c[0], c[1], c[2]]);
}

// ---- the LUT: size, layout, the identity ----
const size = 8;
const identity = buildLut(IDENTITY_GRADE, size);
assert.equal(identity.length, size * size * size * 4);
for (let b = 0; b < size; b++) {
  for (let g = 0; g < size; g++) {
    for (let r = 0; r < size; r++) {
      const i = ((b * size + g) * size + r) * 4;
      // red changes fastest, then green, then blue
      // (floats: the table is a Float32Array)
      assert.ok(Math.abs(identity[i] - r / (size - 1)) < 1e-6, `red at ${r},${g},${b}`);
      assert.ok(Math.abs(identity[i + 1] - g / (size - 1)) < 1e-6, `green at ${r},${g},${b}`);
      assert.ok(Math.abs(identity[i + 2] - b / (size - 1)) < 1e-6, `blue at ${r},${g},${b}`);
      assert.equal(identity[i + 3], 1);
    }
  }
}
assert.equal(buildLut(IDENTITY_GRADE).length, 32 * 32 * 32 * 4, "the default size is 32");
assert.throws(() => buildLut(IDENTITY_GRADE, 1));
assert.throws(() => buildLut(IDENTITY_GRADE, 65));
assert.throws(() => buildLut(IDENTITY_GRADE, 4.5));

// deterministic
assert.deepEqual(buildLut(LOOK_PRESETS[1].grade, 6), buildLut(LOOK_PRESETS[1].grade, 6));

// strength 0 is the identity whatever the grade; strength 1 is the grade; half is in between
const strong = presetGrade("cold-mystic");
assert.deepEqual(buildLut(strong, size, 0), identity);
assert.deepEqual(buildLut(strong, size, -3), identity, "a strength below 0 counts as 0");
assert.deepEqual(buildLut(strong, size, 1), buildLut(strong, size));
assert.deepEqual(buildLut(strong, size, 7), buildLut(strong, size), "a strength above 1 counts as 1");
const full = buildLut(strong, size, 1);
const half = buildLut(strong, size, 0.5);
for (let i = 0; i < full.length; i++) assert.ok(Math.abs(half[i] - (identity[i] + full[i]) / 2) < 1e-6);

// ---- the controls do what they say ----
const grey: [number, number, number] = [0.5, 0.5, 0.5];
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const warm = gradeColor(...grey, { ...IDENTITY_GRADE, temperature: 0.8 });
assert.ok(warm[0] > warm[2], "warm: more red than blue");
const cool = gradeColor(...grey, { ...IDENTITY_GRADE, temperature: -0.8 });
assert.ok(cool[2] > cool[0], "cool: more blue than red");
assert.ok(Math.abs(lum(warm) - 0.5) < 0.02, "white balance keeps the brightness");
const magenta = gradeColor(...grey, { ...IDENTITY_GRADE, tint: 0.8 });
assert.ok(magenta[1] < magenta[0] && magenta[1] < magenta[2], "magenta tint: less green");
assert.ok(gradeColor(...grey, { ...IDENTITY_GRADE, exposure: 1 })[0] > 0.5);
assert.ok(gradeColor(...grey, { ...IDENTITY_GRADE, exposure: -1 })[0] < 0.5);
assert.ok(gradeColor(0.8, 0.8, 0.8, { ...IDENTITY_GRADE, contrast: 1.4 })[0] > 0.8);
assert.ok(gradeColor(0.2, 0.2, 0.2, { ...IDENTITY_GRADE, contrast: 1.4 })[0] < 0.2);
assert.ok(Math.abs(gradeColor(0.5, 0.5, 0.5, { ...IDENTITY_GRADE, contrast: 1.4 })[0] - 0.5) < 1e-9, "mid grey stays");
const sat0 = gradeColor(0.8, 0.3, 0.2, { ...IDENTITY_GRADE, saturation: 0 });
assert.ok(Math.abs(sat0[0] - sat0[1]) < 1e-9 && Math.abs(sat0[1] - sat0[2]) < 1e-9, "no saturation: grey");
assert.ok(gradeColor(0.1, 0.1, 0.1, { ...IDENTITY_GRADE, shadows: 1 })[0] > 0.1, "lifted shadows");
assert.ok(gradeColor(0.9, 0.9, 0.9, { ...IDENTITY_GRADE, highlights: -1 })[0] < 0.9, "dimmer highlights");
// a blue shadow tone: a dark grey turns blue, a bright one hardly
const toned = { ...IDENTITY_GRADE, shadowHue: 240, shadowAmount: 1 };
const darkTone = gradeColor(0.1, 0.1, 0.1, toned);
const lightTone = gradeColor(0.9, 0.9, 0.9, toned);
assert.ok(darkTone[2] - darkTone[0] > 0.1, "shadows toned blue");
assert.ok(lightTone[2] - lightTone[0] < 0.01, "highlights not");

// ---- the presets ----
assert.deepEqual(LOOK_PRESETS.map((p) => p.id), ["none", "cold-mystic", "warm-film", "grey-overcast", "vivid-tale", "cinder"]);
assert.equal(new Set(LOOK_PRESETS.map((p) => p.id)).size, LOOK_PRESETS.length, "unique ids");
for (const preset of LOOK_PRESETS) {
  assert.ok(preset.name.en && preset.name.hu, `${preset.id} has names`);
  assert.ok(isPresetId(preset.id));
  for (const key of GRADE_KEYS) {
    const v = preset.grade[key];
    const { min, max } = GRADE_LIMITS[key];
    assert.ok(Number.isFinite(v) && v >= min && v <= max, `${preset.id}.${key} = ${v} is within ${min}..${max}`);
  }
  // every LUT value within 0..1, and a look other than "none" really changes the picture
  const lut = buildLut(preset.grade, 16);
  for (const v of lut) assert.ok(v >= 0 && v <= 1 && Number.isFinite(v), `${preset.id} LUT value ${v}`);
  assert.equal(isIdentityGrade(preset.grade), preset.id === "none", `${preset.id} identity`);
  assert.equal(swatchesCss(preset.grade).length, 8);
}
assert.equal(isPresetId("bogus"), false);
assert.equal(isPresetId(3), false);
// distinct looks have distinct keys
assert.equal(new Set(LOOK_PRESETS.map((p) => gradeKey(p.grade))).size, LOOK_PRESETS.length);

// the cold look is cooler and the warm one warmer than the plain picture, on a mid grey
const coldGrey = gradeColor(...grey, presetGrade("cold-mystic"));
assert.ok(coldGrey[2] > coldGrey[0]);
const warmGrey = gradeColor(...grey, presetGrade("warm-film"));
assert.ok(warmGrey[0] > warmGrey[2]);
// the grey look is less colourful than the vivid one
const spread = (c: number[]) => Math.max(...c) - Math.min(...c);
assert.ok(spread(gradeColor(0.8, 0.3, 0.2, presetGrade("grey-overcast"))) < spread(gradeColor(0.8, 0.3, 0.2, presetGrade("vivid-tale"))));

// ---- merging keeps values within their limits ----
const merged = mergeGrade(IDENTITY_GRADE, { contrast: 9, saturation: -4, shadowHue: 400, temperature: Number.NaN });
assert.equal(merged.contrast, GRADE_LIMITS.contrast.max);
assert.equal(merged.saturation, 0);
assert.equal(merged.shadowHue, 360);
assert.equal(merged.temperature, 0, "a number that isn't one is ignored");
assert.equal(IDENTITY_GRADE.contrast, 1, "the identity is not touched");

console.log("colorGrade ok");
