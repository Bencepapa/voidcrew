export const PUDDLE_PROP = "puddle_prop";
export const PUDDLE_MASK_PATH = "decals/puddle_large/diffuse.png";

export const PUDDLE_RIPPLE = {
  speed: { min: 0, max: 4 },
  amplitude: { min: 0, max: 4 },
  density: { min: 0.25, max: 4 },
} as const;

export type PuddleRipple = Partial<Record<keyof typeof PUDDLE_RIPPLE, number>>;

export function readPuddleRipple(value: unknown): PuddleRipple | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const ripple = value as PuddleRipple;
  const result: PuddleRipple = {};
  for (const key of ["speed", "amplitude", "density"] as const) {
    const number = ripple[key];
    if (typeof number !== "number" || !Number.isFinite(number)) continue;
    const { min, max } = PUDDLE_RIPPLE[key];
    const clamped = Math.min(max, Math.max(min, number));
    if (clamped !== 1) result[key] = clamped;
  }
  return Object.keys(result).length ? result : undefined;
}
