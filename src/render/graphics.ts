// The graphics options a player can lower for a weaker device (debug panel >
// Graphics). They belong to the device, not to a map: the defaults follow the
// screen (a touch screen gets lighter ones), and what's chosen is kept in
// this browser's storage.

export interface Graphics {
  // how many particles (smoke, flames, petals), relative to the full amount
  particleQuality: number;
  // how finely smooth (sloped) walls are built: cells along a panel - 64 is
  // 8192 triangles a wall, 32 is 2048, 16 is 512
  wallDetail: number;
  // the most device pixels drawn per screen pixel (1: sharp enough for pixel art, cheapest)
  pixelRatioCap: number;
  // move the particles every this many frames (2: half the work, still smooth)
  particleEvery: number;
  // the farthest the view reaches (cells), whatever the view distance setting
  // asks: the fog closes in nearer and fewer cells are drawn (VIEW_DISTANCE_MAX:
  // no limit)
  viewDistanceCap: number;
  // how far off walls, floors, doors and props keep their detailed mesh: their
  // distant, coarser versions switch in this many times farther than usual
  // (1: as tuned for the fog of a 7-cell view); 0: none built at all - the
  // detailed mesh at every distance (more triangles drawn, less to build)
  lodScale: number;
}

// the view distance setting's top (see viewDistanceCap) - only Ultra goes
// past VIEW_DISTANCE_HIGH, the most the other presets allow
export const VIEW_DISTANCE_MAX = 14;
export const VIEW_DISTANCE_HIGH = 9;

export const GRAPHICS_KEYS: (keyof Graphics)[] = ["particleQuality", "wallDetail", "pixelRatioCap", "particleEvery", "viewDistanceCap", "lodScale"];

// (Ultra is for a strong desktop graphics card: never a device's own default)
export const GRAPHICS_PRESETS: Record<string, Graphics> = {
  Low: { particleQuality: 0.25, wallDetail: 16, pixelRatioCap: 1, particleEvery: 3, viewDistanceCap: 5, lodScale: 1 },
  Medium: { particleQuality: 0.5, wallDetail: 32, pixelRatioCap: 1.5, particleEvery: 2, viewDistanceCap: 6, lodScale: 1 },
  High: { particleQuality: 1, wallDetail: 64, pixelRatioCap: 2, particleEvery: 1, viewDistanceCap: VIEW_DISTANCE_HIGH, lodScale: 1 },
  Ultra: { particleQuality: 1, wallDetail: 64, pixelRatioCap: 2, particleEvery: 1, viewDistanceCap: VIEW_DISTANCE_MAX, lodScale: 3 },
};

// how far the view reaches: the view distance setting, within the device's cap
export function effectiveViewDistance(s: { viewDistance: number; viewDistanceCap: number }): number {
  return Math.min(s.viewDistance, s.viewDistanceCap);
}

const KEY = "voidcrew.graphics";

// what a device gets until the player chooses: a touch screen medium, else high
export function deviceGraphics(): Graphics {
  const touch = typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;
  return { ...GRAPHICS_PRESETS[touch ? "Medium" : "High"] };
}

export function loadGraphics(): Graphics {
  const base = deviceGraphics();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<Graphics> | null;
    if (saved) for (const k of GRAPHICS_KEYS) if (typeof saved[k] === "number") base[k] = saved[k] as number;
    // (saved before a value existed - the view distance cap, the LOD scale:
    // the ones of the preset the rest match, if any)
    const missing = GRAPHICS_KEYS.filter((k) => saved && typeof saved[k] !== "number");
    if (saved && missing.length) {
      const was = Object.values(GRAPHICS_PRESETS).find((p) => GRAPHICS_KEYS.every((k) => missing.includes(k) || p[k] === base[k]));
      if (was) for (const k of missing) base[k] = was[k];
    }
  } catch {
    // (no storage, or a broken save: the device's own)
  }
  return base;
}

export function saveGraphics(g: Graphics) {
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(GRAPHICS_KEYS.map((k) => [k, g[k]]))));
  } catch {
    // (it lasts as long as the page)
  }
}

// the name of the preset these values match, if any
export function presetOf(g: Graphics): string {
  return Object.entries(GRAPHICS_PRESETS).find(([, p]) => GRAPHICS_KEYS.every((k) => p[k] === g[k]))?.[0] ?? "Custom";
}
