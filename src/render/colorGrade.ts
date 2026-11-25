// The colour look ("Színvilág"): a colour grade like a film's colour filter, applied to the finished
// picture by a 3D lookup table (see colorLookShader.ts, colorLookPass.ts). This file is the pure
// part, free of React and three.js, so the maths and the presets can be tested in node.
//
// A grade is a handful of friendly controls (white balance, exposure, contrast, saturation, the
// shadows and highlights, a colour for each of the two) that are baked into a LUT: for every
// (r, g, b) on a size^3 grid of display-referred sRGB values, the graded colour. The renderer then
// looks every pixel up in that table, so the cost of the look does not depend on how many controls
// it has. See concept/editor-ui/NOTES-color-look.md.

export interface ColorGrade {
  // white balance: -1 cool (blue) .. 1 warm (yellow); in linear light, brightness kept
  temperature: number;
  // -1 green .. 1 magenta
  tint: number;
  // exposure in stops (EV), in linear light
  exposure: number;
  // 1 = unchanged; around mid grey
  contrast: number;
  // 0 = grey, 1 = unchanged, 2 = twice as vivid
  saturation: number;
  // -1 deeper .. 1 lifted shadows
  shadows: number;
  // -1 dimmer .. 1 brighter highlights
  highlights: number;
  // the colour the shadows are toned to (hue in degrees) and how much
  shadowHue: number;
  shadowAmount: number;
  // the same for the highlights
  highlightHue: number;
  highlightAmount: number;
}

export type GradeKey = keyof ColorGrade;

export interface GradeLimit {
  min: number;
  max: number;
  step: number;
}

export const GRADE_KEYS: GradeKey[] = [
  "temperature",
  "tint",
  "exposure",
  "contrast",
  "saturation",
  "shadows",
  "highlights",
  "shadowHue",
  "shadowAmount",
  "highlightHue",
  "highlightAmount",
];

export const GRADE_LIMITS: Record<GradeKey, GradeLimit> = {
  temperature: { min: -1, max: 1, step: 0.01 },
  tint: { min: -1, max: 1, step: 0.01 },
  exposure: { min: -2, max: 2, step: 0.05 },
  contrast: { min: 0.5, max: 1.5, step: 0.01 },
  saturation: { min: 0, max: 2, step: 0.01 },
  shadows: { min: -1, max: 1, step: 0.01 },
  highlights: { min: -1, max: 1, step: 0.01 },
  shadowHue: { min: 0, max: 360, step: 1 },
  shadowAmount: { min: 0, max: 1, step: 0.01 },
  highlightHue: { min: 0, max: 360, step: 1 },
  highlightAmount: { min: 0, max: 1, step: 0.01 },
};

// no change at all (the hues don't matter while their amounts are 0)
export const IDENTITY_GRADE: Readonly<ColorGrade> = Object.freeze({
  temperature: 0,
  tint: 0,
  exposure: 0,
  contrast: 1,
  saturation: 1,
  shadows: 0,
  highlights: 0,
  shadowHue: 220,
  shadowAmount: 0,
  highlightHue: 40,
  highlightAmount: 0,
});

export function clampGradeValue(key: GradeKey, value: number): number {
  const { min, max } = GRADE_LIMITS[key];
  return Math.min(max, Math.max(min, value));
}

// the grade with `over` laid on top; every value ends within its limits
export function mergeGrade(base: Readonly<ColorGrade>, over?: Partial<ColorGrade>): ColorGrade {
  const out = { ...base };
  if (over) {
    for (const key of GRADE_KEYS) {
      const v = over[key];
      if (typeof v === "number" && Number.isFinite(v)) out[key] = clampGradeValue(key, v);
    }
  }
  return out;
}

// whether the grade changes nothing (the hues of an amount-less tone don't count)
export function isIdentityGrade(grade: Readonly<ColorGrade>): boolean {
  const g = grade;
  const id = IDENTITY_GRADE;
  return (
    g.temperature === id.temperature &&
    g.tint === id.tint &&
    g.exposure === id.exposure &&
    g.contrast === id.contrast &&
    g.saturation === id.saturation &&
    g.shadows === id.shadows &&
    g.highlights === id.highlights &&
    g.shadowAmount === 0 &&
    g.highlightAmount === 0
  );
}

// a stable text for a grade, to tell whether a lookup table has to be built again
export function gradeKey(grade: Readonly<ColorGrade>): string {
  return GRADE_KEYS.map((key) => grade[key]).join(",");
}

// ---- the presets ----

export type LookPresetId = "none" | "cold-mystic" | "warm-film" | "grey-overcast" | "vivid-tale" | "cinder";

export interface LookPreset {
  id: LookPresetId;
  name: { en: string; hu: string };
  grade: Readonly<ColorGrade>;
}

const make = (over: Partial<ColorGrade>): Readonly<ColorGrade> => Object.freeze(mergeGrade(IDENTITY_GRADE, over));

export const LOOK_PRESETS: readonly LookPreset[] = [
  { id: "none", name: { en: "Neutral (none)", hu: "Semleges (nincs)" }, grade: IDENTITY_GRADE },
  {
    // cool blue shadows, held-back colour, firm contrast
    id: "cold-mystic",
    name: { en: "Cold and mystic", hu: "Hideg-misztikus" },
    grade: make({
      temperature: -0.3,
      tint: 0.05,
      exposure: -0.1,
      contrast: 1.15,
      saturation: 0.8,
      shadows: -0.1,
      shadowHue: 225,
      shadowAmount: 0.45,
      highlightHue: 200,
      highlightAmount: 0.15,
    }),
  },
  {
    // teal shadows, orange highlights
    id: "warm-film",
    name: { en: "Warm film", hu: "Meleg-filmes" },
    grade: make({
      temperature: 0.2,
      contrast: 1.1,
      saturation: 1.05,
      shadowHue: 190,
      shadowAmount: 0.4,
      highlightHue: 35,
      highlightAmount: 0.35,
    }),
  },
  {
    // washed out, a slight blue
    id: "grey-overcast",
    name: { en: "Grey overcast", hu: "Szürke-borús" },
    grade: make({
      temperature: -0.1,
      exposure: -0.05,
      contrast: 1.05,
      saturation: 0.55,
      shadowHue: 215,
      shadowAmount: 0.15,
      highlightHue: 210,
      highlightAmount: 0.1,
    }),
  },
  {
    // bright, vivid, lifted shadows
    id: "vivid-tale",
    name: { en: "Vivid tale", hu: "Élénk mese" },
    grade: make({
      temperature: 0.08,
      exposure: 0.15,
      contrast: 1.05,
      saturation: 1.4,
      shadows: 0.2,
      highlights: 0.1,
    }),
  },
  {
    // dark, brown-red shadows
    id: "cinder",
    name: { en: "Cinder", hu: "Pernye" },
    grade: make({
      temperature: 0.15,
      exposure: -0.25,
      contrast: 1.2,
      saturation: 0.75,
      shadows: -0.2,
      shadowHue: 20,
      shadowAmount: 0.45,
      highlightHue: 30,
      highlightAmount: 0.15,
    }),
  },
];

export const LOOK_PRESET_IDS: LookPresetId[] = LOOK_PRESETS.map((p) => p.id);

export function isPresetId(id: unknown): id is LookPresetId {
  return typeof id === "string" && (LOOK_PRESET_IDS as string[]).includes(id);
}

export function presetGrade(id: LookPresetId | undefined): Readonly<ColorGrade> {
  return LOOK_PRESETS.find((p) => p.id === id)?.grade ?? IDENTITY_GRADE;
}

// ---- the maths (display-referred sRGB in and out, 0..1) ----

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => {
  const v = c < 0 ? 0 : c;
  return clamp01(v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
};

// a fully saturated colour of a hue (degrees)
function hueRgb(hue: number): [number, number, number] {
  const h = ((((hue % 360) + 360) % 360) / 60);
  const x = 1 - Math.abs((h % 2) - 1);
  if (h < 1) return [1, x, 0];
  if (h < 2) return [x, 1, 0];
  if (h < 3) return [0, 1, x];
  if (h < 4) return [0, x, 1];
  if (h < 5) return [x, 0, 1];
  return [1, 0, x];
}

// One colour through a grade. Each step is skipped while its controls are at rest, so the identity
// grade returns its input exactly.
export function gradeColor(r: number, g: number, b: number, grade: Readonly<ColorGrade>): [number, number, number] {
  r = clamp01(r);
  g = clamp01(g);
  b = clamp01(b);

  // white balance and exposure, in linear light
  if (grade.temperature !== 0 || grade.tint !== 0 || grade.exposure !== 0) {
    let gr = 1 + 0.3 * grade.temperature + 0.1 * grade.tint;
    let gg = 1 - 0.2 * grade.tint;
    let gb = 1 - 0.3 * grade.temperature + 0.1 * grade.tint;
    // (the balance moves the colour, not the brightness)
    const keep = luma(gr, gg, gb);
    const ev = Math.pow(2, grade.exposure);
    gr = (gr / keep) * ev;
    gg = (gg / keep) * ev;
    gb = (gb / keep) * ev;
    r = toSrgb(toLinear(r) * gr);
    g = toSrgb(toLinear(g) * gg);
    b = toSrgb(toLinear(b) * gb);
  }

  if (grade.contrast !== 1) {
    r = clamp01((r - 0.5) * grade.contrast + 0.5);
    g = clamp01((g - 0.5) * grade.contrast + 0.5);
    b = clamp01((b - 0.5) * grade.contrast + 0.5);
  }

  if (grade.shadows !== 0 || grade.highlights !== 0) {
    const l = luma(r, g, b);
    const dark = (1 - l) * (1 - l);
    const d = grade.shadows * 0.25 * dark + grade.highlights * 0.2 * l * l;
    r = clamp01(r + d);
    g = clamp01(g + d);
    b = clamp01(b + d);
  }

  // split toning: the tone colour's chroma (its colour without its brightness), weighted by how
  // dark or how bright the pixel is
  if (grade.shadowAmount > 0 || grade.highlightAmount > 0) {
    const l = luma(r, g, b);
    if (grade.shadowAmount > 0) {
      const [cr, cg, cb] = hueRgb(grade.shadowHue);
      const cl = luma(cr, cg, cb);
      const k = grade.shadowAmount * 0.35 * (1 - l) * (1 - l);
      r += (cr - cl) * k;
      g += (cg - cl) * k;
      b += (cb - cl) * k;
    }
    if (grade.highlightAmount > 0) {
      const [cr, cg, cb] = hueRgb(grade.highlightHue);
      const cl = luma(cr, cg, cb);
      const k = grade.highlightAmount * 0.35 * l * l;
      r += (cr - cl) * k;
      g += (cg - cl) * k;
      b += (cb - cl) * k;
    }
    r = clamp01(r);
    g = clamp01(g);
    b = clamp01(b);
  }

  if (grade.saturation !== 1) {
    const l = luma(r, g, b);
    r = clamp01(l + (r - l) * grade.saturation);
    g = clamp01(l + (g - l) * grade.saturation);
    b = clamp01(l + (b - l) * grade.saturation);
  }
  return [r, g, b];
}

export const LUT_SIZE = 32;

// The lookup table of a grade: size^3 entries of RGBA floats in 0..1, red changing fastest, then
// green, then blue (the layout of a 3D texture: index = ((b * size + g) * size + r) * 4). `strength`
// mixes the look with the original (0 = the colours unchanged, 1 = the whole look).
export function buildLut(grade: Readonly<ColorGrade>, size = LUT_SIZE, strength = 1): Float32Array {
  if (!Number.isInteger(size) || size < 2 || size > 64) throw new Error(`LUT size ${size} isn't an integer from 2 to 64`);
  const mix = Math.min(1, Math.max(0, strength));
  const out = new Float32Array(size * size * size * 4);
  const last = size - 1;
  let i = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const sr = r / last;
        const sg = g / last;
        const sb = b / last;
        const [gr, gg, gb] = gradeColor(sr, sg, sb, grade);
        out[i++] = sr + (gr - sr) * mix;
        out[i++] = sg + (gg - sg) * mix;
        out[i++] = sb + (gb - sb) * mix;
        out[i++] = 1;
      }
    }
  }
  return out;
}

// A few typical colours, for the editor's little before / after strip: dark, mid and light grey,
// stone, grass, sky, fire and skin.
export const SWATCH_COLORS: readonly [number, number, number][] = [
  [0.08, 0.08, 0.09],
  [0.45, 0.45, 0.45],
  [0.88, 0.88, 0.86],
  [0.5, 0.45, 0.38],
  [0.25, 0.5, 0.2],
  [0.35, 0.55, 0.85],
  [0.9, 0.4, 0.1],
  [0.85, 0.65, 0.52],
];

export function swatchesCss(grade: Readonly<ColorGrade>): string[] {
  return SWATCH_COLORS.map(([r, g, b]) => {
    const [gr, gg, gb] = gradeColor(r, g, b, grade);
    return `rgb(${Math.round(gr * 255)} ${Math.round(gg * 255)} ${Math.round(gb * 255)})`;
  });
}
