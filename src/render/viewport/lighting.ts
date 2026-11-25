// Map lights are served by a fixed pool of point lights reassigned to the
// best sources every frame: three.js compiles the light count into its
// shaders, so a constant pool avoids recompiles, and the per-pixel lighting
// cost stays bounded however many lights the map has. Only sources in
// cells the party can see (or next to one - their light spills through
// doorways) compete, nearest first, those ahead of the camera favored.
// Lights fade out with distance, about where the fog closes, and a slot
// fades its light in and out instead of popping.
// The sight (lights and culling) reaches the view distance setting; lights
// fade out over its last LIGHT_FADE_SPAN cells.
// (the most: the graphics setting can ask for fewer - Graphics.lightPool;
// and no more than the reach texture has bits for, see lightGrid.ts)
export const LIGHT_POOL_SIZE = 8;
export const LIGHT_FADE_SPAN = 1.5;

// where in the party's cell the sight is taken from (offsets from its center)
export const SIGHT_POINTS: [number, number][] = [
  [0, 0],
  [-0.35, -0.35],
  [0.35, -0.35],
  [-0.35, 0.35],
  [0.35, 0.35],
];

// a source behind the camera ranks as if this much further away
export const LIGHT_BEHIND_PENALTY = 0.35;
// a source this much (world units) past its own reach behind the camera
// doesn't compete at all (see updateLightPool)
export const LIGHT_BEHIND_SLACK = 0.5;
// a source already in the pool keeps its slot until a rival ranks this
// much nearer (a fraction of its distance), so near-ties don't flicker
export const LIGHT_KEEP_BIAS = 0.85;
// how fast a slot's light fades in or out (per second, 0..1)
export const LIGHT_SLOT_FADE = 4;

// a fire (see fire.ts): its light (color, intensity and reach at size 1,
// how high over its flames), and the dark smoke rising off it (color, how
// high over the flames it comes from, how much and how big beside them)
export const FIRE_LIGHT_INTENSITY = 1.8;
export const FIRE_LIGHT_RANGE = 2.4;
export const FIRE_LIGHT_LIFT = 0.15;
export const FIRE_SMOKE_COLOR = 0x2e2a27;
export const FIRE_SMOKE_LIFT = 0.3;
export const FIRE_SMOKE_DENSITY = 0.8;
export const FIRE_SMOKE_SIZE = 1.3;
// a fire light's flicker at `now` (ms): about 1, quickly unsteady
export function fireFlicker(now: number, seed: number): number {
  return 1 + 0.22 * Math.sin(now / 47 + seed * 1.7) + 0.15 * Math.sin(now / 23 + seed * 4.1) + 0.12 * (Math.random() - 0.5);
}
