// A small cache for the baked light grid (see lightGrid.ts, and bake() in GameViewport). The scene is rebuilt for any
// structural edit, a wall texture change included, but the bake only depends on the geometry, the props, the lights and the
// bake options: when none of those changed, the last result is reused instead of computing it again (tens of seconds on a
// big map). Kept free of three.js and React.

export interface BakeKeyInput {
  width: number;
  height: number;
  cells: unknown;
  floorHeights?: unknown;
  ceilingHeights?: unknown;
  skySurfaces?: Uint8Array;
  props?: unknown;
  bridges?: unknown;
  sharedPropTypes?: unknown;
  lights: unknown;
  wallHeight: number;
  options: unknown;
  ambientDensity?: number;
  reflectionDensity?: number;
}

/** What the bake is a function of, as a string (equal strings: the same grid). */
export function bakeCacheKey(input: BakeKeyInput): string {
  const { width, height, cells, floorHeights, ceilingHeights, skySurfaces, props, bridges, sharedPropTypes, lights, wallHeight, options, ambientDensity, reflectionDensity } = input;
  return JSON.stringify([width, height, cells, floorHeights, ceilingHeights, skySurfaces?.join(","), props, bridges, sharedPropTypes, lights, wallHeight, options, ambientDensity ?? null, reflectionDensity ?? null]);
}

/** A least-recently-used cache of at most `max` entries. */
export function createBakeCache<T>(max = 4) {
  const entries = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      const value = entries.get(key);
      if (value === undefined) return undefined;
      entries.delete(key);
      entries.set(key, value);
      return value;
    },
    set(key: string, value: T) {
      entries.delete(key);
      entries.set(key, value);
      while (entries.size > max) entries.delete(entries.keys().next().value as string);
    },
    get size() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
  };
}
