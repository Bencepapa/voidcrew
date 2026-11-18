// The optional dark fantasy post-process's settings (see
// darkFantasyShader.ts and concept/editor-ui/NOTES-dark-fantasy-post.md):
// the global sliders, the colour rule set and the debug mask. Kept free of
// React and three.js so the shader's uniform update can use it too.

export type PostRuleMode = "keep" | "shift" | "fade";
export type PostOthersMode = "keep" | "fade";
export type PostMaskMode = "off" | "rules";

export interface PostRule {
  on: boolean;
  // source hue centre (degrees, 0-360) and its half-width (degrees)
  hue: number;
  width: number;
  minSat: number;
  mode: PostRuleMode;
  // the target colour ("#rrggbb"); only its hue is used for Shift
  target: string;
  // saturation and value scale for Shift
  sat: number;
  val: number;
}

export interface PostOthers {
  mode: PostOthersMode;
  fade: number;
}

export interface PostProcessSettings {
  postDark: boolean;
  postDarkness: number;
  postWarm: number;
  postCold: number;
  postSaturation: number;
  postPalette: number;
  postVignette: number;
  postRules: PostRule[];
  postOthers: PostOthers;
  postMask: PostMaskMode;
}

export const POST_RULE_COUNT = 4;

export const DEFAULT_POST_RULES: PostRule[] = [
  // red / orange / yellow: pulled to the fire colour (yellow-green is not caught)
  { on: true, hue: 22.5, width: 22.5, minSat: 0.12, mode: "shift", target: "#ff6414", sat: 1, val: 1 },
  // blue / violet: pulled to a deep blue
  { on: true, hue: 240, width: 35, minSat: 0.12, mode: "shift", target: "#06315c", sat: 1, val: 1 },
  // green / turquoise: kept (important objects)
  { on: true, hue: 140, width: 50, minSat: 0.12, mode: "keep", target: "#00ff80", sat: 1, val: 1 },
  // spare slot
  { on: false, hue: 300, width: 30, minSat: 0.2, mode: "shift", target: "#ff00ff", sat: 1, val: 1 },
];

export const DEFAULT_POST_OTHERS: PostOthers = { mode: "fade", fade: 0.5 };

export function defaultPostSettings(): PostProcessSettings {
  return {
    postDark: false,
    postDarkness: 0.7,
    postWarm: 1.8,
    postCold: 1.5,
    postSaturation: 1.3,
    postPalette: 0.9,
    postVignette: 0.6,
    postRules: DEFAULT_POST_RULES.map((rule) => ({ ...rule })),
    postOthers: { ...DEFAULT_POST_OTHERS },
    postMask: "off",
  };
}

// the hue (degrees) of a "#rrggbb" colour, for the source-hue picker
export function hueOfHex(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const n = parseInt(match[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

// a fully saturated colour for a hue (degrees), for the source-hue picker
export function hueToHex(hue: number): string {
  const h = ((((hue % 360) + 360) % 360) / 60);
  const s = 0.9;
  const v = 0.85;
  const c = v * s;
  const x = c * (1 - Math.abs((h % 2) - 1));
  const m = v - c;
  const rgb: [number, number, number] =
    h < 1 ? [c, x, 0] : h < 2 ? [x, c, 0] : h < 3 ? [0, c, x] : h < 4 ? [0, x, c] : h < 5 ? [x, 0, c] : [c, 0, x];
  return `#${rgb.map((channel) => Math.round((channel + m) * 255).toString(16).padStart(2, "0")).join("")}`;
}
