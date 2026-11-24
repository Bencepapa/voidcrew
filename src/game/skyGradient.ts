// A gradient sky for open-air decks (MapFile.textures.skyGradient): a vertical
// colour ramp drawn into a small canvas instead of an image in public/skies/.
// Kept free of React and three.js so the map format and the editor can share it.

export interface SkyGradient {
  // the zenith (top of the canvas), the horizon (its middle) and, optionally,
  // the ground/below-horizon colour (its bottom)
  top: string;
  horizon: string;
  bottom?: string;
}

const HEX = /^#[0-9a-fA-F]{6}$/;

const hex = (value: unknown): string | undefined =>
  typeof value === "string" && HEX.test(value) ? value.toLowerCase() : undefined;

// Bad colours are dropped, not an error: no required colour -> no gradient
// (the deck falls back to its sky image / the generated starry sky).
export function cleanSkyGradient(raw: unknown): SkyGradient | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const top = hex(src.top);
  const horizon = hex(src.horizon);
  if (!top || !horizon) return undefined;
  const bottom = hex(src.bottom);
  return bottom ? { top, horizon, bottom } : { top, horizon };
}

// Where each colour sits on the canvas: the zenith at the top, the horizon
// halfway down, the ground at the bottom. Without a ground colour the lower
// half just keeps the horizon colour.
export function skyGradientStops(spec: SkyGradient): { offset: number; color: string }[] {
  const stops = [{ offset: 0, color: spec.top }, { offset: 0.5, color: spec.horizon }];
  if (spec.bottom) stops.push({ offset: 1, color: spec.bottom });
  return stops;
}

// The map settings' sky choice: an image in public/skies/, or a gradient
// (which wins over the image when both are present in an older file).
export type SkyChoice = { kind: "image"; image?: string } | { kind: "gradient"; gradient: SkyGradient };

export function skyTextures(
  current: Record<string, string | SkyGradient | undefined> | undefined,
  choice: SkyChoice,
): Record<string, string | SkyGradient | undefined> | undefined {
  const textures = { ...(current ?? {}) };
  delete textures.sky;
  delete textures.skyGradient;
  if (choice.kind === "image") {
    if (choice.image) textures.sky = choice.image;
  } else {
    const gradient = cleanSkyGradient(choice.gradient);
    if (gradient) textures.skyGradient = gradient;
  }
  return Object.keys(textures).length ? textures : undefined;
}

export interface SkyGradientPreset {
  id: "day" | "dusk" | "night";
  label: string;
  gradient: SkyGradient;
}

export const SKY_GRADIENT_PRESETS: readonly SkyGradientPreset[] = [
  { id: "day", label: "editorBar.skyPresetDay", gradient: { top: "#3b78d8", horizon: "#cfe6ff" } },
  { id: "dusk", label: "editorBar.skyPresetDusk", gradient: { top: "#2a1a4a", horizon: "#ff9a5a" } },
  { id: "night", label: "editorBar.skyPresetNight", gradient: { top: "#05060f", horizon: "#1b2a4a" } },
];
