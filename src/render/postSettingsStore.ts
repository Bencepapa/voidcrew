// The dark fantasy post-process's settings as something that can be kept and carried (see darkFantasyShader.ts):
// text for the clipboard (copy here, paste on another machine or after a lost page), validated on the way back in, and the
// browser's own saved copy so a reload does not lose a hand-tuned look. Kept free of React and three.js.
import { DEFAULT_POST_OTHERS, DEFAULT_POST_RULES, POST_RULE_COUNT, type PostOthers, type PostProcessSettings, type PostRule } from "./postSettings";

/** The settings that make up the look (the mask and the colour look's off switch are session things, not kept). */
export type PostSaved = Pick<PostProcessSettings, "postDark" | "postDarkness" | "postWarm" | "postCold" | "postSaturation" | "postPalette" | "postVignette" | "postRules" | "postOthers">;

const NUMBERS: { key: "postDarkness" | "postWarm" | "postCold" | "postSaturation" | "postPalette" | "postVignette"; min: number; max: number }[] = [
  { key: "postDarkness", min: 0, max: 1 },
  { key: "postWarm", min: 0.5, max: 3 },
  { key: "postCold", min: 0.5, max: 3 },
  { key: "postSaturation", min: 0.5, max: 2 },
  { key: "postPalette", min: 0, max: 1 },
  { key: "postVignette", min: 0, max: 1 },
];

const FORMAT = "voidcrew-dark-fantasy";
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const isHex = (value: unknown): value is string => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

function readRule(raw: unknown, fallback: PostRule): PostRule {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const r = raw as Record<string, unknown>;
  return {
    on: typeof r.on === "boolean" ? r.on : fallback.on,
    hue: isNumber(r.hue) ? clamp(r.hue, 0, 360) : fallback.hue,
    width: isNumber(r.width) ? clamp(r.width, 0, 180) : fallback.width,
    minSat: isNumber(r.minSat) ? clamp(r.minSat, 0, 1) : fallback.minSat,
    mode: r.mode === "keep" || r.mode === "shift" || r.mode === "fade" ? r.mode : fallback.mode,
    target: isHex(r.target) ? r.target : fallback.target,
    sat: isNumber(r.sat) ? clamp(r.sat, 0, 3) : fallback.sat,
    val: isNumber(r.val) ? clamp(r.val, 0, 3) : fallback.val,
  };
}

function readOthers(raw: unknown): PostOthers | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  return {
    mode: o.mode === "keep" || o.mode === "fade" ? o.mode : DEFAULT_POST_OTHERS.mode,
    fade: isNumber(o.fade) ? clamp(o.fade, 0, 1) : DEFAULT_POST_OTHERS.fade,
  };
}

/** The kept settings as they are in `settings` (a fresh object, nothing shared). */
export function pickPostSaved(settings: PostProcessSettings): PostSaved {
  return {
    postDark: settings.postDark,
    postDarkness: settings.postDarkness,
    postWarm: settings.postWarm,
    postCold: settings.postCold,
    postSaturation: settings.postSaturation,
    postPalette: settings.postPalette,
    postVignette: settings.postVignette,
    postRules: settings.postRules.map((rule) => ({ ...rule })),
    postOthers: { ...settings.postOthers },
  };
}

/** The text for the clipboard. */
export function postToText(settings: PostProcessSettings): string {
  return JSON.stringify({ format: FORMAT, v: 1, ...pickPostSaved(settings) }, null, 2);
}

/**
 * Settings read back from text: only the known keys with sane values (numbers clamped to the sliders' ranges, a rule's
 * missing fields from the default rule of its slot). Not this look's text (not JSON, none of its keys): undefined.
 */
export function parsePostText(text: string): Partial<PostSaved> | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const src = raw as Record<string, unknown>;
  if (src.format !== undefined && src.format !== FORMAT) return undefined;
  const out: Partial<PostSaved> = {};
  if (typeof src.postDark === "boolean") out.postDark = src.postDark;
  for (const { key, min, max } of NUMBERS) {
    const value = src[key];
    if (isNumber(value)) out[key] = clamp(value, min, max);
  }
  if (Array.isArray(src.postRules)) {
    out.postRules = Array.from({ length: POST_RULE_COUNT }, (_, i) => readRule(src.postRules instanceof Array ? src.postRules[i] : undefined, DEFAULT_POST_RULES[i]));
  }
  const others = readOthers(src.postOthers);
  if (others) out.postOthers = others;
  return Object.keys(out).length ? out : undefined;
}

// ---- the browser's own copy ----

export const POST_STORAGE_KEY = "voidcrew-dark-fantasy";

export function loadPostSaved(): Partial<PostSaved> {
  try {
    const text = typeof localStorage !== "undefined" ? localStorage.getItem(POST_STORAGE_KEY) : null;
    return (text && parsePostText(text)) || {};
  } catch {
    return {}; // (no storage: the defaults)
  }
}

export function savePostSaved(settings: PostProcessSettings) {
  try {
    localStorage.setItem(POST_STORAGE_KEY, postToText(settings));
  } catch {
    /* (not kept) */
  }
}