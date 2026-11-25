// The look a map can carry (MapFile.look): a colour grade chosen from a preset and/or set by hand
// (see render/colorGrade.ts). Kept free of React and three.js so the map format, the world
// definitions and the editor can share it.
//
//   { "preset": "cold-mystic", "strength": 0.8, "grade": { "contrast": 1.2, "shadowHue": 240 } }
//
// `preset` is the starting point, `grade` holds the values changed from it by hand (they win over
// the preset's), `strength` mixes the look with the plain picture (default 1). A map's look replaces
// its world's default look (WorldDef.defaultLook) as a whole; { "preset": "none" } switches a world's
// default off for that map.

import {
  GRADE_KEYS,
  clampGradeValue,
  isIdentityGrade,
  isPresetId,
  mergeGrade,
  presetGrade,
  type ColorGrade,
  type GradeKey,
  type LookPresetId,
} from "../render/colorGrade";

export interface LookSpec {
  preset?: LookPresetId;
  strength?: number;
  grade?: Partial<ColorGrade>;
}

export interface ResolvedLook {
  grade: ColorGrade;
  strength: number;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// a stored look, cleaned: an unknown preset is dropped, numbers are clamped to their limits and
// unknown fields are thrown away; nothing left = no look at all (undefined)
export function cleanLook(raw: unknown): LookSpec | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  const out: LookSpec = {};
  if (isPresetId(src.preset)) out.preset = src.preset;
  if (typeof src.strength === "number" && Number.isFinite(src.strength)) out.strength = clamp01(src.strength);
  if (src.grade && typeof src.grade === "object" && !Array.isArray(src.grade)) {
    const g = src.grade as Record<string, unknown>;
    const grade: Partial<ColorGrade> = {};
    for (const key of GRADE_KEYS) {
      const v = g[key];
      if (typeof v === "number" && Number.isFinite(v)) grade[key] = clampGradeValue(key, v);
    }
    if (Object.keys(grade).length) out.grade = grade;
  }
  return Object.keys(out).length ? out : undefined;
}

// the grade a look stands for: its preset's values with its own on top
export function effectiveGrade(look: LookSpec | undefined): ColorGrade {
  return mergeGrade(presetGrade(look?.preset), look?.grade);
}

export function effectiveStrength(look: LookSpec | undefined): number {
  return clamp01(look?.strength ?? 1);
}

// What the renderer applies: the map's own look, else the world's default; null when there is none
// or it changes nothing (an explicit "none" included - which is why a map's look doesn't fall back).
export function resolveLook(own: LookSpec | undefined, inherited?: LookSpec): ResolvedLook | null {
  const spec = own ?? inherited;
  if (!spec) return null;
  const grade = effectiveGrade(spec);
  const strength = effectiveStrength(spec);
  if (strength <= 0 || isIdentityGrade(grade)) return null;
  return { grade, strength };
}

// A resolver that answers with the same object while the map's look and its world's default are the
// same objects (the viewport asks every frame).
export function createLookResolver() {
  let own: LookSpec | undefined;
  let inherited: LookSpec | undefined;
  let result: ResolvedLook | null = null;
  let primed = false;
  return (nextOwn: LookSpec | undefined, nextInherited: LookSpec | undefined): ResolvedLook | null => {
    if (!primed || nextOwn !== own || nextInherited !== inherited) {
      primed = true;
      own = nextOwn;
      inherited = nextInherited;
      result = resolveLook(own, inherited);
    }
    return result;
  };
}

// A look with the values equal to its preset's left out of `grade` (and an empty grade removed),
// so what is stored is what was changed by hand.
export function compactLook(look: LookSpec | undefined): LookSpec | undefined {
  if (!look) return undefined;
  const base = presetGrade(look.preset);
  const grade: Partial<ColorGrade> = {};
  for (const key of GRADE_KEYS) {
    const v = look.grade?.[key];
    if (v !== undefined && v !== base[key]) grade[key] = v;
  }
  const out: LookSpec = {};
  if (look.preset) out.preset = look.preset;
  // (a full strength is the default)
  if (look.strength !== undefined && look.strength !== 1) out.strength = look.strength;
  if (Object.keys(grade).length) out.grade = grade;
  return Object.keys(out).length ? out : undefined;
}

// the editor's edits: each returns the new look (undefined: no look of the map's own)
export function withPreset(look: LookSpec | undefined, preset: LookPresetId): LookSpec {
  // (a new preset starts afresh: the old one's changes by hand go, the strength stays)
  return compactLook({ preset, strength: look?.strength }) ?? { preset };
}

export function withStrength(look: LookSpec | undefined, strength: number): LookSpec {
  return compactLook({ ...look, strength: clamp01(strength) }) ?? {};
}

export function withGradeValue(look: LookSpec | undefined, key: GradeKey, value: number): LookSpec {
  const grade = { ...look?.grade, [key]: clampGradeValue(key, value) };
  return compactLook({ ...look, grade }) ?? {};
}

// the preset's own values again (the strength stays)
export function withoutGradeChanges(look: LookSpec | undefined): LookSpec {
  return withPreset(look, look?.preset ?? "none");
}

// ---- copy and paste ----

const MARK = "voidcrewLook";

// The text of a look for the clipboard: JSON with the whole effective grade, so it still means the
// same if the presets change later.
export function lookToText(look: LookSpec | undefined): string {
  return JSON.stringify({
    [MARK]: 1,
    preset: look?.preset ?? "none",
    strength: effectiveStrength(look),
    grade: effectiveGrade(look),
  });
}

export type LookParse = { ok: true; look: LookSpec } | { ok: false; reason: "empty" | "json" | "format" };

// A look from pasted text: the copied JSON, a bare look object or a map's { "look": ... } excerpt.
// Anything else is rejected, never half-taken.
export function parseLookText(text: string): LookParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "format" };
  const look = compactLook(cleanLook(raw) ?? cleanLook((raw as Record<string, unknown>).look));
  return look ? { ok: true, look } : { ok: false, reason: "format" };
}
