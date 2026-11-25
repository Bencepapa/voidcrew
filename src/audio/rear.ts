// The ear's shadow: what a sound straight behind the listener loses - its highs (a low-pass) and a little level. It is a
// front / back cue that works on speakers too (the stereo balance says nothing of front and back). How much it takes is
// the Debug panel's "behind" strength, 0..1: 0 is nothing, the default (0.5) is a light shadow (about 4 kHz and -2.5 dB
// straight behind - still clear, like a person turned away), 1 is the heavy one (2 kHz and -6 dB). The sides are never
// dulled; how far behind a sound is comes from `behindness` (soundField.ts). Pure, see rear.test.ts.

const OPEN_CUTOFF = 18000;
const FULL_CUTOFF = 2000;
const FULL_GAIN_DB = -6;
export const DEFAULT_REAR_STRENGTH = 0.5;
const DEFAULT_CUTOFF = 4000;
const DEFAULT_GAIN_DB = -2.5;

// (the two curves are bent so that the default strength lands exactly on the default's numbers: a cutoff moves in
// octaves, a level in decibels, and the two do not want the same half-way)
const CUTOFF_EXPONENT = Math.log(Math.log(OPEN_CUTOFF / DEFAULT_CUTOFF) / Math.log(OPEN_CUTOFF / FULL_CUTOFF)) / Math.log(DEFAULT_REAR_STRENGTH);
const GAIN_EXPONENT = Math.log(DEFAULT_GAIN_DB / FULL_GAIN_DB) / Math.log(DEFAULT_REAR_STRENGTH);

const clamp01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

// the shadow straight behind the listener at a strength: the low-pass's cutoff (Hz) and the level kept (0..1)
export function rearShadow(strength: number): { cutoff: number; gain: number } {
  const s = clamp01(strength);
  if (s === 0) return { cutoff: OPEN_CUTOFF, gain: 1 };
  return {
    cutoff: OPEN_CUTOFF * Math.pow(FULL_CUTOFF / OPEN_CUTOFF, Math.pow(s, CUTOFF_EXPONENT)),
    gain: Math.pow(10, (FULL_GAIN_DB * Math.pow(s, GAIN_EXPONENT)) / 20),
  };
}

// What the shadow does to a sound `behind` (0..1: 0 in front or at the side, 1 straight behind) the listener.
export function rearFilter(behind: number, strength: number = DEFAULT_REAR_STRENGTH): { cutoff: number; gain: number } {
  const b = clamp01(behind);
  const full = rearShadow(strength);
  return { cutoff: OPEN_CUTOFF * Math.pow(full.cutoff / OPEN_CUTOFF, b), gain: Math.pow(full.gain, b) };
}
