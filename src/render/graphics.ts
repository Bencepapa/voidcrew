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
}

// the view distance setting's top (see viewDistanceCap)
export const VIEW_DISTANCE_MAX = 9;

export const GRAPHICS_KEYS: (keyof Graphics)[] = ["particleQuality", "wallDetail", "pixelRatioCap", "particleEvery", "viewDistanceCap"];

export const GRAPHICS_PRESETS: Record<string, Graphics> = {
  Low: { particleQuality: 0.25, wallDetail: 16, pixelRatioCap: 1, particleEvery: 3, viewDistanceCap: 5 },
  Medium: { particleQuality: 0.5, wallDetail: 32, pixelRatioCap: 1.5, particleEvery: 2, viewDistanceCap: 6 },
  High: { particleQuality: 1, wallDetail: 64, pixelRatioCap: 2, particleEvery: 1, viewDistanceCap: VIEW_DISTANCE_MAX },
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
    // (saved before there was a cap: the one of the preset it was, if any)
    if (saved && typeof saved.viewDistanceCap !== "number") {
      const was = Object.values(GRAPHICS_PRESETS).find((p) => GRAPHICS_KEYS.every((k) => k === "viewDistanceCap" || p[k] === base[k]));
      if (was) base.viewDistanceCap = was.viewDistanceCap;
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
