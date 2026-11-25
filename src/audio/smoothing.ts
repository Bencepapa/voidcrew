// Smoothing for the sound engine: nothing a listener hears may jump. A voice's loudness, filter, pan and the like are
// worked out from the map (soundField.ts, stereo.ts) and change in steps - a plan is made again when the listener
// crosses into another cell, a door opens, a wall comes between - so the engine chases each target with an exponential
// approach instead of putting it in at once. Pure (no Web Audio): the maths here is tested without a browser (see
// smoothing.test.ts); the engine (engine.ts) calls `Smoother.step` once for every state it is given.

// How quickly each thing follows its target: the time constant in seconds (about 95% of a jump is covered in three of
// them), and whether it moves in the log domain (a frequency: 20 kHz down to 1.6 kHz sweeps evenly through the octaves
// instead of falling through the top ones at once).
export interface Curve {
  tau: number;
  log?: boolean;
}

export const TAU = {
  // the left / right balance: it follows a turning head closely enough, and still takes the edge off a jump
  pan: 0.12,
  // loudness, the walls' filter and level, the ear's shadow behind the listener
  level: 0.2,
  cutoff: 0.2,
  wallGain: 0.2,
  rear: 0.2,
  // the apparent place of a voice relative to the listener (the HRTF path)
  place: 0.15,
  // a voice coming in or going out: a direct one is quick, one through a doorway (the portal voice) takes ~0.35 s
  fadeDirect: 0.06,
  fadePortal: 0.12,
} as const;

// the share of the way to the target covered in `dt` seconds with the time constant `tau`
export function smoothingAlpha(dt: number, tau: number): number {
  if (!(dt > 0)) return 0;
  if (!(tau > 0)) return 1;
  return 1 - Math.exp(-dt / tau);
}

// `current` moves toward `target`
export function approach(current: number, target: number, dt: number, tau: number): number {
  return current + (target - current) * smoothingAlpha(dt, tau);
}

// the same on a log scale (both positive): equal steps in octaves, not in Hz
export function approachLog(current: number, target: number, dt: number, tau: number): number {
  const a = Math.max(current, 1e-6);
  const b = Math.max(target, 1e-6);
  return a * Math.pow(b / a, smoothingAlpha(dt, tau));
}

// A set of named values that each chase a target with their own curve.
export class Smoother<K extends string> {
  private current: Record<K, number> | null = null;
  constructor(private readonly curves: Record<K, Curve>) {}

  // put the values in at once (a voice that has just started must not glide to where it belongs)
  snap(target: Record<K, number>): Record<K, number> {
    this.current = { ...target };
    return this.current;
  }

  // move toward the target over `dt` seconds; the first call snaps
  step(target: Record<K, number>, dt: number): Record<K, number> {
    if (!this.current) return this.snap(target);
    const next = { ...this.current };
    for (const key of Object.keys(this.curves) as K[]) {
      const curve = this.curves[key];
      next[key] = curve.log ? approachLog(next[key], target[key], dt, curve.tau) : approach(next[key], target[key], dt, curve.tau);
    }
    this.current = next;
    return next;
  }

  get values(): Record<K, number> | null {
    return this.current;
  }
}

// ---- a pulse's gate

// The time constant that makes a gate open or close in about `seconds` (95% of the way): its attack when opening, its
// release when closing. A very short one is limited so the edge is never a click's worth of instant.
export const MIN_GATE_SECONDS = 0.004;
export function gateTimeConstant(seconds: number): number {
  const s = Number.isFinite(seconds) ? seconds : MIN_GATE_SECONDS;
  return Math.max(MIN_GATE_SECONDS, s) / 3;
}
