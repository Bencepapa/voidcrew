import type { LightEffect } from "./types";

// How bright an unsteady light is at a moment (0: off, 1: its intensity;
// sparks flash brighter). `seed` sets it apart from other lights with the
// same effect, `t` is in seconds. The same seed and time give the same
// level, so a light's ceiling panel and its light agree.

// a number 0..1 from two integers, the same each time
function hash(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function lightLevel(effect: LightEffect, seed: number, t: number): number {
  switch (effect) {
    case "flicker": {
      // steady for a while, then a fit of flickering (some seconds in
      // every few), the tube dropping out for a tick at a time
      const fit = hash(seed, Math.floor(t / 2.5)) < 0.4;
      const tick = hash(seed + 7, Math.floor(t * 18));
      if (!fit) return tick < 0.03 ? 0.4 : 1;
      return tick < 0.35 ? 0.05 : tick < 0.5 ? 0.5 : 1;
    }
    case "spark": {
      // now and then (in about half of the 1.3 s spans) a burst: a few
      // bright, short flashes
      const span = 1.3;
      const n = Math.floor(t / span);
      if (hash(seed, n) > 0.5) return 0;
      const start = hash(seed + 3, n) * (span - 0.3);
      const into = t - n * span - start;
      if (into < 0 || into > 0.25) return 0;
      const flash = Math.floor(into / 0.04);
      const k = hash(seed + 11, n * 16 + flash);
      return k < 0.4 ? 0 : 0.6 + k;
    }
    case "pulse":
      return 0.55 + 0.45 * Math.sin((t * 2 * Math.PI) / 1.6 + seed);
  }
}
