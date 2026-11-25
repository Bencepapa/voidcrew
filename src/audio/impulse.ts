// The echo of a room as an impulse response, made from two numbers - how long it rings (`decay`, seconds to -60 dB) and
// how soft its surfaces are (`softness`, 0..1) - so there is no sample file: noise under an exponentially falling
// envelope, whose highs fall away faster the softer the room is. Pure (no Web Audio: the engine puts the arrays into
// a ConvolverNode, see reverbBus.ts), tested in impulse.test.ts.

// silence before the echo starts (seconds): the sound is heard before its echo is
export const PREDELAY = 0.012;
export const IMPULSE_MIN_DECAY = 0.1;
export const IMPULSE_MAX_DECAY = 8;

// the high cut of the wet bus for a softness: bright 16 kHz .. dark 2.5 kHz
export const softnessCutoff = (softness: number) => 16000 * (2500 / 16000) ** Math.max(0, Math.min(1, softness));

// A tiny seeded random generator: the same room always rings the same (and a test can look at the numbers).
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// What makes two impulses the same: the numbers rounded to 0.05, so a slider being dragged does not make a new one
// at every step.
export function impulseParams(decay: number, softness: number): { decay: number; softness: number; key: string } {
  const d = Math.round(Math.max(IMPULSE_MIN_DECAY, Math.min(IMPULSE_MAX_DECAY, decay)) * 20) / 20;
  const s = Math.round(Math.max(0, Math.min(1, softness)) * 20) / 20;
  return { decay: d, softness: s, key: `${d.toFixed(2)}:${s.toFixed(2)}` };
}

// Two channels (left, right: different noise, so the echo is wide) of `PREDELAY + decay` seconds, each with an energy
// of 1 (the sum of the squares), so the wet level does not depend on how long the echo is.
//
// The noise is shaped by a low-pass whose cutoff glides down over the decay (for the softest room from 1.9 kHz at the
// start to a quarter of that at the end; a room of 0 has none), and the envelope falls 60 dB over `decay` seconds.
export function makeImpulse(decay: number, softness: number, sampleRate: number): Float32Array[] {
  const d = Math.max(IMPULSE_MIN_DECAY, Math.min(IMPULSE_MAX_DECAY, decay));
  const s = Math.max(0, Math.min(1, softness));
  const pre = Math.round(PREDELAY * sampleRate);
  const length = pre + Math.max(1, Math.round(d * sampleRate));
  const start = 16000 * 0.12 ** s;
  const end = start * 0.25 ** s;
  const channels: Float32Array[] = [];
  for (let c = 0; c < 2; c++) {
    const next = random(0x51ed + c * 7919);
    const out = new Float32Array(length);
    let low = 0;
    let energy = 0;
    for (let i = pre; i < length; i++) {
      const t = (i - pre) / sampleRate;
      const noise = next() * 2 - 1;
      let x = noise;
      if (s > 0) {
        const cutoff = start * (end / start) ** Math.min(1, t / d);
        const a = 1 - Math.exp((-2 * Math.PI * cutoff) / sampleRate);
        low += a * (noise - low);
        x = low;
      }
      // -60 dB over the decay, and a short fade at the very end so the tail does not stop with a click
      const tail = Math.min(1, (length - i) / Math.max(1, 0.02 * sampleRate));
      const value = x * 10 ** ((-3 * t) / d) * tail;
      out[i] = value;
      energy += value * value;
    }
    const scale = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = pre; i < length; i++) out[i] *= scale;
    channels.push(out);
  }
  return channels;
}
