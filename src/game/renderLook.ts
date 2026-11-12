// The render values a map can carry (MapFile.render): the viewer's debug
// sliders that belong to a deck's look rather than to the testing session.
// Opening a map applies them over the viewer's defaults; "Save to map" in
// the debug panel writes the current ones back. Kept free of React and
// three.js so the map format can use it.

export const RENDER_NUMBER_KEYS = [
  "roughness",
  "metalness",
  "normalStrength",
  "aoIntensity",
  "aoDirect",
  "aoRadius",
  "wallHeight",
  "ambientIntensity",
  "mapLightIntensity",
  // the baked light bounced round corners (see lightGrid.ts bounceLight)
  "lightBounce",
  "accentRatio",
  // the sky's light on the cells under an open ceiling (strength; compass
  // degrees it comes from; degrees above the horizon)
  "skyLightIntensity",
  "skyLightAzimuth",
  "skyLightElevation",
  "reliefLevels",
  "reliefMinIsland",
  "displacementScale",
  // the floors' own relief depth and normal strength (0: as the walls')
  "floorReliefDepth",
  "floorNormalStrength",
] as const;

export type RenderNumberKey = (typeof RENDER_NUMBER_KEYS)[number];

// how the relief geometry is made: stepped from a few distinct height
// levels (machinery, panels), or a smooth height field with slopes
// (stone, hedges, trees)
export type ReliefMode = "steps" | "smooth";
export type WallProfile = "flat" | "convex" | "concave" | "relief";

export interface RenderLook extends Partial<Record<RenderNumberKey, number>> {
  wallProfile?: WallProfile;
  reliefMode?: ReliefMode;
  // the sky light's colour ("#rrggbb")
  skyLightColor?: string;
  // what the distance fades to ("#rrggbb"; none: black)
  fogColor?: string;
  // the headlamp is on (a dark dungeon: the party carries a light)
  headlamp?: boolean;
  // the view bobs a little while the party stands still
  bobEnabled?: boolean;
}

const PROFILES: WallProfile[] = ["flat", "convex", "concave", "relief"];
const MODES: ReliefMode[] = ["steps", "smooth"];

// a file's render block, cleaned: only known keys with sane values
export function cleanRenderLook(raw: unknown): RenderLook | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const src = raw as Record<string, unknown>;
  const out: RenderLook = {};
  for (const key of RENDER_NUMBER_KEYS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
  }
  if (PROFILES.includes(src.wallProfile as WallProfile)) out.wallProfile = src.wallProfile as WallProfile;
  if (MODES.includes(src.reliefMode as ReliefMode)) out.reliefMode = src.reliefMode as ReliefMode;
  if (typeof src.headlamp === "boolean") out.headlamp = src.headlamp;
  if (typeof src.skyLightColor === "string" && /^#[0-9a-fA-F]{6}$/.test(src.skyLightColor)) out.skyLightColor = src.skyLightColor;
  if (typeof src.fogColor === "string" && /^#[0-9a-fA-F]{6}$/.test(src.fogColor)) out.fogColor = src.fogColor;
  if (typeof src.bobEnabled === "boolean") out.bobEnabled = src.bobEnabled;
  return Object.keys(out).length ? out : undefined;
}

// the render values of the viewer's settings that differ from its defaults,
// as a map's render block (undefined when none does)
export function pickRender(settings: object, defaults: object): RenderLook | undefined {
  const s = settings as Record<string, unknown>;
  const d = defaults as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of [...RENDER_NUMBER_KEYS, "wallProfile", "reliefMode", "headlamp", "bobEnabled", "skyLightColor", "fogColor"]) {
    if (s[key] !== d[key]) out[key] = s[key];
  }
  return cleanRenderLook(out);
}

// the viewer's defaults for the render keys (what a map without a render
// block - or without some of them - gets)
export function renderDefaults(defaults: object): RenderLook {
  return cleanRenderLook(Object.fromEntries([...RENDER_NUMBER_KEYS, "wallProfile", "reliefMode", "headlamp", "bobEnabled", "skyLightColor", "fogColor"].map((k) => [k, (defaults as Record<string, unknown>)[k]]))) ?? {};
}
